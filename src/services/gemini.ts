/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality, Type } from "@google/genai";
import { VoiceSettings, ScriptChunk, SplitOption, VoiceName } from "../types";

let aiInstance: GoogleGenAI | null = null;
function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please set it in your environment.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function splitScript(text: string, option: SplitOption): Promise<ScriptChunk[]> {
  const chunks: ScriptChunk[] = [];
  const targetCount = option.chunkCount;
  const cleanText = text.trim();
  if (!cleanText) return [];

  if (targetCount === 1) {
    return [{
      id: 'chunk-single',
      label: 'Full Script',
      text: cleanText,
      estimatedDuration: Math.round((cleanText.split(/\s+/).length / 140) * 60)
    }];
  }

  const paragraphs = cleanText.split(/\n\s*\n/);
  const totalLength = cleanText.length;
  const targetChunkSize = totalLength / targetCount;
  let currentChunk: string[] = [];
  let currentSize = 0;

  paragraphs.forEach((p) => {
    currentChunk.push(p);
    currentSize += p.length;
    if (currentSize >= targetChunkSize && chunks.length < targetCount - 1) {
      const content = currentChunk.join('\n\n');
      chunks.push({
        id: `chunk-${chunks.length}`,
        label: chunks.length === 0 ? "Introduction" : `Segment ${chunks.length + 1}`,
        text: content,
        estimatedDuration: Math.round((content.split(/\s+/).length / 140) * 60)
      });
      currentChunk = [];
      currentSize = 0;
    }
  });

  if (currentChunk.length > 0) {
    const content = currentChunk.join('\n\n');
    chunks.push({
      id: `chunk-${chunks.length}`,
      label: "Conclusion",
      text: content,
      estimatedDuration: Math.round((content.split(/\s+/).length / 140) * 60)
    });
  }
  return chunks;
}

export async function generateVoicePreview(settings: VoiceSettings): Promise<string> {
  const previewText = "This is a preview of my voice with the current style settings.";
  return generateTTS({ id: 'preview', text: previewText, label: 'Preview', estimatedDuration: 2 }, settings);
}

export async function generateTTS(chunk: ScriptChunk, settings: VoiceSettings): Promise<string> {
  const ai = getAI();
  
  // Map custom voices to supported prebuilt voices
  // Supported: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
  let activeVoice: string = settings.voice;
  let personaInstruction = "";

  if (settings.voice === VoiceName.AOIDE) {
    activeVoice = 'Zephyr';
    personaInstruction = "Narrate with a lyrical, expressive, and slightly more melodic quality.";
  } else if (settings.voice === VoiceName.ERIS) {
    activeVoice = 'Puck';
    personaInstruction = "Narrate with high energy, versatility, and a dynamic range.";
  } else if (settings.voice === VoiceName.NYX) {
    activeVoice = 'Charon';
    personaInstruction = "Narrate with a deep, mysterious, and slightly more resonant lower register.";
  } else if (settings.voice === VoiceName.ATLAS) {
    activeVoice = 'Charon';
    personaInstruction = "Narrate with a very deep, authoritative, and resonant bass-baritone tone.";
  } else if (settings.voice === VoiceName.ASTRA) {
    activeVoice = 'Zephyr';
    personaInstruction = "Narrate with a bright, friendly, and optimistic high-energy tone.";
  }

  // Ensure activeVoice is strictly one of the supported ones for the TTS model
  const supportedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
  if (!supportedVoices.includes(activeVoice)) {
    activeVoice = 'Charon'; // Default fallback
  }

  const voicePrompt = `
    ${settings.preset}. 
    Tone: ${settings.tone}. 
    Pacing: ${settings.pace}. 
    Emotional intensity: ${Math.round(settings.emotionIntensity * 100)}%.
    ${personaInstruction}
    
    Script segment:
    ${chunk.text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: voicePrompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: activeVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data received");
    }

    // Convert base64 PCM (linear-16, 24kHz) to a playable Blob
    // The Gemini TTS skill doesn't explicitly state the format, 
    // but usually it's raw PCM 16-bit 24kHz.
    // However, browser <audio> tags won't play raw PCM. 
    // We need to convert it to a WAV or play it via AudioContext.
    
    return base64ToWavUrl(base64Audio, 24000);
  } catch (error) {
    console.error("Error generating TTS:", error);
    throw error;
  }
}

function base64ToWavUrl(base64: string, sampleRate: number): string {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // WAV Header
  const buffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 32 + bytes.length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true); // Mono
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, bytes.length, true);

  // Write the actual audio data
  const uint8Data = new Uint8Array(buffer, 44);
  uint8Data.set(bytes);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function mergeAudio(urls: string[]): Promise<string> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  const buffers = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await audioCtx.decodeAudioData(arrayBuffer);
    })
  );

  const totalLength = buffers.reduce((acc, buffer) => acc + buffer.length, 0);
  const outputBuffer = audioCtx.createBuffer(
    buffers[0].numberOfChannels,
    totalLength,
    buffers[0].sampleRate
  );

  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      outputBuffer.getChannelData(channel).set(buffer.getChannelData(channel), offset);
    }
    offset += buffer.length;
  }

  // Convert buffer back to WAV
  const wavBlob = audioBufferToWav(outputBuffer);
  return URL.createObjectURL(wavBlob);
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels,
    length = buffer.length * numOfChan * 2 + 44,
    bufferArr = new ArrayBuffer(length),
    view = new DataView(bufferArr),
    channels = [],
    sampleRate = buffer.sampleRate;
  let offset = 0,
    pos = 0;

  // write WAVE header
  writeString(view, pos, 'RIFF'); pos += 4;
  view.setUint32(pos, length - 8, true); pos += 4;
  writeString(view, pos, 'WAVE'); pos += 4;
  writeString(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, 16, true); pos += 4;
  view.setUint16(pos, 1, true); pos += 2;
  view.setUint16(pos, numOfChan, true); pos += 2;
  view.setUint32(pos, sampleRate, true); pos += 4;
  view.setUint32(pos, sampleRate * 2 * numOfChan, true); pos += 4;
  view.setUint16(pos, numOfChan * 2, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2;
  writeString(view, pos, 'data'); pos += 4;
  view.setUint32(pos, length - pos - 4, true); pos += 4;

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArr], { type: 'audio/wav' });
}

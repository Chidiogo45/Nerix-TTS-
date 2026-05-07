/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum VoiceName {
  KORE = 'Kore',
  CHARON = 'Charon',
  PUCK = 'Puck',
  FENRIR = 'Fenrir',
  ZEPHYR = 'Zephyr',
  AOIDE = 'Aoide',
  ERIS = 'Eris',
  NYX = 'Nyx'
}

export enum ToneType {
  SERIOUS = 'Serious',
  NEUTRAL = 'Neutral',
  INTENSE = 'Intense'
}

export enum PaceType {
  SLOW = 'Slow',
  NORMAL = 'Normal',
  FAST = 'Fast'
}

export enum StylePreset {
  DOCUMENTARY = 'Documentary narration',
  MILITARY = 'Military analysis',
  STORYTELLING = 'Storytelling cinematic',
  EDUCATIONAL = 'Educational explainer'
}

export interface ScriptChunk {
  id: string;
  text: string;
  label: string;
  estimatedDuration: number; // in seconds
  audioUrl?: string;
  isGenerating?: boolean;
  progress?: number;
  statusMessage?: string;
  error?: string;
}

export interface VoiceSettings {
  voice: VoiceName;
  tone: ToneType;
  pace: PaceType;
  emotionIntensity: number; // 0 to 1
  preset: StylePreset;
}

export interface SplitOption {
  id: string;
  label: string;
  description: string;
  chunkCount: number;
  color: string;
}

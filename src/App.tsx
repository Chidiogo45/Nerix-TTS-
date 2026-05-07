/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Type, 
  Settings2, 
  Mic2, 
  Play, 
  Download, 
  Split, 
  Clock, 
  FileAudio,
  Plus,
  Trash2,
  ChevronRight,
  Waves,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { 
  VoiceName, 
  ToneType, 
  PaceType, 
  StylePreset, 
  VoiceSettings, 
  ScriptChunk, 
  SplitOption 
} from './types';
import { splitScript, generateTTS, mergeAudio, generateVoicePreview } from './services/gemini';

const SPLIT_OPTIONS: SplitOption[] = [
  { id: 'single', label: 'No Split', description: 'Single output file (max 10k chars)', chunkCount: 1, color: 'text-slate-400 bg-slate-800/50' },
  { id: 'recommended', label: 'Recommended', description: 'Best balance: 4 segments (~2-3 mins)', chunkCount: 4, color: 'text-indigo-400 bg-indigo-500/10' },
  { id: 'alternative', label: 'Alternative', description: 'Fewer cuts: 3 segments (~3-4 mins)', chunkCount: 3, color: 'text-amber-400 bg-amber-500/10' },
  { id: 'precision', label: 'Precision', description: 'Maximum control: 6 segments (~1-2 mins)', chunkCount: 6, color: 'text-violet-400 bg-violet-500/10' },
];

export default function App() {
  const [script, setScript] = useState('');
  const [selectedSplit, setSelectedSplit] = useState(SPLIT_OPTIONS[1]);
  const [chunks, setChunks] = useState<ScriptChunk[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    voice: VoiceName.KORE,
    tone: ToneType.NEUTRAL,
    pace: PaceType.NORMAL,
    emotionIntensity: 0.5,
    preset: StylePreset.DOCUMENTARY
  });

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

  // Derived stats
  const charCount = script.length;
  const wordCount = useMemo(() => script.trim().split(/\s+/).filter(Boolean).length, [script]);
  const estDuration = useMemo(() => Math.round((wordCount / 140) * 60), [wordCount]);

  const totalChunks = chunks.length;
  const completedChunks = chunks.filter(c => c.audioUrl).length;
  const isGeneratingAny = chunks.some(c => c.isGenerating);
  const globalProgress = totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0;

  const handleSplit = async () => {
    if (!script.trim()) return;
    setIsSplitting(true);
    // Instant split using the new heuristic logic
    const result = await splitScript(script, selectedSplit);
    setChunks(result);
    setIsSplitting(false);
  };

  const handleGenerateVoicePreview = async () => {
    setIsPreviewing(true);
    try {
      const url = await generateVoicePreview(voiceSettings);
      setPreviewAudioUrl(url);
    } catch (error) {
      console.error("Preview generation failed:", error);
    } finally {
      setIsPreviewing(false);
    }
  };

  // Automatically refresh preview if settings change (debounced or manual? user asked "any changes to it should affect the preview")
  // Let's stick to manual or clear the preview so user knows it's out of date
  useEffect(() => {
    setPreviewAudioUrl(null);
  }, [voiceSettings]);

  const handleGenerateChunk = async (chunkId: string) => {
    // Stage 1: Initialization
    setChunks(prev => prev.map(c => c.id === chunkId ? { 
      ...c, 
      isGenerating: true, 
      error: undefined, 
      progress: 5, 
      statusMessage: 'Connecting...' 
    } : c));
    
    const chunk = chunks.find(c => c.id === chunkId);
    if (!chunk) return;

    try {
      // Stage 2: Synthesis Start simulation
      const synthesisProgressInterval = setInterval(() => {
        setChunks(prev => prev.map(c => {
          if (c.id === chunkId && c.progress && c.progress < 85) {
            return { ...c, progress: Math.min(85, c.progress + (Math.random() * 8)), statusMessage: 'Synthesizing...' };
          }
          return c;
        }));
      }, 400);

      const audioUrl = await generateTTS(chunk, voiceSettings);
      clearInterval(synthesisProgressInterval);

      // Stage 3: Completion
      setChunks(prev => prev.map(c => c.id === chunkId ? { 
        ...c, 
        audioUrl, 
        isGenerating: false, 
        progress: 100, 
        statusMessage: 'Ready' 
      } : c));
    } catch (error) {
      setChunks(prev => prev.map(c => c.id === chunkId ? { 
        ...c, 
        isGenerating: false, 
        error: 'Generation failed',
        statusMessage: 'Error'
      } : c));
    }
  };

  const handleGenerateAll = async () => {
    for (const chunk of chunks) {
      if (!chunk.audioUrl) {
        await handleGenerateChunk(chunk.id);
      }
    }
  };

  const handleMerge = async () => {
    const urls = chunks.map(c => c.audioUrl).filter((url): url is string => !!url);
    if (urls.length === 0) return;
    
    setIsMerging(true);
    setMergeProgress(10);
    setMergeStatus('Initializing project data...');
    
    try {
      await new Promise(r => setTimeout(r, 600));
      setMergeProgress(35);
      setMergeStatus('Compiling audio buffers...');
      
      await new Promise(r => setTimeout(r, 800));
      setMergeProgress(65);
      setMergeStatus('Normalizing volume levels...');
      
      const mergedUrl = await mergeAudio(urls);
      
      setMergeProgress(90);
      setMergeStatus('Generating final preview...');
      await new Promise(r => setTimeout(r, 400));
      
      setMergedAudioUrl(mergedUrl);
      setMergeProgress(100);
      setMergeStatus('Completed');
    } catch (error) {
      console.error("Merging failed", error);
      setMergeStatus('Merge failed');
    } finally {
      setIsMerging(false);
      setTimeout(() => setMergeStatus(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-slate-100 font-sans selection:bg-indigo-500/30 flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 md:px-6 bg-[#161920] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-white uppercase italic">NERIX <span className="text-indigo-400 non-italic">TTS</span></h1>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <div className="hidden lg:flex gap-4 text-xs font-medium text-slate-400">
            <div className="flex flex-col items-end">
              <span className="text-slate-200">~{charCount.toLocaleString()} CHARS</span>
              <span>REMAINING: {(10000 - charCount).toLocaleString()}</span>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div className="flex flex-col items-end">
              <span className="text-slate-200">~{Math.floor(estDuration / 60)}:{String(estDuration % 60).padStart(2, '0')} MINS</span>
              <span>EST. DURATION</span>
            </div>
          </div>
          {chunks.length > 0 && (
            <button 
              onClick={handleGenerateAll}
              className="bg-indigo-600 hover:bg-indigo-500 px-3 md:px-4 py-2 rounded-lg font-semibold text-xs md:text-sm transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
            >
              GENERATE ALL
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-[280px_1fr_320px] lg:h-[calc(100vh-64px-40px)] overflow-hidden">
        
        {/* Left Column: Input & Controls */}
        <section className="order-2 lg:order-1 border-t lg:border-t-0 lg:border-r border-slate-800 flex flex-col bg-[#12141A] max-h-[500px] lg:max-h-none overflow-hidden shrink-0 lg:shrink">
          <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
             <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Long-Form Script</label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-600 lg:hidden">{charCount}/10000</span>
                  <button 
                    onClick={() => setScript('')}
                    className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
             </div>
             <textarea 
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Paste script here..."
                className="flex-1 min-h-[160px] bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-sm leading-relaxed text-slate-300 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                maxLength={10000}
             />
             
             <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Word Count</p>
                  <p className="text-base md:text-lg font-semibold">{wordCount.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Complexity</p>
                  <p className={`text-base md:text-lg font-semibold ${wordCount > 500 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {wordCount > 500 ? 'High' : 'Low'}
                  </p>
                </div>
             </div>

             <div className="pt-2">
               <button
                  onClick={handleSplit}
                  disabled={isSplitting || !script.trim()}
                  className="w-full py-3 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/20 rounded-xl font-bold text-xs md:text-sm tracking-wide transition-all flex items-center justify-center gap-2 group"
                >
                  {isSplitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Split className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
                  SMART SPLIT ENGINE
                </button>
             </div>
          </div>
        </section>

        {/* Center Column: Split Preview */}
        <section className="order-1 lg:order-2 bg-[#0F1115] flex flex-col overflow-hidden min-h-[300px] lg:min-h-0">
          <div className="p-4 md:p-6 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[#161920]/30 backdrop-blur-sm sticky top-0 z-10 gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-base md:text-lg font-semibold">Smart Split Preview</h2>
                {isGeneratingAny && (
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
                    GENERATING...
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">Segments optimized for natural pacing</p>
              
              {totalChunks > 0 && (completedChunks > 0 || isGeneratingAny) && (
                <div className="mt-3 w-full sm:max-w-xs space-y-1">
                  <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase">
                    <span>Batch Synthesis</span>
                    <span>{Math.round(globalProgress)}%</span>
                  </div>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${globalProgress}%` }}
                      className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 w-full sm:w-auto overflow-x-auto whitespace-nowrap scrollbar-none">
              {SPLIT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedSplit(opt)}
                  className={`px-3 py-1 text-[10px] font-bold rounded transition-all flex-1 sm:flex-none ${
                    selectedSplit.id === opt.id 
                      ? 'bg-indigo-600 text-white shadow-lg' 
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {opt.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {chunks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-6 opacity-80 mt-10 lg:mt-20 py-8 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <Split className="w-12 h-12 md:w-16 md:h-16 opacity-30" />
                    <p className="text-sm font-medium px-4">Split script to generate segments</p>
                  </div>
                  {script.trim() && (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">Or skip splitting</span>
                      <button 
                        onClick={async () => {
                          const singleChunk = await splitScript(script, SPLIT_OPTIONS[0]);
                          setChunks(singleChunk);
                        }}
                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-slate-300 transition-all flex items-center gap-2 group"
                      >
                        <Mic2 className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                        GENERATE FULL SCRIPT AS-IS
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                chunks.map((chunk, index) => (
                  <motion.div
                    key={chunk.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-[#161920] border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-indigo-500/50 transition-all shadow-lg shadow-black/20"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-indigo-400">#{String(index + 1).padStart(2, '0')}</span>
                        <h3 className="font-medium text-slate-200 text-sm">{chunk.label}</h3>
                        {!chunk.audioUrl && (
                           <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 bg-slate-800 text-slate-500 rounded uppercase font-bold tracking-widest">
                             {chunk.statusMessage || 'Pending'}
                           </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-auto">
                          <span className="text-[10px] md:text-xs text-slate-500 font-mono italic">
                            {Math.floor(chunk.estimatedDuration / 60)}:{String(chunk.estimatedDuration % 60).padStart(2, '0')}m
                          </span>
                          {chunk.audioUrl ? (
                            <div className="flex items-center gap-2">
                               <audio src={chunk.audioUrl} controls className="h-6 w-20 md:w-24 filter invert brightness-125 opacity-70 hover:opacity-100 transition-opacity" />
                               <a 
                                  href={chunk.audioUrl} 
                                  download={`${chunk.label}.wav`}
                                  className="text-indigo-400 hover:text-indigo-300 transition-colors p-1"
                               >
                                 <Download className="w-4 h-4" />
                               </a>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleGenerateChunk(chunk.id)}
                              disabled={chunk.isGenerating}
                              className={`text-[10px] md:text-xs font-bold uppercase tracking-widest transition-colors ${chunk.isGenerating ? 'text-indigo-400/50' : 'text-indigo-400 hover:text-indigo-300'}`}
                            >
                              {chunk.isGenerating ? `${Math.round(chunk.progress || 0)}%` : 'GENERATE'}
                            </button>
                          )}
                      </div>
                    </div>
                    
                    <textarea 
                      value={chunk.text}
                      onChange={(e) => {
                        const newText = e.target.value;
                        setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, text: newText } : c));
                      }}
                      className="text-[11px] md:text-xs text-slate-400 bg-transparent border-none p-0 resize-none focus:outline-none focus:text-slate-200 min-h-[40px] leading-relaxed"
                    />

                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: chunk.audioUrl ? '100%' : chunk.isGenerating ? `${chunk.progress}%` : '0%' }}
                        className={`h-full transition-all duration-300 ${chunk.audioUrl ? 'bg-indigo-500' : 'bg-indigo-600'} ${chunk.isGenerating ? 'shadow-[0_0_8px_rgba(99,102,241,0.6)]' : ''}`}
                      />
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Right Column: Voice & Style Config */}
        <section className="order-3 border-t shrink-0 lg:order-3 lg:border-t-0 lg:border-l border-slate-800 bg-[#12141A] flex flex-col overflow-hidden max-h-[600px] lg:max-h-none">
          <div className="p-4 md:p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1">
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">🎙 Configuration</label>
                
                {/* Voice Selection Dropdown */}
                <div className="relative group">
                  <select 
                    value={voiceSettings.voice}
                    onChange={(e) => setVoiceSettings(prev => ({ ...prev, voice: e.target.value as VoiceName }))}
                    className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl text-sm font-semibold text-slate-100 focus:outline-none focus:border-indigo-500 appearance-none transition-all shadow-lg shadow-black/20"
                  >
                    {[
                      { id: VoiceName.CHARON, name: 'Charon (Documentary)' },
                      { id: VoiceName.KORE, name: 'Kore (Authoritative)' },
                      { id: VoiceName.FENRIR, name: 'Algenib (Cinematic)' },
                      { id: VoiceName.ZEPHYR, name: 'Zephyr (Calm)' },
                      { id: VoiceName.AOIDE, name: 'Aoide (Expressive)' },
                      { id: VoiceName.ERIS, name: 'Eris (Energetic)' },
                      { id: VoiceName.NYX, name: 'Nyx (Mysterious)' }
                    ].map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <ChevronRight className="w-4 h-4 rotate-90" />
                  </div>
                </div>
              </div>

              {/* Contextual Style Controls */}
              <div className="bg-[#161920] border border-slate-800 rounded-2xl p-5 space-y-6 shadow-xl">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-4 bg-indigo-500 rounded-full" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Style Tuning</span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-medium">
                      <span className="text-slate-400">Emotional Intensity</span>
                      <span className="text-indigo-400 font-mono">{Math.round(voiceSettings.emotionIntensity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={voiceSettings.emotionIntensity}
                      onChange={(e) => setVoiceSettings(prev => ({ ...prev, emotionIntensity: parseFloat(e.target.value) }))}
                      className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-500 font-bold ml-1 uppercase">Tone</span>
                      <select 
                        value={voiceSettings.tone}
                        onChange={(e) => setVoiceSettings(prev => ({ ...prev, tone: e.target.value as ToneType }))}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-2.5 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                      >
                        {Object.values(ToneType).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-500 font-bold ml-1 uppercase">Pace</span>
                      <select 
                        value={voiceSettings.pace}
                        onChange={(e) => setVoiceSettings(prev => ({ ...prev, pace: e.target.value as PaceType }))}
                        className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-2.5 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                      >
                        {Object.values(PaceType).map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                   <button
                    onClick={handleGenerateVoicePreview}
                    disabled={isPreviewing}
                    className="w-full py-3 bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 rounded-xl text-[10px] font-bold text-indigo-400 hover:text-white transition-all flex items-center justify-center gap-2 group active:scale-95"
                  >
                    {isPreviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 group-hover:scale-110" />}
                    {previewAudioUrl ? 'REFRESH PREVIEW' : 'PREVIEW VOICE'}
                  </button>
                  
                  {previewAudioUrl && (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 bg-slate-950 p-2.5 rounded-xl border border-indigo-500/20 flex flex-col gap-2"
                    >
                       <div className="flex items-center justify-between px-1">
                         <span className="text-[9px] font-bold text-indigo-400">LIVE PREVIEW</span>
                         <Waves className="w-3 h-3 text-indigo-400 animate-pulse" />
                       </div>
                       <audio src={previewAudioUrl} autoPlay controls className="h-7 w-full filter invert brightness-125" />
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">🧠 Narrative Preset</label>
              <select 
                value={voiceSettings.preset}
                onChange={(e) => setVoiceSettings(prev => ({ ...prev, preset: e.target.value as StylePreset }))}
                className="w-full bg-slate-900 border border-slate-800 p-3.5 rounded-2xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%23475569%22%20stroke-width%3D%221.66667%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat"
              >
                {Object.values(StylePreset).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="mt-8 space-y-4">
               {chunks.length > 0 && chunks.every(c => c.audioUrl) ? (
                 <div className="space-y-4">
                    <div className="flex flex-col gap-2">
                       <button 
                         onClick={handleMerge}
                         disabled={isMerging}
                         className="w-full py-4 border-2 border-indigo-500 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg shadow-indigo-500/10 active:scale-95 flex items-center justify-center gap-2 group"
                       >
                         {isMerging ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileAudio className="w-5 h-5 group-hover:animate-bounce" />}
                         {isMerging ? 'PROCESS MERGE...' : 'MERGE FULL AUDIO (.WAV)'}
                       </button>
                       
                       {isMerging && (
                         <div className="space-y-1.5 px-1">
                            <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                              <span>{mergeStatus}</span>
                              <span>{mergeProgress}%</span>
                            </div>
                            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${mergeProgress}%` }}
                                className="h-full bg-indigo-500"
                              />
                            </div>
                         </div>
                       )}
                    </div>
                    {mergedAudioUrl && (
                      <div className="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-2xl space-y-3">
                         <div className="flex items-center justify-between">
                           <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Final Production Ready</span>
                         </div>
                         <audio src={mergedAudioUrl} controls className="w-full filter invert brightness-125" />
                         <a 
                            href={mergedAudioUrl} 
                            download="project_output.wav"
                            className="flex items-center justify-center gap-2 w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 transition-colors"
                         >
                           <Download className="w-4 h-4" /> Export Production File
                         </a>
                      </div>
                    )}
                 </div>
               ) : (
                  <div className="p-4 border-2 border-dashed border-slate-800 rounded-2xl text-center opacity-30">
                    <Mic2 className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 leading-relaxed">Wait for Generation</p>
                  </div>
               )}
            </div>
          </div>
        </section>
      </main>
      
      {/* Footer Bar */}
      <footer className="h-10 bg-[#0A0C10] border-t border-slate-800 flex items-center px-4 md:px-6 justify-between text-[9px] md:text-[10px] tracking-wider text-slate-600 shrink-0">
        <div className="flex gap-4 font-mono">
          <span>SAMPLING RATE: 24KHZ</span>
          <span className="hidden sm:inline">BITRATE: 320KBPS</span>
          <span className="hidden lg:inline">MODEL: GEMINI-3.1-TTS</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
          <span>SYSTEM ONLINE</span>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          background: #6366f1;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid #161920;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.4);
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

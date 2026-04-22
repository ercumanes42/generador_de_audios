/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from "react";
import { Mic, Sparkles, Languages, Volume2, Save, Play, Download, Trash2, Clock, Check, Loader2 } from "lucide-react";
import { enhanceTextExpressivenessChunked, generateTTSChunked } from "./lib/gemini";
import { concatGeminiAudioChunks, decodeGeminiAudio } from "./lib/audioUtils";
import { TTSHistoryItem, saveHistory, getAllHistory, deleteHistory } from "./lib/db";

const LANGUAGES = [
  { code: "Español", label: "Español" },
  { code: "English", label: "English" },
  { code: "Français", label: "Français" },
  { code: "Deutsch", label: "Deutsch" },
  { code: "Italiano", label: "Italiano" },
  { code: "Português", label: "Português" },
];

const VOICES = [
  { id: "Puck", name: "Puck (Masculino)" },
  { id: "Charon", name: "Charon (Masculino)" },
  { id: "Fenrir", name: "Fenrir (Masculino)" },
  { id: "Kore", name: "Kore (Femenino)" },
  { id: "Zephyr", name: "Zephyr (Femenino)" },
  { id: "Aoede", name: "Aoede (Femenino)" },
];

export default function App() {
  const [text, setText] = useState("");
  const [enhancedText, setEnhancedText] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0].code);
  const [voice, setVoice] = useState(VOICES[0].id);
  
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Progress tracking
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  
  const [currentAudio, setCurrentAudio] = useState<Blob | null>(null);
  
  const [history, setHistory] = useState<TTSHistoryItem[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await getAllHistory();
      setHistory(data);
    } catch (error) {
      console.error("Failed to load history", error);
    }
  };

  const handleEnhance = async () => {
    if (!text.trim()) return;
    setIsEnhancing(true);
    abortRef.current = new AbortController();
    setProgress({ current: 0, total: 1, message: "Iniciando mejora IA..." });
    
    try {
      const result = await enhanceTextExpressivenessChunked(
        text, 
        language,
        (cur, tot) => setProgress({ current: cur, total: tot, message: `Mejorando fragmentos de texto...` }),
        abortRef.current.signal
      );
      setEnhancedText(result);
    } catch (err: any) {
      if (err.message !== "Cancelado") console.error(err);
      if (err.message !== "Cancelado") alert("Error al mejorar el texto.");
    } finally {
      setIsEnhancing(false);
      setProgress(null);
    }
  };

  const handleGenerate = async () => {
    const textToGenerate = enhancedText.trim() || text.trim();
    if (!textToGenerate) return;
    
    setIsGenerating(true);
    setCurrentAudio(null);
    abortRef.current = new AbortController();
    setProgress({ current: 0, total: 1, message: "Iniciando generación TTS..." });
    
    try {
      const audioChunks = await generateTTSChunked(
        textToGenerate, 
        voice,
        (cur, tot) => setProgress({ current: cur, total: tot, message: `Sintetizando partes de audio...` }),
        abortRef.current.signal
      );
      
      setProgress({ current: 1, total: 1, message: "Ensamblando archivo WAV final..." });
      const audioBlob = concatGeminiAudioChunks(audioChunks);
      setCurrentAudio(audioBlob);
      
      const newItem: TTSHistoryItem = {
        originalText: text,
        enhancedText: enhancedText,
        language,
        voice,
        date: Date.now(),
        audioBlob // Guárdalo como raw Blob por rendimiento
      };
      
      const newId = await saveHistory(newItem);
      newItem.id = newId;
      setHistory(prev => [newItem, ...prev]);
      
    } catch (err: any) {
      if (err.message !== "Cancelado") console.error(err);
      if (err.message !== "Cancelado") alert("Error al generar el audio.");
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteHistory = async (id: number) => {
    try {
      await deleteHistory(id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error(err);
    }
  };
  
  const getAudioBlob = (item: TTSHistoryItem) => {
    return item.audioBlob || (item.audioWavBase64 ? decodeGeminiAudio(item.audioWavBase64) : new Blob());
  };

  const playHistoryAudio = (item: TTSHistoryItem) => {
    const blob = getAudioBlob(item);
    const url = URL.createObjectURL(blob);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play();
    }
  };

  const downloadHistoryAudio = (item: TTSHistoryItem) => {
    const blob = getAudioBlob(item);
    handleDownload(blob, `gemini-tts-${item.date}.wav`);
  };

  return (
    <div className="bento-container">
      {/* Invisible global audio element for history playback */}
      <audio ref={audioRef} className="hidden" controls />

      {/* Header */}
      <div className="bento-card lg:col-span-3 lg:row-span-2 flex items-center justify-center border-indigo-500/30 bg-indigo-500/5">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tighter text-indigo-400">GEMINI <span className="text-white">TTS</span></h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">v3.1 Preview Studio</p>
        </div>
      </div>

      {/* Input Areas */}
      <div className="bento-card lg:col-span-6 lg:row-span-8 flex flex-col">
        <div className="flex-1 flex flex-col gap-2">
          <div className="label-mono">Entrada de Texto Original</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe el guion aquí..."
            className="flex-1 bg-transparent border-none outline-none resize-none text-base leading-relaxed placeholder:text-slate-600 custom-scrollbar text-slate-100"
          />
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
          <div className="flex">
            <span className="ai-tag">[serio]</span>
            <span className="ai-tag">[entusiasta]</span>
            <span className="ai-tag">[susurro]</span>
          </div>
          <button
            onClick={handleEnhance}
            disabled={isEnhancing || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-full text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            MEJORAR CON IA
          </button>
        </div>

        {/* Enhanced Text Area */}
        <div className="flex-1 flex flex-col gap-2 mt-4 pt-4 border-t border-slate-800">
          <div className="label-mono">Texto Creado / Mejorado (con etiquetas)</div>
          <textarea
            value={enhancedText}
            onChange={(e) => setEnhancedText(e.target.value)}
            placeholder="El texto mejorado aparecerá aquí..."
            className="flex-1 bg-transparent border-none outline-none resize-none text-base leading-relaxed text-indigo-200 placeholder:text-slate-700 custom-scrollbar"
          />
        </div>
      </div>

      {/* Settings Sub-panel */}
      <div className="bento-card lg:col-span-3 lg:row-span-4">
        <div className="label-mono">Voz y Configuración</div>
        <div className="space-y-4 h-full flex flex-col justify-center">
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400">Idioma</label>
            <div className="relative">
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm outline-none focus:ring-1 ring-indigo-500 appearance-none pr-8 cursor-pointer text-slate-200"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                 <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-400">Modelo de Voz</label>
            <div className="relative">
              <select 
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm outline-none focus:ring-1 ring-indigo-500 appearance-none pr-8 cursor-pointer text-slate-200"
              >
                {VOICES.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                 <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Panel */}
      <div className="bento-card lg:col-span-3 lg:row-span-6">
        <div className="label-mono flex justify-between items-center">
          <span>Historial Persistente</span>
          <Clock className="w-3 h-3 text-indigo-400" />
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar mt-2">
          {history.length === 0 ? (
            <div className="text-center text-slate-500 text-sm mt-10">
              No hay audios generados aún.
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 cursor-pointer group transition-all flex flex-col gap-2">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] text-indigo-400">{new Date(item.date).toLocaleDateString()}</span>
                  <div className="flex gap-1">
                    <span className="text-[9px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                      {item.voice.split(" ")[0]}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] line-clamp-2 text-slate-300 italic">"{item.enhancedText || item.originalText}"</p>
                
                <div className="flex items-center gap-2 mt-1 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => playHistoryAudio(item)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                    title="Reproducir"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => downloadHistoryAudio(item)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors"
                    title="Descargar WAV"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => item.id && handleDeleteHistory(item.id)}
                    className="p-1.5 bg-slate-800 hover:bg-red-500/20 rounded text-red-400 transition-colors ml-auto"
                    title="Eliminar del historial"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audio Output */}
      <div className="bento-card lg:col-span-6 lg:row-span-4 bg-slate-950 border-dashed border-slate-700 flex flex-col">
        <div className="label-mono flex justify-between items-center">
            <span>Visualización de Audio</span>
            {currentAudio && <Check className="w-3 h-3 text-emerald-400" />}
        </div>
        <div className="flex-1 flex flex-col justify-center items-center gap-4">
          {!currentAudio ? (
             <div className="text-slate-600 text-sm flex items-center gap-2">
                <Volume2 className="w-4 h-4 opacity-50" /> Esperando generación...
             </div>
          ) : (
             <>
                <div className="flex items-center justify-center gap-1.5 mb-2">
                    <div className="w-1 h-6 bg-indigo-500 rounded-full opacity-20 animate-pulse"></div>
                    <div className="w-1 h-10 bg-indigo-500 rounded-full opacity-40 animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-1 h-16 bg-indigo-500 rounded-full opacity-60 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-1 h-20 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                    <div className="w-1 h-16 bg-indigo-500 rounded-full opacity-80 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                    <div className="w-1 h-10 bg-indigo-500 rounded-full opacity-50 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                    <div className="w-1 h-5 bg-indigo-500 rounded-full opacity-30 animate-pulse" style={{ animationDelay: '0.6s' }}></div>
                </div>
                <audio 
                  controls 
                  src={URL.createObjectURL(currentAudio)} 
                  className="w-full max-w-sm mx-auto h-8 grayscale contrast-150 rounded"
                />
                <div className="flex justify-center w-full max-w-sm mt-1">
                  <button
                    onClick={() => handleDownload(currentAudio, `gemini-tts-${Date.now()}.wav`)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-bold tracking-tight transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> DESCARGAR WAV
                  </button>
                </div>
             </>
          )}
        </div>
      </div>

      {/* Generate Button Area */}
      <div 
        className={`bento-card lg:col-span-3 lg:row-span-2 border-none items-center justify-center p-0 overflow-hidden transition-all ${
            isGenerating || (!text.trim() && !enhancedText.trim())
            ? 'bg-slate-800'
            : 'bg-gradient-to-br from-indigo-600 to-violet-700 shadow-xl shadow-indigo-500/20'
        }`}
      >
        {progress ? (
           <div className="w-full h-full flex flex-col justify-center px-6 gap-3">
             <div className="flex justify-between text-xs text-indigo-300 font-bold tracking-wider">
               <span>{progress.message}</span>
               <span>{progress.current} / {progress.total}</span>
             </div>
             <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden shadow-inner">
               <div className="bg-indigo-400 h-2 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(129,140,248,0.8)]" style={{ width: `${(progress.current/progress.total)*100}%` }}></div>
             </div>
             <button onClick={handleCancel} className="mt-1 text-[10px] text-red-400 hover:text-red-300 transition-colors font-bold tracking-wider text-left">
               CANCELAR OPERACIÓN
             </button>
           </div>
        ) : (
          <div 
            onClick={() => {
                if(!isGenerating && (text.trim() || enhancedText.trim())) {
                    handleGenerate();
                }
            }}
            className={`w-full h-full flex items-center justify-center ${(!text.trim() && !enhancedText.trim()) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95 hover:shadow-indigo-500/40'}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white" />
              </div>
              <span className="text-sm font-bold tracking-tight text-white">
                GENERAR AUDIO
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


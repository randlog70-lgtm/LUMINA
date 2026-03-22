import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Volume2, Globe, WifiOff, Loader2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import { useChapters } from '@/lib/chapter-context';

interface TTSPlayerProps {
  text: string;
  onWordBoundary?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
}

export function TTSPlayer({ text, onWordBoundary, onEnd }: TTSPlayerProps) {
  const { settings, apiKey: userApiKey } = useChapters();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [voice, setVoice] = useState('Kore');
  const [showSettings, setShowSettings] = useState(false);
  
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isCancelledRef = useRef(false);

  const voices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

  useEffect(() => {
    // Check if we have an API key, if not, default to offline
    if (!userApiKey && !process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      setIsOnline(false);
    } else {
      setIsOnline(true);
    }
  }, [userApiKey]);

  useEffect(() => {
    return () => {
      if (synth) synth.cancel();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [synth]);

  const playOffline = () => {
    if (!synth) return;
    if (isPaused) {
      synth.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    
    utterance.onboundary = (event) => {
      if (event.name === 'word' && onWordBoundary) {
        onWordBoundary(event.charIndex, event.charLength);
      }
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      if (onEnd) onEnd();
    };

    utteranceRef.current = utterance;
    synth.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const playOnline = async () => {
    if (!text.trim()) return;
    
    isCancelledRef.current = false;
    
    if (isPaused && audioContextRef.current) {
      audioContextRef.current.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    try {
      setIsLoading(true);
      const apiKey = userApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text.substring(0, 5000) }] }], // Limit text for TTS
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      if (isCancelledRef.current) return;

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }

        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        
        // Gemini TTS returns raw 16-bit PCM data at 24kHz
        const bufferToDecode = bytes.length % 2 === 0 ? bytes.buffer : bytes.buffer.slice(0, bytes.length - 1);
        const pcmData = new Int16Array(bufferToDecode);
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 32768.0; // Normalize to [-1, 1]
        }

        const audioBuffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
        audioBuffer.getChannelData(0).set(floatData);
        
        const source = audioContextRef.current.createBufferSource();
        const gainNode = audioContextRef.current.createGain();
        
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        source.onended = () => {
          if (!isPaused) {
            setIsPlaying(false);
            setIsPaused(false);
            if (onEnd) onEnd();
          }
        };

        sourceNodeRef.current = source;
        gainNodeRef.current = gainNode;
        source.start(0);
        setIsPlaying(true);
        setIsPaused(false);

        // For online mode, we don't have word boundaries easily.
        // We could try to estimate them, but for now, let's just emit a "start" boundary.
        if (onWordBoundary) onWordBoundary(0, text.length);
      }
    } catch (error) {
      if (!isCancelledRef.current) {
        console.error("Online TTS Error:", error);
        playOffline();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlay = () => {
    if (isOnline) {
      playOnline();
    } else {
      playOffline();
    }
  };

  const handlePause = () => {
    if (isOnline && audioContextRef.current) {
      audioContextRef.current.suspend();
      setIsPaused(true);
      setIsPlaying(false);
    } else if (!isOnline && synth) {
      synth.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    isCancelledRef.current = true;
    setIsLoading(false);
    
    if (isOnline && sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      setIsPlaying(false);
      setIsPaused(false);
      if (onEnd) onEnd();
    } else if (!isOnline && synth) {
      synth.cancel();
      setIsPlaying(false);
      setIsPaused(false);
      if (onEnd) onEnd();
    } else {
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  const isDark = settings?.theme === 'dark';

  return (
    <div className={`relative flex items-center gap-1 p-1 rounded-lg transition-colors ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
      {!isPlaying ? (
        <button onClick={handlePlay} disabled={isLoading} className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-900 hover:bg-white'}`} title="Play">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        </button>
      ) : (
        <button onClick={handlePause} className={`p-1.5 rounded-md transition-colors ${isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-900 hover:bg-white'}`} title="Pause">
          <Pause className="w-4 h-4" />
        </button>
      )}
      <button onClick={handleStop} className={`p-1.5 rounded-md transition-colors ${isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-900 hover:bg-white'}`} title="Stop">
        <Square className="w-4 h-4" />
      </button>
      
      <div className={`w-px h-4 mx-1 ${isDark ? 'bg-zinc-700' : 'bg-zinc-300'}`} />
      
      <button 
        onClick={() => {
          handleStop();
          setIsOnline(!isOnline);
        }} 
        className={`p-1.5 rounded-md transition-colors ${isOnline ? (isDark ? 'text-indigo-400 bg-indigo-900/50' : 'text-indigo-600 bg-indigo-50') : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-900 hover:bg-white')}`}
        title={isOnline ? "Online TTS (High Quality)" : "Offline TTS (Fast)"}
      >
        {isOnline ? <Globe className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
      </button>

      <div className="relative">
        <button 
          onClick={() => setShowSettings(!showSettings)} 
          className={`p-1.5 rounded-md transition-colors ${showSettings ? (isDark ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'bg-white text-zinc-900 shadow-sm') : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-zinc-500 hover:text-zinc-900 hover:bg-white')}`}
          title="TTS Settings"
        >
          <Volume2 className="w-4 h-4" />
        </button>

        <AnimatePresence>
          {showSettings && (
            <>
              {/* Overlay */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSettings(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
              />
              
              {/* Modal */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm border rounded-3xl shadow-2xl p-8 z-[70] ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black tracking-tight">Voice Settings</h3>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                  >
                    <Plus className="w-5 h-5 rotate-45" />
                  </button>
                </div>

                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Volume</span>
                      <span className="text-lg font-black text-indigo-600">{Math.round(volume * 100)}%</span>
                    </div>
                    <div className="relative flex items-center h-6">
                      <div className={`absolute w-full h-2 rounded-full ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
                      <input 
                        type="range" 
                        min="0" max="1" step="0.01" 
                        value={volume} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setVolume(val);
                          if (gainNodeRef.current) gainNodeRef.current.gain.value = val;
                          if (utteranceRef.current) utteranceRef.current.volume = val;
                        }}
                        className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer accent-indigo-600 z-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Speed</span>
                      <span className="text-lg font-black text-indigo-600">{rate}x</span>
                    </div>
                    <div className="relative flex items-center h-6">
                      <div className={`absolute w-full h-2 rounded-full ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
                      <input 
                        type="range" 
                        min="0.5" max="2" step="0.1" 
                        value={rate} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setRate(val);
                          if (sourceNodeRef.current && isOnline) sourceNodeRef.current.playbackRate.value = val;
                          if (utteranceRef.current) utteranceRef.current.rate = val;
                        }}
                        className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer accent-indigo-600 z-10"
                      />
                    </div>
                  </div>

                  {isOnline ? (
                    <div className="space-y-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Select Voice</div>
                      <div className="grid grid-cols-2 gap-2">
                        {voices.map(v => (
                          <button
                            key={v}
                            onClick={() => {
                              setVoice(v);
                              handleStop();
                            }}
                            className={`px-4 py-3 text-xs font-bold rounded-2xl border transition-all ${
                              voice === v 
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' 
                                : (isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300')
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Pitch</span>
                        <span className="text-lg font-black text-indigo-600">{pitch}</span>
                      </div>
                      <div className="relative flex items-center h-6">
                        <div className={`absolute w-full h-2 rounded-full ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`} />
                        <input 
                          type="range" 
                          min="0.5" max="2" step="0.1" 
                          value={pitch} 
                          onChange={(e) => setPitch(parseFloat(e.target.value))}
                          className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer accent-indigo-600 z-10"
                        />
                      </div>
                    </div>
                  )}
                  
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full h-12 bg-indigo-600 text-white rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 mt-4"
                  >
                    SAVE SETTINGS
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

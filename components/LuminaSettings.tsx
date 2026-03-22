'use client';

import React, { useState } from 'react';
import { Settings, X, Key, Info, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChapters } from '@/lib/chapter-context';

export function LuminaSettings() {
  const { apiKey, updateApiKey, settings } = useChapters();
  const [isOpen, setIsOpen] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [showSaved, setShowSaved] = useState(false);

  const handleSave = () => {
    updateApiKey(tempKey);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  const isDark = settings?.theme === 'dark';

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
        title="Lumina Settings"
      >
        <Settings className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md border rounded-3xl shadow-2xl p-8 z-[110] ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`}
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 rounded-xl text-white">
                    <Settings className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-black tracking-tight">Lumina Settings</h3>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                      <Key className="w-3 h-3" />
                      Gemini API Key
                    </label>
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      Get Key <Info className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="relative">
                    <input 
                      type="password"
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder="Enter your Gemini API key..."
                      className={`w-full px-4 py-3 rounded-2xl border text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-none transition-all ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-zinc-50 border-zinc-200 text-zinc-900'}`}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    By providing your own API key, you can use your own quota and potentially access more powerful models. Your key is stored locally in your browser and never sent to our servers.
                  </p>
                </div>

                {!tempKey && !apiKey && (
                  <div className={`flex items-start gap-3 p-4 rounded-2xl ${isDark ? 'bg-amber-900/20 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-medium">
                      No API key provided. Lumina will use the default shared key, which may have limited availability.
                    </p>
                  </div>
                )}

                <button 
                  onClick={handleSave}
                  className={`w-full h-12 rounded-2xl text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg ${
                    showSaved 
                      ? 'bg-emerald-600 text-white shadow-emerald-200' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                  }`}
                >
                  {showSaved ? (
                    <>
                      <Check className="w-4 h-4" />
                      SAVED SUCCESSFULLY
                    </>
                  ) : (
                    'SAVE API SETTINGS'
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

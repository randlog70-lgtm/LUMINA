'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from 'react';
import { useChapters } from '@/lib/chapter-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, BookOpen, Save, Sliders, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, Upload, ChevronDown, Loader2, Info, Check, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { exportToTxt, exportToPdf, exportToEpub, importFile } from '@/lib/file-utils';
import { TTSPlayer } from '@/components/TTSPlayer';
import { ReadingSettings } from '@/components/ReadingSettings';
import { LuminaSettings } from '@/components/LuminaSettings';
import { Type } from "@google/genai";

type Mode = 'normal' | 'time' | 'chronos';

interface AuditResult {
  type: 'QUESTION' | 'STORY' | 'SOUND';
  content: string;
  reasoning: string;
}

function EditorContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const { chapters, getChapter, updateChapter, bulkAddChapters, settings, isLoaded, apiKey: userApiKey } = useChapters();
  
  const chapter = id ? getChapter(id) : undefined;
  const chapterIndex = useMemo(() => chapters.findIndex(c => c.id === id), [chapters, id]);
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

  const [mode, setMode] = useState<Mode>('normal');
  const [intensity, setIntensity] = useState<number>(50);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [isTimeControlsMinimized, setIsTimeControlsMinimized] = useState(true);
  const [isChronosMinimized, setIsChronosMinimized] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [selectedSentenceIndices, setSelectedSentenceIndices] = useState<number[]>([]);
  const [ttsWordRange, setTtsWordRange] = useState<{ start: number; end: number } | null>(null);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleWordBoundary = useCallback((charIndex: number, charLength: number) => {
    setTtsWordRange({ start: charIndex, end: charIndex + charLength });
    setIsTtsPlaying(true);
  }, []);

  const handleTTSEnd = useCallback(() => {
    setTtsWordRange(null);
    setIsTtsPlaying(false);
  }, []);

  const callGeminiWithRetry = useCallback(async (fn: () => Promise<any>, maxRetries = 3) => {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
        const isQuotaError = errorStr.includes('RESOURCE_EXHAUSTED') || error?.status === 429 || (error?.error?.code === 429);
        
        if (isQuotaError && retries < maxRetries - 1) {
          const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
          continue;
        }
        throw error;
      }
    }
  }, []);

  const zoomIn = () => updateChapter(id!, { ...chapter, content: chapter?.content || '' }); // Just to trigger re-render if needed, but we use settings now
  const zoomOut = () => {}; // Replaced by settings

  // Redirect if no chapter found
  useEffect(() => {
    if (isLoaded && (!id || (!chapter && id))) {
      router.push('/');
    }
  }, [id, chapter, router, isLoaded]);

  // --- AI Logic ---
  const modifyText = useCallback(async (text: string, level: number, action: 'shorten' | 'expand' | 'format') => {
    if (!text.trim()) return '';
    setIsProcessing(true);
    try {
      const apiKey = userApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";
      
      let prompt = "";
      if (action === 'shorten') {
        prompt = `Shorten the following text while preserving its core meaning, integrity, and important details. 
      Intensity Level: ${level}/100 (where 0 is original and 100 is extremely concise).
      Text: "${text}"
      Return only the shortened text. Do not add any preamble or explanation.`;
      } else if (action === 'expand') {
        prompt = `Expand and elaborate on the following text, adding descriptive details, sensory information, and depth while preserving its core meaning. 
      Intensity Level: ${level}/100 (where 0 is original and 100 is extremely detailed and lengthened).
      Text: "${text}"
      Return only the expanded text. Do not add any preamble or explanation.`;
      } else if (action === 'format') {
        prompt = `The following text is a "wall of text" without proper paragraph breaks or formatting. 
      Restore the paragraph structure, fix any spacing issues, and ensure it is readable and well-arranged. 
      DO NOT change the story, wording, or content. ONLY fix the formatting and paragraphing.
      Text: "${text}"
      Return only the formatted text. Do not add any preamble or explanation.`;
      }

      const response = await callGeminiWithRetry(() => ai.models.generateContent({
        model,
        contents: prompt,
      }));

      return response.text || text;
    } catch (error: any) {
      console.error("AI modification error:", error);
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      if (errorStr.includes('RESOURCE_EXHAUSTED')) {
        setErrorMessage("Gemini API quota exceeded. Please wait a moment and try again.");
      } else {
        setErrorMessage("An error occurred with the AI service. Please try again.");
      }
      return text;
    } finally {
      setIsProcessing(false);
    }
  }, [userApiKey, callGeminiWithRetry]);

  const displayContent = chapter?.shortenedContent || chapter?.content || '';
  const displaySentences = useMemo(() => {
    if (!displayContent) return [];
    
    // Split by paragraphs first to identify boundaries
    const paragraphs = displayContent.split(/\n\s*\n/);
    const allParts: string[] = [];
    
    paragraphs.forEach((para, pIdx) => {
      if (!para.trim()) return;
      
      // Split paragraph into sentences, preserving trailing punctuation and space
      const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [para];
      
      sentences.forEach((s, sIdx) => {
        let cleanSentence = s; // Keep original spacing if possible
        
        // If it's the last sentence of a paragraph (and not the last paragraph), add double newline
        if (sIdx === sentences.length - 1 && pIdx < paragraphs.length - 1) {
          // Ensure it ends with exactly two newlines for consistent paragraph spacing
          cleanSentence = cleanSentence.trimEnd() + '\n\n';
        } else if (sIdx < sentences.length - 1) {
          // Ensure a single space between sentences within a paragraph
          cleanSentence = cleanSentence.trimEnd() + ' ';
        }
        
        if (cleanSentence) {
          allParts.push(cleanSentence);
        }
      });
    });
    
    return allParts;
  }, [displayContent]);

  const analyzeWritingContext = useCallback(async (selectedText: string, fullChapter: string, title: string) => {
    setIsAuditing(true);
    setAuditResult(null);
    setUserAnswer('');
    setErrorMessage(null);
    
    try {
      const apiKey = userApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3.1-pro-preview";

      const prompt = `You are CHRONOS, a Narrative Auditor. Your goal is to identify "Narrative Gaps" in a story.
      
      CONTEXT:
      Chapter Title: "${title}"
      Full Chapter Content: "${fullChapter}"
      
      SELECTED SEGMENT TO AUDIT:
      "${selectedText}"
      
      YOUR TASK:
      Analyze the selected segment against the full chapter context. Look for:
      1. Logical Leaps: Characters knowing things they shouldn't, or conflicts resolving without cause.
      2. Contextual Thinness: Flat scenes lacking environment, stakes, or internal state.
      3. Unexplained Elements: Elements appearing without prior world-building or explanation.
      
      RESPONSE FORMAT (JSON):
      {
        "type": "QUESTION" | "STORY" | "SOUND",
        "content": "The question to ask the user OR the suggested expansion OR a confirmation message",
        "reasoning": "Your internal analysis of why this segment works or fails"
      }
      
      DECISION TREE:
      - If Gaps Found: type="QUESTION", content="Ask the user for the missing details".
      - If Context is Clear but Weak: type="STORY", content="Provide a suggested expansion that matches the tone".
      - If Narratively Sound: type="SOUND", content="Explain why it works".`;

      const response = await callGeminiWithRetry(() => ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["QUESTION", "STORY", "SOUND"] },
              content: { type: Type.STRING },
              reasoning: { type: Type.STRING }
            },
            required: ["type", "content", "reasoning"]
          }
        }
      }));

      const result = JSON.parse(response.text || '{}') as AuditResult;
      setAuditResult(result);
    } catch (error: any) {
      console.error("CHRONOS Audit Error:", error);
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      if (errorStr.includes('RESOURCE_EXHAUSTED')) {
        setErrorMessage("CHRONOS Audit quota exceeded. Please wait a moment and try again.");
      } else {
        setErrorMessage("An error occurred during the audit. Please try again.");
      }
    } finally {
      setIsAuditing(false);
    }
  }, [userApiKey, callGeminiWithRetry]);

  useEffect(() => {
    setSelectedSentenceIndices([]);
  }, [isManualEditing, mode]);

  useEffect(() => {
    if (mode === 'chronos' && selectedSentenceIndices.length > 0 && !isManualEditing) {
      const selectedText = selectedSentenceIndices
        .sort((a, b) => a - b)
        .map(idx => displaySentences[idx])
        .join(' ');
      analyzeWritingContext(selectedText, chapter?.content || '', chapter?.title || '');
    }
  }, [mode, selectedSentenceIndices, displaySentences, analyzeWritingContext, chapter?.content, chapter?.title, isManualEditing]);

  const handleManualEditChange = (newText: string) => {
    if (!id) return;
    if (chapter?.shortenedContent !== undefined) {
      updateChapter(id, { shortenedContent: newText });
    } else {
      updateChapter(id, { content: newText });
    }
  };

  const generateExpansion = useCallback(async (selectedText: string, fullChapter: string, title: string, userResponse: string) => {
    setIsProcessing(true);
    try {
      const apiKey = userApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3.1-pro-preview";

      const prompt = `You are CHRONOS. You have identified a narrative gap and the author has provided the missing details.
      
      CONTEXT:
      Chapter Title: "${title}"
      Full Chapter Content: "${fullChapter}"
      Original Segment: "${selectedText}"
      Author's Clarification: "${userResponse}"
      
      YOUR TASK:
      Perform a "Narrative Reconstruction". Expand the original segment by integrating the author's clarification.
      - TONE MATCHING: Match the surrounding text's style, vocabulary, and mood.
      - SEAMLESS SYNTHESIS: Ensure the new content flows perfectly into the existing story.
      - NO SLOP: Do not add generic AI filler. Be precise and evocative.
      
      Return ONLY the reconstructed text segment. No preamble.`;

      const response = await callGeminiWithRetry(() => ai.models.generateContent({
        model,
        contents: prompt
      }));

      if (response.text && id) {
        if (selectedSentenceIndices.length > 0) {
          const sortedIndices = [...selectedSentenceIndices].sort((a, b) => a - b);
          const newSentences = [...displaySentences];
          
          // Replace the first selected sentence with the new content
          newSentences[sortedIndices[0]] = response.text;
          
          // Remove the other selected sentences
          for (let i = sortedIndices.length - 1; i > 0; i--) {
            newSentences.splice(sortedIndices[i], 1);
          }
          
          const newContent = newSentences.join(' ');
          updateChapter(id, { shortenedContent: newContent });
          setAuditResult(null);
          // Keep mode as 'chronos' so user can see the result and apply/revert
        }
      }
    } catch (error: any) {
      console.error("CHRONOS Synthesis Error:", error);
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      if (errorStr.includes('RESOURCE_EXHAUSTED')) {
        setErrorMessage("CHRONOS Synthesis quota exceeded. Please wait a moment and try again.");
      } else {
        setErrorMessage("An error occurred during reconstruction. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [userApiKey, id, selectedSentenceIndices, displaySentences, updateChapter, callGeminiWithRetry]);

  const sentencesWithIndices = useMemo(() => {
    let currentPos = 0;
    return displaySentences.map(s => {
      const start = currentPos;
      currentPos += s.length;
      return { text: s, start, end: currentPos };
    });
  }, [displaySentences]);

  const ttsText = useMemo(() => sentencesWithIndices.map(s => s.text).join(''), [sentencesWithIndices]);

  const handleAIAction = async (action: 'shorten' | 'expand' | 'format') => {
    if (!displayContent || !id) return;
    
    if (selectedSentenceIndices.length > 0) {
      setIsProcessing(true);
      try {
        const sortedIndices = [...selectedSentenceIndices].sort((a, b) => a - b);
        const newSentences = [...displaySentences];
        
        for (const idx of sortedIndices) {
          const targetSentence = displaySentences[idx];
          const modified = await modifyText(targetSentence, intensity, action);
          newSentences[idx] = modified;
        }
        
        const newContent = newSentences.join(' ');
        updateChapter(id, { shortenedContent: newContent, intensity });
      } catch (error) {
        console.error("AI Action Error:", error);
      } finally {
        setIsProcessing(false);
      }
    } else {
      const modified = await modifyText(displayContent, intensity, action);
      updateChapter(id, { shortenedContent: modified, intensity });
    }
  };

  if (!isLoaded || (id && !chapter)) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-zinc-500">Loading your story...</p>
        </div>
      </div>
    );
  }

  const handleApply = () => {
    if (id && chapter?.shortenedContent) {
      updateChapter(id, { content: chapter.shortenedContent, shortenedContent: undefined });
      setSelectedSentenceIndices([]);
    }
  };

  const handleRevert = () => {
    if (id) {
      updateChapter(id, { shortenedContent: undefined });
      setSelectedSentenceIndices([]);
    }
  };

  const handleExport = async (format: 'txt' | 'pdf' | 'epub') => {
    if (!chapter) return;
    setShowExportMenu(false);
    const contentToExport = chapter.shortenedContent || chapter.content;
    
    try {
      if (format === 'txt') await exportToTxt(chapter.title, contentToExport);
      if (format === 'pdf') await exportToPdf(chapter.title, contentToExport);
      if (format === 'epub') await exportToEpub(chapter.title, contentToExport);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export file.");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setIsProcessing(true);
      const fileNameNoExt = file.name.replace(/\.[^/.]+$/, "");
      const importedChapters = await importFile(file);
      
      if (importedChapters.length > 0) {
        const ids = bulkAddChapters(importedChapters, fileNameNoExt);
        // Navigate to the first chapter of the new import
        router.push(`/editor?id=${ids[0]}`);
      }
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import file. Make sure it's a valid TXT, PDF, or EPUB.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!chapter) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const themeClasses = {
    light: 'bg-zinc-50 text-zinc-900',
    dark: 'bg-zinc-900 text-zinc-100',
    sepia: 'bg-[#f4ecd8] text-[#5b4636]'
  };

  const fontClasses = {
    serif: 'font-serif',
    sans: 'font-sans',
    mono: 'font-mono'
  };

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${themeClasses[settings?.theme || 'light']}`}>
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className={`min-h-16 border-b flex flex-wrap items-center justify-between px-2 py-2 md:px-8 md:py-0 gap-2 transition-colors duration-300 ${settings?.theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : settings?.theme === 'sepia' ? 'bg-[#f4ecd8] border-[#e0d5ba]' : 'bg-white border-zinc-200'}`}>
          <div className="flex items-center gap-1 md:gap-4 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            <button 
              onClick={() => router.push('/')}
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className={`flex p-1 rounded-lg flex-shrink-0 ${settings?.theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
              <button 
                onClick={() => setMode('normal')}
                className={`flex items-center gap-1.5 px-2 md:px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === 'normal' 
                    ? (settings?.theme === 'dark' ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm')
                    : (settings?.theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700')
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Normal</span>
              </button>
              <button 
                onClick={() => setMode('time')}
                className={`flex items-center gap-1.5 px-2 md:px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === 'time' 
                    ? (settings?.theme === 'dark' ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm')
                    : (settings?.theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700')
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Time</span>
              </button>
              <button 
                onClick={() => setMode('chronos')}
                className={`flex items-center gap-1.5 px-2 md:px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === 'chronos' 
                    ? (settings?.theme === 'dark' ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm')
                    : (settings?.theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700')
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chronos</span>
              </button>
            </div>
            
            <div className="flex-shrink-0">
              <TTSPlayer 
                text={ttsText} 
                onWordBoundary={handleWordBoundary}
                onEnd={handleTTSEnd}
              />
            </div>

            <div className="flex items-center gap-1 md:gap-2 ml-2 md:ml-4 border-l pl-2 md:pl-4 border-zinc-200 dark:border-zinc-800">
              <button 
                onClick={() => handleAIAction('format')}
                disabled={isProcessing || !displayContent}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                title="Auto-Format with AI"
              >
                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                <span className="hidden md:inline">Auto-Format</span>
              </button>
              <button 
                onClick={() => prevChapter && router.push(`/editor?id=${prevChapter.id}`)}
                disabled={!prevChapter}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                title="Previous Chapter"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] md:text-xs font-bold text-zinc-400 uppercase tracking-widest min-w-[60px] text-center">
                {chapterIndex + 1} / {chapters.length}
              </span>
              <button 
                onClick={() => nextChapter && router.push(`/editor?id=${nextChapter.id}`)}
                disabled={!nextChapter}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                title="Next Chapter"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-4 flex-shrink-0 ml-auto">
            {isProcessing && (
              <div className="hidden sm:flex items-center gap-2 text-[10px] md:text-xs text-indigo-600 font-medium animate-pulse">
                <Sliders className="w-3 h-3 md:w-3.5 md:h-3.5 animate-spin" />
                Processing...
              </div>
            )}
            <ReadingSettings />
            <LuminaSettings />

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImport} 
              accept=".txt,.pdf,.epub" 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className={`p-2 rounded-lg transition-colors ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
              title="Import File"
            >
              <Upload className="w-5 h-5" />
            </button>

            <div className="relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-2 md:px-4 md:py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1 md:gap-2"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              
              {showExportMenu && (
                <div className="absolute top-full right-0 mt-2 w-32 bg-white border border-zinc-200 rounded-xl shadow-xl py-2 z-50">
                  <button onClick={() => handleExport('txt')} className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">.TXT</button>
                  <button onClick={() => handleExport('pdf')} className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">.PDF</button>
                  <button onClick={() => handleExport('epub')} className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">.EPUB</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {errorMessage && (
          <div className="mx-4 md:mx-12 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3 text-red-800 text-sm">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Info className="w-4 h-4" />
              </div>
              <p>{errorMessage}</p>
            </div>
            <button 
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-red-100 rounded-lg transition-colors text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Editor Area */}
        <div className={`flex-1 overflow-y-auto p-4 md:p-12 flex justify-center transition-all duration-500 ${
          (mode === 'time' || mode === 'chronos') ? 'pb-32' : 'pb-12'
        }`}>
          <div className="w-full max-w-3xl">
            <AnimatePresence mode="wait">
              {mode === 'normal' ? (
                <motion.div 
                  key="normal-editor"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <h1 className={`text-2xl md:text-3xl font-bold ${fontClasses[settings?.fontFamily || 'serif']}`}>{chapter.title}</h1>
                  
                  {isTtsPlaying ? (
                    <div 
                      style={{ 
                        fontSize: `${settings?.fontSize || 18}px`,
                        lineHeight: settings?.lineHeight || 1.6
                      }}
                      className={`w-full min-h-[70vh] whitespace-pre-wrap ${fontClasses[settings?.fontFamily || 'serif']} ${settings?.theme === 'dark' ? 'text-zinc-100' : settings?.theme === 'sepia' ? 'text-[#5b4636]' : 'text-zinc-800'}`}
                    >
                      {sentencesWithIndices.map((s, idx) => {
                        const isTtsReadingSentence = ttsWordRange && ttsWordRange.start >= s.start && ttsWordRange.start < s.end;
                        
                        return (
                          <span 
                            key={idx}
                            className="transition-all duration-200"
                          >
                            {isTtsReadingSentence ? (
                              <>
                                {s.text.substring(0, ttsWordRange.start - s.start)}
                                <span className="bg-yellow-300 text-black rounded-sm px-0.5 font-bold shadow-sm">
                                  {s.text.substring(ttsWordRange.start - s.start, ttsWordRange.end - s.start)}
                                </span>
                                {s.text.substring(ttsWordRange.end - s.start)}
                              </>
                            ) : (
                              s.text
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={chapter.content}
                      onChange={(e) => updateChapter(id!, { content: e.target.value })}
                      placeholder="Start writing your story here..."
                      style={{ 
                        fontSize: `${settings?.fontSize || 18}px`,
                        lineHeight: settings?.lineHeight || 1.6
                      }}
                      className={`w-full min-h-[70vh] bg-transparent border-none focus:ring-0 resize-none ${fontClasses[settings?.fontFamily || 'serif']} ${settings?.theme === 'dark' ? 'text-zinc-100 placeholder:text-zinc-600' : settings?.theme === 'sepia' ? 'text-[#5b4636] placeholder:text-[#8c7b6c]' : 'text-zinc-800 placeholder:text-zinc-300'}`}
                    />
                  )}

                  {/* Bottom Navigation */}
                  <div className="flex items-center justify-between pt-12 pb-8 border-t border-zinc-100 dark:border-zinc-800">
                    <button 
                      onClick={() => prevChapter && router.push(`/editor?id=${prevChapter.id}`)}
                      disabled={!prevChapter}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all disabled:opacity-30 ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="text-sm font-bold">Previous</span>
                    </button>
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      {chapterIndex + 1} / {chapters.length}
                    </span>
                    <button 
                      onClick={() => nextChapter && router.push(`/editor?id=${nextChapter.id}`)}
                      disabled={!nextChapter}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all disabled:opacity-30 ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                    >
                      <span className="text-sm font-bold">Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="time-editor"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4 md:space-y-8"
                >
                  <div className={`border rounded-2xl p-4 md:p-8 shadow-sm ${settings?.theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : settings?.theme === 'sepia' ? 'bg-[#fdf6e3] border-[#e0d5ba]' : 'bg-white border-zinc-200'}`}>
                    <div className="flex items-center justify-between mb-4 md:mb-8">
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-base md:text-lg font-bold">
                          {isManualEditing ? 'Manual Editing' : (mode === 'time' ? 'AI Edit Preview' : 'Narrative Audit')}
                        </h3>
                        <p className={`text-[10px] md:text-xs ${settings?.theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          {isManualEditing 
                            ? "You are in manual edit mode. Changes will be saved directly."
                            : selectedSentenceIndices.length > 0 
                              ? (mode === 'time' ? `Modifying ${selectedSentenceIndices.length} selected segment${selectedSentenceIndices.length > 1 ? 's' : ''}...` : `Auditing ${selectedSentenceIndices.length} selected segment${selectedSentenceIndices.length > 1 ? 's' : ''}...`)
                              : "Select one or more segments to target them."}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsManualEditing(!isManualEditing)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            isManualEditing 
                              ? 'bg-indigo-600 text-white shadow-md' 
                              : (settings?.theme === 'dark' ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          {isManualEditing ? 'Finish Editing' : 'Manual Edit'}
                        </button>
                        {mode === 'time' && !isManualEditing && (
                          <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold">
                            {intensity}%
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="max-w-none">
                      {isManualEditing ? (
                        <textarea
                          value={displayContent}
                          onChange={(e) => handleManualEditChange(e.target.value)}
                          placeholder="Edit your text here..."
                          style={{ 
                            fontSize: `${settings?.fontSize || 18}px`,
                            lineHeight: settings?.lineHeight || 1.6
                          }}
                          className={`w-full min-h-[50vh] bg-transparent border-none focus:ring-0 resize-none ${fontClasses[settings?.fontFamily || 'serif']} ${settings?.theme === 'dark' ? 'text-zinc-100 placeholder:text-zinc-600' : settings?.theme === 'sepia' ? 'text-[#5b4636] placeholder:text-[#8c7b6c]' : 'text-zinc-800 placeholder:text-zinc-300'}`}
                        />
                      ) : (
                        <div 
                          style={{ 
                            fontSize: `${settings?.fontSize || 18}px`,
                            lineHeight: settings?.lineHeight || 1.6
                          }}
                          className={`whitespace-pre-wrap ${fontClasses[settings?.fontFamily || 'serif']}`}
                        >
                          {sentencesWithIndices.map((s, idx) => {
                            const isSelected = selectedSentenceIndices.includes(idx);
                            const isHighlighted = highlightedIndex === idx && !isSelected;
                            
                            // Check if TTS is currently reading this sentence
                            const isTtsReadingSentence = ttsWordRange && ttsWordRange.start >= s.start && ttsWordRange.start < s.end;
                            
                            return (
                              <span 
                                key={idx}
                                onMouseEnter={() => setHighlightedIndex(idx)}
                                onMouseLeave={() => setHighlightedIndex(null)}
                                onClick={() => {
                                  if (mode === 'time' || mode === 'chronos') {
                                    setSelectedSentenceIndices(prev => 
                                      prev.includes(idx) 
                                        ? prev.filter(i => i !== idx)
                                        : [...prev, idx]
                                    );
                                  }
                                }}
                                className={`transition-all duration-300 cursor-pointer inline rounded px-0.5 ${
                                  isSelected 
                                    ? 'bg-indigo-600 text-white shadow-md ring-4 ring-indigo-600/20' 
                                    : isHighlighted 
                                      ? (settings?.theme === 'dark' ? 'bg-indigo-900/50 text-indigo-200' : 'bg-indigo-100 text-indigo-900')
                                      : ''
                                }`}
                              >
                                {isTtsReadingSentence ? (
                                  <>
                                    {s.text.substring(0, ttsWordRange.start - s.start)}
                                    <span className="bg-yellow-300 text-black rounded-sm px-0.5">
                                      {s.text.substring(ttsWordRange.start - s.start, ttsWordRange.end - s.start)}
                                    </span>
                                    {s.text.substring(ttsWordRange.end - s.start)}
                                  </>
                                ) : (
                                  s.text
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Navigation */}
                  <div className="flex items-center justify-between pt-12 pb-8 border-t border-zinc-100 dark:border-zinc-800">
                    <button 
                      onClick={() => prevChapter && router.push(`/editor?id=${prevChapter.id}`)}
                      disabled={!prevChapter}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all disabled:opacity-30 ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="text-sm font-bold">Previous</span>
                    </button>
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      {chapterIndex + 1} / {chapters.length}
                    </span>
                    <button 
                      onClick={() => nextChapter && router.push(`/editor?id=${nextChapter.id}`)}
                      disabled={!nextChapter}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all disabled:opacity-30 ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                    >
                      <span className="text-sm font-bold">Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Floating UI Container */}
        <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">
          {/* Pending Actions (Apply/Revert) - Visible in any mode if shortenedContent exists */}
          <AnimatePresence>
            {chapter.shortenedContent && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                className={`flex items-center gap-2 p-2 rounded-2xl border shadow-2xl ${settings?.theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}
              >
                <button 
                  onClick={handleRevert}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${settings?.theme === 'dark' ? 'text-zinc-300 hover:bg-zinc-700' : 'text-zinc-600 hover:bg-zinc-100'}`}
                >
                  REVERT
                </button>
                <button 
                  onClick={handleApply}
                  className="px-4 py-2 text-xs font-black bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                >
                  APPLY CHANGES
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Time Mode Control Panel */}
          <AnimatePresence>
            {mode === 'time' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                className={`relative flex flex-col items-end transition-all duration-500 ${isTimeControlsMinimized ? 'w-14 h-14' : 'w-[320px] md:w-[400px] p-6'} rounded-[28px] border shadow-2xl overflow-hidden ${settings?.theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}
              >
                {isTimeControlsMinimized ? (
                  <button 
                    onClick={() => setIsTimeControlsMinimized(false)}
                    className="w-14 h-14 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    <Clock className="w-6 h-6" />
                  </button>
                ) : (
                  <div className="w-full space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Time Mode</span>
                          <span className="text-sm font-black text-indigo-600">{intensity}% Intensity</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsTimeControlsMinimized(true)}
                        className={`p-2 rounded-xl transition-colors ${settings?.theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                      >
                        <ChevronDown className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Intensity</span>
                        <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                          <span>Original</span>
                          <span>Max</span>
                        </div>
                      </div>
                      <div className="relative flex items-center h-6">
                        <div className={`absolute w-full h-2 rounded-full ${settings?.theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-100'}`} />
                        <input 
                          type="range"
                          min="0"
                          max="100"
                          value={intensity}
                          onChange={(e) => setIntensity(parseInt(e.target.value))}
                          className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer accent-indigo-600 z-10"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Target</span>
                      <div className={`relative flex items-center px-3 py-2 rounded-xl border ${settings?.theme === 'dark' ? 'bg-zinc-700 border-zinc-600' : 'bg-zinc-50 border-zinc-200'}`}>
                        <select 
                          className="w-full bg-transparent text-sm font-bold focus:outline-none cursor-pointer appearance-none pr-8"
                          value={selectedSentenceIndices.length > 0 ? 'sentence' : 'chapter'}
                          onChange={(e) => {
                            if (e.target.value === 'chapter') setSelectedSentenceIndices([]);
                          }}
                        >
                          <option value="chapter">Whole Chapter</option>
                          <option value="sentence">{selectedSentenceIndices.length > 0 ? `${selectedSentenceIndices.length} Selected` : 'Selected Sentence'}</option>
                        </select>
                        <ChevronDown className="absolute right-3 w-4 h-4 text-zinc-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button 
                        onClick={() => handleAIAction('shorten')}
                        disabled={isProcessing || isManualEditing}
                        className="flex-1 h-12 bg-indigo-600 text-white rounded-2xl text-xs font-black hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SHORTEN'}
                      </button>
                      <button 
                        onClick={() => handleAIAction('format')}
                        disabled={isProcessing || isManualEditing}
                        className="flex-1 h-12 bg-zinc-100 text-zinc-900 rounded-2xl text-xs font-black hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'FORMAT'}
                      </button>
                      <button 
                        onClick={() => handleAIAction('expand')}
                        disabled={isProcessing || isManualEditing}
                        className="flex-1 h-12 bg-emerald-600 text-white rounded-2xl text-xs font-black hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'EXPAND'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* CHRONOS Mode Control Panel */}
          <AnimatePresence>
            {mode === 'chronos' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                className={`relative flex flex-col items-end transition-all duration-500 ${isChronosMinimized ? 'w-14 h-14' : 'w-[320px] md:w-[400px] p-6'} rounded-[28px] border shadow-2xl overflow-hidden ${settings?.theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}
              >
                {isChronosMinimized ? (
                  <button 
                    onClick={() => setIsChronosMinimized(false)}
                    className="w-14 h-14 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    <Sliders className="w-6 h-6" />
                  </button>
                ) : (
                  <div className="w-full space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                          <Sliders className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">CHRONOS</span>
                          <span className="text-sm font-black text-indigo-600">Narrative Auditor</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsChronosMinimized(true)}
                        className={`p-2 rounded-xl transition-colors ${settings?.theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                      >
                        <ChevronDown className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                      {selectedSentenceIndices.length === 0 ? (
                        <div className={`p-6 rounded-3xl border-2 border-dashed flex flex-col items-center text-center gap-4 ${settings?.theme === 'dark' ? 'border-zinc-800 bg-zinc-800/20' : 'border-zinc-100 bg-zinc-50/50'}`}>
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                            <Edit2 className="w-6 h-6 text-indigo-600" />
                          </div>
                          <p className="text-sm font-medium text-zinc-500 leading-relaxed">
                            Select one or more segments of your story to begin the Narrative Audit.
                          </p>
                        </div>
                      ) : isAuditing ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Auditing Context...</p>
                        </div>
                      ) : auditResult ? (
                        <div className="space-y-6">
                          {/* Reasoning Layer */}
                          <div className={`p-6 rounded-3xl space-y-3 ${settings?.theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                              <Info className="w-3 h-3" />
                              Internal Analysis
                            </label>
                            <p className="text-sm font-medium leading-relaxed italic opacity-80">
                              &quot;{auditResult.reasoning}&quot;
                            </p>
                          </div>

                          {/* Audit Result Content */}
                          <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                              {auditResult.type === 'QUESTION' ? 'NARRATIVE GAP DETECTED' : auditResult.type === 'STORY' ? 'SUGGESTED RECONSTRUCTION' : 'NARRATIVE STATUS'}
                            </label>
                            
                            {auditResult.type === 'QUESTION' ? (
                              <div className="space-y-4">
                                <p className="text-lg font-bold leading-tight">{auditResult.content}</p>
                                <textarea 
                                  value={userAnswer}
                                  onChange={(e) => setUserAnswer(e.target.value)}
                                  placeholder="Provide the missing details..."
                                  className={`w-full h-32 p-4 rounded-2xl border text-sm font-medium focus:ring-2 focus:ring-indigo-600 focus:outline-none transition-all resize-none ${settings?.theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`}
                                />
                                <button 
                                  onClick={() => {
                                    const selectedText = selectedSentenceIndices
                                      .sort((a, b) => a - b)
                                      .map(idx => displaySentences[idx])
                                      .join(' ');
                                    generateExpansion(selectedText, chapter.content, chapter.title, userAnswer);
                                  }}
                                  disabled={!userAnswer.trim() || isProcessing || isManualEditing}
                                  className="w-full h-12 bg-indigo-600 text-white rounded-2xl text-xs font-black hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                                >
                                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'RECONSTRUCT NARRATIVE'}
                                </button>
                              </div>
                            ) : auditResult.type === 'STORY' ? (
                              <div className="space-y-4">
                                <div className={`p-6 rounded-3xl border-2 border-indigo-100 leading-relaxed text-sm ${settings?.theme === 'dark' ? 'bg-zinc-800/30 border-indigo-900/30' : 'bg-indigo-50/30'}`}>
                                  {auditResult.content}
                                </div>
                                <div className="flex gap-3">
                                  <button 
                                    onClick={() => {
                                      if (id) {
                                        const sortedIndices = [...selectedSentenceIndices].sort((a, b) => a - b);
                                        const newSentences = [...displaySentences];
                                        
                                        // Replace the first selected sentence with the new content
                                        newSentences[sortedIndices[0]] = auditResult.content;
                                        
                                        // Remove the other selected sentences
                                        for (let i = sortedIndices.length - 1; i > 0; i--) {
                                          newSentences.splice(sortedIndices[i], 1);
                                        }
                                        
                                        const newContent = newSentences.join(' ');
                                        updateChapter(id, { shortenedContent: newContent });
                                        setAuditResult(null);
                                      }
                                    }}
                                    className="flex-1 h-12 bg-emerald-600 text-white rounded-2xl text-xs font-black hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                                  >
                                    APPLY RECONSTRUCTION
                                  </button>
                                  <button 
                                    onClick={() => setAuditResult(null)}
                                    className="flex-1 h-12 bg-zinc-100 text-zinc-900 rounded-2xl text-xs font-black hover:bg-zinc-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                                  >
                                    DISCARD
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className={`p-6 rounded-3xl flex items-center gap-4 ${settings?.theme === 'dark' ? 'bg-emerald-900/20 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                                <Check className="w-6 h-6 flex-shrink-0" />
                                <p className="text-sm font-bold">This segment is narratively sound and logically consistent.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 gap-4 opacity-40">
                          <Sliders className="w-12 h-12" />
                          <p className="text-xs font-bold uppercase tracking-widest">Ready for Audit</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-zinc-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
      <EditorContent />
    </Suspense>
  );
}

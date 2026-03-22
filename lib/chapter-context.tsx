'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  bookId?: string;
  shortenedContent?: string;
  intensity?: number;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  chapterIds: string[];
}

export interface ReadingSettings {
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: 'serif' | 'sans' | 'mono';
  fontSize: number;
  lineHeight: number;
}

interface ChapterContextType {
  chapters: Chapter[];
  books: Book[];
  settings: ReadingSettings;
  addChapter: (bookId?: string) => string;
  bulkAddChapters: (newChapters: { title: string; content: string }[], bookTitle?: string) => string[];
  deleteChapter: (id: string) => void;
  deleteBook: (id: string) => void;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  getChapter: (id: string) => Chapter | undefined;
  getBook: (id: string) => Book | undefined;
  updateSettings: (updates: Partial<ReadingSettings>) => void;
  resetData: () => void;
  isLoaded: boolean;
  apiKey: string;
  updateApiKey: (key: string) => void;
}

const ChapterContext = createContext<ChapterContextType | undefined>(undefined);

export function ChapterProvider({ children }: { children: React.ReactNode }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState<ReadingSettings>({
    theme: 'light',
    fontFamily: 'serif',
    fontSize: 18,
    lineHeight: 1.6,
  });
  const [apiKey, setApiKey] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  const resetData = () => {
    setChapters([
      { 
        id: '1', 
        title: 'Introduction', 
        content: 'In the beginning, there was only the void. A vast, empty expanse that stretched across the infinite reaches of time and space. It was a place of silence and stillness, where nothing moved and nothing breathed. But then, a spark ignited. A tiny, flickering light that pierced the darkness and brought life to the universe. This spark grew and grew, spreading its warmth and energy to every corner of existence. And so, the world was born.' 
      }
    ]);
    setBooks([]);
    setSettings({
      theme: 'light',
      fontFamily: 'serif',
      fontSize: 18,
      lineHeight: 1.6,
    });
    setApiKey('');
  };

  // Load from localStorage on mount
  useEffect(() => {
    const savedChapters = localStorage.getItem('lumina_chapters');
    const savedBooks = localStorage.getItem('lumina_books');
    const savedSettings = localStorage.getItem('lumina_settings');
    const savedApiKey = localStorage.getItem('lumina_api_key');
    
    if (savedChapters) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setChapters(JSON.parse(savedChapters));
      } catch (e) {
        console.error("Failed to parse chapters", e);
      }
    } else {
      setChapters([
        { 
          id: '1', 
          title: 'Introduction', 
          content: 'In the beginning, there was only the void. A vast, empty expanse that stretched across the infinite reaches of time and space. It was a place of silence and stillness, where nothing moved and nothing breathed. But then, a spark ignited. A tiny, flickering light that pierced the darkness and brought life to the universe. This spark grew and grew, spreading its warmth and energy to every corner of existence. And so, the world was born.' 
        }
      ]);
    }

    if (savedBooks) {
      try {
        setBooks(JSON.parse(savedBooks));
      } catch (e) {
        console.error("Failed to parse books", e);
      }
    }

    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }

    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
    
    setIsLoaded(true);
  }, []);

  // Save to localStorage when chapters change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('lumina_chapters', JSON.stringify(chapters));
      localStorage.setItem('lumina_books', JSON.stringify(books));
      localStorage.setItem('lumina_settings', JSON.stringify(settings));
      localStorage.setItem('lumina_api_key', apiKey);
    }
  }, [chapters, books, settings, apiKey, isLoaded]);

  const addChapter = (bookId?: string) => {
    const newId = Date.now().toString();
    const newChapter: Chapter = {
      id: newId,
      title: `Chapter ${chapters.filter(c => c.bookId === bookId).length + 1}`,
      content: '',
      bookId,
    };
    setChapters(prev => [...prev, newChapter]);
    
    if (bookId) {
      setBooks(prev => prev.map(b => b.id === bookId ? { ...b, chapterIds: [...b.chapterIds, newId] } : b));
    }
    
    return newId;
  };

  const bulkAddChapters = (newChaptersData: { title: string; content: string }[], bookTitle?: string) => {
    const newIds: string[] = [];
    const bookId = bookTitle ? `book_${Date.now()}` : undefined;
    
    const newChapters: Chapter[] = newChaptersData.map((data, index) => {
      const id = (Date.now() + index).toString();
      newIds.push(id);
      return {
        id,
        title: data.title,
        content: data.content,
        bookId,
      };
    });
    
    setChapters(prev => [...prev, ...newChapters]);
    
    if (bookId && bookTitle) {
      const newBook: Book = {
        id: bookId,
        title: bookTitle,
        chapterIds: newIds,
      };
      setBooks(prev => [...prev, newBook]);
    }
    
    return newIds;
  };

  const deleteChapter = (id: string) => {
    const chapter = chapters.find(c => c.id === id);
    setChapters(prev => prev.filter(c => c.id !== id));
    if (chapter?.bookId) {
      setBooks(prev => prev.map(b => b.id === chapter.bookId ? { ...b, chapterIds: b.chapterIds.filter(cid => cid !== id) } : b));
    }
  };

  const deleteBook = (id: string) => {
    const book = books.find(b => b.id === id);
    if (book) {
      setChapters(prev => prev.filter(c => !book.chapterIds.includes(c.id)));
      setBooks(prev => prev.filter(b => b.id !== id));
    }
  };

  const updateChapter = (id: string, updates: Partial<Chapter>) => {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const updateBook = (id: string, updates: Partial<Book>) => {
    setBooks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const getChapter = (id: string) => {
    return chapters.find(c => c.id === id);
  };

  const getBook = (id: string) => {
    return books.find(b => b.id === id);
  };

  const updateSettings = (updates: Partial<ReadingSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const updateApiKey = (key: string) => {
    setApiKey(key);
  };

  return (
    <ChapterContext.Provider value={{ 
      chapters, 
      books, 
      settings, 
      addChapter, 
      bulkAddChapters, 
      deleteChapter, 
      deleteBook,
      updateChapter, 
      updateBook,
      getChapter, 
      getBook,
      updateSettings,
      resetData,
      isLoaded,
      apiKey,
      updateApiKey
    }}>
      {children}
    </ChapterContext.Provider>
  );
}

export function useChapters() {
  const context = useContext(ChapterContext);
  if (context === undefined) {
    throw new Error('useChapters must be used within a ChapterProvider');
  }
  return context;
}

'use client';

import React, { useState, useRef } from 'react';
import { Plus, Trash2, Edit2, BookOpen, ChevronRight, Upload, RotateCcw } from 'lucide-react';
import { useChapters } from '@/lib/chapter-context';
import { useRouter } from 'next/navigation';
import { importFile } from '@/lib/file-utils';
import { LuminaSettings } from '@/components/LuminaSettings';

export default function DashboardPage() {
  const { chapters, books, addChapter, bulkAddChapters, deleteChapter, deleteBook, updateChapter, updateBook, resetData, isLoaded } = useChapters();
  const router = useRouter();
  const [isEditingTitle, setIsEditingTitle] = useState<string | null>(null);
  const [isEditingBookTitle, setIsEditingBookTitle] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const id = addChapter(selectedBookId || undefined);
    router.push(`/editor?id=${id}`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileNameNoExt = file.name.replace(/\.[^/.]+$/, "");
      const importedChapters = await importFile(file);
      if (importedChapters.length > 0) {
        const ids = bulkAddChapters(importedChapters, fileNameNoExt);
        router.push(`/editor?id=${ids[0]}`);
      }
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import file. Please ensure it's a valid txt, pdf, or epub.");
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelect = (id: string) => {
    router.push(`/editor?id=${id}`);
  };

  const handleUpdateTitle = (id: string, title: string) => {
    updateChapter(id, { title });
    setIsEditingTitle(null);
  };

  const handleUpdateBookTitle = (id: string, title: string) => {
    updateBook(id, { title });
    setIsEditingBookTitle(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteChapter(id);
  };

  const handleDeleteBook = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setBookToDelete(id);
  };

  const confirmDeleteBook = () => {
    if (bookToDelete) {
      deleteBook(bookToDelete);
      if (selectedBookId === bookToDelete) setSelectedBookId(null);
      setBookToDelete(null);
    }
  };

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    resetData();
    setShowResetConfirm(false);
    setSelectedBookId(null);
  };

  const standaloneChapters = chapters.filter(c => !c.bookId);
  const currentBook = selectedBookId ? books.find(b => b.id === selectedBookId) : null;
  const bookChapters = currentBook ? chapters.filter(c => c.bookId === selectedBookId) : [];

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-b-2 border-indigo-600 rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-zinc-500">Loading your library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-zinc-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {selectedBookId && (
              <button 
                onClick={() => setSelectedBookId(null)}
                className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              {selectedBookId ? currentBook?.title : 'Lumina'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              accept=".txt,.pdf,.epub" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImport}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button 
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{selectedBookId ? 'New Chapter' : 'New Story'}</span>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-3 bg-zinc-50/50">
          {!selectedBookId ? (
            <>
              {/* Books List */}
              {books.map((book) => (
                <div 
                  key={book.id}
                  onClick={() => setSelectedBookId(book.id)}
                  className="group flex items-center justify-between p-4 md:p-5 bg-white rounded-2xl cursor-pointer hover:shadow-md border border-zinc-100 transition-all"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-12 bg-indigo-50 rounded-lg flex items-center justify-center border border-indigo-100">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      {isEditingBookTitle === book.id ? (
                        <input
                          autoFocus
                          className="bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 rounded-lg px-3 py-1 text-base w-full max-w-xs"
                          defaultValue={book.title}
                          onBlur={(e) => handleUpdateBookTitle(book.id, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleUpdateBookTitle(book.id, e.currentTarget.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-base font-bold text-zinc-800 truncate">{book.title}</span>
                      )}
                      <span className="text-xs text-zinc-400">{book.chapterIds.length} Chapters</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsEditingBookTitle(book.id); }}
                        className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-indigo-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteBook(e, book.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-zinc-500 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-300 ml-2" />
                  </div>
                </div>
              ))}

              {/* Standalone Chapters */}
              {standaloneChapters.map((chapter) => (
                <div 
                  key={chapter.id}
                  onClick={() => handleSelect(chapter.id)}
                  className="group flex items-center justify-between p-4 md:p-5 bg-white rounded-2xl cursor-pointer hover:shadow-md border border-zinc-100 transition-all"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-zinc-300 group-hover:bg-indigo-500 transition-colors" />
                    {isEditingTitle === chapter.id ? (
                      <input
                        autoFocus
                        className="bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 rounded-lg px-3 py-1 text-base w-full max-w-xs"
                        defaultValue={chapter.title}
                        onBlur={(e) => handleUpdateTitle(chapter.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle(chapter.id, e.currentTarget.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-base font-semibold text-zinc-800 truncate">{chapter.title}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsEditingTitle(chapter.id); }}
                        className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-indigo-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(e, chapter.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-zinc-500 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-300 ml-2" />
                  </div>
                </div>
              ))}

              {books.length === 0 && standaloneChapters.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-zinc-500">
                  <BookOpen className="w-12 h-12 text-zinc-300" />
                  <p>No stories yet. Import a file or create one!</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Book Chapters View */}
              {bookChapters.map((chapter, index) => (
                <div 
                  key={chapter.id}
                  onClick={() => handleSelect(chapter.id)}
                  className="group flex items-center justify-between p-4 md:p-5 bg-white rounded-2xl cursor-pointer hover:shadow-md border border-zinc-100 transition-all"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="text-xs font-bold text-zinc-300 w-6">{index + 1}</span>
                    {isEditingTitle === chapter.id ? (
                      <input
                        autoFocus
                        className="bg-zinc-50 border-none focus:ring-2 focus:ring-indigo-500 rounded-lg px-3 py-1 text-base w-full max-w-xs"
                        defaultValue={chapter.title}
                        onBlur={(e) => handleUpdateTitle(chapter.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle(chapter.id, e.currentTarget.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-base font-semibold text-zinc-800 truncate">{chapter.title}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsEditingTitle(chapter.id); }}
                        className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-indigo-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(e, chapter.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-zinc-500 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-300 ml-2" />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer User Profile */}
        <div className="p-4 md:p-6 border-t border-zinc-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
               {process.env.NEXT_PUBLIC_USER_EMAIL?.charAt(0).toUpperCase() || 'U'}
             </div>
             <div className="flex-1 min-w-0">
               <p className="text-sm font-semibold text-zinc-900 truncate">{process.env.NEXT_PUBLIC_USER_EMAIL || 'User'}</p>
               <p className="text-xs text-zinc-500">Pro Editor</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <LuminaSettings />
            <button 
              onClick={handleReset}
              className="p-2 hover:bg-red-50 rounded-xl text-zinc-400 hover:text-red-600 transition-colors flex items-center gap-2 text-xs font-medium"
              title="Reset All Data"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-xl space-y-6">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
              <RotateCcw className="w-8 h-8 text-red-600" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-zinc-900">Reset All Data?</h3>
              <p className="text-zinc-500 text-sm">This will permanently delete all your books, chapters, and settings. This action cannot be undone.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={confirmReset}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
              >
                Yes, Reset Everything
              </button>
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="w-full py-3 bg-zinc-100 text-zinc-600 rounded-xl font-bold hover:bg-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Book Confirmation Modal */}
      {bookToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-xl space-y-6">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-zinc-900">Delete Book?</h3>
              <p className="text-zinc-500 text-sm">Are you sure you want to delete &quot;{books.find(b => b.id === bookToDelete)?.title}&quot; and all its chapters?</p>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={confirmDeleteBook}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
              >
                Delete Book
              </button>
              <button 
                onClick={() => setBookToDelete(null)}
                className="w-full py-3 bg-zinc-100 text-zinc-600 rounded-xl font-bold hover:bg-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

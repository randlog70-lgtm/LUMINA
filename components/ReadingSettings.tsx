import React, { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { useChapters, ReadingSettings as ISettings } from '@/lib/chapter-context';

export function ReadingSettings() {
  const { settings, updateSettings } = useChapters();
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className={`p-2 rounded-lg transition-colors ${settings?.theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
        title="Reading Settings"
      >
        <Settings className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(false)}
        className={`p-2 rounded-lg transition-colors ${settings?.theme === 'dark' ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}
        title="Close Settings"
      >
        <X className="w-5 h-5" />
      </button>

      <div className={`absolute top-full right-0 mt-2 w-64 border rounded-xl shadow-xl p-4 z-50 ${settings?.theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
        <h3 className={`text-sm font-bold mb-4 ${settings?.theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>Reading Settings</h3>
        
        <div className="space-y-4">
          {/* Theme */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Theme</label>
            <div className="flex gap-2">
              {(['light', 'dark', 'sepia'] as const).map(theme => (
                <button
                  key={theme}
                  onClick={() => updateSettings({ theme })}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize border transition-colors ${
                    settings.theme === theme 
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50' 
                      : (settings?.theme === 'dark' ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50')
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Font Style</label>
            <div className="flex gap-2">
              {(['serif', 'sans', 'mono'] as const).map(font => (
                <button
                  key={font}
                  onClick={() => updateSettings({ fontFamily: font })}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize border transition-colors ${
                    settings.fontFamily === font 
                      ? 'border-indigo-600 text-indigo-700 bg-indigo-50' 
                      : (settings?.theme === 'dark' ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50')
                  }`}
                >
                  {font}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span>Font Size</span>
              <span>{settings.fontSize}px</span>
            </div>
            <input 
              type="range" 
              min="12" max="40" step="1" 
              value={settings.fontSize} 
              onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
              className="w-full accent-indigo-600"
            />
          </div>

          {/* Line Height */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span>Line Height</span>
              <span>{settings.lineHeight}x</span>
            </div>
            <input 
              type="range" 
              min="1.2" max="2.5" step="0.1" 
              value={settings.lineHeight} 
              onChange={(e) => updateSettings({ lineHeight: parseFloat(e.target.value) })}
              className="w-full accent-indigo-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

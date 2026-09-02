import React, { useState, useRef } from 'react';
import { FolderPlus, Files, PlusCircle, Search } from 'lucide-react';
import { ScannedFileItem } from '../types/electron';

interface DropZoneProps {
  onAddFiles: (files: ScannedFileItem[]) => void;
  isProcessing: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onAddFiles,
  isProcessing,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [showPasteInput, setShowPasteInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (window.electronAPI && e.dataTransfer.files.length > 0) {
      const rawPaths: string[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i] as any;
        if (f.path) rawPaths.push(f.path);
      }

      if (rawPaths.length > 0) {
        try {
          const scanned = await window.electronAPI.scanFolders(rawPaths);
          if (scanned && scanned.length > 0) {
            onAddFiles(scanned);
            return;
          }
        } catch (_) {}
      }
    }
  };

  const handleSelectFilesClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.electronAPI?.openFiles) {
      try {
        const files = await window.electronAPI.openFiles();
        if (files && files.length > 0) {
          onAddFiles(files);
        }
        return;
      } catch (err) {
        console.warn('[getDuplicates] Electron openFiles fallback:', err);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleSelectFolderClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.electronAPI?.openFolder) {
      try {
        const files = await window.electronAPI.openFolder();
        if (files && files.length > 0) {
          onAddFiles(files);
        }
        return;
      } catch (err) {
        console.warn('[getDuplicates] Electron openFolder fallback:', err);
      }
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected: ScannedFileItem[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const f = e.target.files[i] as any;
        if (f && f.name) {
          selected.push({
            name: f.name,
            path: f.path || f.name,
            size: f.size || 0,
            mtime: f.lastModified || Date.now(),
            ext: f.name.split('.').pop() ? `.${f.name.split('.').pop()}` : ''
          });
        }
      }
      if (selected.length > 0) {
        onAddFiles(selected);
      }
    }
  };

  const handleManualAdd = () => {
    if (!pastedText.trim() || !window.electronAPI?.scanFolders) return;
    const lines = pastedText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      window.electronAPI.scanFolders(lines).then((scanned) => {
        if (scanned && scanned.length > 0) {
          onAddFiles(scanned);
        }
      });
    }
    setPastedText('');
    setShowPasteInput(false);
  };

  return (
    <div className="w-full app-no-drag" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        ref={folderInputRef}
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed transition-all duration-200 p-6 rounded-xl flex flex-col items-center justify-center text-center ${
          isDragging
            ? 'border-accent-neon bg-accent-neon/10 shadow-[0_0_25px_rgba(0,245,212,0.25)] scale-[1.01]'
            : 'border-white/[0.12] bg-surface-elevated/60 hover:bg-surface-elevated/90 hover:border-white/20'
        }`}
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleSelectFolderClick}
            disabled={isProcessing}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-mono font-medium rounded-lg shadow-glow-accent transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer app-no-drag"
          >
            <FolderPlus className="w-4 h-4 text-accent-neon" />
            <span>Scan Folder for Duplicates</span>
          </button>

          <button
            type="button"
            onClick={handleSelectFilesClick}
            disabled={isProcessing}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-2 px-4 py-2 bg-surface-card hover:bg-white/10 text-slate-200 border border-white/[0.15] text-xs font-mono font-medium rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer app-no-drag"
          >
            <Files className="w-4 h-4 text-accent-cyan" />
            <span>Select Files</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowPasteInput(!showPasteInput);
            }}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.04] hover:bg-white/10 text-slate-300 text-xs font-mono rounded-lg transition-colors border border-white/10 cursor-pointer app-no-drag"
          >
            <PlusCircle className="w-3.5 h-3.5 text-accent-magenta" />
            <span>{showPasteInput ? 'Hide Path Box' : 'Paste Folder Paths'}</span>
          </button>
        </div>

        {showPasteInput && (
          <div className="w-full max-w-xl mt-4 p-3 bg-black/60 border border-white/15 rounded-lg space-y-2 text-left animate-in fade-in app-no-drag">
            <label className="text-[11px] font-mono text-slate-300 block font-semibold flex items-center justify-between">
              <span>Paste directory or file paths (one per line):</span>
              <span className="text-[10px] text-slate-500 font-normal">e.g. D:\Videos or C:\Downloads</span>
            </label>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="D:\Media\Downloads&#10;E:\Backups&#10;C:\Users\User\Documents"
              rows={3}
              className="w-full bg-black/70 border border-white/10 p-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent-neon rounded"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteInput(false)}
                className="px-3 py-1 text-xs font-mono text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualAdd}
                disabled={!pastedText.trim()}
                className="flex items-center gap-1.5 px-4 py-1 bg-accent text-white text-xs font-mono font-medium rounded hover:bg-accent-hover disabled:opacity-40 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Scan Paths</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

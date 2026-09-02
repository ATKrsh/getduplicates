import React from 'react';
import { Files, Copy, HardDrive, Clock } from 'lucide-react';

interface StatsBarProps {
  totalFiles: number;
  duplicateGroupCount: number;
  wastedBytes: number;
  processingTimeSec: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${totalSeconds.toFixed(1)}s`;
}

export const StatsBar: React.FC<StatsBarProps> = ({
  totalFiles,
  duplicateGroupCount,
  wastedBytes,
  processingTimeSec,
}) => {
  const formattedTime = formatDuration(processingTimeSec);
  const formattedWasted = formatBytes(wastedBytes);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
      {/* 1. Files Scanned */}
      <div className="p-3 bg-surface-elevated/70 border border-white/[0.08] rounded-xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
          <Files className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-slate-400 font-medium truncate">Scanned</p>
          <p className="text-sm font-bold text-white">{totalFiles}</p>
        </div>
      </div>

      {/* 2. Duplicate Groups */}
      <div className="p-3 bg-surface-elevated/70 border border-accent-cyan/30 rounded-xl flex items-center gap-3 shadow-[0_0_12px_rgba(0,240,255,0.08)]">
        <div className="w-8 h-8 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 flex items-center justify-center text-accent-cyan">
          <Copy className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-slate-400 font-medium truncate">Duplicate Sets</p>
          <p className="text-sm font-bold text-accent-cyan">{duplicateGroupCount}</p>
        </div>
      </div>

      {/* 3. Reclaimable Wasted Space */}
      <div className="p-3 bg-surface-elevated/70 border border-accent-magenta/30 rounded-xl flex items-center gap-3 shadow-[0_0_12px_rgba(247,37,133,0.08)]">
        <div className="w-8 h-8 rounded-lg bg-accent-magenta/15 border border-accent-magenta/30 flex items-center justify-center text-accent-magenta">
          <HardDrive className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-slate-400 font-medium truncate">Reclaimable</p>
          <p className="text-sm font-bold text-accent-magenta">{formattedWasted}</p>
        </div>
      </div>

      {/* 4. Processing Time */}
      <div 
        className="p-3 bg-surface-elevated/70 border border-white/[0.08] rounded-xl flex items-center gap-3"
        title={`Elapsed Time: ${formattedTime} (${processingTimeSec.toFixed(2)}s)`}
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Clock className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-slate-400 font-medium truncate">Scan Time</p>
          <p className="text-sm font-bold text-slate-200 truncate">
            {formattedTime}
          </p>
        </div>
      </div>
    </div>
  );
};

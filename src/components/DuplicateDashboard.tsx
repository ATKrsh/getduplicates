import React, { useState, useMemo } from 'react';
import { DuplicateGroup, DuplicateFileItem } from '../types/electron';
import { 
  Trash2, ExternalLink, RefreshCw, Download, File, FolderOpen, 
  CheckSquare, Square, Search, AlertCircle, Sparkles, HardDrive, ShieldAlert,
  CheckCircle2, XCircle, X, Loader2, Users
} from 'lucide-react';

export interface DeletionProgressData {
  current: number;
  total: number;
  fileName: string;
  filePath: string;
}

export interface DeletionSummaryData {
  deletedCount: number;
  freedBytes: number;
  failedCount: number;
  permanent: boolean;
}

interface DuplicateDashboardProps {
  groups: DuplicateGroup[];
  onToggleFileSelection: (groupId: string, fileId: string) => void;
  onSelectAllDuplicates: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: (permanent: boolean) => void;
  onClearAll: () => void;
  onReprocessAll: () => void;
  hasLoadedFiles: boolean;
  isDeleting: boolean;
  deletionProgress?: DeletionProgressData | null;
  deletionSummary?: DeletionSummaryData | null;
  onDismissSummary?: () => void;
  hddOptimization?: boolean;
  onToggleHddOptimization?: () => void;
  concurrency?: number;
  onConcurrencyChange?: (val: number) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const DuplicateDashboard: React.FC<DuplicateDashboardProps> = ({
  groups,
  onToggleFileSelection,
  onSelectAllDuplicates,
  onDeselectAll,
  onDeleteSelected,
  onClearAll,
  onReprocessAll,
  hasLoadedFiles,
  isDeleting,
  deletionProgress,
  deletionSummary,
  onDismissSummary,
  hddOptimization = true,
  onToggleHddOptimization,
  concurrency = 300,
  onConcurrencyChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [permanentDelete, setPermanentDelete] = useState(false);

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(g => 
      g.files.some(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    );
  }, [groups, searchQuery]);

  // Total selected files & reclaimable bytes
  const { selectedCount, selectedBytes } = useMemo(() => {
    let count = 0;
    let bytes = 0;
    for (const g of groups) {
      for (const f of g.files) {
        if (f.selectedForDeletion) {
          count++;
          bytes += f.size;
        }
      }
    }
    return { selectedCount: count, selectedBytes: bytes };
  }, [groups]);

  const handleReveal = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.electronAPI?.revealInFolder) {
      window.electronAPI.revealInFolder(filePath);
    }
  };

  const handleOpenFile = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.electronAPI?.openFile) {
      window.electronAPI.openFile(filePath);
    }
  };

  const handleExportReport = async () => {
    if (groups.length === 0 || !window.electronAPI?.exportReport) return;

    let report = `getDuplicates - Duplicate Scan Report\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Total Duplicate Sets: ${groups.length}\n`;
    report += `Selected for Deletion: ${selectedCount} files (${formatBytes(selectedBytes)})\n\n`;
    report += `------------------------------------------------------------\n\n`;

    groups.forEach((g, idx) => {
      report += `[Set #${idx + 1}] Size: ${formatBytes(g.size)} | Hash: ${g.hash}\n`;
      g.files.forEach(f => {
        const tag = f.isOriginal ? '[ORIGINAL]' : (f.selectedForDeletion ? '[SELECTED TO DELETE]' : '[DUPLICATE]');
        report += `  ${tag} ${f.path}\n`;
      });
      report += `\n`;
    });

    await window.electronAPI.exportReport(report, `duplicates_report_${Date.now()}.txt`);
  };

  const confirmDeletion = () => {
    setShowDeleteConfirm(false);
    onDeleteSelected(permanentDelete);
  };

  return (
    <div className="flex flex-col flex-1 bg-surface border border-white/5 rounded-xl overflow-hidden shadow-2xl relative min-h-0">
      {/* Header Bar with Controls */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.01] gap-2">
        <div className="flex items-center gap-3 font-mono text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent-cyan" />
            <span className="font-semibold text-white">Duplicate Clusters</span>
            <span className="px-2 py-0.5 rounded-full bg-accent/20 border border-accent/40 text-[10px] text-accent-cyan">
              {filteredGroups.length}
            </span>
          </div>

          {/* Quick Search */}
          {hasLoadedFiles && (
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2 py-0.5 bg-surface-elevated border border-white/10 rounded text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-accent-neon font-mono w-36 sm:w-48"
              />
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Concurrency Text Box */}
          {onConcurrencyChange && (
            <div 
              className="flex items-center gap-1.5 px-2 py-1 bg-surface-elevated/90 border border-white/10 rounded-lg text-slate-300 text-xs shadow-inner"
              title="Custom parallel worker limit (1 - 1000)"
            >
              <Users className="w-3.5 h-3.5 text-accent-cyan pointer-events-none" />
              <span className="text-[11px] text-slate-400">Workers:</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={concurrency}
                disabled={isDeleting}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    onConcurrencyChange(Math.max(1, Math.min(1000, val)));
                  }
                }}
                className="w-12 px-1 py-0.5 bg-black/60 border border-white/15 rounded text-center text-accent-neon font-mono font-bold text-[11px] focus:outline-none focus:border-accent-neon disabled:opacity-50"
              />
            </div>
          )}

          {/* HDD Optimization Toggle Button */}
          {onToggleHddOptimization && (
            <button
              type="button"
              onClick={onToggleHddOptimization}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer select-none ${
                hddOptimization
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.15)] hover:bg-amber-500/25'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)] hover:bg-emerald-500/25'
              }`}
              title={hddOptimization ? 'HDD Optimization: ON (32 workers with latency safe queue)' : 'SSD Turbo: ON (200 unrestricted workers)'}
            >
              <HardDrive className={`w-3.5 h-3.5 ${hddOptimization ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span className="text-[11px]">{hddOptimization ? 'HDD Safe' : 'SSD Turbo'}</span>
              <span className={`w-2 h-2 rounded-full ${hddOptimization ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            </button>
          )}

          {hasLoadedFiles && groups.length > 0 && (
            <>
              <button
                onClick={onSelectAllDuplicates}
                className="flex items-center gap-1 px-2.5 py-1 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent-cyan text-xs rounded transition-colors cursor-pointer font-mono"
                title="Automatically select duplicate copies, preserving 1 original"
              >
                <Sparkles className="w-3 h-3 text-accent-neon" />
                <span>Auto-Select Copies</span>
              </button>

              <button
                onClick={onDeselectAll}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/60 hover:bg-slate-700/80 border border-white/5 text-slate-300 text-xs rounded transition-colors cursor-pointer font-mono"
                title="Deselect all files"
              >
                <span>Deselect All</span>
              </button>

              {selectedCount > 0 && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-xs font-semibold rounded transition-colors cursor-pointer font-mono shadow-[0_0_12px_rgba(239,68,68,0.25)]"
                  title="Delete all selected duplicates"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedCount})</span>
                </button>
              )}

              <button
                onClick={handleExportReport}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs rounded transition-colors cursor-pointer font-mono"
                title="Export text report of duplicate files"
              >
                <Download className="w-3 h-3" />
                <span>Export Report</span>
              </button>
            </>
          )}

          {hasLoadedFiles && (
            <>
              <button
                onClick={onReprocessAll}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/50 hover:bg-slate-700/80 border border-white/5 text-slate-300 text-xs rounded transition-colors cursor-pointer font-mono"
                title="Rescan and recheck duplicates"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Rescan</span>
              </button>
              <button
                onClick={onClearAll}
                className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs rounded transition-colors cursor-pointer font-mono"
                title="Clear current scan results"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Post-Deletion Confirmation Toast / Banner */}
      {deletionSummary && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center justify-between text-xs font-mono animate-in fade-in shadow-lg">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <span className="font-bold text-white">
                Deletion Complete: {deletionSummary.deletedCount} files successfully removed.
              </span>
              <span className="ml-2 text-emerald-400">
                Reclaimed {formatBytes(deletionSummary.freedBytes)} disk space!
              </span>
              {deletionSummary.failedCount > 0 && (
                <span className="ml-2 text-red-400">
                  ({deletionSummary.failedCount} files failed due to permissions)
                </span>
              )}
            </div>
          </div>
          {onDismissSummary && (
            <button
              onClick={onDismissSummary}
              className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Duplicate Groups List View */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
        {groups.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono py-16">
            <HardDrive className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">No duplicate files detected yet.</p>
            <p className="text-xs opacity-60 mt-1">Select or drop a folder above to start the 200-worker scan.</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono py-12">
            <Search className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">No files match &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          filteredGroups.map((group, groupIndex) => (
            <div
              key={group.id}
              className="bg-surface-elevated/70 border border-white/[0.08] rounded-xl overflow-hidden shadow-lg transition-all"
            >
              {/* Group Header */}
              <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5 font-mono text-xs gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent-cyan font-bold text-[11px]">
                    Set #{groupIndex + 1}
                  </span>
                  <span className="text-slate-300 font-semibold">
                    {group.files.length} Identical Copies
                  </span>
                  <span className="text-slate-500 text-[10px]">
                    ({formatBytes(group.size)} each)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-accent-magenta font-semibold bg-accent-magenta/10 border border-accent-magenta/20 px-2 py-0.5 rounded">
                    Wasting {formatBytes(group.wastedBytes)}
                  </span>
                </div>
              </div>

              {/* Files in Group */}
              <div className="divide-y divide-white/[0.04]">
                {group.files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => onToggleFileSelection(group.id, file.id)}
                    className={`flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors cursor-pointer font-mono text-xs ${
                      file.selectedForDeletion ? 'bg-red-500/[0.06]' : ''
                    }`}
                  >
                    {/* Checkbox & File Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                      <div className="flex-shrink-0">
                        {file.selectedForDeletion ? (
                          <CheckSquare className="w-4 h-4 text-red-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 truncate" title={file.name}>
                            {file.name}
                          </span>
                          {file.isOriginal ? (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] text-emerald-400 font-bold">
                              ORIGINAL (Oldest)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded bg-red-500/20 border border-red-500/40 text-[9px] text-red-400 font-bold">
                              DUPLICATE
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5" title={file.path}>
                          {file.path}
                        </p>
                      </div>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] text-slate-500 hidden sm:inline">
                        {new Date(file.mtime).toLocaleDateString()}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleReveal(file.path, e)}
                        title="Reveal in Windows Explorer"
                        className="p-1.5 bg-white/[0.05] hover:bg-white/15 text-slate-300 hover:text-accent-cyan rounded transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleOpenFile(file.path, e)}
                        title="Open File Natively"
                        className="p-1.5 bg-white/[0.05] hover:bg-white/15 text-slate-300 hover:text-emerald-400 rounded transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface-elevated border border-white/15 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl font-mono">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Confirm Duplicate Deletion</h3>
                <p className="text-xs text-slate-400">{selectedCount} files selected ({formatBytes(selectedBytes)})</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete the selected duplicate files? Originals will remain untouched.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={permanentDelete}
                  onChange={(e) => setPermanentDelete(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-red-500 focus:ring-0"
                />
                <span className="text-slate-300">Permanent delete (Bypass Windows Recycle Bin)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-200 text-xs rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletion}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded shadow-[0_0_12px_rgba(239,68,68,0.4)] transition-colors cursor-pointer"
              >
                Delete Files
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Deletion Progress Modal */}
      {isDeleting && (
        <div className="fixed inset-0 z-[110] bg-black/85 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in font-mono">
          <div className="bg-surface-elevated border border-red-500/40 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-center">
            <div className="flex items-center justify-center gap-3 text-red-400">
              <Loader2 className="w-7 h-7 animate-spin text-red-400" />
              <h3 className="font-bold text-base text-white">Deleting Duplicate Files</h3>
            </div>

            {deletionProgress ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="text-red-300">
                    Deleting file {deletionProgress.current} of {deletionProgress.total}...
                  </span>
                  <span className="font-bold text-accent-neon">
                    {Math.round((deletionProgress.current / deletionProgress.total) * 100)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-black/60 rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-red-600 via-accent-magenta to-accent-neon transition-all duration-150"
                    style={{ width: `${(deletionProgress.current / deletionProgress.total) * 100}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-400 truncate text-left pt-1" title={deletionProgress.filePath}>
                  <span className="text-slate-500 font-semibold">Active: </span>
                  {deletionProgress.fileName}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 animate-pulse">Initializing safe deletion...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

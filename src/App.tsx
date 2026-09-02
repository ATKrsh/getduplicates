import React, { useState, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { ProgressBar } from './components/ProgressBar';
import { StatsBar } from './components/StatsBar';
import { DuplicateDashboard } from './components/DuplicateDashboard';
import { DuplicateScanner, ScanProgressUpdate } from './utils/duplicateScanner';
import { ScannedFileItem, DuplicateGroup } from './types/electron';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[getDuplicates UI Error]:', error, errorInfo);
    if (window.electronAPI?.logCrash) {
      window.electronAPI.logCrash(`React Boundary: ${error.message}\n${error.stack}\n${errorInfo.componentStack}`);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-6 text-center font-mono">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 shadow-lg">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-xs text-slate-400 max-w-md mb-6 font-light">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset & Reload App</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AppContent: React.FC = () => {
  const scannerRef = useRef<DuplicateScanner>(new DuplicateScanner());
  const loadedFilesRef = useRef<ScannedFileItem[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

  // Telemetry state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hddOptimization, setHddOptimization] = useState(true);
  const [concurrency, setConcurrency] = useState<number>(300);
  const [totalFilesScanned, setTotalFilesScanned] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [currentStepLabel, setCurrentStepLabel] = useState('');
  const [processingTimeSec, setProcessingTimeSec] = useState(0);

  const isProcessingRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);

  // Scan & analyze duplicate files
  const processFilesBatch = async (files: ScannedFileItem[]) => {
    if (!files || files.length === 0 || isProcessingRef.current) return;

    loadedFilesRef.current = files;
    isProcessingRef.current = true;
    setIsProcessing(true);
    startTimeRef.current = Date.now();

    const activeConcurrency = Math.max(1, Math.min(1000, concurrency || (hddOptimization ? 32 : 200)));

    setTotalFilesScanned(files.length);
    setBatchTotal(files.length);
    setProcessedCount(0);
    setProcessingTimeSec(0);
    setCurrentFileName('');
    setCurrentStepLabel(`Starting multi-tier duplicate scan (${activeConcurrency} Workers, ${hddOptimization ? 'HDD Safe' : 'SSD Direct'})...`);
    setDuplicateGroups([]);

    const timerInterval = setInterval(() => {
      if (isProcessingRef.current) {
        setProcessingTimeSec((Date.now() - startTimeRef.current) / 1000);
      }
    }, 100);

    try {
      const results = await scannerRef.current.findDuplicates(
        files,
        (update: ScanProgressUpdate) => {
          if (!isProcessingRef.current) return;
          setBatchTotal(update.totalCount);
          setProcessedCount(update.processedCount);
          setCurrentFileName(update.currentFileName);
          setCurrentStepLabel(update.stageLabel);
        },
        hddOptimization,
        activeConcurrency
      );

      if (isProcessingRef.current) {
        setDuplicateGroups(results);
      }
    } catch (err) {
      console.error('[getDuplicates] Processing error:', err);
    } finally {
      clearInterval(timerInterval);
      isProcessingRef.current = false;
      setIsProcessing(false);
      setProcessingTimeSec((Date.now() - startTimeRef.current) / 1000);
      setCurrentFileName('');
      setCurrentStepLabel('Duplicate scan complete.');
    }
  };

  const [deletionProgress, setDeletionProgress] = useState<{ current: number; total: number; fileName: string; filePath: string } | null>(null);
  const [deletionSummary, setDeletionSummary] = useState<{ deletedCount: number; freedBytes: number; failedCount: number; permanent: boolean } | null>(null);

  // Listen to IPC deletion progress events
  React.useEffect(() => {
    if (window.electronAPI?.onDeletionProgress) {
      const cleanup = window.electronAPI.onDeletionProgress((data) => {
        setDeletionProgress(data);
      });
      return cleanup;
    }
  }, []);

  const handleToggleFileSelection = (groupId: string, fileId: string) => {
    setDuplicateGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        files: group.files.map(f => {
          if (f.id !== fileId) return f;
          return { ...f, selectedForDeletion: !f.selectedForDeletion };
        })
      };
    }));
  };

  const handleSelectAllDuplicates = () => {
    setDuplicateGroups(prev => prev.map(group => ({
      ...group,
      files: group.files.map(f => ({
        ...f,
        selectedForDeletion: !f.isOriginal // Select all copies except original
      }))
    })));
  };

  const handleDeselectAll = () => {
    setDuplicateGroups(prev => prev.map(group => ({
      ...group,
      files: group.files.map(f => ({
        ...f,
        selectedForDeletion: false
      }))
    })));
  };

  const handleDeleteSelected = async (permanent: boolean) => {
    if (isDeleting || !window.electronAPI?.deleteFilesBatch) return;

    const filesToDelete: string[] = [];
    let selectedBytesSum = 0;

    duplicateGroups.forEach(g => {
      g.files.forEach(f => {
        if (f.selectedForDeletion) {
          filesToDelete.push(f.path);
          selectedBytesSum += f.size;
        }
      });
    });

    if (filesToDelete.length === 0) return;

    setIsDeleting(true);
    setDeletionProgress({
      current: 0,
      total: filesToDelete.length,
      fileName: 'Starting...',
      filePath: filesToDelete[0]
    });
    setDeletionSummary(null);
    setCurrentStepLabel(`Deleting ${filesToDelete.length} duplicate files...`);

    try {
      const deleteResults = await window.electronAPI.deleteFilesBatch(filesToDelete, permanent);
      const successfulPaths = new Set(deleteResults.filter(r => r.success).map(r => r.path));
      const failedCount = deleteResults.filter(r => !r.success).length;

      let actuallyFreedBytes = 0;
      duplicateGroups.forEach(g => {
        g.files.forEach(f => {
          if (successfulPaths.has(f.path)) {
            actuallyFreedBytes += f.size;
          }
        });
      });

      // Remove deleted files from groups
      setDuplicateGroups(prev => {
        const updatedGroups: DuplicateGroup[] = [];
        for (const g of prev) {
          const remainingFiles = g.files.filter(f => !successfulPaths.has(f.path));
          if (remainingFiles.length > 1) {
            // Still has duplicates
            updatedGroups.push({
              ...g,
              files: remainingFiles,
              wastedBytes: g.size * (remainingFiles.length - 1)
            });
          }
        }
        return updatedGroups;
      });

      setDeletionSummary({
        deletedCount: successfulPaths.size,
        freedBytes: actuallyFreedBytes > 0 ? actuallyFreedBytes : selectedBytesSum,
        failedCount,
        permanent
      });
    } catch (err) {
      console.error('[getDuplicates] Deletion error:', err);
    } finally {
      setIsDeleting(false);
      setDeletionProgress(null);
      setCurrentStepLabel('');
    }
  };

  const handleClearAll = async () => {
    isProcessingRef.current = false;
    setIsProcessing(false);
    loadedFilesRef.current = [];
    setDuplicateGroups([]);
    setTotalFilesScanned(0);
    setBatchTotal(0);
    setProcessedCount(0);
    setProcessingTimeSec(0);
    setCurrentFileName('');
    setCurrentStepLabel('');
    setDeletionSummary(null);
    setDeletionProgress(null);

    if (scannerRef.current) {
      await scannerRef.current.cancelAll();
    }
  };

  const handleReprocessAll = () => {
    const activeFiles = [...loadedFilesRef.current];
    if (activeFiles.length === 0) return;
    setDuplicateGroups([]);
    setProcessedCount(0);
    setProcessingTimeSec(0);
    setDeletionSummary(null);
    processFilesBatch(activeFiles);
  };

  const handleCancelProcessing = async () => {
    isProcessingRef.current = false;
    setIsProcessing(false);
    setCurrentFileName('');
    setCurrentStepLabel('Terminating scan tasks...');

    if (scannerRef.current) {
      await scannerRef.current.cancelAll();
    }

    setCurrentStepLabel('All scan tasks terminated.');
  };

  // Calculate total duplicates & wasted bytes
  const { totalDuplicateFiles, totalWastedBytes } = duplicateGroups.reduce(
    (acc, g) => {
      acc.totalDuplicateFiles += (g.files.length - 1);
      acc.totalWastedBytes += g.wastedBytes;
      return acc;
    },
    { totalDuplicateFiles: 0, totalWastedBytes: 0 }
  );

  const hasLoadedFiles = loadedFilesRef.current.length > 0;

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-slate-100 overflow-hidden font-sans border border-white/10 select-none">
      <Header
        totalFiles={totalFilesScanned}
        duplicateCount={totalDuplicateFiles}
        isProcessing={isProcessing}
      />
      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden min-w-0">
        <DropZone
          onAddFiles={processFilesBatch}
          isProcessing={isProcessing}
        />
        <ProgressBar
          isProcessing={isProcessing}
          totalFiles={batchTotal}
          processedCount={processedCount}
          currentFileName={currentFileName}
          currentStepLabel={currentStepLabel}
          onCancel={handleCancelProcessing}
        />
        <StatsBar
          totalFiles={totalFilesScanned}
          duplicateGroupCount={duplicateGroups.length}
          wastedBytes={totalWastedBytes}
          processingTimeSec={processingTimeSec}
        />
        <DuplicateDashboard
          groups={duplicateGroups}
          onToggleFileSelection={handleToggleFileSelection}
          onSelectAllDuplicates={handleSelectAllDuplicates}
          onDeselectAll={handleDeselectAll}
          onDeleteSelected={handleDeleteSelected}
          onClearAll={handleClearAll}
          onReprocessAll={handleReprocessAll}
          hasLoadedFiles={hasLoadedFiles}
          isDeleting={isDeleting}
          deletionProgress={deletionProgress}
          deletionSummary={deletionSummary}
          onDismissSummary={() => setDeletionSummary(null)}
          hddOptimization={hddOptimization}
          onToggleHddOptimization={() => setHddOptimization(!hddOptimization)}
          concurrency={concurrency}
          onConcurrencyChange={setConcurrency}
        />
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;

import { ScannedFileItem, DuplicateFileItem, DuplicateGroup } from '../types/electron';

export interface ScanProgressUpdate {
  stage: 'SCANNING' | 'GROUPING_SIZE' | 'HASHING_PARTIAL' | 'HASHING_FULL' | 'COMPLETE';
  stageLabel: string;
  processedCount: number;
  totalCount: number;
  currentFileName: string;
}

export class DuplicateScanner {
  private isCancelled = false;

  public async cancelAll(): Promise<void> {
    this.isCancelled = true;
    if (window.electronAPI?.cancelAllTasks) {
      try {
        await window.electronAPI.cancelAllTasks();
      } catch (_) {}
    }
    setTimeout(() => {
      this.isCancelled = false;
    }, 300);
  }

  public async findDuplicates(
    files: ScannedFileItem[],
    onProgress: (update: ScanProgressUpdate) => void,
    hddOptimization: boolean = true,
    customConcurrency: number = 300
  ): Promise<DuplicateGroup[]> {
    this.isCancelled = false;

    if (!files || files.length === 0 || !window.electronAPI) {
      return [];
    }

    // STAGE 1: Fast Size-Based Pre-Clustering (0ms Disk I/O, removes 90%+ of files)
    onProgress({
      stage: 'GROUPING_SIZE',
      stageLabel: 'Analyzing file size clusters...',
      processedCount: 0,
      totalCount: files.length,
      currentFileName: 'Categorizing file sizes...'
    });

    const sizeBuckets = new Map<number, ScannedFileItem[]>();
    for (const file of files) {
      if (this.isCancelled) return [];
      if (file.size > 0) {
        const bucket = sizeBuckets.get(file.size);
        if (bucket) {
          bucket.push(file);
        } else {
          sizeBuckets.set(file.size, [file]);
        }
      }
    }

    // Filter to only size collisions (buckets with >= 2 files)
    const sizeCollisionFiles: ScannedFileItem[] = [];
    for (const [, bucket] of sizeBuckets.entries()) {
      if (bucket.length > 1) {
        for (const file of bucket) {
          sizeCollisionFiles.push(file);
        }
      }
    }

    if (sizeCollisionFiles.length === 0 || this.isCancelled) {
      return [];
    }

    // Dynamic concurrency from user input box (safe bounded between 1 and 1000)
    const CONCURRENCY = Math.max(1, Math.min(1000, Number(customConcurrency) || (hddOptimization ? 32 : 200)));
    const YIELD_DELAY_MS = hddOptimization ? 4 : 0;
    let completedPartial = 0;
    let nextPartialIdx = 0;
    const partialHashResults = new Map<string, ScannedFileItem[]>(); // key: `${size}_${partialHash}`

    onProgress({
      stage: 'HASHING_PARTIAL',
      stageLabel: `Stage 1: Header/Footer partial hashing (${CONCURRENCY} Workers, ${hddOptimization ? 'HDD Safe' : 'Direct IO'})...`,
      processedCount: 0,
      totalCount: sizeCollisionFiles.length,
      currentFileName: ''
    });

    // STAGE 2: 200-Worker Tier A Partial Hashing (First 64KB + Last 64KB)
    const partialWorker = async () => {
      while (!this.isCancelled && nextPartialIdx < sizeCollisionFiles.length) {
        const idx = nextPartialIdx++;
        const file = sizeCollisionFiles[idx];
        if (!file) continue;

        try {
          const res = await window.electronAPI!.computePartialHash(file.path);
          if (res && res.success && res.hash) {
            const key = `${file.size}_${res.hash}`;
            const group = partialHashResults.get(key);
            if (group) {
              group.push(file);
            } else {
              partialHashResults.set(key, [file]);
            }
          }
        } catch (_) {}

        completedPartial++;
        if (completedPartial % 5 === 0 || completedPartial === sizeCollisionFiles.length) {
          onProgress({
            stage: 'HASHING_PARTIAL',
            stageLabel: `Stage 1: Partial hash check (${completedPartial}/${sizeCollisionFiles.length})`,
            processedCount: completedPartial,
            totalCount: sizeCollisionFiles.length,
            currentFileName: file.name
          });
        }
        if (YIELD_DELAY_MS > 0) {
          await new Promise(r => setTimeout(r, YIELD_DELAY_MS));
        } else {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    };

    const partialWorkersCount = Math.min(CONCURRENCY, sizeCollisionFiles.length);
    await Promise.all(Array.from({ length: partialWorkersCount }, () => partialWorker()));

    if (this.isCancelled) return [];

    // Filter to candidates where partial hash also matched
    const fullHashCandidates: ScannedFileItem[] = [];
    for (const [, bucket] of partialHashResults.entries()) {
      if (bucket.length > 1) {
        for (const file of bucket) {
          fullHashCandidates.push(file);
        }
      }
    }

    if (fullHashCandidates.length === 0 || this.isCancelled) {
      return [];
    }

    onProgress({
      stage: 'HASHING_FULL',
      stageLabel: `Stage 2: Cryptographic full verification (${CONCURRENCY} Workers, ${hddOptimization ? 'HDD Safe' : 'Direct IO'})...`,
      processedCount: 0,
      totalCount: fullHashCandidates.length,
      currentFileName: ''
    });

    // STAGE 3: 200-Worker Tier B Full Stream Hashing for definitive match
    let completedFull = 0;
    let nextFullIdx = 0;
    const fullHashResults = new Map<string, ScannedFileItem[]>(); // key: `${size}_${fullHash}`

    const fullWorker = async () => {
      while (!this.isCancelled && nextFullIdx < fullHashCandidates.length) {
        const idx = nextFullIdx++;
        const file = fullHashCandidates[idx];
        if (!file) continue;

        try {
          const res = await window.electronAPI!.computeFullHash(file.path);
          if (res && res.success && res.hash) {
            const key = `${file.size}_${res.hash}`;
            const group = fullHashResults.get(key);
            if (group) {
              group.push(file);
            } else {
              fullHashResults.set(key, [file]);
            }
          }
        } catch (_) {}

        completedFull++;
        if (completedFull % 3 === 0 || completedFull === fullHashCandidates.length) {
          onProgress({
            stage: 'HASHING_FULL',
            stageLabel: `Stage 2: Verified full hashes (${completedFull}/${fullHashCandidates.length})`,
            processedCount: completedFull,
            totalCount: fullHashCandidates.length,
            currentFileName: file.name
          });
        }
        if (YIELD_DELAY_MS > 0) {
          await new Promise(r => setTimeout(r, YIELD_DELAY_MS));
        } else {
          await new Promise(r => setTimeout(r, 0));
        }
      }
    };

    const fullWorkersCount = Math.min(CONCURRENCY, fullHashCandidates.length);
    await Promise.all(Array.from({ length: fullWorkersCount }, () => fullWorker()));

    if (this.isCancelled) return [];

    // STAGE 4: Assemble confirmed Duplicate Groups
    const duplicateGroups: DuplicateGroup[] = [];
    let groupCounter = 1;

    for (const [key, rawFiles] of fullHashResults.entries()) {
      if (rawFiles.length > 1) {
        const [sizeStr, hash] = key.split('_');
        const size = parseInt(sizeStr, 10) || rawFiles[0].size;

        // Sort files in cluster: oldest file first (preserves original), then shortest path
        const sortedFiles = [...rawFiles].sort((a, b) => {
          if (a.mtime !== b.mtime) {
            return a.mtime - b.mtime; // Oldest first
          }
          return a.path.length - b.path.length; // Shortest path first
        });

        const duplicateItems: DuplicateFileItem[] = sortedFiles.map((f, i) => ({
          ...f,
          id: `dup-${Date.now()}-${groupCounter}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          hash,
          isOriginal: i === 0, // First file is marked original
          selectedForDeletion: i > 0 // Duplicates auto-selected for deletion
        }));

        duplicateGroups.push({
          id: `group-${Date.now()}-${groupCounter++}`,
          hash,
          size,
          files: duplicateItems,
          wastedBytes: size * (duplicateItems.length - 1)
        });
      }
    }

    // Sort duplicate groups by wasted space descending (largest reclaimable first)
    duplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);

    onProgress({
      stage: 'COMPLETE',
      stageLabel: 'Duplicate scan completed.',
      processedCount: fullHashCandidates.length,
      totalCount: fullHashCandidates.length,
      currentFileName: ''
    });

    return duplicateGroups;
  }
}

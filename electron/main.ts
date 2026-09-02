import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// High stability & performance memory flags for Windows
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

function getDumpDirectory(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'dump');
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'dump');
  }
  const exeDir = path.dirname(app.getPath('exe'));
  const exeDump = path.join(exeDir, 'dump');
  try {
    if (!fs.existsSync(exeDump)) {
      fs.mkdirSync(exeDump, { recursive: true });
    }
    const testFile = path.join(exeDump, '.probe_write');
    fs.writeFileSync(testFile, '1');
    fs.unlinkSync(testFile);
    return exeDump;
  } catch (_) {
    const userDataDump = path.join(app.getPath('userData'), 'dump');
    try {
      if (!fs.existsSync(userDataDump)) {
        fs.mkdirSync(userDataDump, { recursive: true });
      }
    } catch (_) {}
    return userDataDump;
  }
}

const dumpPath = getDumpDirectory();

function cleanAllPreviousCaches() {
  try {
    if (fs.existsSync(dumpPath)) {
      const items = fs.readdirSync(dumpPath);
      for (const item of items) {
        if (item === '.probe_write') continue;
        const full = path.join(dumpPath, item);
        try {
          if (fs.statSync(full).isDirectory()) {
            fs.rmSync(full, { recursive: true, force: true });
          } else {
            fs.unlinkSync(full);
          }
        } catch (_) {}
      }
      console.log('[getDuplicates] Cleaned previous dump cache on launch.');
    } else {
      fs.mkdirSync(dumpPath, { recursive: true });
    }
  } catch (err) {
    console.warn('[getDuplicates] Failed to clean previous dump cache:', err);
  }
}

try {
  if (!fs.existsSync(dumpPath)) {
    fs.mkdirSync(dumpPath, { recursive: true });
  }
} catch (err) {
  console.error('[getDuplicates] Failed to create dump path:', err);
}

function writeCrashLog(type: string, message: string, stack?: string) {
  try {
    const logPath = path.join(dumpPath, 'crash.log');
    const timestamp = new Date().toISOString();
    const logEntry = `\n[${timestamp}] [${type}] ${message}\n${stack || ''}\n`;
    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (err) {
    console.error('Failed to write crash log:', err);
  }
}

process.on('uncaughtException', (error) => {
  console.error('[getDuplicates] Uncaught Exception:', error);
  writeCrashLog('MainProcess_UncaughtException', error.message, error.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[getDuplicates] Unhandled Rejection:', reason);
  writeCrashLog('MainProcess_UnhandledRejection', String(reason), reason instanceof Error ? reason.stack : undefined);
});

app.on('render-process-gone', (_event, _webContents, details) => {
  writeCrashLog('RenderProcessGone', `Reason: ${details.reason}, ExitCode: ${details.exitCode}`);
});

const SYSTEM_FILES_TO_IGNORE = new Set([
  'thumbs.db', '.ds_store', 'desktop.ini', 'folder.jpg', 'icon\r', '$recycle.bin', 'system volume information'
]);

function shouldIgnoreFile(filename: string): boolean {
  if (!filename) return true;
  const lower = filename.toLowerCase();
  return lower.startsWith('.') || SYSTEM_FILES_TO_IGNORE.has(lower);
}

export interface ScannedFileItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
  ext: string;
}

// Locality-preserving recursive directory scanner
async function scanDirectoryRecursive(dirPath: string): Promise<ScannedFileItem[]> {
  const results: ScannedFileItem[] = [];

  async function walk(dir: string) {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      // Sort entries alphabetically to preserve physical sector locality on HDDs
      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const lowerName = entry.name.toLowerCase();
          if (
            !entry.name.startsWith('.') &&
            lowerName !== '$recycle.bin' &&
            lowerName !== 'system volume information' &&
            lowerName !== 'node_modules' &&
            lowerName !== '.git'
          ) {
            await walk(fullPath);
          }
        } else if (entry.isFile() && !shouldIgnoreFile(entry.name)) {
          try {
            const stat = await fs.promises.stat(fullPath);
            if (stat.size > 0) {
              results.push({
                name: entry.name,
                path: fullPath,
                size: stat.size,
                mtime: stat.mtimeMs,
                ext: path.extname(entry.name).toLowerCase()
              });
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      console.warn(`[getDuplicates] Failed to read dir: ${dir}`, err);
    }
  }

  try {
    await walk(dirPath);
  } catch (_) {}
  return results;
}

function getIndexHtmlPath(): string {
  const possiblePaths = [
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(__dirname, 'dist', 'index.html'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function getPreloadPath(): string {
  const cjsPath = path.join(__dirname, 'preload.cjs');
  if (fs.existsSync(cjsPath)) return cjsPath;
  return path.join(__dirname, 'preload.js');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 790,
    minWidth: 880,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#05070d',
    title: 'getDuplicates',
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5176').catch(() => {
      mainWindow?.loadFile(getIndexHtmlPath());
    });
  } else {
    mainWindow.loadFile(getIndexHtmlPath());
  }

  mainWindow.once('ready-to-show', () => {
    // Purge any persistent Chromium cache and storage partitions on fresh start
    if (mainWindow?.webContents?.session) {
      mainWindow.webContents.session.clearCache().catch(() => {});
      mainWindow.webContents.session.clearStorageData({
        storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
      }).catch(() => {});
    }
    mainWindow?.show();
  });

  mainWindow.on('restore', () => {
    mainWindow?.webContents.invalidate();
  });

  mainWindow.on('focus', () => {
    mainWindow?.webContents.invalidate();
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:state-changed', { isMaximized: true });
    mainWindow?.webContents.invalidate();
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state-changed', { isMaximized: false });
    mainWindow?.webContents.invalidate();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

interface DriveBucket {
  drive: string;
  running: number;
  concurrency: number;
  queue: Array<() => void>;
  recentLatencies: number[];
  lastAdjust: number;
}

// Drive-Aware Adaptive Concurrency Queue (200 Global Workers with per-drive queue depth & HDD latency backpressure)
class DriveAwareQueue {
  private globalConcurrency: number;
  private globalRunning = 0;
  private driveBuckets = new Map<string, DriveBucket>();

  constructor(globalConcurrency = 200) {
    this.globalConcurrency = Math.max(1, globalConcurrency);
  }

  private getDriveRoot(filePath: string): string {
    try {
      if (!filePath) return 'DEFAULT';
      const resolved = path.resolve(filePath);
      const match = resolved.match(/^([a-zA-Z]:|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/);
      if (match) {
        return match[1].toUpperCase();
      }
    } catch (_) {}
    return 'DEFAULT';
  }

  private getOrCreateBucket(drive: string): DriveBucket {
    let bucket = this.driveBuckets.get(drive);
    if (!bucket) {
      bucket = {
        drive,
        running: 0,
        concurrency: 8, // Initial optimal queue depth per physical drive volume
        queue: [],
        recentLatencies: [],
        lastAdjust: Date.now()
      };
      this.driveBuckets.set(drive, bucket);
    }
    return bucket;
  }

  private adjustBucket(bucket: DriveBucket, durationMs: number) {
    bucket.recentLatencies.push(durationMs);
    if (bucket.recentLatencies.length > 10) {
      bucket.recentLatencies.shift();
    }

    const now = Date.now();
    // Adaptive backpressure tuning every 1.5s
    if (now - bucket.lastAdjust > 1500 && bucket.recentLatencies.length >= 4) {
      bucket.lastAdjust = now;
      const sum = bucket.recentLatencies.reduce((a, b) => a + b, 0);
      const avg = sum / bucket.recentLatencies.length;

      if (avg > 2500) {
        // High disk latency / mechanical HDD queue stall detected: throttle drive queue depth
        bucket.concurrency = Math.max(3, bucket.concurrency - 2);
      } else if (avg < 800) {
        // Fast NVMe SSD / light load: ramp up per-drive concurrency
        bucket.concurrency = Math.min(32, bucket.concurrency + 2);
      }
    }
  }

  run<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const drive = this.getDriveRoot(filePath);
    const bucket = this.getOrCreateBucket(drive);

    return new Promise((resolve, reject) => {
      const execute = () => {
        this.globalRunning++;
        bucket.running++;
        const startTime = Date.now();

        fn()
          .then((res) => {
            this.adjustBucket(bucket, Date.now() - startTime);
            resolve(res);
          })
          .catch((err) => {
            this.adjustBucket(bucket, Date.now() - startTime);
            reject(err);
          })
          .finally(() => {
            this.globalRunning--;
            bucket.running--;
            this.dispatchNext();
          });
      };

      if (this.globalRunning < this.globalConcurrency && bucket.running < bucket.concurrency) {
        execute();
      } else {
        bucket.queue.push(execute);
      }
    });
  }

  private dispatchNext() {
    if (this.globalRunning >= this.globalConcurrency) return;

    // Fair round-robin across drive buckets to prevent starvation
    for (const bucket of this.driveBuckets.values()) {
      if (this.globalRunning >= this.globalConcurrency) break;
      if (bucket.running < bucket.concurrency && bucket.queue.length > 0) {
        const nextTask = bucket.queue.shift();
        if (nextTask) {
          nextTask();
        }
      }
    }
  }

  clear() {
    for (const bucket of this.driveBuckets.values()) {
      bucket.queue = [];
      bucket.running = 0;
    }
    this.globalRunning = 0;
  }
}

// 200 Ultra-High-Throughput Global Workers
const MAX_CONCURRENT_EXTRACTIONS = 200;
const driveQueue = new DriveAwareQueue(MAX_CONCURRENT_EXTRACTIONS);

let isCancellationRequested = false;

// Tier A: Partial Hash (First 64KB + Last 64KB)
async function computePartialHash(filePath: string): Promise<string> {
  const PART_SIZE = 65536; // 64KB
  const stat = await fs.promises.stat(filePath);
  const fileSize = stat.size;

  const handle = await fs.promises.open(filePath, 'r');
  const hash = crypto.createHash('md5');

  try {
    if (fileSize <= PART_SIZE * 2) {
      // Small file: read in full
      const buffer = Buffer.alloc(fileSize);
      await handle.read(buffer, 0, fileSize, 0);
      hash.update(buffer);
    } else {
      // Header 64KB
      const headBuf = Buffer.alloc(PART_SIZE);
      await handle.read(headBuf, 0, PART_SIZE, 0);
      hash.update(headBuf);

      // Footer 64KB
      const tailBuf = Buffer.alloc(PART_SIZE);
      await handle.read(tailBuf, 0, PART_SIZE, fileSize - PART_SIZE);
      hash.update(tailBuf);
    }
    return hash.digest('hex');
  } finally {
    await handle.close().catch(() => {});
  }
}

// Tier B: Full Streaming Hash
function computeFullHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath, { highWaterMark: 1048576 }); // 1MB buffer

    stream.on('data', (chunk) => {
      if (isCancellationRequested) {
        stream.destroy();
        reject(new Error('Cancelled'));
        return;
      }
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

function setupIPC() {
  ipcMain.handle('crash:log', (_event, errorInfo: string) => {
    writeCrashLog('RendererProcessError', errorInfo);
    return true;
  });

  // Window controls
  ipcMain.handle('window:minimize', () => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      win?.minimize();
      return true;
    } catch (_) {
      return false;
    }
  });

  ipcMain.handle('window:maximize', () => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMaximized()) {
          win.unmaximize();
          return false;
        } else {
          win.maximize();
          return true;
        }
      }
    } catch (_) {}
    return false;
  });

  ipcMain.handle('window:close', () => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      win?.close();
      return true;
    } catch (_) {
      return false;
    }
  });

  ipcMain.handle('window:isMaximized', () => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      return win ? win.isMaximized() : false;
    } catch (_) {
      return false;
    }
  });

  // Dialog: Select Files
  ipcMain.handle('dialog:openFiles', async () => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const res = win
        ? await dialog.showOpenDialog(win, {
            title: 'Select Files to Check Duplicates',
            properties: ['openFile', 'multiSelections'],
          })
        : await dialog.showOpenDialog({
            title: 'Select Files to Check Duplicates',
            properties: ['openFile', 'multiSelections'],
          });
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return [];
      
      const results: ScannedFileItem[] = [];
      for (const filePath of res.filePaths) {
        try {
          const stat = await fs.promises.stat(filePath);
          if (stat.size > 0) {
            results.push({
              name: path.basename(filePath),
              path: filePath,
              size: stat.size,
              mtime: stat.mtimeMs,
              ext: path.extname(filePath).toLowerCase()
            });
          }
        } catch (_) {}
      }
      return results;
    } catch (err) {
      console.error('[getDuplicates] Error in dialog:openFiles:', err);
      return [];
    }
  });

  // Dialog: Select Folder
  ipcMain.handle('dialog:openFolder', async () => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const res = win
        ? await dialog.showOpenDialog(win, {
            title: 'Select Folder to Scan for Duplicates',
            properties: ['openDirectory', 'multiSelections'],
          })
        : await dialog.showOpenDialog({
            title: 'Select Folder to Scan for Duplicates',
            properties: ['openDirectory', 'multiSelections'],
          });
      if (res.canceled || !res.filePaths || res.filePaths.length === 0) return [];
      const allResults: ScannedFileItem[] = [];
      for (const dirPath of res.filePaths) {
        const found = await scanDirectoryRecursive(dirPath);
        for (let i = 0; i < found.length; i++) {
          allResults.push(found[i]);
        }
      }
      return allResults;
    } catch (err) {
      console.error('[getDuplicates] Error in dialog:openFolder:', err);
      return [];
    }
  });

  // Scan Specific Folder Paths or Files
  ipcMain.handle('fs:scanFolders', async (_event, folderPaths: string[]) => {
    const allResults: ScannedFileItem[] = [];
    if (!Array.isArray(folderPaths)) return allResults;
    for (const fPath of folderPaths) {
      try {
        const stats = await fs.promises.stat(fPath).catch(() => null);
        if (stats?.isDirectory()) {
          const found = await scanDirectoryRecursive(fPath);
          for (let i = 0; i < found.length; i++) {
            allResults.push(found[i]);
          }
        } else if (stats?.isFile() && stats.size > 0 && !shouldIgnoreFile(path.basename(fPath))) {
          allResults.push({
            name: path.basename(fPath),
            path: fPath,
            size: stats.size,
            mtime: stats.mtimeMs,
            ext: path.extname(fPath).toLowerCase()
          });
        }
      } catch (_) {}
    }
    return allResults;
  });

  // Cancel All Operations
  ipcMain.handle('process:cancelAll', async () => {
    isCancellationRequested = true;
    driveQueue.clear();
    setTimeout(() => {
      isCancellationRequested = false;
    }, 300);
    return { success: true };
  });

  // Compute Partial Hash (Tier A)
  ipcMain.handle('hash:computePartial', async (_event, filePath: string) => {
    if (isCancellationRequested) return { success: false, error: 'Cancelled' };
    return driveQueue.run(filePath, async () => {
      if (isCancellationRequested) return { success: false, error: 'Cancelled' };
      try {
        const partialHash = await computePartialHash(filePath);
        return { success: true, hash: partialHash };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    });
  });

  // Compute Full Hash (Tier B)
  ipcMain.handle('hash:computeFull', async (_event, filePath: string) => {
    if (isCancellationRequested) return { success: false, error: 'Cancelled' };
    return driveQueue.run(filePath, async () => {
      if (isCancellationRequested) return { success: false, error: 'Cancelled' };
      try {
        const fullHash = await computeFullHash(filePath);
        return { success: true, hash: fullHash };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    });
  });

  // Reveal in Windows Explorer
  ipcMain.handle('fs:reveal', async (_event, filePath: string) => {
    try {
      if (filePath && fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return true;
      }
    } catch (_) {}
    return false;
  });

  // Open file natively
  ipcMain.handle('fs:openFile', async (_event, filePath: string) => {
    try {
      if (filePath && fs.existsSync(filePath)) {
        await shell.openPath(filePath);
        return true;
      }
    } catch (_) {}
    return false;
  });

  // Delete file safely (to Recycle Bin with direct unlink fallback)
  ipcMain.handle('fs:deleteFile', async (_event, rawPath: string, permanent = false) => {
    try {
      if (!rawPath) return { success: false, error: 'Empty path' };
      const cleanPath = path.normalize(rawPath.replace(/^file:\/\/\/?/, ''));
      if (!fs.existsSync(cleanPath)) {
        return { success: true };
      }
      let deleted = false;
      let lastError = '';
      if (!permanent && typeof shell.trashItem === 'function') {
        try {
          await shell.trashItem(cleanPath);
          deleted = true;
        } catch (e: any) {
          lastError = e?.message || String(e);
        }
      }
      if (!deleted) {
        try {
          await fs.promises.chmod(cleanPath, 0o666).catch(() => {});
          await fs.promises.unlink(cleanPath);
          deleted = true;
        } catch (e: any) {
          lastError = e?.message || String(e);
        }
      }
      return { success: deleted, error: deleted ? undefined : lastError };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  });

  // Batch delete files with live progress broadcast and robust Recycle Bin -> Unlink fallback
  ipcMain.handle('fs:deleteFilesBatch', async (_event, filePaths: string[], permanent = false) => {
    const results: Array<{ path: string; success: boolean; error?: string }> = [];
    if (!Array.isArray(filePaths)) return results;

    const total = filePaths.length;
    for (let i = 0; i < total; i++) {
      const origPath = filePaths[i];
      try {
        const cleanPath = path.normalize(origPath.replace(/^file:\/\/\/?/, ''));
        const fileName = path.basename(cleanPath);

        // Send live progress event
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('deletion:progress', {
            current: i + 1,
            total,
            filePath: origPath,
            fileName
          });
        }

        if (!fs.existsSync(cleanPath)) {
          results.push({ path: origPath, success: true });
          continue;
        }

        let deleted = false;
        let lastError = '';

        // Strategy 1: Windows Recycle Bin (unless permanent)
        if (!permanent && typeof shell.trashItem === 'function') {
          try {
            await shell.trashItem(cleanPath);
            deleted = true;
          } catch (e: any) {
            lastError = e?.message || String(e);
          }
        }

        // Strategy 2: Direct unlink fallback if Recycle Bin fails or permanent delete
        if (!deleted) {
          try {
            await fs.promises.chmod(cleanPath, 0o666).catch(() => {});
            await fs.promises.unlink(cleanPath);
            deleted = true;
          } catch (e: any) {
            lastError = e?.message || String(e);
          }
        }

        results.push({
          path: origPath,
          success: deleted,
          error: deleted ? undefined : lastError
        });
      } catch (err: any) {
        results.push({ path: origPath, success: false, error: err.message });
      }
    }
    return results;
  });

  // Export Duplicate Report
  ipcMain.handle('fs:exportReport', async (_event, reportData: string, defaultName = 'duplicates_report.txt') => {
    try {
      const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const res = await dialog.showSaveDialog(win || mainWindow!, {
        title: 'Export Duplicate Report',
        defaultPath: defaultName,
        filters: [
          { name: 'Text Document', extensions: ['txt'] },
          { name: 'JSON Document', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (res.canceled || !res.filePath) return { success: false };
      await fs.promises.writeFile(res.filePath, reportData, 'utf8');
      shell.showItemInFolder(res.filePath);
      return { success: true, path: res.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    cleanAllPreviousCaches();
    setupIPC();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

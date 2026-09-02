export interface ScannedFileItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
  ext: string;
}

export interface DuplicateFileItem extends ScannedFileItem {
  id: string;
  hash?: string;
  isOriginal?: boolean;
  selectedForDeletion?: boolean;
}

export interface DuplicateGroup {
  id: string;
  hash: string;
  size: number;
  files: DuplicateFileItem[];
  wastedBytes: number;
}

export interface ElectronAPI {
  minimizeWindow: () => Promise<boolean>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => () => void;

  openFiles: () => Promise<ScannedFileItem[]>;
  openFolder: () => Promise<ScannedFileItem[]>;

  scanFolders: (paths: string[]) => Promise<ScannedFileItem[]>;
  revealInFolder: (filePath: string) => Promise<boolean>;
  openFile: (filePath: string) => Promise<boolean>;
  deleteFile: (filePath: string, permanent?: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteFilesBatch: (filePaths: string[], permanent?: boolean) => Promise<Array<{ path: string; success: boolean; error?: string }>>;
  onDeletionProgress?: (callback: (data: { current: number; total: number; filePath: string; fileName: string }) => void) => () => void;
  exportReport: (reportData: string, defaultName?: string) => Promise<{ success: boolean; path?: string }>;

  computePartialHash: (filePath: string) => Promise<{ success: boolean; hash?: string; error?: string }>;
  computeFullHash: (filePath: string) => Promise<{ success: boolean; hash?: string; error?: string }>;
  cancelAllTasks: () => Promise<{ success: boolean }>;

  logCrash: (errorInfo: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

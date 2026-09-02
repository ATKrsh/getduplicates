import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => Promise<boolean>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  onWindowStateChange: (callback: (state: { isMaximized: boolean }) => void) => () => void;

  // Dialogs
  openFiles: () => Promise<Array<{ name: string; path: string; size: number; mtime: number; ext: string }>>;
  openFolder: () => Promise<Array<{ name: string; path: string; size: number; mtime: number; ext: string }>>;

  // File Operations
  scanFolders: (paths: string[]) => Promise<Array<{ name: string; path: string; size: number; mtime: number; ext: string }>>;
  revealInFolder: (filePath: string) => Promise<boolean>;
  openFile: (filePath: string) => Promise<boolean>;
  deleteFile: (filePath: string, permanent?: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteFilesBatch: (filePaths: string[], permanent?: boolean) => Promise<Array<{ path: string; success: boolean; error?: string }>>;
  onDeletionProgress?: (callback: (data: { current: number; total: number; filePath: string; fileName: string }) => void) => () => void;
  exportReport: (reportData: string, defaultName?: string) => Promise<{ success: boolean; path?: string }>;

  // Hashing Operations
  computePartialHash: (filePath: string) => Promise<{ success: boolean; hash?: string; error?: string }>;
  computeFullHash: (filePath: string) => Promise<{ success: boolean; hash?: string; error?: string }>;
  cancelAllTasks: () => Promise<{ success: boolean }>;

  // Crash Logging
  logCrash: (errorInfo: string) => Promise<boolean>;
}

const api: ElectronAPI = {
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowStateChange: (callback) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on('window:state-changed', handler);
    return () => {
      ipcRenderer.removeListener('window:state-changed', handler);
    };
  },

  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  scanFolders: (paths: string[]) => ipcRenderer.invoke('fs:scanFolders', paths),
  revealInFolder: (filePath: string) => ipcRenderer.invoke('fs:reveal', filePath),
  openFile: (filePath: string) => ipcRenderer.invoke('fs:openFile', filePath),
  deleteFile: (filePath: string, permanent?: boolean) => ipcRenderer.invoke('fs:deleteFile', filePath, permanent),
  deleteFilesBatch: (filePaths: string[], permanent?: boolean) => ipcRenderer.invoke('fs:deleteFilesBatch', filePaths, permanent),
  onDeletionProgress: (callback) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('deletion:progress', handler);
    return () => {
      ipcRenderer.removeListener('deletion:progress', handler);
    };
  },
  exportReport: (reportData: string, defaultName?: string) => ipcRenderer.invoke('fs:exportReport', reportData, defaultName),

  computePartialHash: (filePath: string) => ipcRenderer.invoke('hash:computePartial', filePath),
  computeFullHash: (filePath: string) => ipcRenderer.invoke('hash:computeFull', filePath),
  cancelAllTasks: () => ipcRenderer.invoke('process:cancelAll'),

  logCrash: (errorInfo: string) => ipcRenderer.invoke('crash:log', errorInfo),
};

contextBridge.exposeInMainWorld('electronAPI', api);

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowStateChange: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window:state-changed', handler);
    return () => {
      ipcRenderer.removeListener('window:state-changed', handler);
    };
  },

  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  scanFolders: (paths) => ipcRenderer.invoke('fs:scanFolders', paths),
  revealInFolder: (filePath) => ipcRenderer.invoke('fs:reveal', filePath),
  openFile: (filePath) => ipcRenderer.invoke('fs:openFile', filePath),
  deleteFile: (filePath, permanent) => ipcRenderer.invoke('fs:deleteFile', filePath, permanent),
  deleteFilesBatch: (filePaths, permanent) => ipcRenderer.invoke('fs:deleteFilesBatch', filePaths, permanent),
  onDeletionProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('deletion:progress', handler);
    return () => {
      ipcRenderer.removeListener('deletion:progress', handler);
    };
  },
  exportReport: (reportData, defaultName) => ipcRenderer.invoke('fs:exportReport', reportData, defaultName),

  computePartialHash: (filePath) => ipcRenderer.invoke('hash:computePartial', filePath),
  computeFullHash: (filePath) => ipcRenderer.invoke('hash:computeFull', filePath),
  cancelAllTasks: () => ipcRenderer.invoke('process:cancelAll'),

  logCrash: (errorInfo) => ipcRenderer.invoke('crash:log', errorInfo),
};

contextBridge.exposeInMainWorld('electronAPI', api);

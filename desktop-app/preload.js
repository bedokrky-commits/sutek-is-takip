const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sutekDesktop', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveUrl: (url) => ipcRenderer.invoke('settings:saveUrl', url),
  reset: () => ipcRenderer.invoke('settings:reset'),
  reload: () => ipcRenderer.invoke('app:reload')
})

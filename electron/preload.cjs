const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al proceso de renderizado
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  sqlite: {
    all: async (profileId, table) => await ipcRenderer.invoke('sqlite-all', profileId, table),
    get: async (profileId, table, id) => await ipcRenderer.invoke('sqlite-get', profileId, table, id),
    put: async (profileId, table, row) => await ipcRenderer.invoke('sqlite-put', profileId, table, row),
    remove: async (profileId, table, id) => await ipcRenderer.invoke('sqlite-remove', profileId, table, id),
    addPending: async (profileId, change) => await ipcRenderer.invoke('sqlite-addPending', profileId, change),
    getPending: async (profileId) => await ipcRenderer.invoke('sqlite-getPending', profileId),
    clearPending: async (profileId, id) => await ipcRenderer.invoke('sqlite-clearPending', profileId, id),
    getMeta: async (profileId, key) => await ipcRenderer.invoke('sqlite-getMeta', profileId, key),
    setMeta: async (profileId, key, value) => await ipcRenderer.invoke('sqlite-setMeta', profileId, key, value),
    replaceAll: async (profileId, table, rows) => await ipcRenderer.invoke('sqlite-replaceAll', profileId, table, rows),
    updatePending: async (profileId, pendingChange) => await ipcRenderer.invoke('sqlite-updatePending', profileId, pendingChange)
  }
});

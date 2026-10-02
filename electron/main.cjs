const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let sqliteService = null;

const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;

// Evita abrir varias instancias (y que dos procesos escriban la misma BD)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Fix para versión Portable: guardar datos junto al ejecutable para que no se borren
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'ventas-app-data'));
}

function createWindow() {
  // Icono opcional: en Windows el .exe ya lleva el icono de build/icon.ico
  const iconPath = path.join(__dirname, '../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Los enlaces externos se abren en el navegador, no dentro de la app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpcHandlers() {
  if (sqliteService) return;
  sqliteService = require('./sqliteService.cjs');

  const s = sqliteService;
  const handlers = {
    'sqlite-all': (profileId, table) => s.all(profileId, table),
    'sqlite-get': (profileId, table, id) => s.get(profileId, table, id),
    'sqlite-put': (profileId, table, row) => s.put(profileId, table, row),
    'sqlite-remove': (profileId, table, id) => s.remove(profileId, table, id),
    'sqlite-addPending': (profileId, change) => s.addPending(profileId, change),
    'sqlite-getPending': (profileId) => s.getPending(profileId),
    'sqlite-clearPending': (profileId, id) => s.clearPending(profileId, id),
    'sqlite-getMeta': (profileId, key) => s.getMeta(profileId, key),
    'sqlite-setMeta': (profileId, key, value) => s.setMeta(profileId, key, value),
    'sqlite-replaceAll': (profileId, table, rows) => s.replaceAll(profileId, table, rows),
    'sqlite-updatePending': (profileId, change) => s.updatePending(profileId, change)
  };

  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        s.log(`ERROR_IPC ${channel}: ${err && err.message}`);
        throw err;
      }
    });
  }

  app.on('before-quit', () => {
    s.log('CERRANDO app');
    s.closeAllDatabases();
  });
}

if (gotLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIpcHandlers();
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let pythonProcess = null;
let isInteractiveOverlay = false;

let currentHotkeys = {
  toggle_overlay: 'Alt+Q',
  undo_detection: 'Alt+Z',
  toggle_smudge_timer: 'Alt+T',
  tap_bpm: 'Alt+B',
  reset_match: 'Alt+R',
};

function loadSavedHotkeys() {
  const cfgPath = path.resolve(__dirname, '../../backend/user_config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (parsed && parsed.hotkeys) {
        currentHotkeys = { ...currentHotkeys, ...parsed.hotkeys };
      }
    } catch (_) {}
  }
}

function startPythonBackend() {
  const runtimePython = path.resolve(__dirname, '../../backend/runtime/python.exe');
  const venvPython = path.resolve(__dirname, '../../backend/.venv/Scripts/python.exe');
  const pyExe = fs.existsSync(runtimePython) ? runtimePython : venvPython;
  const serverScript = path.resolve(__dirname, '../../backend/server.py');
  if (fs.existsSync(pyExe) && fs.existsSync(serverScript)) {
    pythonProcess = spawn(pyExe, [serverScript], {
      cwd: path.resolve(__dirname, '../../backend'),
      stdio: 'ignore',
      windowsHide: true,
    });
  }
}

function registerHotkeys(hotkeys) {
  globalShortcut.unregisterAll();
  currentHotkeys = { ...currentHotkeys, ...hotkeys };

  const safeRegister = (accel, actionName) => {
    if (!accel) return;
    try {
      globalShortcut.register(accel, () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('hotkey-action', actionName);
      });
    } catch (err) {
      console.error(`Failed to register hotkey ${accel}:`, err);
    }
  };

  Object.entries(currentHotkeys).forEach(([action, accel]) => {
    safeRegister(accel, action);
  });
}

function setOverlayInteractive(interactive) {
  isInteractiveOverlay = Boolean(interactive);
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (isInteractiveOverlay) {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setFocusable(true);
    mainWindow.focus();
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  mainWindow.webContents.send('overlay-mode-changed', isInteractiveOverlay);
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Highest Windows z-order level so it renders cleanly over Borderless Windowed games
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Exclude the overlay itself from Windows screen capture (WDA_EXCLUDEFROMCAPTURE)
  // so the CV/OCR engine only sees Phasmophobia behind the overlay and never reads its own HUD text!
  mainWindow.setContentProtection(true);

  // Start in Mini-HUD click-through mode by default (press Alt+Q for Discord-style interactive mode)
  setOverlayInteractive(false);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const distIndex = path.join(__dirname, '../dist/index.html');

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

app.whenReady().then(() => {
  loadSavedHotkeys();
  startPythonBackend();
  createOverlayWindow();
  registerHotkeys(currentHotkeys);

  ipcMain.on('set-overlay-mode', (_event, interactive) => {
    setOverlayInteractive(interactive);
  });

  ipcMain.on('set-ignore-mouse', (_event, ignore) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!isInteractiveOverlay) {
      mainWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    }
  });

  ipcMain.handle('update-hotkeys', (_event, newHotkeys) => {
    registerHotkeys(newHotkeys);
    return currentHotkeys;
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (pythonProcess) {
    try {
      pythonProcess.kill();
    } catch (_) {}
  }
});

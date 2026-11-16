const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phasmoOverlay', {
  setOverlayMode: (interactive) => ipcRenderer.send('set-overlay-mode', interactive),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  updateHotkeys: (hotkeys) => ipcRenderer.invoke('update-hotkeys', hotkeys),
  quitApp: () => ipcRenderer.send('quit-app'),
  onOverlayModeChanged: (callback) => {
    const listener = (_event, isInteractive) => callback(isInteractive);
    ipcRenderer.on('overlay-mode-changed', listener);
    return () => ipcRenderer.removeListener('overlay-mode-changed', listener);
  },
  onHotkeyAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('hotkey-action', listener);
    return () => ipcRenderer.removeListener('hotkey-action', listener);
  },
});

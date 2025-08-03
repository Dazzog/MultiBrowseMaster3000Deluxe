const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  navigate: (index, url) => ipcRenderer.send('navigate', { index, url }),
  saveURLs: (urls) => ipcRenderer.send('save-urls', urls),
  requestStoredURLs: () => ipcRenderer.invoke('load-urls'),
  toggleFullscreen: (index) => ipcRenderer.send('toggle-fullscreen', index),
  goBack: (index) => ipcRenderer.send('go-back', index),
  goForward: (index) => ipcRenderer.send('go-forward', index),
  onURLUpdate: (callback) => ipcRenderer.on('update-url', (event, data) => callback(data)),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  moveToDisplay: (index) => ipcRenderer.send('move-to-display', index),
  setTickerText: (text) => ipcRenderer.send('set-ticker-text', text),
  onUpdateTickerText: (callback) => ipcRenderer.on('update-ticker-text', (_, text) => callback(text)),
  onDrop: (callback) => ipcRenderer.on('drop-reply', (event, data) => callback(data)),
});

window.addEventListener('contextmenu', (event) => {
  if (event.target.nodeName === 'INPUT' || event.target.nodeName === 'TEXTAREA') {
    event.preventDefault();
    ipcRenderer.send('show-context-menu');
  }
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  const path = `file:///${webUtils.getPathForFile(file).replace(/\\/g, '/')}`;
  const id = event.target?.id;
  ipcRenderer.send('drop', { path, id });
});
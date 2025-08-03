const { contextBridge, ipcRenderer } = require('electron');

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
});

window.addEventListener('contextmenu', (event) => {
  if (event.target.nodeName === 'INPUT' || event.target.nodeName === 'TEXTAREA') {
    event.preventDefault();
    ipcRenderer.send('show-context-menu');
  }
});

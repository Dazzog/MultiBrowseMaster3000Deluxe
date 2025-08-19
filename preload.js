const {contextBridge, ipcRenderer, webUtils} = require('electron');

contextBridge.exposeInMainWorld('api', {
    navigate: (index, url) => ipcRenderer.send('navigate', {index, url}),
    saveURLs: (viewUrls, controlUrl) => ipcRenderer.send('save-urls', {viewUrls, controlUrl}),
    requestStoredURLs: () => ipcRenderer.invoke('load-urls'),
    toggleFullscreen: (index) => ipcRenderer.send('toggle-fullscreen', index),
    togglePriority: (index) => ipcRenderer.send('toggle-priority', index),
    goBack: (index) => ipcRenderer.send('go-back', index),
    goForward: (index) => ipcRenderer.send('go-forward', index),
    onURLUpdate: (callback) => ipcRenderer.on('update-url', (event, data) => callback(data)),
    getDisplays: () => ipcRenderer.invoke('get-displays'),
    onDisplayWindowPositionUpdate: (callback) => ipcRenderer.on('update-display-window-position', (event, data) => callback(data)),
    moveToDisplay: (index) => ipcRenderer.send('move-to-display', index),
    loadTicker: () => ipcRenderer.invoke('load-ticker'),
    setTickerText: (text) => ipcRenderer.send('set-ticker-text', text),
    setTickerColor: (color) => ipcRenderer.send('set-ticker-color', color),
    setTickerBackgroundColor: (color) => ipcRenderer.send('set-ticker-background-color', color),
    onUpdateTickerText: (callback) => ipcRenderer.on('update-ticker-text', (_, text) => callback(text)),
    onUpdateTickerColor: (callback) => ipcRenderer.on('update-ticker-color', (_, color) => callback(color)),
    onUpdateTickerBackgroundColor: (callback) => ipcRenderer.on('update-ticker-background-color', (_, color) => callback(color)),
    onDrop: (callback) => ipcRenderer.on('drop-reply', (event, data) => callback(data)),
    getScreenshot: (index) => ipcRenderer.invoke('get-screenshot', index),
    getCaptureSources: () => ipcRenderer.invoke('get-capture-sources'),
    cancelCaptureSourcesSelect: () => ipcRenderer.invoke('cancel-capture-sources-select'),
    setDisplayCaptureSource: (viewIndex, sourceId) => ipcRenderer.invoke('set-display-capture-source', {
        viewIndex,
        sourceId
    }),
    startDisplayCapture: (viewIndex) => ipcRenderer.invoke('start-display-capture', {viewIndex}),
    toggleForceVideo: (index) => ipcRenderer.send('toggle-force-video', index),
    onNotifyNewVersion: (callback) => ipcRenderer.on('notify-new-version', (event, data) => callback(data)),
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
    ipcRenderer.send('drop', {path, id});
});
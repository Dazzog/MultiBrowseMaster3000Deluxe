const {
    app,
    BrowserWindow,
    desktopCapturer,
    ipcMain,
    Menu,
    screen,
    session,
    webContents,
    WebContentsView
} = require('electron');
const path = require('path');
const {ElectronBlocker} = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs');

const title = 'MultiBrowseMaster 3000 Deluxe';

let displayWindow;
let controlWindow;
let views = [];
let fullscreenIndex = null;
let priorityIndex = null;

let tickerView = null;
let tickerText = null;

const urlsStoragePath = path.join(app.getPath('userData'), 'urls.json');
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadStoredURLs() {
    if (fs.existsSync(urlsStoragePath)) {
        try {
            return JSON.parse(fs.readFileSync(urlsStoragePath, 'utf-8'));
        } catch {
            return [];
        }
    }
    return [];
}

function saveURLs(urlArray) {
    fs.writeFileSync(urlsStoragePath, JSON.stringify(urlArray, null, 2), 'utf-8');
}

function layoutAllViews() {
    const [winWidth, winHeight] = displayWindow.getContentSize();

    const tickerHeight = tickerText ? winHeight * 0.05 : 0;
    const availableHeight = winHeight - tickerHeight;

    if (priorityIndex !== null) {
        const unpriorizedViews = [...views.filter((view, index) => index !== priorityIndex)];

        const viewWidth = Math.floor(winWidth / 3);
        const viewHeight = Math.floor(availableHeight / 3);

        for (let i = 0; i < unpriorizedViews.length; i++) {

            unpriorizedViews[i].setBounds({
                x: 0,
                y: i * viewHeight,
                width: viewWidth,
                height: viewHeight
            });
        }

        views[priorityIndex].setBounds({
            x: viewWidth,
            y: 0,
            width: viewWidth * 2,
            height: viewHeight * 3
        });

        tickerView.setBounds({
            x: 0,
            y: availableHeight,
            width: winWidth,
            height: tickerHeight,
        });
    } else {
        const cols = 2, rows = 2;
        const viewWidth = Math.floor(winWidth / cols);
        const viewHeight = Math.floor(availableHeight / rows);

        for (let i = 0; i < views.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * viewWidth;
            const y = row * (viewHeight + tickerHeight);

            views[i].setBounds({
                x,
                y,
                width: viewWidth,
                height: viewHeight
            });
        }

        tickerView.setBounds({
            x: 0,
            y: viewHeight,
            width: winWidth,
            height: tickerHeight,
        });
    }
}

function processInput(input) {
    // Trim leading/trailing whitespace
    input = (input || '').trim();


    // Gib bei leerem Input sofort Standardseite zurück
    if (!input) {
        return 'https://picsum.photos/1920/1080';
    }

    // Regex für vollständige URLs mit Protokoll
    const urlPattern = /^(https?:\/\/|file:\/\/)([\w-]+\.)*[\w-]{2,}([\/?#][^\s]*)?$/i;

    // Sonderfälle wie file://... (ohne Domain) und about:blank
    const specialCases = /^(file:\/\/.+|about:blank)$/i;

    // Regex für Domains ohne Protokoll (inkl. localhost, IPs, Ports)
    const bareDomainPattern = /^(([\w.-]+\.[a-z]{2,})|(localhost)|(\d{1,3}(\.\d{1,3}){3}))(:\d+)?(\/[^\s]*)?$/i;

    if (urlPattern.test(input) || specialCases.test(input)) {
        return input;
    }

    if (bareDomainPattern.test(input)) {
        return 'http://' + input;
    }

    // Keine gültige URL, benutze Google-Suche
    const encodedQuery = encodeURIComponent(input);
    return `https://www.google.com/search?q=${encodedQuery}`;
}

function loadSettings() {
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
        return {};
    }
}

function saveSettings(data) {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function findViewIndexByFrame(request) {
    for (let i = 0; i < views.length; i++) {
        if (views[i].webContents.mainFrame === request.frame) return i;
    }
    return -1;
}

let blocker;

async function getAdBlocker() {
    if (!blocker) {
        // persistenter Cache beschleunigt den Start
        const cachePath = path.join(app.getPath('userData'), 'adblocker.bin');
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
        // Optionales Debug
        blocker.on('request-blocked', ({url}) => console.debug('[adblock] blocked:', url));
        blocker.on('request-redirected', ({url}) => console.debug('[adblock] redirected:', url));
    }
    return blocker;
}

async function enableAdblockForSession(session) {
    const blocker = await getAdBlocker();
    blocker.enableBlockingInSession(session); // idempotent – mehrfacher Aufruf ist ok
}

function isErrorPage(url) {
    try {
        const u = new URL(url);
        // file://.../error.html überspringen
        return u.protocol === 'file:' && u.pathname.endsWith('/error.html');
    } catch {
        return false;
    }
}

const getViewErrorHandler = (view) => ((_e, errorCode, errorDesc, validatedURL, isMainFrame) => {
    if (!isMainFrame || isErrorPage(view.webContents.getURL())) return;
    // Eigene Fehlerseite laden und Infos übergeben
    view.webContents.loadFile(path.join(__dirname, 'error.html'), {
        query: {code: String(errorCode), desc: errorDesc, url: validatedURL}
    });
});

function setDefaultViewSettings(view) {
    const wc = view.webContents;

    wc.on('did-fail-load', getViewErrorHandler(view));

    wc.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return

        const isCmdOrCtrl = input.control || input.meta
        const isShift = input.shift

        // F5
        if (input.key === 'F5' || (isCmdOrCtrl && input.code === 'KeyR')) {
            isShift ? wc.reloadIgnoringCache() : wc.reload()
            event.preventDefault()
        }
    })
}

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady()
    .then(async () => {
        const defaultSession = session.defaultSession;

        defaultSession.webRequest.onCompleted({urls: ['*://*/*']}, (details) => {
            if (!details.webContentsId) return;
            const wc = webContents.fromId(details.webContentsId);

            if (!wc) return;
            if (details.resourceType !== 'mainFrame') return;
            if (isErrorPage(details.url)) return;

            if (details.statusCode >= 400) {
                wc.loadFile(path.join(__dirname, 'error.html'), {
                    query: {code: String(details.statusCode), url: details.url}
                });
            }
        });

        defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
            try {
                const viewIndex = findViewIndexByFrame(request);
                if (viewIndex < 0) return callback({}); // keine Freigabe

                const selection = displayCaptureSelections.get(viewIndex);
                if (!selection) return callback({});    // keine Quelle gewählt -> verweigern

                // Aktuelle Liste holen, daraus die gewünschte Quelle heraussuchen
                const sources = await desktopCapturer.getSources({
                    types: ['screen', 'window'],
                    fetchWindowIcons: true,
                });

                const picked = sources.find(s => s.id === selection.sourceId);
                // Quelle nicht (mehr) vorhanden
                if (!picked) return callback({});

                callback({
                    video: picked
                });
            } catch (err) {
                console.error('setDisplayMediaRequestHandler error:', err);
                callback({}); // sicher verweigern
            }
        });

        return enableAdblockForSession(session.defaultSession)
    })
    .then(async () => {
        const {width, height} = screen.getPrimaryDisplay().bounds;

        const savedSettings = loadSettings();

        displayWindow = new BrowserWindow({
            x: savedSettings.windowX ?? 0,
            y: savedSettings.windowY ?? 0,
            width: savedSettings.windowWidth ?? width,
            height: savedSettings.windowHeight ?? height,
            frame: false,
            fullscreen: true,
            backgroundColor: '#111',
            webPreferences: {
                contextIsolation: true
            },
            icon: path.join(__dirname, 'assets', 'icon.ico'),
        });

        displayWindow.setTitle(title);

        displayWindow.on('close', () => {
            const bounds = displayWindow.getBounds();
            saveSettings({
                ...loadSettings(), // merge with existing
                windowX: bounds.x,
                windowY: bounds.y,
                windowWidth: bounds.width,
                windowHeight: bounds.height,
            });
        });

        const storedURLs = loadStoredURLs();

        for (let i = 0; i < 4; i++) {
            const view = new WebContentsView({webPreferences: {contextIsolation: true}});

            views.push(view);
            displayWindow.contentView.addChildView(view);

            setDefaultViewSettings(view);

            const url = (storedURLs.viewUrls || [])[i] || storedURLs[i] || 'https://picsum.photos/1920/1080';
            view.webContents.loadURL(url);

            function sendNavUpdate(index, inpage) {
                const view = views[index];

                // Clear duplicates from history
                const history = view.webContents.navigationHistory;
                const allEntries = history.getAllEntries();
                const entriesToDelete = allEntries.filter((entry, index) => {
                    return isErrorPage(entry.url) || (index > 0 && allEntries[index - 1].url === entry.url);
                }).map(entry => allEntries.indexOf(entry)).sort().reverse();
                entriesToDelete.forEach(entry => history.removeEntryAtIndex(entry));

                if (view.injectedCssKey && !inpage) {
                    injectForceVideoCss(view, view.injectedCssKey);
                }


                const wc = views[index].webContents;
                let url = wc.getURL();
                if (isErrorPage(wc.getURL())) {
                    url = new URL(url).searchParams.get('url');
                }

                controlWindow.webContents.send('update-url', {
                    index,
                    url,
                    canGoBack: wc.navigationHistory.canGoBack(),
                    canGoForward: wc.navigationHistory.canGoForward()
                });
            }

            view.webContents.on('did-navigate', (e) => sendNavUpdate(i));
            view.webContents.on('did-navigate-in-page', (e) => sendNavUpdate(i, true));

            view.webContents.setWindowOpenHandler(({url}) => {
                const targetUrl = new URL(url);
                const currentUrl = new URL(view.webContents.getURL());

                const sameHost = targetUrl.hostname === currentUrl.hostname;

                if (sameHost) {
                    view.webContents.loadURL(url);
                } else {
                    console.warn('Blocked opening URL in new window', url);
                }
                return {action: 'deny'};
            });
        }

        tickerView = new WebContentsView({
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });
        tickerView.webContents.loadFile('ticker.html');
        displayWindow.contentView.addChildView(tickerView);

        layoutAllViews();

        displayWindow.on('resize', () => {
            if (fullscreenIndex === null) layoutAllViews();
        });

        displayWindow.on('closed', () => {
            if (controlWindow && !controlWindow.isDestroyed()) controlWindow.close();
        });

        controlWindow = new BrowserWindow({
            x: savedSettings.controlPanelX ?? null,
            y: savedSettings.controlPanelY ?? null,
            width: savedSettings.controlPanelWidth ?? 1280,
            minWidth: 1168,
            height: savedSettings.controlPanelHeight ?? 980,
            minHeight: 400,
            resizable: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true
            },
            icon: path.join(__dirname, 'assets', 'icon.ico'),
        });

        if (savedSettings.controlPanelMax) controlWindow.maximize();

        controlWindow.setTitle('Control Panel - ' + title);

        controlWindow.setMenuBarVisibility(false);
        controlWindow.loadFile('control.html');

        const controlView = new WebContentsView({webPreferences: {contextIsolation: true}});
        views['control'] = controlView;
        controlWindow.contentView.addChildView(controlView);
        const url = storedURLs.controlUrl || 'https://picsum.photos/1920/1080';
        controlView.webContents.loadURL(url);

        const [controlWinWidth, controlWinHeight] = controlWindow.getContentSize();
        controlView.setBounds({
            x: 0,
            y: 56,
            width: controlWinWidth,
            height: controlWinHeight - 329
        });

        controlView.webContents.on('did-navigate', () => sendNavUpdate('control'));
        controlView.webContents.on('did-navigate-in-page', () => sendNavUpdate('control', true));

        controlView.webContents.setWindowOpenHandler(({url}) => {
            const targetUrl = new URL(url);
            const currentUrl = new URL(controlView.webContents.getURL());

            const sameHost = targetUrl.hostname === currentUrl.hostname;

            if (sameHost) {
                controlView.webContents.loadURL(url);
                return {action: 'deny'};
            }

            return {action: 'allow'};
        });

        setDefaultViewSettings(controlView);

        controlWindow.on('resize', () => {
            const [controlWinWidth, controlWinHeight] = controlWindow.getContentSize();
            controlView.setBounds({
                x: 0,
                y: 56,
                width: controlWinWidth,
                height: controlWinHeight - 355
            });
        })

        controlWindow.on('close', () => {
            const bounds = controlWindow.getBounds();

            let settings = {
                ...loadSettings(),
                controlPanelX: bounds.x,
                controlPanelY: bounds.y,
                controlPanelMax: controlWindow.isMaximized()
            };

            if (!controlWindow.isMaximized()) {
                settings = {
                    ...settings,
                    controlPanelWidth: bounds.width,
                    controlPanelHeight: bounds.height,
                };
            }

            saveSettings(settings);
        });

        controlWindow.on('closed', () => {
            if (displayWindow && !displayWindow.isDestroyed()) displayWindow.close();
        });

        ipcMain.on('show-context-menu', (event) => {
            const template = [
                {role: 'cut', label: 'Ausschneiden'},
                {role: 'copy', label: 'Kopieren'},
                {role: 'paste', label: 'Einfügen'},
                {type: 'separator'},
                {role: 'selectAll', label: 'Alles auswählen'}
            ];

            const menu = Menu.buildFromTemplate(template);
            menu.popup(BrowserWindow.fromWebContents(event.sender));
        });
    });

ipcMain.on('navigate', (event, {index, url}) => {
    const view = views[index];
    if (view) {
        view.webContents.loadURL(processInput(url));
    }
});

ipcMain.on('go-back', (event, index) => {
    const view = views[index];
    if (view && view.webContents.navigationHistory.canGoBack()) {
        if (isErrorPage(view.webContents.getURL())) {
            view.webContents.navigationHistory.goToOffset(-2);
        } else {
            view.webContents.navigationHistory.goBack();
        }
    }
});

ipcMain.on('go-forward', (event, index) => {
    const view = views[index];
    if (view && view.webContents.navigationHistory.canGoForward()) {
        view.webContents.navigationHistory.goForward();
    }
});

ipcMain.on('save-urls', (event, urls) => {
    saveURLs(urls);
});

ipcMain.handle('load-urls', () => {
    return loadStoredURLs();
});

ipcMain.on('toggle-fullscreen', (event, index) => {
    const [width, height] = displayWindow.getContentSize();

    if (fullscreenIndex === index) {
        fullscreenIndex = null;
        layoutAllViews();
    } else {
        fullscreenIndex = index;
        for (let i = 0; i < views.length; i++) {
            if (i === index) {
                views[i].setBounds({x: 0, y: 0, width, height});
            } else {
                views[i].setBounds({x: 0, y: 0, width: 0, height: 0});
            }
        }
    }
});

function injectForceVideoCss(view, oldKey) {
    if (oldKey) {
        view.webContents.removeInsertedCSS(oldKey).then(() => injectForceVideoCss(view));
    } else {
        view.webContents.insertCSS(
            `
            video {
                position: fixed !important;
                inset: 0 !important;
                margin: 0 !important;
                width: 100vw !important;
                max-width: 100vw !important;
                height: 100vh !important;
                max-height: 100vh !important;
                object-fit: contain !important;
                z-index: 2147483647 !important;
                background-color: #111 !important;
            }
            
            * {
              overflow: hidden !important;
            }

            :not(video) {
              max-width: 0 !important;
              max-height: 0 !important;
              z-index: 0 !important;
            }
            `
        ).then(key => {
            view.injectedCssKey = key;
        });
    }
}

ipcMain.on('toggle-force-video', (event, index) => {
    const view = views[index];

    if (!view.injectedCssKey) {
        injectForceVideoCss(view);
    } else {
        view.webContents.removeInsertedCSS(view.injectedCssKey).then(() => {
            view.injectedCssKey = null;
        })
    }
});

ipcMain.on('toggle-priority', (event, index) => {
    if (priorityIndex == index) {
        priorityIndex = null;
    } else {
        priorityIndex = index;
    }

    layoutAllViews();
});

ipcMain.handle('get-displays', () => {
    return screen.getAllDisplays().map((d, i) => ({
        index: i,
        bounds: d.bounds,
        id: d.id
    }));
});

ipcMain.on('move-to-display', (event, targetIndex) => {
    const displays = screen.getAllDisplays();

    if (targetIndex < 0 || targetIndex >= displays.length) {
        console.warn(`Display index ${targetIndex} is out of bounds.`);
        return;
    }

    const targetDisplay = displays[targetIndex];
    const bounds = targetDisplay.bounds;

    displayWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
    });

    displayWindow.setFullScreen(true);
});

ipcMain.on('set-ticker-text', (event, text) => {
    tickerView.webContents.send('update-ticker-text', text);
    tickerText = text;
    layoutAllViews();
    saveSettings({...loadSettings(), tickerText: text});
});

ipcMain.on('set-ticker-color', (event, color) => {
    tickerView.webContents.send('update-ticker-color', color);
    saveSettings({...loadSettings(), tickerColor: color});
});

ipcMain.on('set-ticker-background-color', (event, color) => {
    tickerView.webContents.send('update-ticker-background-color', color);
    saveSettings({...loadSettings(), tickerBackgroundColor: color});
});

ipcMain.on('drop', (event, path) => {
    event.sender.send('drop-reply', path);
});

ipcMain.handle('load-ticker', () => {
    const {tickerText, tickerColor, tickerBackgroundColor} = loadSettings();
    return {tickerText, tickerColor, tickerBackgroundColor};
});

ipcMain.handle('get-screenshot', async (event, index) => {
    if (views) {
        const targetView = views[index];

        if (targetView?.webContents) {

            const image = await targetView.webContents.capturePage();
            return image.toDataURL();
        }
    }
});

const displayCaptureSelections = new Map();

ipcMain.handle('set-display-capture-source', async (event, {viewIndex, sourceId, withAudio}) => {
    displayCaptureSelections.set(viewIndex, {sourceId, withAudio: !!withAudio});
    views['control'].setVisible(true);
});

ipcMain.handle('get-capture-sources', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        fetchWindowIcons: true
    });

    views['control'].setVisible(false);

    return sources.map(s => ({
        id: s.id, name: s.name,
        display_id: s.display_id,
        iconDataUrl: s.appIcon?.toDataURL?.() ?? null,
        thumbDataUrl: s.thumbnail?.toDataURL?.() ?? null
    }));
});

ipcMain.handle('cancel-capture-sources-select', async () => {
    views['control'].setVisible(true);
});

ipcMain.handle('start-display-capture', async (event, {viewIndex}) => {
    const view = views[viewIndex];
    if (!view) return;

    // lokale Seite laden oder injizieren – hier: injizieren
    await view.webContents.executeJavaScript(`
    (async () => {
      try {
        // Nutzer-Gesture simuliert ihr via Button im Control; hier wird nur gestartet
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        let video = document.getElementById('___cap___');
        if (!video) {
          video = document.createElement('video');
          video.id = '___cap___';
          video.autoplay = true;
          video.playsInline = true;
          video.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:2147483647';
          document.body.innerHTML = ''; // View komplett für Stream verwenden
          document.body.appendChild(video);
        }
        video.srcObject = stream;
      } catch (e) {
        console.error('getDisplayMedia failed', e);
      }
    })();
  `);
});
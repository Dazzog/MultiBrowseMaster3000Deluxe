import {
    app,
    BrowserWindow,
    desktopCapturer,
    ipcMain,
    Menu,
    screen,
    session,
    webContents,
    WebContentsView
} from 'electron';
import fetch from 'cross-fetch';
import https from 'https';
import path from 'path';
import semver from 'semver';
import url from 'url';
import {ElectronBlocker} from '@ghostery/adblocker-electron';

import * as appConfig from './config.js';


/* CONSTS */
const title = 'MultiBrowseMaster 3000 Deluxe v' + app.getVersion();

const CONTROL_VIEW_ID = 'control';
const DEFAULT_VIEW_URL = 'https://picsum.photos/1920/1080';
const DEFAULT_BLANK_URL = 'about:blank';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* APP VARIABLES */
let displayWindow;
let views = [];
let fullscreenIndex = null;
let priorityIndex = null;

let controlWindow;
let controlViews = [];
let activeControlViewIndex = 0;

let tickerView = null;
let tickerText = null;

const displayCaptureSelections = new Map();

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
        return DEFAULT_BLANK_URL;
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

function findViewIndexByFrame(request) {
    for (let i = 0; i < views.length; i++) {
        if (views[i].webContents.mainFrame === request.frame) return i;
    }
    return -1;
}

let blocker;

async function getAdBlocker() {
    if (!blocker) {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
        // Optionales Debug
        //blocker.on('request-blocked', ({url}) => console.debug('[adblock] blocked:', url));
        //blocker.on('request-redirected', ({url}) => console.debug('[adblock] redirected:', url));
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

function loadErrorPage(wc, code, desc, url) {
    wc.loadFile(path.join(__dirname, 'views', 'error.html'), {
        query: {code: String(code), desc, url}
    });
}

function getViewErrorHandler(wc) {
    return ((_e, errorCode, errorDesc, validatedURL, isMainFrame) => {
        if (!isMainFrame || isErrorPage(wc.getURL())) return;
        loadErrorPage(wc, errorCode, validatedURL, errorDesc);
    });
}

async function getFocusedElementInfo(webContents) {
    return webContents.executeJavaScript(`(() => {
    function deep(doc=document){
      let el = doc.activeElement;
      try {
        while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
        if (el && el.tagName === 'IFRAME') {
          const d = el.contentDocument || el.contentWindow?.document;
          if (d) {
            const inner = deep(d);
            if (inner) el = inner;
          }
        }
      } catch(_) {}
      return el;
    }
    const el = deep();
    if (!el) return null;
    const cssPath = (() => {
      const path = [];
      let n = el;
      while (n && n.nodeType === 1 && n !== document) {
        let sel = n.tagName.toLowerCase();
        if (n.id) { sel += '#' + CSS.escape(n.id); path.unshift(sel); break; }
        let i = 1, p = n;
        while ((p = p.previousElementSibling)) if (p.tagName === n.tagName) i++;
        const siblingsSameTag = n.parentElement && Array.from(n.parentElement.children).some(c => c.tagName === n.tagName);
        if (siblingsSameTag) sel += ':nth-of-type(' + i + ')';
        path.unshift(sel);
        n = n.parentElement;
      }
      return path.join(' > ');
    })();

    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: el.className || null,
      role: el.getAttribute?.('role') || null,
      name: el.getAttribute?.('name') || null,
      type: el.getAttribute?.('type') || null,
      contentEditable: !!el.isContentEditable,
      cssPath
    };
  })()`);
}

function setDefaultViewSettings(wc) {
    wc.on('did-fail-load', getViewErrorHandler(wc));

    // Define Hotkeys
    wc.on('before-input-event', async (event, input) => {
        if (input.type !== 'keyDown') return;

        const isCmdOrCtrl = input.control || input.meta
        const isShift = input.shift

        if (input.code === 'F5' || (isCmdOrCtrl && input.code === 'KeyR')) {
            isShift ? wc.reloadIgnoringCache() : wc.reload()
            event.preventDefault()
        } else {
            const activeElement = await getFocusedElementInfo(wc);
            if (input.code == 'Tab' || !['input', 'textarea'].includes(activeElement?.tag?.toLowerCase())) {
                controlWindow.webContents.send('display-window-key-down', input.code, isShift, isCmdOrCtrl);
                event.preventDefault();
            }
        }

        return false;
    })
}

function sendNavUpdate(index, inpage) {
    let view = getTargetView(index);

    if (view) {
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

        const wc = view.webContents;
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

        saveViewURLs();
    }
}

function saveViewURLs() {
    if (views && controlViews) {
        appConfig.saveViewURLs({
            viewUrls: views.map((view) => view.webContents.getURL()),
            controlUrls: controlViews.map((view) => view.webContents.getURL()),
        });
    }
}

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

function updateDisplayWindowPosition() {
    controlWindow.webContents.send('update-display-window-position', displayWindow.getBounds());
}

function getCaptureSourceName(s) {
    let label = '';
    if (s.display_id) {
        const display = screen.getAllDisplays().find(entry => entry.id == s.display_id);
        if (display) {
            label = display.label;
        }
    }

    return s.name + (label ? ': ' + label : '');
}

function addControlView(url, active) {
    const controlView = new WebContentsView({webPreferences: {contextIsolation: true}});
    controlViews.push(controlView);

    const activeView = controlViews[activeControlViewIndex];
    controlView.webContents.setAudioMuted(activeView ? activeView.webContents.isAudioMuted() : false);

    controlWindow.contentView.addChildView(controlView);

    if (active) {
        controlViews.forEach(view => view.setVisible(false));
        controlView.setVisible(true);
        activeControlViewIndex = controlViews.indexOf(controlView);
    } else {
        controlView.setVisible(false);
    }

    controlView.webContents.on('did-navigate', () => sendNavUpdate(CONTROL_VIEW_ID));
    controlView.webContents.on('did-navigate-in-page', () => sendNavUpdate(CONTROL_VIEW_ID, true));

    controlView.webContents.setWindowOpenHandler(({url}) => {
        addControlView(url, true);
        return {action: 'deny'};
    });

    setDefaultViewSettings(controlView.webContents);

    updateControlViews();

    controlView.webContents.loadURL(url || DEFAULT_BLANK_URL).then(() => {
        updateControlViews();

        controlView.webContents.on('did-navigate', () => {
            controlView.favicon = null;
            setTimeout(() => updateControlViews(), 100);
        });

        controlView.webContents.on('did-navigate-in-page', () => {
            setTimeout(() => updateControlViews(), 100);
        });

        controlView.webContents.on('page-favicon-updated', (event, favicons) => {
            controlView.favicon = favicons[0];
            setTimeout(() => updateControlViews(), 100);
        });

        controlView.webContents.on('page-title-updated', () => {
            setTimeout(() => updateControlViews(), 100);
        });
    });
}

function updateControlViews() {
    resizeAllControlViews();

    controlViews.forEach((view, index) => {
        view.setVisible(index === activeControlViewIndex);
    })

    controlWindow.webContents.send('update-control-views', {
        titles: controlViews.map(view => view.webContents.getTitle()),
        favicons: controlViews.map(view => view.favicon),
        muted: controlViews.map(view => view.webContents.isAudioMuted()),
        index: activeControlViewIndex,
    });

    sendNavUpdate(CONTROL_VIEW_ID);
}

function getTargetView(index) {
    if (index === 'control' && controlViews) {
        return controlViews[activeControlViewIndex];
    } else if (views) {
        return views[index];
    }
}

function resizeAllControlViews() {
    const [controlWinWidth, controlWinHeight] = controlWindow.getContentSize();
    controlViews.forEach((view) => view.setBounds({
        x: 0,
        y: 86,
        width: controlWinWidth,
        height: controlWinHeight - 385
    }));
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
                loadErrorPage(wc, details.statusCode, details.url);
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

        const savedConfig = appConfig.loadAppConfig();

        displayWindow = new BrowserWindow({
            x: savedConfig.windowX ?? 0,
            y: savedConfig.windowY ?? 0,
            width: savedConfig.windowWidth ?? width,
            height: savedConfig.windowHeight ?? height,
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
            appConfig.saveAppConfig({
                ...appConfig.loadAppConfig(), // merge with existing
                windowX: bounds.x,
                windowY: bounds.y,
                windowWidth: bounds.width,
                windowHeight: bounds.height,
            });
        });

        setDefaultViewSettings(displayWindow.webContents);

        const storedURLs = appConfig.loadViewURLs();

        for (let i = 0; i < 4; i++) {
            const view = new WebContentsView({webPreferences: {contextIsolation: true}});

            views.push(view);
            displayWindow.contentView.addChildView(view);

            setDefaultViewSettings(view.webContents);

            const url = (storedURLs.viewUrls || [])[i] || storedURLs[i] || DEFAULT_VIEW_URL;
            view.webContents.loadURL(url);

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
        setDefaultViewSettings(tickerView.webContents);
        tickerView.webContents.loadFile(path.join(__dirname, 'views', 'ticker.html'));
        displayWindow.contentView.addChildView(tickerView);

        layoutAllViews();

        displayWindow.on('resize', () => {
            if (fullscreenIndex === null) layoutAllViews();
        });

        displayWindow.on('closed', () => {
            if (controlWindow && !controlWindow.isDestroyed()) controlWindow.close();
        });

        controlWindow = new BrowserWindow({
            x: savedConfig.controlPanelX ?? null,
            y: savedConfig.controlPanelY ?? null,
            width: savedConfig.controlPanelWidth ?? 1320,
            minWidth: 1150,
            height: savedConfig.controlPanelHeight ?? 980,
            minHeight: 512,
            resizable: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true
            },
            icon: path.join(__dirname, 'assets', 'icon.ico'),
        });

        if (savedConfig.controlPanelMax) controlWindow.maximize();

        controlWindow.setTitle('Control Panel - ' + title);

        controlWindow.setMenuBarVisibility(false);
        controlWindow.loadFile(path.join(__dirname, 'views', 'control.html'));

        // TODO: Load all Control Views

        const controlUrls = storedURLs.controlUrls || (storedURLs.controlUrl ? [storedURLs.controlUrl] : null) || ['https://picsum.photos/1920/1080'];

        controlUrls.forEach((url, index) => {
            addControlView(url, index === 0);
        });

        setDefaultViewSettings(controlWindow.webContents);

        setTimeout(() => resizeAllControlViews(), 100);
        controlWindow.on('resize', () => resizeAllControlViews())

        controlWindow.on('close', () => {
            const bounds = controlWindow.getBounds();

            let config = {
                ...appConfig.loadAppConfig(),
                controlPanelX: bounds.x,
                controlPanelY: bounds.y,
                controlPanelMax: controlWindow.isMaximized()
            };

            if (!controlWindow.isMaximized()) {
                config = {
                    ...config,
                    controlPanelWidth: bounds.width,
                    controlPanelHeight: bounds.height,
                };
            }

            appConfig.saveAppConfig(config);
        });

        controlWindow.on('closed', () => {
            if (displayWindow && !displayWindow.isDestroyed()) displayWindow.close();
        });

        https.get("https://api.github.com/repos/Dazzog/MultiBrowseMaster3000Deluxe/releases/latest", {
            headers: {'User-Agent': 'electron-app'}
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const release = JSON.parse(data);
                const latestVersion = release.tag_name.replace(/^v/, ''); // z. B. "v1.3.0" → "1.3.0"

                if (semver.lt(app.getVersion(), latestVersion)) {
                    controlWindow.webContents.send('notify-new-version', release);
                }
            });
        });

        setTimeout(() => updateDisplayWindowPosition(), 400);
    });

/* Interface invents */
{
    ipcMain.on('navigate', (event, {index, url}) => {
        const view = getTargetView(index);

        if (view) {
            view.webContents.loadURL(processInput(url));
        }
    });

    ipcMain.on('go-back', (event, index) => {
        const view = getTargetView(index);
        if (view && view.webContents.navigationHistory.canGoBack()) {
            if (isErrorPage(view.webContents.getURL())) {
                view.webContents.navigationHistory.goToOffset(-2);
            } else {
                view.webContents.navigationHistory.goBack();
            }
        }
    });

    ipcMain.on('go-forward', (event, index) => {
        const view = getTargetView(index);
        if (view && view.webContents.navigationHistory.canGoForward()) {
            view.webContents.navigationHistory.goForward();
        }
    });

    ipcMain.handle('load-urls', () => {
        return appConfig.loadViewURLs();
    });

    ipcMain.on('toggle-fullscreen', (event, index) => {
        const [width, height] = displayWindow.getContentSize();

        if (index === undefined || fullscreenIndex === index) {
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
            views[index].webContents.focus();
        }
    });

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
            id: d.id,
            label: d.label,
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

        updateDisplayWindowPosition();
    });

    ipcMain.on('set-ticker-text', (event, text) => {
        tickerView.webContents.send('update-ticker-text', text);
        tickerText = text;
        layoutAllViews();
        appConfig.saveAppConfig({...appConfig.loadAppConfig(), tickerText: text});
    });

    ipcMain.on('set-ticker-color', (event, color) => {
        tickerView.webContents.send('update-ticker-color', color);
        appConfig.saveAppConfig({...appConfig.loadAppConfig(), tickerColor: color});
    });

    ipcMain.on('set-ticker-background-color', (event, color) => {
        tickerView.webContents.send('update-ticker-background-color', color);
        appConfig.saveAppConfig({...appConfig.loadAppConfig(), tickerBackgroundColor: color});
    });

    ipcMain.on('drop', (event, path) => {
        event.sender.send('drop-reply', path);
    });

    ipcMain.handle('load-ticker', () => {
        const {tickerText, tickerColor, tickerBackgroundColor} = appConfig.loadAppConfig();
        return {tickerText, tickerColor, tickerBackgroundColor};
    });

    ipcMain.handle('get-screenshot', async (event, index) => {
        const view = getTargetView(index);

        if (view?.webContents) {

            const image = await view.webContents.capturePage();
            return image.toDataURL();
        }
    });

    ipcMain.handle('set-display-capture-source', async (event, {viewIndex, sourceId, withAudio}) => {
        displayCaptureSelections.set(viewIndex, {sourceId, withAudio: !!withAudio});
        controlViews[activeControlViewIndex].setVisible(true);
    });

    ipcMain.handle('get-capture-sources', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            fetchWindowIcons: true
        });

        controlViews[activeControlViewIndex].setVisible(false);

        return sources.map(s => ({
            id: s.id,
            name: getCaptureSourceName(s),
            display_id: s.display_id,
            iconDataUrl: s.appIcon?.toDataURL?.() ?? null,
            thumbDataUrl: s.thumbnail?.toDataURL?.() ?? null
        }));
    });

    ipcMain.handle('cancel-capture-sources-select', async () => {
        controlViews[activeControlViewIndex].setVisible(true);
    });

    ipcMain.handle('start-display-capture', async (event, {viewIndex: index}) => {
        const view = views[index];
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

    ipcMain.on('set-active-tab', (event, index) => {
        activeControlViewIndex = index;
        updateControlViews();

        sendNavUpdate(CONTROL_VIEW_ID);

        updateControlViews();
    });

    ipcMain.on('close-tab', (event, index) => {
        if (activeControlViewIndex >= index) {
            activeControlViewIndex = Math.max(activeControlViewIndex - 1, 0);
        }

        const closedView = controlViews[index];
        controlWindow.contentView.removeChildView(closedView);
        controlViews.splice(index, 1);
        closedView.setVisible(false);
        closedView.webContents.setAudioMuted(true);
        try {
            closedView.webContents.destroy();
        } catch (e) {
            closedView.webContents.loadURL('about:blank');
            closedView.webContents.navigationHistory.clear();
        }
        updateControlViews();

        saveViewURLs()
    });

    ipcMain.on('open-tab', () => {
        addControlView('', true);
        updateControlViews();
    });

    ipcMain.on('toggle-mute-tab', (event, index) => {
        const view = controlViews[index];
        view.webContents.setAudioMuted(!view.webContents.isAudioMuted());
        updateControlViews();
    });
}
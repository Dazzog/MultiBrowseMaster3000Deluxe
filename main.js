const {app, BrowserWindow, WebContentsView, ipcMain, screen, Menu} = require('electron');
const path = require('path');
const fs = require('fs');

const title = 'MultiBrowseMaster 3000 Deluxe';

let displayWindow;
let controlWindow;
let views = [];
let fullscreenIndex = null;

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
    })
}

function processInput(input) {
    // Trim leading/trailing whitespace
    input = (input || '').trim();


    // Gib bei leerem Input sofort Standardseite zurück
    if (!input) {
        return 'https://picsum.photos/1920/1080';
    }

    // Erweiterter RegEx für URL-Erkennung inklusive http(s), file, und about:blank
    const urlPattern = /^(https?:\/\/|file:\/\/)([\w-]+\.)*[\w-]{2,}([\/?#][^\s]*)?$/i;

    // Sonderfälle wie file://... (ohne Domain) und about:blank
    const specialCases = /^(file:\/\/.+|about:blank)$/i;

    if (urlPattern.test(input) || specialCases.test(input)) {
        // Ergänze ggf. http:// bei Domain-URLs ohne Protokoll
        if (/^([\w-]+\.)+[\w-]{2,}(\/[^\s]*)?$/i.test(input)) {
            input = 'http://' + input;
        }
        return input;
    } else {
        // Keine gültige URL, erstelle Google-Suche
        const encodedQuery = encodeURIComponent(input);
        return `https://www.google.com/search?q=${encodedQuery}`;
    }
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

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady().then(() => {
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

        const url = storedURLs[i] || 'https://picsum.photos/1920/1080';
        view.webContents.loadURL(url);

        function sendNavUpdate(index) {
            const wc = views[index].webContents;
            controlWindow.webContents.send('update-url', {
                index,
                url: wc.getURL(),
                canGoBack: wc.navigationHistory.canGoBack(),
                canGoForward: wc.navigationHistory.canGoForward()
            });
        }

        view.webContents.on('did-navigate', () => sendNavUpdate(i));
        view.webContents.on('did-navigate-in-page', () => sendNavUpdate(i));

        view.webContents.setWindowOpenHandler(({url}) => {
            view.webContents.loadURL(url); // in der aktuellen View laden
            return {action: 'deny'};     // aber kein neues Fenster öffnen
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
        width: 1280,
        height: 264,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets', 'icon.ico'),
    });

    controlWindow.setTitle('Control Panel - ' + title);

    controlWindow.setMenuBarVisibility(false);
    controlWindow.loadFile('control.html');

    controlWindow.on('close', () => {
        const bounds = controlWindow.getBounds();
        saveSettings({
            ...loadSettings(), // merge with existing
            controlPanelX: bounds.x,
            controlPanelY: bounds.y,
        });
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
    if (views[index]) {
        views[index].webContents.loadURL(processInput(url));
    }
});

ipcMain.on('go-back', (event, index) => {
    const view = views[index];
    if (view && view.webContents.navigationHistory.canGoBack()) {
        view.webContents.navigationHistory.goBack();
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
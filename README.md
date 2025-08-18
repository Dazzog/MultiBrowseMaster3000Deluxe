# MultiBrowseMaster 3000 Deluxe

MultiBrowseMaster 3000 Deluxe is an Electron-based application for simultaneously displaying up to four websites in a
grid layout and controlling them via a Control Panel in a separate window.

## Features

- 4-Webview Grid: Display four websites simultaneously
- Control panel: Intuitive interface with Material Icons and interactive controls
- Individual URL input per view with navigation buttons, priority mode, and fullscreen toggle
- Ticker text: Optional scrolling text in the screen center
- Drag & Drop: Drop local files (e.g., HTML, images, videos, PDFs) directly into an input field
- Screen sharing: Share any screen or window in one of the views
- Ad blocker: Integration with [@ghostery/adblocker-electron](https://github.com/ghostery/adblocker)

## Installation

### Requirements

- Node.js (recommended: ≥ v18)
- npm or yarn

### Setup

```bash
git clone https://github.com/Dazzog/MultiBrowseMaster3000Deluxe.git
cd MultiBrowseMaster3000Deluxe
npm install
```

### Start in development mode

```bash
npm start
```

## Build (Windows Portable)

```bash
npm run dist
```

Generates a portable `.exe` file with custom icon.

## Project Structure

- `main.js` – Entry point of the Electron app.
- `control.html` / `control.css` – Main UI for controlling the webviews.
- `ticker.html` / `ticker.css` – Separate view for scrolling ticker text.
- `error.html` / `error.css` – Error page template
- `preload.js` – IPC bridge between Renderer and Main process.
- `assets/` – Icons and build resources.

## License

[MIT](./LICENSE) – Open source license with permissive reuse and distribution.

## Author

[github.com/Dazzog](https://github.com/Dazzog)
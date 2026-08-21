/**
 * Electron Main Process
 *
 * Launches the app as an Electron desktop application.
 *
 * Two load modes:
 *   1. Development: if the webpack dev server answers at ELECTRON_DEV_URL
 *      (read from .env or defaulting to http://localhost:3000, started
 *      with `npm start`), and identifies itself with the custom
 *      X-Pochade-Dev-Server header, the window loads that URL for
 *      hot-reload development.
 *   2. Production: the bundled dist/ directory is served over a custom
 *      privileged `app://` protocol registered below.
 *
 * Why a custom protocol instead of loadFile()? The app relies on web
 * platform features that need a real origin: module web workers,
 * fetching .wasm binaries, and OPFS (Origin Private File System)
 * persistence for the SQLite database. Serving dist/ over a standard,
 * secure scheme makes all of them behave exactly like they do on the
 * web — no special Electron-only code paths.
 *
 * For LLMs: this file runs in Node.js (Electron main), NOT in a browser.
 * Renderer code lives in src/ and index.js. Keep Node/Electron APIs here
 * and web APIs there; the renderer has contextIsolation enabled and no
 * nodeIntegration.
 */

import { app, BrowserWindow, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { WINDOW_OPTIONS } from './window-options.js';
import { isProfilerEnabled, collectMetrics } from './profiler.js';
import { resolveStartUrl } from './dev-server.js';

// Load project-specific environment variables (PORT, ELECTRON_DEV_URL, etc.)
// so the dev server URL matches the one generated when the project was created.
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const DEV_SERVER_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:3000';

/** Minimal MIME table for the static files webpack emits into dist/. */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Register `app://` as a privileged scheme.
 * Must run before the app is ready. `standard` + `secure` make the
 * scheme behave like https: for URL parsing and web platform features
 * (workers, OPFS, File System Access API).
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

/**
 * Serve files from dist/ over the app:// protocol.
 *
 * @param {Request} request - The incoming protocol request
 * @returns {Promise<Response>} The file contents or an error response
 */
async function handleAppRequest(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (!pathname || pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.normalize(path.join(DIST_DIR, pathname));

  // Guard against path traversal outside dist/
  if (!filePath.startsWith(DIST_DIR)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const data = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return new Response(data, {
      headers: { 'Content-Type': contentType },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

/**
 * Start streaming memory/CPU metrics to the renderer.
 *
 * Sends an initial enable signal after the page loads, then posts a
 * metrics payload every second until the window is destroyed.
 *
 * @param {BrowserWindow} win - The target renderer window
 */
function attachMemoryProfiler(win) {
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('profiler-enabled');

    const interval = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(interval);
        return;
      }
      win.webContents.send('profiler-metrics', collectMetrics());
    }, 1000);
  });
}

/**
 * Create the main application window.
 *
 * @returns {Promise<void>}
 */
async function createWindow() {
  const win = new BrowserWindow(WINDOW_OPTIONS);

  if (isProfilerEnabled()) {
    attachMemoryProfiler(win);
  }

  const startUrl = await resolveStartUrl(DEV_SERVER_URL);
  win.loadURL(startUrl);
}

app.whenReady().then(() => {
  protocol.handle('app', handleAppRequest);
  createWindow();

  // macOS: re-create the window when the dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

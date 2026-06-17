// Electron main process — wraps the Expo web export (react-native-web) into a
// desktop window for Tartaria Realms (PC / Steam).
//
// Two things this does beyond opening a window:
//
// 1) SERVES the web bundle over a tiny built-in localhost HTTP server instead of
//    loading it via file://. Expo's web export references assets with ABSOLUTE
//    paths (/_expo/static/js/…); under file:// those resolve to the filesystem
//    root and 404, so nothing mounts and you get a black window. Serving over
//    http://127.0.0.1:<port>/ makes the absolute paths resolve correctly.
//
// 2) Writes a DIAGNOSTIC LOG to the user's Desktop ("Tartaria-Realms-log.txt")
//    capturing startup, asset load failures, renderer crashes, preload errors,
//    and renderer console output — so a black-screen launch produces something we
//    can actually read. DevTools also opens automatically for this dev build.

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ───────────────────────── diagnostic log ─────────────────────────
let LOG_PATH = null;
function resolveLogPath() {
  const candidates = [];
  try { candidates.push(path.join(app.getPath('desktop'), 'Tartaria-Realms-log.txt')); } catch {}
  try { candidates.push(path.join(app.getPath('userData'), 'Tartaria-Realms-log.txt')); } catch {}
  candidates.push(path.join(__dirname, 'Tartaria-Realms-log.txt'));
  for (const c of candidates) {
    try { fs.writeFileSync(c, ''); return c; } catch {}
  }
  return null;
}
function logLine(s) {
  const line = `[${new Date().toISOString()}] ${s}\n`;
  try { if (LOG_PATH) fs.appendFileSync(LOG_PATH, line); } catch {}
  // eslint-disable-next-line no-console
  console.log(s);
}

// ───────────────────────── static file server ─────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.wasm': 'application/wasm',
  '.txt': 'text/plain',
};
// Start an http server rooted at `dir`; resolves with the chosen port.
function startStaticServer(dir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
        const filePath = path.normalize(path.join(dir, urlPath));
        if (!filePath.startsWith(path.normalize(dir))) { res.writeHead(403); res.end('forbidden'); return; }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            // SPA fallback: unknown route with no file extension → index.html.
            if (!path.extname(filePath)) {
              fs.readFile(path.join(dir, 'index.html'), (e2, idx) => {
                if (e2) { logLine(`HTTP 404 ${urlPath}`); res.writeHead(404); res.end('not found'); }
                else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(idx); }
              });
              return;
            }
            logLine(`HTTP 404 ${urlPath} (${err.code})`);
            res.writeHead(404); res.end('not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (e) {
        logLine(`HTTP server error: ${e && e.message}`);
        res.writeHead(500); res.end('error');
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// ───────────────────────── steam (optional) ─────────────────────────
let steam = null;
function initSteam() {
  const appId = parseInt(process.env.STEAM_APP_ID || '480', 10);
  try {
    const steamworks = require('steamworks.js');
    steam = steamworks.init(appId);
    logLine(`[steam] ready for app ${appId} — player: ${steam.localplayer.getName()}`);
  } catch (e) {
    logLine(`[steam] not available — running without Steam: ${e && e.message}`);
    steam = null;
  }
}

ipcMain.handle('steam:achievement', (_evt, achievementId) => {
  if (!steam) return false;
  try { steam.achievement.activate(achievementId); return true; }
  catch (e) { logLine(`[steam] achievement failed ${achievementId}: ${e && e.message}`); return false; }
});
// Renderer forwards window errors / rejections here (see preload.js).
ipcMain.on('renderer-error', (_evt, msg) => logLine(`RENDERER ERROR: ${msg}`));

// ───────────────────────── window ─────────────────────────
async function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primary.workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(1280, screenW),
    height: Math.min(800, screenH),
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#0a0908',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.maximize();
  // Show no matter what — even on a failed load — so the window can't get stuck
  // hidden behind a never-firing ready-to-show.
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show(); }, 4000);

  // Diagnostics: capture everything that could explain a black screen.
  const wc = win.webContents;
  wc.on('did-fail-load', (_e, code, desc, url) => logLine(`LOAD FAIL ${code} ${desc} — ${url}`));
  wc.on('did-finish-load', () => logLine('load: did-finish-load'));
  wc.on('dom-ready', () => logLine('load: dom-ready'));
  wc.on('render-process-gone', (_e, d) => logLine(`RENDERER GONE: reason=${d.reason} exitCode=${d.exitCode}`));
  wc.on('preload-error', (_e, p, err) => logLine(`PRELOAD ERROR ${p}: ${err && err.message}`));
  wc.on('unresponsive', () => logLine('window: unresponsive'));
  wc.on('console-message', (_e, level, message, line, sourceId) =>
    logLine(`console[${level}] ${message} (${sourceId}:${line})`));

  // DevTools is OFF by default now that the build renders (an open detached
  // DevTools adds real overhead and made clicks feel laggy). Opt in with
  // TARTARIA_DEVTOOLS=1 when you need the console.
  if (process.env.TARTARIA_DEVTOOLS === '1') wc.openDevTools({ mode: 'detach' });

  // F11 fullscreen (Steam Deck / big-picture).
  wc.on('before-input-event', (_evt, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  if (process.env.TARTARIA_FULLSCREEN === '1') win.setFullScreen(true);

  // DEV: live Expo web server. PROD: serve the static export over localhost.
  const devUrl = process.env.TARTARIA_DEV_URL;
  if (devUrl) {
    logLine(`loading dev URL ${devUrl}`);
    win.loadURL(devUrl);
    return;
  }
  const webDir = path.join(__dirname, 'web-build');
  const hasIndex = fs.existsSync(path.join(webDir, 'index.html'));
  logLine(`web-build dir: ${webDir} (index.html ${hasIndex ? 'FOUND' : 'MISSING'})`);
  if (!hasIndex) { logLine('FATAL: web-build/index.html missing — the export was not staged into the wrapper.'); win.show(); return; }
  try {
    const port = await startStaticServer(webDir);
    logLine(`static server on http://127.0.0.1:${port}/`);
    win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (e) {
    logLine(`FATAL: static server failed: ${e && e.message}; falling back to file://`);
    win.loadFile(path.join(webDir, 'index.html'));
  }
}

process.on('uncaughtException', (e) => logLine(`MAIN uncaughtException: ${(e && e.stack) || e}`));

// Enable WebGPU so the Kokoro voice (onnxruntime-web) can run inference on the
// GPU instead of blocking the main thread with WASM — the cause of both the
// gaps between spoken lines and the laggy clicks. Must be set before app ready.
app.commandLine.appendSwitch('enable-unsafe-webgpu');

app.whenReady().then(() => {
  LOG_PATH = resolveLogPath();
  logLine('──────── Tartaria Realms (PC) starting ────────');
  logLine(`versions: electron ${process.versions.electron}, chrome ${process.versions.chrome}, node ${process.versions.node}`);
  logLine(`platform ${process.platform} ${process.arch} — log at ${LOG_PATH}`);
  initSteam();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Preload bridge — exposes a tiny, safe desktop surface to the engine's renderer
// (the react-native-web bundle). contextIsolation keeps the renderer sandboxed;
// only what's listed here is reachable as window.engineDesktop.
//
// Its main job today is forwarding uncaught renderer errors + promise rejections
// to the main process so they land in the Desktop diagnostic log
// (RPG-Engine-Dev-log.txt) — that's how a black-screen mount failure becomes a
// readable stack instead of silence. On mobile/web-without-wrapper
// window.engineDesktop is undefined, so any feature-detecting call is skipped.

const { contextBridge, ipcRenderer } = require('electron');

try {
  window.addEventListener('error', (e) => {
    const m = e?.error?.stack || e?.message || String(e);
    ipcRenderer.send('renderer-error', `window.onerror: ${m}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    ipcRenderer.send('renderer-error', `unhandledrejection: ${(r && (r.stack || r.message)) || String(r)}`);
  });
} catch { /* window not ready — non-fatal */ }

contextBridge.exposeInMainWorld('engineDesktop', {
  isDesktop: true,
  platform: process.platform,
});

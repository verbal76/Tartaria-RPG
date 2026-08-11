// Preload bridge — exposes a tiny, safe desktop/Steam surface to the game's
// renderer (the react-native-web bundle). contextIsolation keeps the renderer
// sandboxed; only what's listed here is reachable as window.tartariaDesktop.
//
// In the game code, feature-detect it:
//   const d = (typeof window !== 'undefined') && window.tartariaDesktop;
//   if (d?.isDesktop) d.unlockAchievement('ACH_FIRST_CONTRACT');
// On mobile/web-without-wrapper this is undefined, so calls are simply skipped.

const { contextBridge, ipcRenderer } = require('electron');

// Forward uncaught renderer errors + promise rejections to the main process so
// they land in the Desktop diagnostic log (Tartaria-Realms-log.txt). This is how
// a black-screen mount failure becomes a readable stack instead of silence.
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

// OTA-1250 — UI SCALE. The renderer owns its own zoom via webFrame, so this
// needs no main-process round trip. Clamped here as well as in the game: the
// bridge is the last line before Electron, and a bad factor makes the window
// unusable with no way back to Settings.
const { webFrame } = require('electron');

contextBridge.exposeInMainWorld('tartariaDesktop', {
  isDesktop: true,
  platform: process.platform,
  unlockAchievement: (achievementId) =>
    ipcRenderer.invoke('steam:achievement', achievementId),
  setZoom: (factor) => {
    const f = Number(factor);
    if (!Number.isFinite(f)) return;
    try { webFrame.setZoomFactor(Math.max(0.5, Math.min(2, f))); } catch { /* non-fatal */ }
  },
});

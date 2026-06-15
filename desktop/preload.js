// Preload bridge — exposes a tiny, safe desktop/Steam surface to the game's
// renderer (the react-native-web bundle). contextIsolation keeps the renderer
// sandboxed; only what's listed here is reachable as window.tartariaDesktop.
//
// In the game code, feature-detect it:
//   const d = (typeof window !== 'undefined') && window.tartariaDesktop;
//   if (d?.isDesktop) d.unlockAchievement('ACH_FIRST_CONTRACT');
// On mobile/web-without-wrapper this is undefined, so calls are simply skipped.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tartariaDesktop', {
  isDesktop: true,
  platform: process.platform,
  unlockAchievement: (achievementId) =>
    ipcRenderer.invoke('steam:achievement', achievementId),
});

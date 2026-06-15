// Electron main process — wraps the Expo web export (react-native-web) into a
// desktop window and, when the Steamworks runtime is present, initializes Steam
// for achievements + overlay. Steam is OPTIONAL: if steamworks.js or the Steam
// client isn't available, the build still runs (handy for local dev), it just
// skips Steam features. The game code talks to Steam only through the tiny,
// safe surface exposed in preload.js (window.tartariaDesktop).

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let steam = null; // steamworks.js client handle, or null when unavailable.

function initSteam() {
  // 480 = Spacewar, Valve's public test app id — lets achievement plumbing be
  // exercised before our real app id is provisioned. Override with STEAM_APP_ID.
  const appId = parseInt(process.env.STEAM_APP_ID || '480', 10);
  try {
    const steamworks = require('steamworks.js');
    steam = steamworks.init(appId);
    // eslint-disable-next-line no-console
    console.log('[steam] ready for app', appId, '— player:', steam.localplayer.getName());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[steam] not available — running without Steam:', e && e.message);
    steam = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0a0908',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // DEV: point at the live Expo web dev server (`npx expo start --web` → :8081)
  // so you get hot reload. PROD: load the static export copied to web-build/.
  const devUrl = process.env.TARTARIA_DEV_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, 'web-build', 'index.html'));
  }
}

// Achievement bridge. The game calls window.tartariaDesktop.unlockAchievement(id)
// at the SAME trigger points it already uses for quests/titles/bosses.
// NOTE: verify the exact steamworks.js method name against the installed version
// (0.x API has shifted: activate vs. setAchievement) before relying on this.
ipcMain.handle('steam:achievement', (_evt, achievementId) => {
  if (!steam) return false;
  try {
    steam.achievement.activate(achievementId);
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[steam] achievement failed', achievementId, e && e.message);
    return false;
  }
});

app.whenReady().then(() => {
  initSteam();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

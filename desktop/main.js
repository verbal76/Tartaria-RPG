// Electron main process — wraps the Expo web export (react-native-web) into a
// desktop window and, when the Steamworks runtime is present, initializes Steam
// for achievements + overlay. Steam is OPTIONAL: if steamworks.js or the Steam
// client isn't available, the build still runs (handy for local dev), it just
// skips Steam features. The game code talks to Steam only through the tiny,
// safe surface exposed in preload.js (window.tartariaDesktop).

const { app, BrowserWindow, ipcMain, screen } = require('electron');
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
  // Resolution-aware: size to whatever display we launch on (laptop panel,
  // external monitor, or Steam Deck's 1280x800), then maximize to fill it. The
  // game is react-native-web — it reads window Dimensions and reflows on resize,
  // so it adapts to any resolution rather than assuming a fixed canvas.
  const primary = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primary.workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(1280, screenW),
    height: Math.min(800, screenH),
    minWidth: 640, // Steam Deck-safe floor
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

  // Fill the current monitor by default; avoids a tiny window on big screens.
  win.maximize();
  win.once('ready-to-show', () => win.show());

  // F11 toggles fullscreen (Steam Deck / big-picture run fullscreen). Launching
  // with TARTARIA_FULLSCREEN=1 (e.g. the Steam shortcut) starts fullscreen.
  win.webContents.on('before-input-event', (_evt, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
    }
  });
  if (process.env.TARTARIA_FULLSCREEN === '1') win.setFullScreen(true);

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

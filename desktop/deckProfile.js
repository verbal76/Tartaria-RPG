// Steam Deck / Steam Machine profile — the pure decisions the Electron wrapper makes about HOW to run
// on a handheld, kept out of main.js so they can be unit-tested without Electron (the jest suite
// __tests__/steamDeckProfile.test.ts requires this file directly).
//
// Valve's Deck/Machine requirements this serves (docs/STEAM-DECK.md has the full matrix):
//   • resolution — 1280x800 is the Deck's native size; we open at it and go fullscreen under Game Mode
//   • text legibility — nothing under 9px at 1280x800 (12px recommended): `minimumFontSize` below
//   • no "unsupported hardware/OS" messaging — nothing here ever surfaces a device warning
//   • no launcher — the game starts straight into itself
//
// ⚠ NOTHING HERE TOUCHES MOBILE OR THE WEB BUNDLE. This file ships only inside the desktop wrapper.
'use strict';

/** The Deck's native panel. 1280x800 is Valve's "preferred" size (1280x720 is the other accepted one). */
const DECK_WIDTH = 1280;
const DECK_HEIGHT = 800;

/** Valve: the smallest on-screen font must never fall below 9px at 1280x800; 12px is recommended.
 *  Chromium's minimumFontSize clamps every rendered font to at least this many CSS px. */
const DECK_MIN_FONT_PX = 12;
const ABSOLUTE_MIN_FONT_PX = 9;

const truthy = (v) => v === '1' || v === 'true' || v === 'TRUE';

/**
 * @param {Record<string,string|undefined>} env  process.env
 * @param {string} platform                        process.platform
 * @param {{ isSteamRunningOnSteamDeck?: () => boolean } | null} [steamUtils]  steamworks.js `utils`, if Steam initialised
 */
function detectProfile(env, platform, steamUtils) {
  let steamSaysDeck = false;
  try { steamSaysDeck = !!(steamUtils && steamUtils.isSteamRunningOnSteamDeck && steamUtils.isSteamRunningOnSteamDeck()); } catch { /* not fatal */ }
  const forced = truthy(env.TARTARIA_DECK);
  const isDeck = forced || truthy(env.SteamDeck) || steamSaysDeck;
  // Game Mode (gamescope) is the only place the window must own the whole screen: there is no desktop.
  const gamepadUI = truthy(env.SteamGamepadUI) || String(env.XDG_CURRENT_DESKTOP || '').toLowerCase() === 'gamescope'
    || truthy(env.TARTARIA_FULLSCREEN);
  // A game launched by the Steam client gets its app id in the environment.
  const steamLaunch = !!(env.SteamAppId || env.SteamGameId);
  const linux = platform === 'linux';
  return { isDeck, gamepadUI, steamLaunch, linux };
}

/** Chromium command-line switches for this profile, as [name, value?] pairs (applied before app ready). */
function commandLineSwitches(profile) {
  const out = [];
  // Electron's chrome-sandbox helper needs a SUID bit or unprivileged user namespaces; a Steam-installed
  // Linux build (an unpacked depot, not an installed package) often has neither, and Chromium then aborts
  // at launch — a black "game didn't start" on the Deck. Steam-launched Linux builds therefore run without
  // the setuid sandbox. The renderer only ever loads the game's own bundle from 127.0.0.1 (contextIsolation
  // on, nodeIntegration off), which is the same trade every Electron game on Steam makes.
  if (profile.linux && profile.steamLaunch) out.push(['no-sandbox']);
  // The Deck is always on Wayland/X11 through gamescope; let Chromium pick rather than guess.
  if (profile.linux) out.push(['ozone-platform-hint', 'auto']);
  return out;
}

/** BrowserWindow options for this profile. `workArea` is screen.getPrimaryDisplay().workAreaSize. */
function windowOptions(profile, workArea) {
  const w = workArea && workArea.width ? workArea.width : DECK_WIDTH;
  const h = workArea && workArea.height ? workArea.height : DECK_HEIGHT;
  const base = { width: Math.min(DECK_WIDTH, w), height: Math.min(DECK_HEIGHT, h), minWidth: 640, minHeight: 480 };
  // Game Mode: the window IS the screen, borderless, no menu, never a desktop frame to fall off.
  if (profile.gamepadUI) return { ...base, fullscreen: true, frame: false, autoHideMenuBar: true };
  return { ...base, autoHideMenuBar: true };
}

/** webPreferences additions for this profile. */
function webPreferencesFor(profile, env) {
  const override = parseInt(String((env && env.TARTARIA_MIN_FONT) || ''), 10);
  const min = Number.isFinite(override) ? Math.max(0, Math.min(24, override)) : (profile.isDeck ? DECK_MIN_FONT_PX : 0);
  return min > 0 ? { minimumFontSize: min } : {};
}

module.exports = {
  DECK_WIDTH, DECK_HEIGHT, DECK_MIN_FONT_PX, ABSOLUTE_MIN_FONT_PX,
  detectProfile, commandLineSwitches, windowOptions, webPreferencesFor,
};

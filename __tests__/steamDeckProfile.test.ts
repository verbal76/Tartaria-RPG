/**
 * Steam Deck / Steam Machine — the desktop wrapper's profile decisions (desktop/deckProfile.js) and how
 * main.js uses them. Valve's requirements, mapped in docs/STEAM-DECK.md:
 *   resolution 1280x800 · text never under 9px (12px recommended) · no device-warning UI · no launcher.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const deck = require('../desktop/deckProfile.js') as {
  DECK_WIDTH: number; DECK_HEIGHT: number; DECK_MIN_FONT_PX: number; ABSOLUTE_MIN_FONT_PX: number;
  detectProfile(env: Record<string, string | undefined>, platform: string, steam?: { isSteamRunningOnSteamDeck?: () => boolean } | null): {
    isDeck: boolean; gamepadUI: boolean; steamLaunch: boolean; linux: boolean };
  commandLineSwitches(p: { linux: boolean; steamLaunch: boolean }): Array<[string, string?]>;
  windowOptions(p: { gamepadUI: boolean }, wa?: { width: number; height: number }): Record<string, unknown>;
  webPreferencesFor(p: { isDeck: boolean }, env?: Record<string, string | undefined>): Record<string, unknown>;
};
const root = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

describe('Steam Deck detection', () => {
  it('a plain desktop is not a Deck and not Game Mode', () => {
    expect(deck.detectProfile({}, 'win32', null)).toEqual({ isDeck: false, gamepadUI: false, steamLaunch: false, linux: false });
  });
  it('SteamOS sets SteamDeck=1; Game Mode sets SteamGamepadUI / the gamescope desktop', () => {
    expect(deck.detectProfile({ SteamDeck: '1' }, 'linux').isDeck).toBe(true);
    expect(deck.detectProfile({ SteamGamepadUI: '1' }, 'linux').gamepadUI).toBe(true);
    expect(deck.detectProfile({ XDG_CURRENT_DESKTOP: 'gamescope' }, 'linux').gamepadUI).toBe(true);
    expect(deck.detectProfile({ XDG_CURRENT_DESKTOP: 'KDE' }, 'linux').gamepadUI).toBe(false);
  });
  it('Steam itself can say it is a Deck when the environment does not', () => {
    expect(deck.detectProfile({}, 'linux', { isSteamRunningOnSteamDeck: () => true }).isDeck).toBe(true);
    expect(deck.detectProfile({}, 'linux', { isSteamRunningOnSteamDeck: () => { throw new Error('no steam'); } }).isDeck).toBe(false);
  });
  it('a Steam-launched game is recognised by the app id Steam puts in the environment', () => {
    expect(deck.detectProfile({ SteamAppId: '123' }, 'linux').steamLaunch).toBe(true);
    expect(deck.detectProfile({ SteamGameId: '123' }, 'linux').steamLaunch).toBe(true);
  });
});

describe('window, text size and process switches', () => {
  it("opens at the Deck's native 1280x800 and never larger than the screen", () => {
    expect([deck.DECK_WIDTH, deck.DECK_HEIGHT]).toEqual([1280, 800]);
    expect(deck.windowOptions({ gamepadUI: false }, { width: 1920, height: 1080 })).toMatchObject({ width: 1280, height: 800 });
    expect(deck.windowOptions({ gamepadUI: false }, { width: 1024, height: 600 })).toMatchObject({ width: 1024, height: 600 });
  });
  it('Game Mode is fullscreen, borderless and menu-less — the window owns the screen', () => {
    expect(deck.windowOptions({ gamepadUI: true })).toMatchObject({ fullscreen: true, frame: false, autoHideMenuBar: true });
    expect(deck.windowOptions({ gamepadUI: false })).not.toHaveProperty('fullscreen');
  });
  it("Valve's text floor: a Deck never renders text under 12px (9px is the absolute minimum), a desktop is untouched", () => {
    expect(deck.ABSOLUTE_MIN_FONT_PX).toBe(9);
    expect(deck.DECK_MIN_FONT_PX).toBeGreaterThanOrEqual(12);
    expect(deck.webPreferencesFor({ isDeck: true }, {})).toEqual({ minimumFontSize: deck.DECK_MIN_FONT_PX });
    expect(deck.webPreferencesFor({ isDeck: false }, {})).toEqual({});
  });
  it('the font override is clamped, and an override can never push below nothing or above 24', () => {
    expect(deck.webPreferencesFor({ isDeck: true }, { TARTARIA_MIN_FONT: '14' })).toEqual({ minimumFontSize: 14 });
    expect(deck.webPreferencesFor({ isDeck: true }, { TARTARIA_MIN_FONT: '999' })).toEqual({ minimumFontSize: 24 });
    expect(deck.webPreferencesFor({ isDeck: true }, { TARTARIA_MIN_FONT: 'abc' })).toEqual({ minimumFontSize: deck.DECK_MIN_FONT_PX });
  });
  it('a Steam-launched Linux build runs without the setuid sandbox (it cannot start otherwise); nothing else does', () => {
    expect(deck.commandLineSwitches({ linux: true, steamLaunch: true })).toContainEqual(['no-sandbox']);
    expect(deck.commandLineSwitches({ linux: true, steamLaunch: false })).not.toContainEqual(['no-sandbox']);
    expect(deck.commandLineSwitches({ linux: false, steamLaunch: true })).not.toContainEqual(['no-sandbox']);
  });
});

describe('the wrapper uses it, and ships it', () => {
  const main = read('desktop', 'main.js');
  it('main.js builds its window and switches from the profile, and answers the renderer', () => {
    expect(main).toContain("require('./deckProfile')");
    expect(main).toContain('deck.windowOptions(');
    expect(main).toContain('deck.webPreferencesFor(');
    expect(main).toContain('deck.commandLineSwitches(');
    expect(main).toContain("ipcMain.handle('desktop:info'");
    expect(main).toContain("ipcMain.handle('steam:textInput'");
    expect(main).toContain('showGamepadTextInput');
  });
  it('the Steam text dialog is the ONLY thing main.js does with Steam text, and failure falls back (ok:false)', () => {
    expect(main).toMatch(/return \{ ok: false, text: null \}/);
  });
  it('the preload exposes the bridge the renderer calls', () => {
    const preload = read('desktop', 'preload.js');
    expect(preload).toContain("getInfo: () => ipcRenderer.invoke('desktop:info')");
    expect(preload).toContain("steamTextInput: (opts) => ipcRenderer.invoke('steam:textInput', opts)");
  });
  it('deckProfile.js is packaged — without it the installed game cannot start', () => {
    const pkg = JSON.parse(read('desktop', 'package.json')) as { build: { files: string[] } };
    expect(pkg.build.files).toContain('deckProfile.js');
  });
  it('there is no launcher and no device-warning UI: the window loads the game directly', () => {
    expect(main).not.toMatch(/launcher|unsupported|not supported/i);
  });
});

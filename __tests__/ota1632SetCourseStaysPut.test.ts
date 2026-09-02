jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1632 — SET COURSE STAYS PUT.
//
// Owner's open list #3: *"whenever I auto route to a location, whatever tile
// I'm standing in when I auto route automatically repopulates all of the loot
// under the take salvage button and under investigate."* Third report of the
// same thing — 2026-08-23 it was *"it refreshes whatever tile I am on with new
// items"*, and OTA-1469 reworded the banner and kept the behaviour.
//
// Measured: setTravelCourse TOOK THE FIRST STEP ITSELF (OTA 053, "so the
// player sees motion now"). One tap and the player was one tile over, on ground
// that rolled its own gear roster and its own ambient chips — the salvage list
// and the investigate row filled with a stranger's loot while the header still
// read the same place. A true sentence about an unwanted move is still an
// unwanted move. The step is gone: SET COURSE plans the road; → DESTINATION on
// the travel row is the only thing that walks it.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { hubLocationIds } from '../app/engine/hub';
import { canonicalDistanceFromGrid } from '../app/engine/worldMap';
import { playerGridCell } from '../app/state/playerGrid';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

async function boot() {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Stayer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await settle(() => !!store.getState().currentScene);
  const p = get().player!;
  store.setState({
    player: { ...p, hubRoomId: null, stamina: p.staminaMax, travelTarget: undefined } as never,
    activeBuildingId: null,
    pendingTravelConfirm: null,
    currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never,
  });
}
function farthestHub(): string {
  const g = playerGridCell(get().player!);
  let best = ''; let bd = -1;
  for (const id of hubLocationIds()) { const d = canonicalDistanceFromGrid(g.x, g.y, id); if (d > bd) { bd = d; best = id; } }
  return best;
}
// The feed is capped, so a "since index N" read can come back empty once it is
// full — read the tail the player would actually see instead.
const texts = (n = 4) => get().gameLog.slice(-n).map((l) => l.text).join('\n');
const codeOnly = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('OTA-1632 — SET COURSE stays put', () => {
  it('⚠⚠⚠ THE TAP PLANS THE ROAD AND MOVES NOTHING — same cell, same scene, same chips, same clock', async () => {
    await boot();
    const far = farthestHub();
    const p0 = get().player!;
    const g0 = playerGridCell(p0);
    const tiles = canonicalDistanceFromGrid(g0.x, g0.y, far);
    expect(tiles).toBeGreaterThan(1);
    const scene0 = get().currentScene!;
    const chips0 = [...(scene0.ambientNouns ?? [])];
    get().setTravelCourse(far);
    const p1 = get().player!;
    expect(p1.travelTarget?.locationId).toBe(far);
    expect(p1.travelTarget?.distanceRemaining).toBe(tiles);
    expect(playerGridCell(p1)).toEqual(g0);
    expect(p1.currentLocationId).toBe(p0.currentLocationId);
    expect(p1.hoursElapsed ?? 0).toBe(p0.hoursElapsed ?? 0);
    expect(p1.stamina).toBe(p0.stamina);
    // The ground under TAKE SALVAGE and the investigate row is the SAME ground —
    // the scene object itself, not a re-roll of it.
    expect(get().currentScene).toBe(scene0);
    expect(get().currentScene?.ambientNouns ?? []).toEqual(chips0);
    const said = texts();
    expect(said).not.toMatch(/You walk|You set off now|new ground/);
    expect(said).toMatch(/Tap the → .+ button on the travel row to press on/);
    expect(said).toContain('STOP TRAVEL');
  });

  it('⚠⚠ → DESTINATION is the step — one tap, one tile closer, new ground', async () => {
    const far = get().player!.travelTarget!.locationId;
    const g0 = playerGridCell(get().player!);
    const d0 = canonicalDistanceFromGrid(g0.x, g0.y, far);
    const scene0 = get().currentScene;
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      await get().continueTravel();
    } finally { rand.mockRestore(); }
    const g1 = playerGridCell(get().player!);
    expect(canonicalDistanceFromGrid(g1.x, g1.y, far)).toBe(d0 - 1);
    expect(get().currentScene).not.toBe(scene0);
  });

  it('⚠⚠ spent legs still plan the road and say so (OTA-615) — and still do not move', () => {
    store.setState({ player: { ...get().player!, travelTarget: undefined, stamina: 0 } as never });
    const far = farthestHub();
    const g0 = playerGridCell(get().player!);
    get().setTravelCourse(far);
    expect(get().player!.travelTarget?.locationId).toBe(far);
    expect(playerGridCell(get().player!)).toEqual(g0);
    expect(texts()).toMatch(/you're spent/);
  });

  it('source pin — no step inside setTravelCourse, one banner, the tutorial branch untouched', () => {
    const src = codeOnly(readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8'));
    const a = src.indexOf('  setTravelCourse(locationId: string) {');
    const b = src.indexOf('  continueTravel() {', a);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    const body = src.slice(a, b);
    expect(body).not.toContain('stepDirection(');
    expect(body).not.toContain('willStep');
    expect(body).not.toContain('spendStamina');
    expect(body).not.toContain('advanceTime(');
    expect(body).toContain('button on the travel row to press on');
    expect(body).toContain("When you're ready to leave");
    expect(src).not.toContain('You set off now');
  });
});

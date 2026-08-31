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

// ⚠⚠⚠ OTA-1597 — THE TILE IS THE TRIGGER.
//
// The owner re-tested the Doubter ON 1596 and the pack STILL never spawned,
// because 1596's heal+arm lived only inside beginScene — and his session never
// produced one: the save LOADED him already standing on great_tartary_plains;
// a cardinal step back onto a tile whose id currentLocationId already names is
// `arrival = null`; and continueTravel's in-place arrival (arb103) clears the
// course with no scene rebuild. He typed it into the game in plain English:
//
//   [player] where are you raiders?? olly olly oxen free
//   [player] the minute I step on his tile I should be fighting
//
// And then stated the model outright: "all of these missions are token based …
// you need to know that I stepped on that tile. that is it. it is coordinate
// based." So the ground check is keyed on the CANON GRID CELL and runs from
// the per-action catch-all, from continueTravel's arrival clears, and from the
// slot-load seam — every way boots come to be standing on the tile.

import { useGameStore, grantStageItems } from '../app/state/gameStore';
import { checkStandingGround } from '../app/state/stageArrival';
import { getRaces, getFactions } from '../app/engine/character';
import { canonicalCellOf, canonicalLocationAtCell } from '../app/engine/worldMap';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function packNames(): string[] {
  return (get().player?.inventory ?? []).map((i) => i.name);
}

function raiderCount(): number {
  return (get().currentScene?.enemies ?? []).filter((e) => e.name.includes('Tartarian Raider')).length;
}

/** His exact save-state: the Doubter parked at stage 1, mark never granted,
 *  boots on the stage's canon cell (optionally offset OFF it). */
function seedDoubter(offset: { dx?: number; dy?: number } = {}) {
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      ...placedAt('great_tartary_plains', offset),
      hubRoomId: null,
      stamina: 100,
      travelTarget: undefined,
      whisperCourse: null,
      inventory: p.inventory.filter((i) => i.name !== "Servants' Mark of Sanction"),
      activeHunts: [{ id: 'hunt_servants_doubter', stage: 1, tracked: true } as never],
    },
    activeBuildingId: null,
  });
  set((s) => (s.currentScene ? {
    currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
  } : s));
}

describe('OTA-1597 — the tile is the trigger', () => {
  const realRandom = Math.random;

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Tilewalker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  afterEach(() => { Math.random = realRandom; });

  it('⚠⚠⚠ THE CATCH-ALL — any action standing on the cell heals the debt and starts the fight', async () => {
    seedDoubter();
    // Quiet the ambient spawners so the only fight that can start is the one
    // the stage owes (rolls in this repo are `Math.random() < p`).
    Math.random = () => 0.99;
    expect(packNames()).not.toContain("Servants' Mark of Sanction");
    await get().submitPlayerAction('look');
    expect(packNames()).toContain("Servants' Mark of Sanction");
    expect(raiderCount()).toBe(3);
    // Frozen for the kill: the record does not move until the pack is down.
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(1);
  });

  it('⚠⚠ and the NEXT action does not pile on — one pack, narrated once', async () => {
    Math.random = () => 0.99;
    await get().submitPlayerAction('look');
    expect(raiderCount()).toBe(3);
    const swornMentions = get().gameLog.filter((e) => e.text.includes('three of his sworn')).length;
    expect(swornMentions).toBe(1);
  });

  it("⚠⚠⚠ COORDINATE-BASED — nominally \"at\" the location but boots OFF the cell does nothing", async () => {
    seedDoubter({ dx: 2 });
    Math.random = () => 0.99;
    await get().submitPlayerAction('look');
    // Two tiles east of the stage's cell: no heal, no spawn. The owner's spec
    // cuts both ways — the tile is the trigger, and only the tile.
    expect(packNames()).not.toContain("Servants' Mark of Sanction");
    expect(raiderCount()).toBe(0);
  });

  it('⚠⚠⚠ OLLY OLLY OXEN FREE — stepping off and back ON the cell starts the fight, stale location id and all', async () => {
    seedDoubter();
    Math.random = () => 0.99;
    // Pick a neighbor that is open ground, so the walk-off never renames
    // currentLocationId — the exact state where 1596's arrival machinery is blind.
    const cell = canonicalCellOf('great_tartary_plains');
    const away = ([['east', 1, 0], ['west', -1, 0], ['north', 0, -1], ['south', 0, 1]] as const)
      .find(([, dx, dy]) => !canonicalLocationAtCell(cell.x + dx, cell.y + dy))!;
    const back = { east: 'west', west: 'east', north: 'south', south: 'north' }[away[0]];
    await get().submitPlayerAction(`go ${away[0]}`);
    expect(raiderCount()).toBe(0); // off the tile — nothing owed here
    await get().submitPlayerAction(`go ${back}`);
    // The minute he steps on the tile, he is fighting.
    expect(get().player?.currentLocationId).toBe('great_tartary_plains');
    expect(raiderCount()).toBe(3);
  });

  it('⚠⚠ THE CONTINUE BUTTON — an in-place course arrival checks the ground it cleared onto', () => {
    seedDoubter();
    set((s) => (s.player ? {
      player: { ...s.player, travelTarget: { locationId: 'great_tartary_plains', distanceRemaining: 0 } as never },
    } : s));
    get().continueTravel();
    expect(get().player?.travelTarget).toBeFalsy();
    expect(raiderCount()).toBe(3);
    expect(packNames()).toContain("Servants' Mark of Sanction");
  });

  it('⚠⚠ the stale interior label does not follow a step across open ground', () => {
    seedDoubter();
    set((s) => (s.player ? { player: { ...s.player, activeHunts: [] } } : s));
    set((s) => (s.currentScene ? {
      currentScene: { ...s.currentScene, microMicroId: 'stale-carried-interior' },
    } : s));
    Math.random = () => 0.99;
    get().stepDirection('east');
    // The new tile's site is its own seeded pick or nothing — never the label
    // carried from a climb three tiles back ("no I am not in the buried skyscraper").
    expect(get().currentScene?.microMicroId).not.toBe('stale-carried-interior');
  });
});

describe('OTA-1597 — every door is wired', () => {
  const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const SL = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'slotSlice.ts'), 'utf8');

  it('⚠⚠ the per-action catch-all runs the ground check beside maybeSeedQuarry', () => {
    const quarry = GS.indexOf('maybeSeedQuarry(get, set);\n    // ⚠⚠⚠ OTA-1597');
    expect(quarry).toBeGreaterThan(-1);
    const after = GS.slice(quarry, quarry + 600);
    expect(after).toContain('checkStandingGround(get, set, grantStageItems);');
  });

  it('⚠⚠ both continueTravel arrival clears and the setTravelCourse arrival call it — the CONTINUE button cannot miss', () => {
    const calls = GS.split('checkStandingGround(get, set, grantStageItems);').length - 1;
    // catch-all + setTravelCourse arrival + continueTravel in-place + continueTravel post-step
    expect(calls).toBeGreaterThanOrEqual(4);
  });

  it('⚠⚠ the slot-load seam checks the ground a save opens standing on, after the trace slate', () => {
    const trace = SL.indexOf('missionTraceLines(get().player)');
    const check = SL.indexOf('checkStandingGround(get');
    expect(trace).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(trace);
  });

  it('⚠⚠ the standing match is the canon grid cell, not the location label', () => {
    const SA = readFileSync(join(__dirname, '..', 'app', 'state', 'stageArrival.ts'), 'utf8');
    expect(SA).toContain('canonicalCellOf(ground)');
    expect(SA).toContain('cell.x !== gc.x || cell.y !== gc.y');
    // The old label check is gone for good — it is what went stale in the open.
    expect(SA).not.toContain('player.currentLocationId !== ground');
  });
});

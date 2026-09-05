// OTA-1506 — THE FIELD GOES LIVE.
//
// ⚠⚠⚠ OTA-1503 proved the owner's bullseye in isolation; THIS wires the game
// onto it. Each enemy carries its own `pos` (bearing + distance), spawns land
// staggered across the rings (nearest first — the pager order), the attack
// gate and every counter judge THAT enemy's own band, one player step moves
// the whole field, and the pack pursues per body. The legacy shared
// `scene.range` survives as a DERIVED compatibility field: the band to the
// ACTIVE target, re-derived on every swipe, step, and pursuit.
//
// ⚠⚠ SAVES MIGRATE THEMSELVES: an old save's enemies have no `pos`, so every
// reader synthesizes one from the shared band it DID store — deterministically,
// because two reads of the same save must agree.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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

import {
  arrivalPos, derivedSceneRange, enemyBandOf, enemyPosOf, openingRange,
  placeEnemies, runEnemyGroupCounters, runMoveCombatRange,
} from '../app/state/combatResolution';
import { bandOf, CONTACT_MIN, distanceForBand } from '../app/engine/combatGeometry';
import type { CurrentScene, GameStore } from '../app/state/gameStore';
import type { Enemy, PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const STORE = readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
const SCREEN = readFileSync(join(ROOT, 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');

/** Deterministic stand-in for Math.random — no Date/random in suites. */
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

const foe = (name: string, over: Partial<Enemy> = {}): Enemy => ({
  name, type: 'Human', abilityPoint: 'Strength 3', attack: 'Cudgel',
  damage: '1D6', hp: 10, rarity: 'Common', loot: [], ...over,
});

const sceneWith = (enemies: Enemy[], over: Partial<CurrentScene> = {}): CurrentScene => ({
  weather: null as unknown as CurrentScene['weather'],
  location: { danger: 0 } as unknown as CurrentScene['location'],
  hazard: null,
  enemies,
  enemyHps: enemies.map((e) => e.hp),
  activeEnemyIdx: 0,
  vendor: null,
  range: 'mid',
  ...over,
} as CurrentScene);

/** A minimal live store around one scene: set() applies partials, appendLog
 *  collects lines — enough to drive the movement and pursuit paths for real. */
function fakeStore(scene: CurrentScene, player: Partial<PlayerCharacter> = {}) {
  const logs: string[] = [];
  const state = {
    currentScene: scene,
    player: { name: 'T', hp: 20, dead: false, equipped: {}, inventory: [], stats: {} , ...player } as unknown as PlayerCharacter,
    appendLog: (_ch: string, text: string) => { logs.push(text); },
  } as unknown as GameStore;
  const get = () => state;
  const set = (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => {
    const p = typeof partial === 'function' ? partial(state) : partial;
    Object.assign(state, p);
  };
  return { get, set, state, logs };
}

describe('OTA-1506 — positions, synthesized and read', () => {
  it('⚠⚠ a stamped pos is the truth; an old save synthesizes from its shared band', () => {
    const stamped = sceneWith([foe('A', { pos: { bearing: 90, distance: 3.2 } })]);
    expect(enemyPosOf(stamped, 0)).toEqual({ bearing: 90, distance: 3.2 });
    const legacy = sceneWith([foe('A'), foe('B')], { range: 'far' });
    expect(enemyPosOf(legacy, 0).distance).toBeCloseTo(distanceForBand('far'), 5);
    expect(enemyPosOf(legacy, 1).distance).toBeCloseTo(distanceForBand('far'), 5);
    // Deterministic — two reads of the same save must agree.
    expect(enemyPosOf(legacy, 1)).toEqual(enemyPosOf(legacy, 1));
    // …and the lineup does not stack on one heading.
    expect(enemyPosOf(legacy, 0).bearing).not.toBeCloseTo(enemyPosOf(legacy, 1).bearing, 1);
  });

  it('⚠⚠ enemyBandOf answers per enemy — including ring-5 null', () => {
    const s = sceneWith([
      foe('near', { pos: { bearing: 0, distance: 0.5 } }),
      foe('walker', { pos: { bearing: 180, distance: 4.5 } }),
    ]);
    expect(enemyBandOf(s, 0)).toBe('close');
    expect(enemyBandOf(s, 1)).toBeNull();
  });

  it("⚠⚠ derivedSceneRange is the ACTIVE target's band, clamped for the walker", () => {
    const s = sceneWith([
      foe('near', { pos: { bearing: 0, distance: 0.5 } }),
      foe('walker', { pos: { bearing: 180, distance: 4.5 } }),
    ]);
    expect(derivedSceneRange(s)).toBe('close');
    expect(derivedSceneRange({ ...s, activeEnemyIdx: 1 })).toBe('distant');
    expect(derivedSceneRange(sceneWith([]))).toBeNull();
  });
});

describe('OTA-1506 — where a lineup lands', () => {
  it('⚠⚠⚠ A PARTY STAGGERS ACROSS THE RINGS, NEAREST FIRST — the pager order is the spawn order', () => {
    const placed = placeEnemies([foe('a'), foe('b'), foe('c'), foe('d')], 'patrol', seeded(9));
    const dists = placed.map((e) => e.pos!.distance);
    for (let i = 1; i < dists.length; i++) expect(dists[i]!).toBeGreaterThan(dists[i - 1]!);
    expect(bandOf(dists[0]!)).toBe('close'); // the leader is reachable
    expect(openingRange(placed)).toBe('close');
  });

  it('⚠⚠ a lone body keeps the shipped mid opening — the duel keeps its approach game', () => {
    const placed = placeEnemies([foe('solo')], 'patrol', seeded(4));
    expect(placed[0]!.pos!.distance).toBeCloseTo(distanceForBand('mid'), 5);
    expect(openingRange(placed)).toBe('mid');
  });

  it('⚠ arrivalPos lands mid-ring of the named band; inputs are not mutated', () => {
    expect(arrivalPos('far', seeded(2)).distance).toBeCloseTo(distanceForBand('far'), 5);
    const original = foe('x');
    placeEnemies([original, foe('y')], 'ambush', seeded(3));
    expect(original.pos).toBeUndefined();
  });
});

describe('OTA-1506 — one step moves the whole field (through the real handler)', () => {
  it("⚠⚠⚠ THE OWNER'S SENTENCE THROUGH THE STORE: north closes, south opens, one step", () => {
    // Both LIVE (the field-shift line only narrates living bodies) — and both
    // end the step at 'far', where a melee body cannot counter, so the enemy
    // volley never fires and this test stays about the geometry.
    const scene = sceneWith([
      foe('North', { pos: { bearing: 0, distance: 3.5 } }),
      foe('South', { pos: { bearing: 180, distance: 1.5 } }),
    ]);
    const { get, set, state, logs } = fakeStore(scene);
    runMoveCombatRange(get, set, state.player!, scene, 'advance');
    const after = state.currentScene!;
    expect(after.enemies[0]!.pos!.distance).toBeCloseTo(2.5, 5);
    expect(after.enemies[1]!.pos!.distance).toBeCloseTo(2.5, 5);
    expect(after.range).toBe('far'); // derived from the active (north) target
    expect(logs.join('\n')).toContain('South now far');
  });

  it('⚠⚠ retreat can push the target OUT of the fight, and says so', () => {
    const scene = sceneWith([foe('Wolf', { pos: { bearing: 0, distance: 3.5 } })], { enemyHps: [0] });
    const { get, set, state, logs } = fakeStore(scene);
    runMoveCombatRange(get, set, state.player!, scene, 'retreat');
    expect(state.currentScene!.enemies[0]!.pos!.distance).toBeCloseTo(4.5, 5);
    expect(state.currentScene!.range).toBe('distant'); // clamped for legacy readers
    expect(logs.join('\n')).toContain('drops out of the fight');
    // …and a second retreat is refused: he is absent and closing.
    runMoveCombatRange(get, set, state.player!, state.currentScene!, 'retreat');
    expect(state.currentScene!.enemies[0]!.pos!.distance).toBeCloseTo(4.5, 5);
    expect(logs.join('\n')).toContain('cannot put more ground');
  });

  it('⚠⚠ advance at contact is refused — you are already toe to toe', () => {
    const scene = sceneWith([foe('Rat', { pos: { bearing: 0, distance: CONTACT_MIN } })], { enemyHps: [0] });
    const { get, set, state, logs } = fakeStore(scene);
    runMoveCombatRange(get, set, state.player!, scene, 'advance');
    expect(state.currentScene!.enemies[0]!.pos!.distance).toBeCloseTo(CONTACT_MIN, 5);
    expect(logs.join('\n')).toContain("already at close / arm's reach");
  });
});

describe('OTA-1506 — the pack pursues per body', () => {
  it('⚠⚠⚠ EACH BENCHED BODY WALKS ITS OWN LINE — bearing kept, one step, range re-derived', () => {
    const scene = sceneWith([
      foe('Raider A', { pos: { bearing: 40, distance: 3.5 } }),
      foe('Raider B', { pos: { bearing: 200, distance: 2.5 } }),
    ]);
    const { get, set, state, logs } = fakeStore(scene);
    runEnemyGroupCounters(get, set, state.player!, { skipDotTick: true });
    const after = state.currentScene!;
    expect(after.enemies[0]!.pos).toEqual({ bearing: 40, distance: 2.5 });
    expect(after.enemies[1]!.pos).toEqual({ bearing: 200, distance: 1.5 });
    expect(after.range).toBe('far'); // active target (A) re-derived after the walk
    expect(logs.join('\n')).toContain('close the distance');
  });

  it('⚠⚠ a dead body does not pursue', () => {
    const scene = sceneWith([
      foe('Live', { pos: { bearing: 0, distance: 3.5 } }),
      foe('Dead', { pos: { bearing: 90, distance: 3.5 } }),
    ], { enemyHps: [10, 0] });
    const { get, set, state } = fakeStore(scene);
    runEnemyGroupCounters(get, set, state.player!, { skipDotTick: true });
    expect(state.currentScene!.enemies[0]!.pos!.distance).toBeCloseTo(2.5, 5);
    expect(state.currentScene!.enemies[1]!.pos!.distance).toBeCloseTo(3.5, 5);
  });
});

describe('OTA-1506 — the wiring is complete (source claims)', () => {
  it("⚠⚠⚠ THE ATTACK GATE ROLLS AGAINST THE TARGET'S OWN BAND — and refuses the ring-5 walker", () => {
    expect(STORE).toContain('const targetBand = enemyBandOf(sceneAfterDots, targetBandIdx);');
    expect(STORE).toContain('const range = targetBand;');
    expect(STORE).toContain('if (targetBand === null) {');
  });

  it('⚠⚠ every spawn site stamps positions — staggered lineups and placed arrivals', () => {
    // Fresh lineups (main encounter, faction party, aetherkin, escort party,
    // climb) go through placeEnemies; every add-one newcomer through arrivalPos.
    // ⚠ OTA-1678 — the faction party's placeEnemies moved with injectFactionParty
    // to state/factionParty.ts; the census counts both files.
    const PARTY = readFileSync(join(ROOT, 'app', 'state', 'factionParty.ts'), 'utf8');
    expect((STORE.match(/placeEnemies\(/g) ?? []).length + (PARTY.match(/placeEnemies\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((STORE.match(/arrivalPos\(/g) ?? []).length).toBeGreaterThanOrEqual(12);
    // No spawn writes a bare enemies array next to a range literal any more:
    // an appended body without a pos would silently inherit the SHARED band.
    expect(STORE).not.toMatch(/enemies: \[\.\.\.s\.currentScene\.enemies, [a-zA-Z]+\],/);
    expect(STORE).not.toMatch(/enemies: \[\.\.\.scene\.enemies, [a-zA-Z]+\],/);
  });

  it('⚠⚠ the swipe re-derives the legacy band — the pager IS the range instrument', () => {
    expect(STORE).toContain('range: derivedSceneRange(swapped) ?? s.currentScene.range');
  });

  it('⚠⚠ the enemy card reads ITS enemy\'s own ring, both hands', () => {
    expect(SCREEN).toContain('const band = enemyBandOf(currentScene, i);');
    expect(SCREEN).toContain('inRange: band !== null && h.bands.includes(band),');
    expect(SCREEN).toContain("band === null ? 'out of range' : RANGE_LABELS[band]");
  });
});

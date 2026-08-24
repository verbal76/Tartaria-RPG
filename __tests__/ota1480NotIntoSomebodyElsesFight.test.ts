// OTA-1480 — TWO PRECONDITIONS ON ONE BUTTON, EACH WITH ONE OWNER.
//
// ⚠⚠ (A) THE SUMMONS HAD NO FIGHT GUARD AT ALL.
//
// Owner's open list: *"summoning while enemies are present."* `summonCoreGuardian`
// checked the Capital, the phase, whether the Core was taken, whether a Guardian
// was already there and (OTA-1471) whether the grid had settled — and then
// appended the Guardian to `currentScene.enemies` whatever else was standing, with
// `activeEnemyIdx` pointed at the new arrival. A player mid-pack could call the
// Guardian down, have their target silently switched, and leave the pack alive
// behind them. Every part of the Guardian encounter — OTA-931 staging, OTA-1471
// pacing, OTA-1476 scaling off one power reading — assumes it is THE fight, not a
// second one bolted onto a first.
//
// ⚠⚠ (B) "AM I REALLY HERE" HAD THREE SPELLINGS AND TWO COORDINATE SYSTEMS.
//
//   app/state/gameStore.ts             `function isStationedAtNamedLocation(p)`, private.
//   app/screens/ExplorationScreen.tsx  a hand-rolled copy, under a comment reading
//                                      "Mirror isStationedAtNamedLocation".
//   app/screens/ContractsScreen.tsx    a second hand-rolled copy, same comment.
//
// Both screens knew they were duplicating a rule and did it anyway, because the
// original was not exported. A predicate private to one file and needed by three
// is not private, it is copied. And all three asked the RE-CENTERED visual frame
// (`mapX/mapY === CENTER`) while `playerGridCell` — OTA-1398, "ONE source of truth
// for where the player is" — and `standingAtLocation` (OTA-1458) both read the
// authoritative absolute cell. Two coordinate systems, one question, four sites.
//
// ⚠ THE AGREEMENT IS MEASURED, NOT ASSERTED. The old visual-frame spelling is kept
// in the leaf as `_stationedByVisualFrameForTest` for exactly one purpose: so this
// suite can walk a state matrix and prove the two answer alike everywhere a player
// can actually be, instead of me claiming a refactor was behaviour-preserving.

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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import {
  summonHostiles,
  hostileNamePhrase,
  summonHostilesLine,
  isCoreGuardian,
  GUARDIANS_BY_CAPITAL,
  spawnGuardianForCapital,
} from '../app/engine/coreGuardians';
import {
  stationedAtNamedLocation,
  _stationedByVisualFrameForTest,
  standingAtLocation,
} from '../app/engine/standingAt';
import {
  WORLD_MAP_CENTER_X,
  WORLD_MAP_CENTER_Y,
  canonicalCellOf,
  gridToVisual,
} from '../app/engine/worldMap';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import type { Enemy, PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STORE_RAW = read('app', 'state', 'gameStore.ts');
const STORE = codeOnly(STORE_RAW);
const EXPL = codeOnly(read('app', 'screens', 'ExplorationScreen.tsx'));
const CONTRACTS = codeOnly(read('app', 'screens', 'ContractsScreen.tsx'));

const mob = (name: string, traits: string[] = []): Enemy => ({
  name, hp: 10, attack: 'claw', damage: '1d4', ac: 10, rarity: 'Common', traits,
} as unknown as Enemy);

// ---------------------------------------------------------------------------
// 0 — self-test
// ---------------------------------------------------------------------------

describe('self-test', () => {
  it('reads real sources and strips only comments', () => {
    expect(STORE_RAW.length).toBeGreaterThan(500_000);
    expect(STORE_RAW).toContain('NOT INTO SOMEBODY ELSE’S FIGHT'.replace('’', "'"));
    expect(STORE).not.toContain('NOT INTO SOMEBODY ELSE’S FIGHT'.replace('’', "'"));
    expect(EXPL.length).toBeGreaterThan(10_000);
    expect(CONTRACTS.length).toBeGreaterThan(10_000);
  });

  it('the fixture mob is not accidentally a Guardian', () => {
    // The whole hostiles test rests on this telling them apart.
    expect(isCoreGuardian(mob('Bog Hound'))).toBe(false);
    const g = spawnGuardianForCapital(
      { level: 3, stats: { strength: 12, dexterity: 12, intelligence: 12, wisdom: 10, charisma: 10, stealth: 10 }, hpMax: 60 } as unknown as PlayerCharacter,
      'voronov',
    );
    expect(g).not.toBeNull();
    expect(isCoreGuardian(g!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1 — what counts as a blocker
// ---------------------------------------------------------------------------

describe('summonHostiles — living, hostile, and not the Guardian itself', () => {
  it('an empty scene blocks nothing', () => {
    expect(summonHostiles([], [], [])).toEqual({ blocked: false, count: 0, names: [] });
    expect(summonHostiles(undefined, undefined, undefined).blocked).toBe(false);
  });

  it('⚠⚠ one living hostile blocks, and is named', () => {
    const h = summonHostiles([mob('Bog Hound')], [10], [false]);
    expect(h.blocked).toBe(true);
    expect(h.count).toBe(1);
    expect(h.names).toEqual(['Bog Hound']);
  });

  it('⚠ a CORPSE does not block — sweepDeadEnemies runs on its own beat', () => {
    // Without this the player who just won the fight is walled for a turn with
    // no way to tell why, which is a worse bug than the one being fixed.
    expect(summonHostiles([mob('Bog Hound')], [0], [false]).blocked).toBe(false);
    expect(summonHostiles([mob('A'), mob('B')], [0, 0], [false, false]).blocked).toBe(false);
    // …and a mixed scene reports only the living one.
    const mixed = summonHostiles([mob('Dead'), mob('Alive')], [0, 7], [false, false]);
    expect(mixed.names).toEqual(['Alive']);
  });

  it('⚠ a KNOCKED-OUT enemy does not block — it is out of the fight (OTA-361)', () => {
    expect(summonHostiles([mob('Sleeper')], [9], [true]).blocked).toBe(false);
    const mixed = summonHostiles([mob('Sleeper'), mob('Awake')], [9, 9], [true, false]);
    expect(mixed.names).toEqual(['Awake']);
  });

  it('⚠⚠ a Guardian already in the scene is NOT a blocker', () => {
    // That case is `already_present` upstream — a fight the player fled and came
    // back to — and it must keep resolving to "bounce them into it", never to
    // "you are busy". A guard that blocked on it would strand the main quest.
    const g = spawnGuardianForCapital(
      { level: 3, stats: { strength: 12, dexterity: 12, intelligence: 12, wisdom: 10, charisma: 10, stealth: 10 }, hpMax: 60 } as unknown as PlayerCharacter,
      'voronov',
    )!;
    expect(summonHostiles([g], [g.hp], [false]).blocked).toBe(false);
    // …but a pack standing beside it still does.
    expect(summonHostiles([g, mob('Mudling')], [g.hp, 5], [false, false]).blocked).toBe(true);
  });

  it('⚠ an ABSENT hp array reads as LIVE, never as empty', () => {
    // Defaulting the other way would silently disable the whole guard on any
    // scene shape that does not track per-enemy hp.
    expect(summonHostiles([mob('Bog Hound')], undefined, undefined).blocked).toBe(true);
    expect(summonHostiles([mob('Bog Hound')], [], []).blocked).toBe(true);
  });

  it('dedupes names but counts distinct kinds', () => {
    const h = summonHostiles(
      [mob('Bog Hound'), mob('Bog Hound'), mob('Mudling')],
      [5, 5, 5], [false, false, false],
    );
    expect(h.names).toEqual(['Bog Hound', 'Mudling']);
    expect(h.count).toBe(2);
    expect(h.blocked).toBe(true);
  });

  it('holds over a sweep of scene shapes without throwing', () => {
    let checked = 0;
    for (const n of [0, 1, 2, 3, 5]) {
      for (const alive of [true, false]) {
        for (const ko of [true, false]) {
          const es = Array.from({ length: n }, (_, i) => mob(`M${i}`));
          const h = summonHostiles(es, es.map(() => (alive ? 5 : 0)), es.map(() => ko));
          expect(h.blocked).toBe(n > 0 && alive && !ko);
          expect(h.count).toBe(h.names.length);
          checked++;
        }
      }
    }
    expect(checked).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 2 — the refusal speaks
// ---------------------------------------------------------------------------

describe('the refusal says the three things a wall owes the player', () => {
  const line = (names: string[]) =>
    summonHostilesLine('Voronov', { blocked: true, count: names.length, names });

  it('⚠ what is in the way, why, and what to do', () => {
    const l = line(['Bog Hound']);
    expect(l).toContain('Bog Hound');                 // what
    expect(l).toMatch(/will not answer over the noise of a fight/); // why
    expect(l).toMatch(/Finish here, or break off/);   // what to do
    expect(l).toContain('Voronov');                   // and where it keeps
    expect(l).toMatch(/keeps/);                       // …and that it is not lost
  });

  it('⚠ agrees in number with what it is describing', () => {
    expect(line(['Bog Hound'])).toContain('is still standing');
    expect(line(['Bog Hound', 'Mudling'])).toContain('are still standing');
    expect(line(['A', 'B', 'C'])).toContain('are still standing');
  });

  it('⚠ reads as English at one, two and many', () => {
    expect(hostileNamePhrase(['A'])).toBe('A');
    expect(hostileNamePhrase(['A', 'B'])).toBe('A and B');
    expect(hostileNamePhrase(['A', 'B', 'C'])).toBe('A, B and C');
    expect(hostileNamePhrase([])).toBe('nothing');
    // No dangling comma before the conjunction, no doubled conjunction.
    expect(hostileNamePhrase(['A', 'B', 'C'])).not.toContain(', and ');
    expect(hostileNamePhrase(['A', 'B', 'C']).match(/ and /g)!.length).toBe(1);
  });

  it('⚠ works for all nine Capitals with no leaked token', () => {
    for (const id of LOST_CAPITAL_LOCATIONS) {
      const name = GUARDIANS_BY_CAPITAL[id]!.capitalName;
      const l = summonHostilesLine(name, { blocked: true, count: 1, names: ['Bog Hound'] });
      expect(l).toContain(name);
      expect(l).not.toContain('undefined');
      expect(l).not.toMatch(/\{[A-Za-z]+\}/);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — one predicate, one coordinate system
// ---------------------------------------------------------------------------

describe('"am I really here" has one owner and reads the authoritative cell', () => {
  const at = (id: string, over: Partial<PlayerCharacter> = {}): PlayerCharacter => {
    const cell = canonicalCellOf(id);
    return {
      currentLocationId: id,
      gridX: cell.x, gridY: cell.y,
      mapX: WORLD_MAP_CENTER_X, mapY: WORLD_MAP_CENTER_Y,
      hubRoomId: null, travelTarget: undefined,
      ...over,
    } as unknown as PlayerCharacter;
  };

  it('⚠⚠ the two spellings agree across every state a player can be in', () => {
    // ⚠ MEASURED, NOT ASSERTED. This is the claim the refactor rests on, and it
    // is the one I am least entitled to take on faith.
    let cases = 0;
    for (const id of LOST_CAPITAL_LOCATIONS) {
      for (const hub of [null, 'gate'] as const) {
        for (const travelling of [false, true]) {
          for (const offset of [0, 1, -1, 3]) {
            const cell = canonicalCellOf(id);
            const p = at(id, {
              hubRoomId: hub,
              travelTarget: travelling ? ({ locationId: 'drakova' } as never) : undefined,
              gridX: cell.x + offset,
              mapX: WORLD_MAP_CENTER_X + offset,
            });
            expect(stationedAtNamedLocation(p)).toBe(_stationedByVisualFrameForTest(p));
            cases++;
          }
        }
      }
    }
    expect(cases).toBe(9 * 2 * 2 * 4); // the sweep is not a no-op
  });

  it('⚠⚠ …and the reason they agree is an IDENTITY, not a coincidence', () => {
    // ⚠ CHECKED A SECOND WAY, because the matrix above only proves agreement on
    // the states I thought to build — and the full suite immediately found one I
    // had not: ota1471's fixture set `currentLocationId` and the visual frame
    // while leaving gridX/gridY on the character's START location. My matrix
    // never built that because I always moved them together.
    //
    // So here is the algebra rather than the sample. `gridToVisual` is
    //     mapX = CENTER_X + (gridX − canonicalCellOf(currentLocationId).x)
    // therefore mapX === CENTER_X EXACTLY WHEN gridX === that location's cell.
    // The two predicates are the same question — one asked of the derived value,
    // one of the source — wherever the derivation has actually been applied.
    // Every real writer applies it: character creation and travelTo write both,
    // stepDirection writes both, and the save loader DERIVES mapX/mapY from
    // gridX/gridY. Only a hand-built fixture can produce the stale state, which
    // is exactly what had produced it.
    let checked = 0;
    for (const id of LOST_CAPITAL_LOCATIONS) {
      const cell = canonicalCellOf(id);
      for (const d of [0, 1, -1, 5, -5]) {
        const vis = gridToVisual(cell.x + d, cell.y, id);
        expect(vis.mapX === WORLD_MAP_CENTER_X).toBe(d === 0);
        checked++;
      }
    }
    expect(checked).toBe(9 * 5);
  });

  it('⚠ standing on the anchor is stationed; one step off is not', () => {
    const p = at('voronov');
    expect(stationedAtNamedLocation(p)).toBe(true);
    const cell = canonicalCellOf('voronov');
    const off = at('voronov', { gridX: cell.x + 1, mapX: WORLD_MAP_CENTER_X + 1 });
    expect(stationedAtNamedLocation(off)).toBe(false);
  });

  it('⚠ indoors at the location counts as here, wherever the frame says', () => {
    expect(stationedAtNamedLocation(at('voronov', { hubRoomId: 'gate' }))).toBe(true);
  });

  it('⚠ mid-journey the departure city is not "here"', () => {
    expect(stationedAtNamedLocation(
      at('voronov', { travelTarget: { locationId: 'drakova' } as never }),
    )).toBe(false);
  });

  it('⚠ null / undefined players answer false rather than throwing', () => {
    expect(stationedAtNamedLocation(null)).toBe(false);
    expect(stationedAtNamedLocation(undefined)).toBe(false);
  });

  it('⚠⚠ it reads the AUTHORITATIVE cell, which is the point of the move', () => {
    // The state the visual-frame spelling gets wrong: grid cell moved, display
    // frame not yet re-centered. Unreachable today because arrival writes both,
    // and exactly the divergence OTA-1347/1458 chased when one write was missed.
    const cell = canonicalCellOf('voronov');
    const drifted = at('voronov', { gridX: cell.x + 2, mapX: WORLD_MAP_CENTER_X });
    expect(standingAtLocation(drifted, 'voronov')).toBe(false);
    expect(stationedAtNamedLocation(drifted)).toBe(false);      // reads the truth
    expect(_stationedByVisualFrameForTest(drifted)).toBe(true); // reads the display
  });

  it('⚠⚠ no hand-rolled copy survives in either screen or in the store', () => {
    for (const [name, src] of [['ExplorationScreen', EXPL], ['ContractsScreen', CONTRACTS], ['gameStore', STORE]] as const) {
      expect(src).not.toMatch(/\.mapX\s*===\s*(?:cx|WORLD_MAP_CENTER_X)/);
      expect(src).not.toMatch(/\.mapY\s*===\s*(?:cy|WORLD_MAP_CENTER_Y)/);
      expect(name.length).toBeGreaterThan(0);
    }
    expect(EXPL).toContain('stationedAtNamedLocation(player)');
    expect(CONTRACTS).toContain('stationedAtNamedLocation(player)');
    expect(STORE).toContain('stationedAtNamedLocation');
  });

  it('⚠ the app never calls the kept-for-testing visual spelling', () => {
    // It exists to make a claim checkable. If production ever calls it, the
    // claim has become the implementation and the move was undone.
    for (const src of [EXPL, CONTRACTS, STORE]) {
      expect(src).not.toContain('_stationedByVisualFrameForTest');
    }
  });
});

// ---------------------------------------------------------------------------
// 4 — both chips carry the gate (the many-doors rule)
// ---------------------------------------------------------------------------

describe('two SUMMON chips, one rule', () => {
  it('⚠⚠ both chips reach the same action', () => {
    expect(EXPL).toContain('onPress={() => useGameStore.getState().summonCoreGuardian()}');
    expect(CONTRACTS).toContain('onPress={() => useGameStore.getState().summonCoreGuardian()}');
  });

  it('⚠⚠ both read the hostiles state at render, from the same helper', () => {
    for (const src of [EXPL, CONTRACTS]) {
      expect(src).toContain('summonHostiles(');
      expect(src).toContain('hostileNamePhrase');
    }
  });

  it('⚠ neither re-derives "is anything alive" by hand', () => {
    for (const src of [EXPL, CONTRACTS]) {
      // A chip counting enemies itself is how a label and a handler diverge.
      expect(src).not.toMatch(/enemies\.filter\([^)]*hp\s*>\s*0/);
      expect(src).not.toMatch(/enemyHps\.some\(/);
    }
  });

  it('⚠ the chip stays PRESSABLE so a tap prints the reason (OTA-220)', () => {
    // A dead control teaches the player nothing. Both chips must keep their
    // onPress regardless of state — the label changes, the handler does not.
    for (const src of [EXPL, CONTRACTS]) {
      expect(src).not.toMatch(/disabled=\{[^}]*summonBlocked/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — through the real store
// ---------------------------------------------------------------------------

describe('OTA-1480 — driven through the real store', () => {
  async function standAtVoronov(enemies: Enemy[], hps: number[]) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Blocker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id,
    } as never);
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const cell = canonicalCellOf('voronov');
    store.setState((s) => ({
      currentScreen: 'exploration',
      currentScene: {
        ...s.currentScene!,
        enemies,
        enemyHps: hps,
        enemyKnockedOut: enemies.map(() => false),
      },
      player: {
        ...s.player!,
        currentLocationId: 'voronov',
        travelTarget: undefined,
        hubRoomId: null,
        gridX: cell.x, gridY: cell.y,
        mapX: WORLD_MAP_CENTER_X, mapY: WORLD_MAP_CENTER_Y,
        hoursElapsed: 100,
        mainQuest: {
          phase: 'cores' as const,
          coresRecovered: ['drakova'],
          guardiansDefeated: ['drakova'],
          lastCoreAtHours: 40, // long settled — this OTA's gate must be the one that fires
        },
      },
    }));
    return store;
  }

  const guardianCount = () =>
    (useGameStore.getState().currentScene?.enemies ?? []).filter((e) => isCoreGuardian(e)).length;

  it('⚠⚠⚠ a live pack REFUSES the summons, and no Guardian is added', async () => {
    const store = await standAtVoronov([mob('Bog Hound')], [10]);
    const r = store.getState().summonCoreGuardian();
    expect(r).toEqual({ ok: false, reason: 'hostiles_present' });
    expect(guardianCount()).toBe(0);
    // …and the enemy that blocked it is untouched.
    expect(store.getState().currentScene?.enemies.length).toBe(1);
  });

  it('⚠⚠⚠ and the player is TOLD, in the world\'s own voice', async () => {
    const store = await standAtVoronov([mob('Bog Hound')], [10]);
    store.getState().summonCoreGuardian();
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/will not answer over the noise of a fight/);
    expect(log).toContain('Bog Hound');
    expect(log).toContain('Voronov');
  });

  it('⚠⚠ a CLEARED scene summons normally — the guard is not a wall', async () => {
    const store = await standAtVoronov([], []);
    const r = store.getState().summonCoreGuardian();
    expect(r.ok).toBe(true);
    expect(guardianCount()).toBe(1);
  });

  it('⚠⚠ a scene of CORPSES summons normally', async () => {
    const store = await standAtVoronov([mob('Bog Hound')], [0]);
    const r = store.getState().summonCoreGuardian();
    expect(r.ok).toBe(true);
    expect(guardianCount()).toBe(1);
  });

  it('⚠⚠ a Guardian already present still bounces the player into it', async () => {
    const store = await standAtVoronov([], []);
    expect(store.getState().summonCoreGuardian().ok).toBe(true);
    // Second call: the Guardian is in the scene. It must NOT read as "hostiles".
    const again = store.getState().summonCoreGuardian();
    expect(again).toEqual({ ok: true, reason: 'already_present' });
    expect(guardianCount()).toBe(1);
  });

  it('⚠ the refusal does not charge the player anything', async () => {
    const store = await standAtVoronov([mob('Bog Hound')], [10]);
    const before = store.getState().player!;
    const hp = before.hp; const stam = before.stamina; const hours = before.hoursElapsed;
    store.getState().summonCoreGuardian();
    const after = store.getState().player!;
    expect(after.hp).toBe(hp);
    expect(after.stamina).toBe(stam);
    expect(after.hoursElapsed).toBe(hours);
  });
});

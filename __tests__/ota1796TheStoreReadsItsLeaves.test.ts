// ⚠⚠⚠ OTA-1796 — THE STORE READS ITS LEAVES.
//
// `useGameStore = create(...)` evaluates its initialiser during gameStore's own
// module evaluation, and that initialiser hands the quest slice a deps object.
// Two of those deps were module bindings declared ~25,000 lines BELOW the
// create( call. On web (Metro keeps `const`) that is a TDZ error and the line
// could not boot — OTA-1756's finding. On native and under jest the RN Babel
// preset downlevels const to var, so the same read was `undefined`, silently:
// the slice's `...deps.FRESH_ENEMY_ARRAYS` spread nothing, and the chain flag,
// copied by value, meant ROUTE TO on a faction contract dropped its own chain
// on the next line. The values now live in app/state/storeLeaves.ts. These
// claims are the ones that were false before it.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

// Capture what the store hands the quest slice AT CREATION — the moment the
// web bundle threw and the native bundle silently got undefined.
// (A global bag, because jest hoists the mock factory above every declaration
// in this file and the store is created the moment it is imported.)
type Bag = { deps?: Record<string, unknown> };
const bag = (): Bag => ((globalThis as unknown as { __ota1796?: Bag }).__ota1796 ??= {});
jest.mock('../app/state/slices/questSlice', () => {
  const real = jest.requireActual('../app/state/slices/questSlice');
  return {
    ...real,
    createQuestSlice: (set: unknown, get: unknown, deps: Record<string, unknown>) => {
      ((globalThis as unknown as { __ota1796?: { deps?: unknown } }).__ota1796 ??= {}).deps = deps;
      return real.createQuestSlice(set, get, deps);
    },
  };
});

import { useGameStore, desiredMissionLeg, FRESH_ENEMY_ARRAYS as STORE_FRESH, chainRouting as STORE_CHAIN } from '../app/state/gameStore';
import { FRESH_ENEMY_ARRAYS, chainRouting } from '../app/state/storeLeaves';
import { getRaces, getFactions } from '../app/engine/character';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import type { PlayerCharacter } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

describe('OTA-1796 — the deps exist when the store is created', () => {
  it('⚠⚠⚠ FRESH_ENEMY_ARRAYS reached the quest slice DEFINED, and it is the leaf\'s own object', () => {
    // Before: `undefined` under this very preset (const → var), so the spread
    // at the escort spawn and the hunt-boss spawn reset nothing.
    const got = bag().deps?.FRESH_ENEMY_ARRAYS;
    expect(got).toBeDefined();
    expect(got).toBe(FRESH_ENEMY_ARRAYS);
    expect(Object.keys(got as object).sort()).toEqual([
      'enemyAmbushUsed', 'enemyArmorShred', 'enemyCorruptionStacks', 'enemyKnockedOut',
      'enemyStaggered', 'enemyStatuses', 'fleeAttempts',
    ]);
    expect(STORE_FRESH).toBe(FRESH_ENEMY_ARRAYS);
  });

  it('⚠⚠⚠ THE CHAIN FLAG IS ONE OBJECT held by the store and the slice — a write on either side is the read on the other', () => {
    expect(bag().deps?.chainRouting).toBe(chainRouting);
    expect(STORE_CHAIN).toBe(chainRouting);
    expect(chainRouting.active).toBe(false);
  });

  it('the leaf has no imports — it cannot be part of any cycle', () => {
    // Structural, by behaviour: requiring the leaf in isolation yields both
    // values with no store loaded.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const leaf = require('../app/state/storeLeaves');
      expect(leaf.FRESH_ENEMY_ARRAYS.fleeAttempts).toBeUndefined();
      expect('fleeAttempts' in leaf.FRESH_ENEMY_ARRAYS).toBe(true);
      expect(leaf.chainRouting).toEqual({ active: false });
    });
  });
});

describe('OTA-1796 — ROUTE TO keeps its own chain', () => {
  async function boot() {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Router', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    return store;
  }

  /** A starter contract whose current leg is somewhere the player is not. */
  function awayContract(player: PlayerCharacter) {
    for (const def of FACTION_QUESTS) {
      const rec = { id: def.id, stage: 0, acceptedAt: 0, tracked: true, postedByFaction: null } as never;
      let leg: { loc: string; phase: string } | null = null;
      try { leg = desiredMissionLeg(player, def, rec) as { loc: string; phase: string }; } catch { continue; }
      if (leg?.loc && leg.loc !== player.currentLocationId) return { def, rec, leg };
    }
    throw new Error('no away contract in the catalogue');
  }

  it('⚠⚠⚠ routeMission SETS the chain and the course, and the chain SURVIVES the course', async () => {
    // Measured before the fix: routedMission null after every one of three
    // starter contracts — setTravelCourse read a flag the slice never reached.
    const store = await boot();
    const { def, rec, leg } = awayContract(store.getState().player!);
    store.setState((s) => ({ player: { ...s.player!, activeFactionQuests: [rec], routedMission: null, travelTarget: null, hubRoomId: null } as never }));
    store.getState().routeMission(def.id);
    const p = store.getState().player!;
    expect(p.travelTarget?.locationId).toBe(leg.loc);
    expect(p.routedMission).toEqual({ id: def.id, phase: leg.phase });
    // The flag is a scoped bypass, not a mode: back to false once the course is set.
    expect(chainRouting.active).toBe(false);
  });

  it('⚠⚠ THE NEGATIVE CONTROL: a MANUAL course still drops the chain — the guard is intact', async () => {
    const store = useGameStore;
    const p0 = store.getState().player!;
    const { def, rec, leg } = awayContract(p0);
    store.setState((s) => ({ player: { ...s.player!, activeFactionQuests: [rec], routedMission: null, travelTarget: null, hubRoomId: null } as never }));
    store.getState().routeMission(def.id);
    expect(store.getState().player!.routedMission).toEqual({ id: def.id, phase: leg.phase });
    // Now the player diverts by hand to somewhere else that is not the leg.
    const elsewhere = FACTION_QUESTS.map((d) => { try { return (desiredMissionLeg(p0, d, rec) as { loc: string }).loc; } catch { return null; } })
      .find((loc) => loc && loc !== leg.loc && loc !== p0.currentLocationId)!;
    expect(elsewhere).toBeTruthy();
    store.getState().setTravelCourse(elsewhere);
    expect(store.getState().player!.travelTarget?.locationId).toBe(elsewhere);
    expect(store.getState().player!.routedMission).toBeNull();
  });
});

describe('OTA-1796 — what the live reset uncovered: the arm must not re-summon a stage\'s own sleepers', () => {
  // With the slice's reset actually running, OTA-1688's "every body out cold →
  // nothing owed" claim failed: the per-action ground arm saw no CONSCIOUS
  // hostiles, re-summoned the stage's brood over the three it had just put
  // down, and the flee then counted three fresh bodies. Before, the re-summon
  // silently inherited the sleepers' knocked-out flags. Now the arm sees the
  // stage's own stamp on the field and keeps its hands off.
  const BOG = 'hunt_bog_dragon';
  const token = (name: string) => ({ id: `t_${name.replace(/\W+/g, '_')}`, name, kind: 'misc', quantity: 1, tags: ['quest'] });
  const settle = async (pred: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); };

  it('⚠⚠⚠ an action taken over the stage\'s own knocked-out brood leaves those bodies where they lie', async () => {
    const store = useGameStore;
    const get = store.getState;
    const p = get().player!;
    store.setState({
      player: {
        ...p, ...placedAt('mud_seas'), hubRoomId: null, stamina: 100, travelTarget: undefined, whisperCourse: null, routedMission: null,
        hp: 600, hpMax: 600, hoursElapsed: 70,
        activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], activeMysteries: [], activeStorylines: [], activeFactionQuests: [], missionEncounters: {},
        inventory: [...p.inventory, token("Eshren's Name-Token")],
      } as never,
      pendingMissionBeat: null, pendingMissionStinger: null, missionCloseQueue: [], missionFleeHoldCell: null, activeBuildingId: null,
      worldMemory: { ...get().worldMemory, deeds: {} },
    } as never);
    store.setState({ currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], enemyStatuses: [], enemyAmbushUsed: [], activeEnemyIdx: 0, range: null } as never });
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).filter((e) => e.name === 'Mud Harpy').length === 3);
    const brood = get().currentScene!.enemies;
    expect(brood).toHaveLength(3);
    expect(brood.every((e) => (e as { stageKey?: string }).stageKey === `hunt:${BOG}:5`)).toBe(true);
    // Every one of them put down — and the reset that stood them up really ran.
    expect(get().currentScene!.enemyKnockedOut).toBeUndefined();
    store.setState({ currentScene: { ...get().currentScene!, enemyKnockedOut: [true, true, true], range: 'close' } as never, pendingMissionStinger: null, pendingMissionBeat: null });
    await get().submitPlayerAction('look around');
    await new Promise((r) => setTimeout(r, 150));
    const after = get().currentScene!;
    expect(after.enemies).toHaveLength(3);
    expect(after.enemies[0]).toBe(brood[0]); // the SAME bodies, not a second brood
    expect(after.enemyKnockedOut).toEqual([true, true, true]);
  });
});

// I-003 / D-guardian-settle-overwrite — production defect repair.
//
// triggerMainQuest() (gameStore.ts) correctly stamps `lastCoreAtHours` onto
// mainQuest the instant a Core is recovered (the OTA-1471 settle clock — see
// the comment at that call site). But the two one-shot beats that fire
// exactly at Core 3 (rival-pressure twist) and Core 4 (golem-forge unlock)
// each re-derived their flagged mainQuest from the STALE pre-stamp
// `nextState` via `mq.markTwistFired(nextState, ...)`, then overwrote
// `player.mainQuest` with that stale-based value on the same tick — silently
// discarding the just-written settle stamp, but ONLY on Core 3 and Core 4
// (no other Core transition runs this code).
//
// Fix (gameStore.ts, inside triggerMainQuest's core_recovered branch):
// `markTwistFired` is now called on `get().player.mainQuest` (the live,
// already-stamped state), not on the stale local `nextState`.
//
// This test drives the real production door: `resolveEnemyDefeat()`, the
// exact store action a live Guardian kill invokes, with a real
// `spawnGuardianForCapital()`-built Guardian as the active enemy — not a
// direct call into the private `triggerMainQuest`/`markTwistFired` functions.

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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
import { spawnGuardianForCapital } from '../app/engine/coreGuardians';
import { placedAt } from '../test-utils/placePlayer';

async function standAtCapitalWithGuardianUp(opts: {
  capitalId: string;
  coresRecovered: string[];
  guardiansDefeated: string[];
  lastCoreAtHours: number;
  hoursElapsed: number;
  twistsFired?: string[];
}) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));

  const basePlayer = store.getState().player!;
  const playerForSpawn = {
    ...basePlayer,
    mainQuest: {
      phase: 'cores' as const,
      coresRecovered: opts.coresRecovered,
      guardiansDefeated: opts.guardiansDefeated,
      lastCoreAtHours: opts.lastCoreAtHours,
      twistsFired: opts.twistsFired ?? [],
    },
  };
  const guardian = spawnGuardianForCapital(playerForSpawn, opts.capitalId)!;

  store.setState((s) => ({
    currentScreen: 'exploration',
    currentScene: {
      ...s.currentScene!,
      enemies: [guardian],
      enemyHps: [guardian.hp],
      activeEnemyIdx: 0,
    },
    player: {
      ...s.player!,
      ...placedAt(opts.capitalId),
      travelTarget: undefined,
      hoursElapsed: opts.hoursElapsed,
      mainQuest: playerForSpawn.mainQuest,
    },
  }));
  return store;
}

describe('I-003 — Guardian settle-clock stamp survives the Core-3 and Core-4 one-shot beats', () => {
  it('Core 3 (rival-pressure twist): lastCoreAtHours reflects THIS Core, not the stale pre-stamp value', async () => {
    const store = await standAtCapitalWithGuardianUp({
      capitalId: 'samarran',
      coresRecovered: ['asgardar', 'nimari'],
      guardiansDefeated: ['asgardar', 'nimari'],
      lastCoreAtHours: 10,
      hoursElapsed: 55.5,
    });

    store.getState().resolveEnemyDefeat();

    const mq = store.getState().player!.mainQuest!;
    expect(mq.coresRecovered).toContain('samarran');
    expect(mq.coresRecovered.length).toBe(3);
    expect(mq.twistsFired).toContain('three_core_pressure');
    // The defect: this used to read back the STALE pre-stamp value (10, or
    // whatever the pre-Core-3 mainQuest carried) because markTwistFired was
    // derived from `nextState`, not the live just-stamped state.
    expect(mq.lastCoreAtHours).toBe(55.5);
  });

  it('Core 4 (golem-forge unlock): lastCoreAtHours reflects THIS Core, not the stale pre-stamp value', async () => {
    const store = await standAtCapitalWithGuardianUp({
      capitalId: 'ostragar',
      coresRecovered: ['asgardar', 'nimari', 'samarran'],
      guardiansDefeated: ['asgardar', 'nimari', 'samarran'],
      lastCoreAtHours: 55.5,
      hoursElapsed: 102,
    });

    store.getState().resolveEnemyDefeat();

    const mq = store.getState().player!.mainQuest!;
    expect(mq.coresRecovered).toContain('ostragar');
    expect(mq.coresRecovered.length).toBe(4);
    expect(mq.twistsFired).toContain('four_core_forge');
    expect(mq.lastCoreAtHours).toBe(102);
  });

  it('negative control: a non-3/4 Core transition never touches twistsFired and still stamps correctly (no regression)', async () => {
    const store = await standAtCapitalWithGuardianUp({
      capitalId: 'asgardar',
      coresRecovered: [],
      guardiansDefeated: [],
      lastCoreAtHours: 0,
      hoursElapsed: 12,
    });

    store.getState().resolveEnemyDefeat();

    const mq = store.getState().player!.mainQuest!;
    expect(mq.coresRecovered).toEqual(['asgardar']);
    expect(mq.twistsFired ?? []).toEqual([]);
    expect(mq.lastCoreAtHours).toBe(12);
  });
});

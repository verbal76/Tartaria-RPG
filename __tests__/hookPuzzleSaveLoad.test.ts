// OTA-131 pressure test #3 — save / load round-trip mid-puzzle.
//
// Scenarios:
//   1. Start the vault puzzle, make 2 correct rotations, persist
//      via JSON.stringify(hook), reload via JSON.parse, finish the
//      3rd rotation, assert solved.
//   2. Mix correct + wrong attempts before persist, restore, continue,
//      assert state matches the pre-persist counter and the puzzle
//      eventually solves.
//   3. Legacy hooks with NO puzzleProgress field (pre-OTA-129 saves)
//      load cleanly — puzzleProgress is undefined and a fresh attempt
//      kicks in like a brand-new puzzle.
//   4. The gameStore's own persist() / hydrate() cycle preserves the
//      mid-puzzle state on an actual save and reload.

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

// OTA-131 GUARDRAIL — 15s file cap. Save/load tests run a handful of
// hydrate/persist cycles each (~50ms apiece).
jest.setTimeout(15000);

import { useGameStore } from '../app/state/gameStore';
import { applyPuzzleInput } from '../app/engine/hookPuzzles';
import type { Hook } from '../app/engine/hooks';

function vaultHook(): Hook {
  return {
    id: 'sl_vault',
    kind: 'sealed_vault_door',
    nouns: ['vault', 'door', 'ring', 'tumbler'],
    plantedLine: 'A vault door.',
    stage: 0,
    resolved: false,
  };
}

async function bootWithHook(hook: Hook) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Saver', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      hooks: [hook],
      ambientNouns: Array.from(new Set([...(scene.ambientNouns ?? []), 'ring', 'vault'])),
      enemies: [],
      vendor: null,
    },
    player: { ...store.getState().player!, stamina: 999, staminaMax: 999, hp: 99, hpMax: 99 },
  });
  return store;
}

describe('OTA-131 save/load — pure resolver round-trip', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('two correct, persist, reload, third correct → solved', () => {
    // Pure resolver flow (no gameStore) — proves the data model
    // survives serialization independently of the store.
    let hook = vaultHook();
    const a = applyPuzzleInput(hook, { intent: 'rotate', target: 'left', direction: 'left' });
    hook = { ...hook, puzzleProgress: a.progress };
    const b = applyPuzzleInput(hook, { intent: 'rotate', target: 'right', direction: 'right' });
    hook = { ...hook, puzzleProgress: b.progress };

    // Persist
    const serialized = JSON.stringify(hook);
    expect(serialized).toContain('puzzleProgress');

    // Reload
    const reloaded = JSON.parse(serialized) as Hook;
    expect(reloaded.puzzleProgress?.correctSoFar).toBe(2);
    expect(reloaded.puzzleProgress?.failures).toBe(0);

    // Continue
    const c = applyPuzzleInput(reloaded, { intent: 'rotate', target: 'right', direction: 'right' });
    expect(c.solved).toBe(true);
    expect(c.progress.correctSoFar).toBe(3);
  });

  it('mixed correct + wrong before persist replays identically after reload', () => {
    let hook = vaultHook();
    // OTA-131 GUARDRAIL: bounded sequence of 6 attempts (well under 500 cap).
    const sequence: Array<{ dir: 'left' | 'right' | null }> = [
      { dir: 'left' },   // correct (1)
      { dir: 'left' },   // wrong (reset to 0, failures=1)
      { dir: 'left' },   // correct (1)
      { dir: 'right' },  // correct (2)
      { dir: null },     // wrong (failures=2, reset to 0)
      { dir: 'right' },  // wrong (no match for step 0, failures=3)
    ];
    for (const s of sequence) {
      const r = applyPuzzleInput(hook, { intent: 'rotate', target: s.dir ?? 'x', direction: s.dir });
      hook = { ...hook, puzzleProgress: r.progress };
    }
    const expected = hook.puzzleProgress!;
    const reloaded = JSON.parse(JSON.stringify(hook)) as Hook;
    expect(reloaded.puzzleProgress?.correctSoFar).toBe(expected.correctSoFar);
    expect(reloaded.puzzleProgress?.failures).toBe(expected.failures);
    expect(reloaded.puzzleProgress?.history).toEqual(expected.history);

    // Continue from reloaded state and drive the clean solve.
    let cur = reloaded;
    const finish: Array<'left' | 'right'> = ['left', 'right', 'right'];
    let lastSolved = false;
    for (const d of finish) {
      const r = applyPuzzleInput(cur, { intent: 'rotate', target: d, direction: d });
      cur = { ...cur, puzzleProgress: r.progress };
      lastSolved = r.solved;
    }
    expect(lastSolved).toBe(true);
  });

  it('legacy hook with NO puzzleProgress field loads cleanly and runs as fresh', () => {
    const legacyJson = JSON.stringify({
      id: 'legacy_vault',
      kind: 'sealed_vault_door',
      nouns: ['vault', 'door'],
      plantedLine: 'A vault door.',
      stage: 0,
      resolved: false,
      // no puzzleProgress
    } as Hook);
    const loaded = JSON.parse(legacyJson) as Hook;
    expect(loaded.puzzleProgress).toBeUndefined();
    // Resolver should not crash on a fresh hook.
    expect(() => applyPuzzleInput(loaded, { intent: 'rotate', target: 'left', direction: 'left' })).not.toThrow();
    const out = applyPuzzleInput(loaded, { intent: 'rotate', target: 'left', direction: 'left' });
    expect(out.progress.correctSoFar).toBe(1);
    expect(out.progress.failures).toBe(0);
    expect(out.progress.history.length).toBe(1);
  });

  it('legacy hook still on stage 0 + a wrong attempt initializes the failure counter', () => {
    const legacy: Hook = {
      id: 'legacy_v2',
      kind: 'sealed_vault_door',
      nouns: ['vault'],
      plantedLine: 'A door.',
      stage: 0,
      resolved: false,
    };
    const out = applyPuzzleInput(legacy, { intent: 'rotate', target: 'wrong-dir', direction: null });
    expect(out.progress.correctSoFar).toBe(0);
    expect(out.progress.failures).toBe(1);
    expect(out.progress.history.length).toBe(1);
  });
});

describe('OTA-131 save/load — full gameStore persist + hydrate', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('puzzleProgress survives a full persist() → hydrate() round-trip', async () => {
    const store = await bootWithHook(vaultHook());
    store.getState().submitPlayerAction('rotate the ring left'); // correctSoFar=1
    store.getState().submitPlayerAction('rotate the ring right'); // correctSoFar=2

    // Pin the pre-persist state for comparison
    const beforeHook = store.getState().currentScene!.hooks.find((h) => h.id === 'sl_vault')!;
    expect(beforeHook.puzzleProgress?.correctSoFar).toBe(2);

    // Persist
    await store.getState().persist();

    // Snapshot AsyncStorage payload to confirm puzzleProgress was
    // serialized — defense in depth against a silent "saved without
    // the field" regression.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const keys: string[] = await AsyncStorage.getAllKeys();
    let foundProgress = false;
    for (const k of keys) {
      const v = await AsyncStorage.getItem(k);
      if (v && v.includes('puzzleProgress') && v.includes('correctSoFar')) {
        foundProgress = true;
        break;
      }
    }
    expect(foundProgress).toBe(true);

    // Re-hydrate (simulates app restart). hydrate() restores from
    // the saved player + scene; the hook with puzzleProgress should
    // re-emerge intact.
    await store.getState().hydrate();
    const afterHook = store.getState().currentScene!.hooks.find((h) => h.id === 'sl_vault');
    expect(afterHook).toBeDefined();
    expect(afterHook!.puzzleProgress?.correctSoFar).toBe(2);
    expect(afterHook!.puzzleProgress?.failures).toBe(0);

    // Finish the 3rd step and assert the puzzle resolves.
    store.getState().submitPlayerAction('rotate the ring right');
    const final = store.getState().currentScene!.hooks.find((h) => h.id === 'sl_vault')!;
    expect(final.stage).toBeGreaterThanOrEqual(1);
  });
});

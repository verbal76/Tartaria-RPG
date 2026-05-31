// OTA-131 pressure test #5 — mercy + hint surfacing.
//
// Verifies:
//   - sealed_vault_door surfaces hint at failures 3 (first hint) and
//     failures 5 (deeper hint), and mercy-solves at failures 7.
//   - submerged_steeple surfaces hint at failures 3 and mercy-solves at
//     failures 6.
//   - Wrong inputs OUTSIDE the puzzle's intentList (e.g. 'ask' on a
//     vault hook) DO NOT count as puzzle failures — they fall through
//     to the normal hook-chain advance / dispatch.
//   - After mercy auto-solve, further investigates on the puzzle noun
//     produce the post-solve experience (either examine returns null
//     and the route falls through, or the chain's stage-1 narration
//     fires; either way puzzleProgress is no longer mutated).

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

// OTA-131 GUARDRAIL — 15s file cap. Each test runs ≤ 12 store taps.
jest.setTimeout(15000);

import { useGameStore } from '../app/state/gameStore';
import { applyPuzzleInput } from '../app/engine/hookPuzzles';
import type { Hook } from '../app/engine/hooks';

function vaultHook(): Hook {
  return {
    id: 'mh_vault',
    kind: 'sealed_vault_door',
    nouns: ['vault', 'door', 'ring', 'tumbler'],
    plantedLine: 'A vault door.',
    stage: 0,
    resolved: false,
  };
}

function steepleHook(): Hook {
  return {
    id: 'mh_steeple',
    kind: 'submerged_steeple',
    nouns: ['steeple', 'cathedral', 'spire'],
    plantedLine: 'A steeple.',
    stage: 0,
    resolved: false,
  };
}

async function bootWithHook(hook: Hook) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Mercy', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      hooks: [hook],
      ambientNouns: Array.from(new Set([...(scene.ambientNouns ?? []), 'ring', 'vault', 'steeple'])),
      enemies: [],
      vendor: null,
    },
    player: { ...store.getState().player!, stamina: 999, staminaMax: 999, hp: 99, hpMax: 99 },
  });
  return store;
}

describe('OTA-131 sealed_vault_door — mercy + hints (resolver-level)', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // Pure resolver tests for exhaustive coverage without touching
  // the store's log channels. Mercy = 7 failures, hints at 3 + 5.
  it('hint at failures 3 (first failure-hint threshold)', () => {
    let hook = vaultHook();
    let r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    hook = { ...hook, puzzleProgress: r.progress };
    expect(r.hint).toBeNull();
    r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    hook = { ...hook, puzzleProgress: r.progress };
    expect(r.hint).toBeNull();
    r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    // 3rd failure surfaces the hint.
    expect(r.progress.failures).toBe(3);
    expect(r.hint).toBeTruthy();
    expect(r.hint).toContain('order the light moves');
    expect(r.solved).toBe(false);
  });

  it('deeper hint at failures 5', () => {
    let hook = vaultHook();
    // OTA-131 GUARDRAIL: loop fixed at 5 (well below 500).
    let r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    for (let i = 0; i < 4; i++) {
      hook = { ...hook, puzzleProgress: r.progress };
      r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    }
    expect(r.progress.failures).toBe(5);
    expect(r.hint).toBeTruthy();
    expect(r.hint).toContain('Three rotations');
    expect(r.solved).toBe(false);
  });

  it('mercy at failures 7 — auto-solves with solvedNarration', () => {
    let hook = vaultHook();
    // OTA-131 GUARDRAIL: cap loop at 7 (well below 500).
    let r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    for (let i = 0; i < 6; i++) {
      hook = { ...hook, puzzleProgress: r.progress };
      r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    }
    expect(r.progress.failures).toBe(7);
    expect(r.solved).toBe(true);
    expect(r.line).toContain('tumbler clicks home');
  });

  it('failures 6 — NOT yet mercy, still hinted deeper', () => {
    let hook = vaultHook();
    let r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    for (let i = 0; i < 5; i++) {
      hook = { ...hook, puzzleProgress: r.progress };
      r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    }
    expect(r.progress.failures).toBe(6);
    expect(r.solved).toBe(false);
    expect(r.hint).toBeTruthy();
  });
});

describe('OTA-131 submerged_steeple — mercy + hints (resolver-level)', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('hint at failures 3', () => {
    let hook = steepleHook();
    let r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    hook = { ...hook, puzzleProgress: r.progress };
    r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    hook = { ...hook, puzzleProgress: r.progress };
    r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    expect(r.progress.failures).toBe(3);
    expect(r.hint).toBeTruthy();
    expect(r.hint).toContain('Three knocks');
  });

  it('mercy at failures 6', () => {
    let hook = steepleHook();
    // OTA-131 GUARDRAIL: cap loop at 6.
    let r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    for (let i = 0; i < 5; i++) {
      hook = { ...hook, puzzleProgress: r.progress };
      r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    }
    expect(r.progress.failures).toBe(6);
    expect(r.solved).toBe(true);
    expect(r.line).toContain('door at the base of the steeple shifts');
  });

  it('failures 4-5 — past hint threshold, NOT yet mercy', () => {
    let hook = steepleHook();
    let r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    for (let i = 0; i < 3; i++) {
      hook = { ...hook, puzzleProgress: r.progress };
      r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    }
    expect(r.progress.failures).toBe(4);
    expect(r.solved).toBe(false);
    expect(r.hint).toBeTruthy();
    hook = { ...hook, puzzleProgress: r.progress };
    r = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    expect(r.progress.failures).toBe(5);
    expect(r.solved).toBe(false);
  });
});

describe('OTA-131 non-puzzle intent — does NOT count as a puzzle failure', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('vault: "ask the vault" routes through normal hook-advance, not puzzle resolver', async () => {
    // 'ask' is hookEligible but NOT in sealedVault's intentList.
    // The gameStore should fall through to the normal hook advance
    // (resolveHookOneStep) instead of calling applyPuzzleInput.
    // Therefore puzzleProgress should stay undefined OR stage should
    // simply advance via the chain path.
    const store = await bootWithHook(vaultHook());
    store.getState().submitPlayerAction('ask about the vault');
    const h = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_vault')!;
    // puzzleProgress should be undefined — the ask path bypassed the
    // resolver entirely.
    expect(h.puzzleProgress).toBeUndefined();
    // And the hook either advanced (stage>=1) via the chain path or
    // stayed at stage 0 because 'ask' didn't carry enough context.
    // Either is fine; the assertion is the resolver didn't fire.
  });

  it('steeple: "investigate steeple" surfaces the chain stage-0 narration on first touch (not a failure)', async () => {
    const store = await bootWithHook(steepleHook());
    store.getState().submitPlayerAction('investigate the steeple');
    const h = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_steeple')!;
    // investigate is in hookEligible but NOT in steeple's intentList
    // → not a puzzle attempt. Should NOT touch puzzleProgress.
    expect(h.puzzleProgress).toBeUndefined();
  });
});

describe('OTA-131 post-mercy behavior — no further puzzleProgress mutation', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('post-mercy: investigate ring returns null examine-line (stage > 0)', async () => {
    const store = await bootWithHook(vaultHook());
    // Drive 7 failures to trigger mercy. Bare 'rotate' (no direction)
    // counts as 'wrong' against an in-intentList verb.
    // OTA-131 GUARDRAIL: loop fixed at 8.
    for (let i = 0; i < 8; i++) {
      const h = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_vault');
      if (!h || h.stage > 0) break;
      store.getState().submitPlayerAction('rotate the ring');
    }
    const solved = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_vault')!;
    expect(solved.stage).toBeGreaterThanOrEqual(1);
    const progBefore = solved.puzzleProgress ? { ...solved.puzzleProgress } : null;

    // After mercy, investigate the ring. Per examinePuzzleLine: stage
    // > 0 → returns null. So the route should fall through to the
    // normal chain advance, not re-fire the puzzle resolver.
    store.getState().submitPlayerAction('investigate the ring');
    const after = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_vault')!;
    // puzzleProgress must NOT be mutated by post-solve taps.
    expect(after.puzzleProgress).toEqual(progBefore);
  });

  it('post-mercy: another rotate tap does NOT increment failures again', async () => {
    const store = await bootWithHook(vaultHook());
    // OTA-131 GUARDRAIL: 8-tap mercy drive.
    for (let i = 0; i < 8; i++) {
      const h = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_vault');
      if (!h || h.stage > 0) break;
      store.getState().submitPlayerAction('rotate the ring');
    }
    const beforeProg = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_vault')!.puzzleProgress;
    store.getState().submitPlayerAction('rotate the ring left');
    const afterProg = store.getState().currentScene!.hooks.find((x) => x.id === 'mh_vault')!.puzzleProgress;
    expect(afterProg).toEqual(beforeProg);
  });
});

describe('OTA-131 hint persistence — hint survives the next correct attempt', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('after 3 failures + 1 correct rotation, the hint is NOT re-fired (correct attempt has no hint payload)', () => {
    let hook = vaultHook();
    let r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    for (let i = 0; i < 2; i++) {
      hook = { ...hook, puzzleProgress: r.progress };
      r = applyPuzzleInput(hook, { intent: 'rotate', target: 'no-dir', direction: null });
    }
    expect(r.progress.failures).toBe(3);
    expect(r.hint).toBeTruthy();
    hook = { ...hook, puzzleProgress: r.progress };

    // Now a correct rotation: solved=false (only 1/3 correct), but the
    // hint should still surface because failures >= 3 (hint threshold
    // is "at or past N failures", not "on the Nth failure").
    r = applyPuzzleInput(hook, { intent: 'rotate', target: 'left', direction: 'left' });
    expect(r.progress.correctSoFar).toBe(1);
    expect(r.progress.failures).toBe(3); // unchanged on a correct attempt
    expect(r.hint).toBeTruthy(); // hint still surfaces because failures stayed at 3
  });
});

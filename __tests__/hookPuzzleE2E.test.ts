// OTA-131 pressure test #1 — end-to-end pipeline:
//   parseInput → submitPlayerAction → hook intercept →
//   puzzle resolver → stage advance → chain reward fire.
//
// Boots the real gameStore, plants a sealed_vault_door hook
// into currentScene.hooks, then drives `submitPlayerAction`
// with the canonical [left, right, right] rotation sequence.
// Asserts that puzzleProgress advances correctly AND the chain
// stage-1 reward fires (TC + items granted per hooks.ts CHAINS
// for sealed_vault_door).
//
// Pattern mirrors climbRopeMechanics / acceptVerbBugs tests:
// mock the native modules, hydrate, startNewGame, setState the
// scene to inject the hook, drive submitPlayerAction, assert
// against store state.

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

// OTA-131 GUARDRAIL — bound test runtime to 15s/file. The E2E
// tests run a handful of submitPlayerAction calls each so we
// should be well under, but the cap catches an accidental
// hang from store hydration in CI.
jest.setTimeout(15000);

import { useGameStore } from '../app/state/gameStore';
import type { Hook } from '../app/engine/hooks';

function vaultHook(): Hook {
  return {
    id: 'e2e_vault',
    kind: 'sealed_vault_door',
    nouns: ['vault', 'door', 'gate', 'seal', 'glyphs', 'ring', 'tumbler'],
    plantedLine: 'A circular Tartarian vault door, mud-pasted but intact.',
    stage: 0,
    resolved: false,
  };
}

function steepleHook(): Hook {
  return {
    id: 'e2e_steeple',
    kind: 'submerged_steeple',
    nouns: ['steeple', 'cathedral', 'spire', 'water', 'church'],
    plantedLine: 'The top of a flooded Tartarian cathedral pierces the standing water.',
    stage: 0,
    resolved: false,
  };
}

async function bootWithHook(hook: Hook) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Cracker', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      hooks: [hook],
      // give the chips the puzzle nouns
      ambientNouns: Array.from(new Set([...(scene.ambientNouns ?? []), 'ring', 'vault', 'steeple'])),
      // clear any enemies/vendors that could short-circuit the dispatch
      enemies: [],
      vendor: null,
    },
  });
  return store;
}

describe('OTA-131 E2E — sealed_vault_door full pipeline', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // OTA-131 BUG #1, OTA-132 fix: pre-OTA-132 the puzzle-solve branch
  // called resolveHookOneStep with hook.stage=0, which fired the
  // empty stage-0 chain outcome and stopped. Rewards (90 TC, Aetheric
  // Shard/Cloth/Compass) only landed on a subsequent tap. OTA-132
  // passes hook with stage=hook.stage+1 so getHookOutcome returns
  // stage-1's reward outcome inline with the puzzle-solve narration.
  it('canonical sequence [left, right, right] solves and fires chain reward', async () => {
    const store = await bootWithHook(vaultHook());
    const beforeTc = store.getState().player!.tc;
    const beforeInvNames = store.getState().player!.inventory.map((i) => i.name);

    store.getState().submitPlayerAction('rotate the ring left');
    let h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_vault')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(1);
    expect(h.puzzleProgress?.failures).toBe(0);
    expect(h.stage).toBe(0);

    store.getState().submitPlayerAction('rotate ring right');
    h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_vault')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(2);
    expect(h.stage).toBe(0);

    store.getState().submitPlayerAction('turn ring right');
    h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_vault')!;
    // After 3 correct, the puzzle solved AND resolveHookOneStep
    // advanced the stage to 1, firing the reward effects.
    expect(h.stage).toBeGreaterThanOrEqual(1);

    // Chain stage-1 grants 90 TC + Aetheric Shard / Cloth / Compass.
    // We assert TC went up by AT LEAST the 90 (other systems —
    // skill-check rewards, novelty-tile training — can add more).
    const afterTc = store.getState().player!.tc;
    expect(afterTc - beforeTc).toBeGreaterThanOrEqual(90);
    const afterInvNames = store.getState().player!.inventory.map((i) => i.name);
    expect(afterInvNames).toEqual(expect.arrayContaining(['Aetheric Shard', 'Aetheric Cloth', 'Aetheric Compass']));
    // And the previously-missing items are new (not pre-existing).
    expect(beforeInvNames).not.toContain('Aetheric Compass');
  });

  it('wrong direction resets progress and surfaces the reset narration', async () => {
    const store = await bootWithHook(vaultHook());
    store.getState().submitPlayerAction('rotate the ring left'); // correct
    store.getState().submitPlayerAction('rotate the ring left'); // wrong (expected right)
    const h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_vault')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(0);
    expect(h.puzzleProgress?.failures).toBe(1);

    const logText = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logText).toMatch(/springs lift the tumbler|puzzle has reset/i);
  });

  it('after puzzle solve, ONE MORE tap fires the stage-1 chain reward (workaround for Bug #1)', async () => {
    // Confirms the stage advance is wired, even though solve doesn't
    // fire the reward inline. After 3 correct rotations + 1 follow-up
    // tap, TC + items should land.
    const store = await bootWithHook(vaultHook());
    const beforeTc = store.getState().player!.tc;
    store.getState().submitPlayerAction('rotate the ring left');
    store.getState().submitPlayerAction('rotate the ring right');
    store.getState().submitPlayerAction('rotate the ring right'); // solves
    // One more tap on a hook noun to fire stage-1 effects.
    store.getState().submitPlayerAction('investigate the vault');
    const afterTc = store.getState().player!.tc;
    expect(afterTc - beforeTc).toBeGreaterThanOrEqual(90);
    const inv = store.getState().player!.inventory.map((i) => i.name);
    expect(inv).toEqual(expect.arrayContaining(['Aetheric Shard', 'Aetheric Cloth', 'Aetheric Compass']));
  });

  it('OTA-130 direction-only fallback — "rotate left" with no noun routes to the single active puzzle', async () => {
    const store = await bootWithHook(vaultHook());
    store.getState().submitPlayerAction('rotate left');
    const h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_vault')!;
    // findActivePuzzleHookForIntent should pick the lone vault hook,
    // resolver should advance correctSoFar to 1.
    expect(h.puzzleProgress?.correctSoFar).toBe(1);
  });

  it('OTA-130 examine-peek — investigate ring after a step surfaces state summary', async () => {
    const store = await bootWithHook(vaultHook());
    store.getState().submitPlayerAction('rotate the ring left');
    const logBefore = store.getState().gameLog.length;
    store.getState().submitPlayerAction('examine the ring');
    const newLines = store.getState().gameLog.slice(logBefore).map((e) => e.text).join('\n');
    expect(newLines).toMatch(/1 of 3 steps held|2 more to go/i);
  });
});

describe('OTA-131 E2E — submerged_steeple full pipeline', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // OTA-131 BUG #1 (submerged_steeple variant), OTA-132 fix. Same
  // root cause as the vault-door variant above, same fix —
  // resolveHookOneStep now receives hook with stage advanced by +1
  // so the stage-1 reward chain fires inline.
  it('three knocks in a row solves and fires chain reward', async () => {
    const store = await bootWithHook(steepleHook());
    const beforeTc = store.getState().player!.tc;
    const beforeInvNames = store.getState().player!.inventory.map((i) => i.name);

    store.getState().submitPlayerAction('knock on the steeple');
    let h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_steeple')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(1);
    expect(h.stage).toBe(0);

    store.getState().submitPlayerAction('knock steeple');
    h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_steeple')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(2);

    store.getState().submitPlayerAction('knock on the steeple');
    h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_steeple')!;
    expect(h.stage).toBeGreaterThanOrEqual(1);

    // Stage-1 effects: 60 TC + Golem Core + 4 damage. We assert
    // TC grew by AT LEAST the chain grant (skill-check rewards,
    // tile-novelty, etc. can add more) and that the named item landed.
    expect(store.getState().player!.tc - beforeTc).toBeGreaterThanOrEqual(60);
    const afterInv = store.getState().player!.inventory.map((i) => i.name);
    expect(afterInv).toEqual(expect.arrayContaining(['Golem Core']));
    expect(beforeInvNames).not.toContain('Golem Core');
  });

  it('non-knock intent (push) resets the rhythm', async () => {
    const store = await bootWithHook(steepleHook());
    store.getState().submitPlayerAction('knock on the steeple');
    let h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_steeple')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(1);
    store.getState().submitPlayerAction('push the steeple');
    h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_steeple')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(0);
    expect(h.puzzleProgress?.failures).toBe(1);
  });

  it('OTA-130 direction-only fallback — bare "knock" routes to active steeple', async () => {
    const store = await bootWithHook(steepleHook());
    store.getState().submitPlayerAction('knock');
    const h = store.getState().currentScene!.hooks.find((x) => x.id === 'e2e_steeple')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(1);
  });
});

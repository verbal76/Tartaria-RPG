// Phase 11 — focused regression for the two new CanonicalActionExecutor
// combat-movement methods (combatAdvance/combatRetreat). Same pattern as
// the existing policy.ts unit tests: no boot, no real store — a minimal
// fake store/walker satisfying only the surface CanonicalActionExecutor
// actually reads (getState().player/currentScene/worldMemory/
// submitPlayerAction, and the walker's drainRolls()). Proves the two new
// methods reach the exact production door a real player's "advance"/
// "retreat" command reaches — submitPlayerAction with that literal verb —
// and nothing else: no direct range/state field is ever written by the
// executor itself.

// actionExecutor.ts value-imports playerView.ts, which value-imports
// combatResolution.ts (Phase 11's enemyBandOf/playerWeaponReach), which
// pulls in the full production module graph down to saveSystem.ts's native
// AsyncStorage. Same boilerplate every other test file that value-imports
// this chain already carries (see canonicalBoundedActionLoop.test.ts) —
// nothing here is store/telemetry setup, only native-module stand-ins so
// the import graph resolves under plain Jest.
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

import { CanonicalActionExecutor } from '../test-utils/canonical/actionExecutor';
import type { Decision } from '../test-utils/canonical/policy';
import type { GameStore } from '../app/state/gameStore';
import type { CanonicalWalker } from '../test-utils/canonical/CanonicalWalker';

function makeDecision(optionId: string, category: Decision['category']): Decision {
  return { optionId, category, reason: 'test' };
}

function makeFakeStore(submitPlayerAction: jest.Mock) {
  const state = {
    player: null,
    currentScene: null,
    worldMemory: {},
    // perform() syncs the log mirror off this after every action — the
    // same telemetry read every pre-existing combat method already
    // triggers (getLogMirror/syncLogMirror), not a new surface.
    gameLog: [],
    submitPlayerAction,
  } as unknown as GameStore;
  return { getState: () => state };
}

function makeFakeWalker(drainRolls: jest.Mock) {
  return { drainRolls } as unknown as CanonicalWalker;
}

describe('CanonicalActionExecutor — combat movement (Phase 11)', () => {
  it('combatAdvance reaches submitPlayerAction with the literal "advance" verb — the same production door a real player types', async () => {
    const submitPlayerAction = jest.fn().mockResolvedValue(undefined);
    const drainRolls = jest.fn();
    const executor = new CanonicalActionExecutor(makeFakeStore(submitPlayerAction), makeFakeWalker(drainRolls));
    const record = await executor.combatAdvance(makeDecision('advance', 'engage-approach'));
    expect(submitPlayerAction).toHaveBeenCalledWith('advance');
    expect(submitPlayerAction).toHaveBeenCalledTimes(1);
    expect(record.result).toBe('ok');
    expect(record.uiActionRepresented).toBe('advance');
  });

  it('combatRetreat reaches submitPlayerAction with the literal "retreat" verb, distinct from combatFlee\'s "flee"', async () => {
    const submitPlayerAction = jest.fn().mockResolvedValue(undefined);
    const drainRolls = jest.fn();
    const executor = new CanonicalActionExecutor(makeFakeStore(submitPlayerAction), makeFakeWalker(drainRolls));
    const record = await executor.combatRetreat(makeDecision('retreat', 'survive-retreat'));
    expect(submitPlayerAction).toHaveBeenCalledWith('retreat');
    expect(submitPlayerAction).not.toHaveBeenCalledWith('flee');
    expect(record.uiActionRepresented).toBe('retreat');
  });

  it('both new methods drain the production dice queue exactly like the four pre-existing combat methods do', async () => {
    const submitPlayerAction = jest.fn().mockResolvedValue(undefined);
    const drainRolls = jest.fn();
    const executor = new CanonicalActionExecutor(makeFakeStore(submitPlayerAction), makeFakeWalker(drainRolls));
    await executor.combatAdvance(makeDecision('advance', 'engage-approach'));
    await executor.combatRetreat(makeDecision('retreat', 'survive-retreat'));
    expect(drainRolls).toHaveBeenCalledTimes(2);
  });

  it('a rejected submitPlayerAction is recorded as \'error\', never silently swallowed', async () => {
    const submitPlayerAction = jest.fn().mockRejectedValue(new Error('boom'));
    const drainRolls = jest.fn();
    const executor = new CanonicalActionExecutor(makeFakeStore(submitPlayerAction), makeFakeWalker(drainRolls));
    const record = await executor.combatAdvance(makeDecision('advance', 'engage-approach'));
    expect(record.result).toBe('error');
  });

  it('the executor calls no store method other than getState()/submitPlayerAction() — no direct range or state mutation exists on this path', async () => {
    const submitPlayerAction = jest.fn().mockResolvedValue(undefined);
    const drainRolls = jest.fn();
    const state = {
      player: null,
      currentScene: null,
      worldMemory: {},
      gameLog: [],
      submitPlayerAction,
    };
    // A Proxy that throws on any property read/write this test did not
    // explicitly allow for (player/currentScene/worldMemory/gameLog/
    // submitPlayerAction — the same telemetry-sanctioned surface every
    // pre-existing combat method already reads) — proves the executor's
    // ADVANCE/RETREAT paths touch nothing else on the store: no range
    // field, no direct HP/position write, nothing beyond what perform()'s
    // own documented contract already reads for every combat action.
    const guardedState = new Proxy(state, {
      get(target, prop, receiver) {
        if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        throw new Error(`unexpected store property read: ${String(prop)}`);
      },
      set() {
        throw new Error('unexpected store property write — executor must never mutate the store directly');
      },
    });
    const store = { getState: () => guardedState as unknown as GameStore };
    const executor = new CanonicalActionExecutor(store, makeFakeWalker(drainRolls));
    await expect(executor.combatAdvance(makeDecision('advance', 'engage-approach'))).resolves.toBeDefined();
  });
});

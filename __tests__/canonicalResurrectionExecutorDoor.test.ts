// Phase 7 — apparatus-integrity repair qualification (owner Section 19).
//
// Proves CanonicalActionExecutor.resurrectViaGem() calls the real production
// door (gameStore.ts's resurrectSlot(slotId), slotSlice.ts:712) with the
// exact slot id argument, and marks a refusal (no gem spent) as a real
// 'error' record rather than a false 'ok'. Narrow unit test of the door's
// wiring only, same fake-store pattern as the other Phase 6/7 door tests.

// Phase 11 — actionExecutor.ts now value-imports playerView.ts, which
// value-imports combatResolution.ts (enemyBandOf/playerWeaponReach for the
// new range/reach observability), pulling in the full production module
// graph down to saveSystem.ts's native AsyncStorage. Same boilerplate every
// other value-importer of this chain already carries (see
// canonicalBoundedActionLoop.test.ts) — not store/telemetry setup, only
// native-module stand-ins so the import graph resolves under plain Jest.
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
import { resetDecisionJournal } from '../test-utils/canonical/decisionJournal';
import type { GameStore } from '../app/state/gameStore';

function makeFakeStore(resurrectSlot: jest.Mock) {
  const state = {
    player: null as unknown as GameStore['player'],
    currentScene: null as unknown as GameStore['currentScene'],
    worldMemory: undefined as unknown as GameStore['worldMemory'],
    resurrectSlot,
    gameLog: [] as unknown as GameStore['gameLog'],
  };
  return { getState: () => state as unknown as GameStore };
}

describe('CanonicalActionExecutor.resurrectViaGem — Phase 7 apparatus repair', () => {
  beforeEach(() => {
    resetDecisionJournal();
  });

  it('calls the real production door with the exact slotId argument on success', async () => {
    const resurrectSlot = jest.fn(async () => true);
    const store = makeFakeStore(resurrectSlot);
    const executor = new CanonicalActionExecutor(store, {} as never);

    const record = await executor.resurrectViaGem('slot_abc123', { optionId: 'resurrect', category: 'critical-path', reason: 'test' });

    expect(record.result).toBe('ok');
    expect(record.productionDoor).toBe('resurrectSlot(slotId)');
    expect(resurrectSlot).toHaveBeenCalledTimes(1);
    expect(resurrectSlot).toHaveBeenCalledWith('slot_abc123');
  });

  it('marks a refusal (no gem spent) as an error record, never a false ok', async () => {
    const resurrectSlot = jest.fn(async () => false);
    const store = makeFakeStore(resurrectSlot);
    const executor = new CanonicalActionExecutor(store, {} as never);

    const record = await executor.resurrectViaGem('slot_abc123', { optionId: 'resurrect', category: 'critical-path', reason: 'test' });

    expect(record.result).toBe('error');
  });
});

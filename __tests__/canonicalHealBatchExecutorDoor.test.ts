// Phase 6 methodology correction — apparatus-integrity repair (Section E.4).
//
// Proves CanonicalActionExecutor.useHealBatch() (added to close I-049) calls
// the real production door (app/state/slices/inventorySlice.ts's
// useHealBatch(itemName, target, count)) with the exact arguments the real
// "✚ heals" quick-bar chip uses (InputBox.tsx:1428-1493) — never the generic
// submitPlayerAction('use <item>') path that silently no-ops mid-combat
// (OTA-1658, pendingRolls guard, gameStore.ts:12036).
//
// Narrow unit test of the door's wiring only, same fake-store pattern as
// canonicalTravelEnemyGuard.test.ts — no full boot needed, since
// useHealBatch's `run` callback touches only store.getState().useHealBatch.

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

function makeFakeStore(useHealBatch: jest.Mock) {
  const state = {
    player: null as unknown as GameStore['player'],
    currentScene: null as unknown as GameStore['currentScene'],
    worldMemory: undefined as unknown as GameStore['worldMemory'],
    useHealBatch,
    gameLog: [] as unknown as GameStore['gameLog'],
  };
  return { getState: () => state as unknown as GameStore };
}

describe('CanonicalActionExecutor.useHealBatch — I-049 apparatus repair', () => {
  beforeEach(() => {
    resetDecisionJournal();
  });

  it('calls the real production door with the exact itemName/target/count arguments', async () => {
    const useHealBatch = jest.fn();
    const store = makeFakeStore(useHealBatch);
    const executor = new CanonicalActionExecutor(store, {} as never);

    const record = await executor.useHealBatch('Medkit', 'self', 2, { optionId: 'heal', category: 'survive-heal', reason: 'test' });

    expect(record.result).toBe('ok');
    expect(record.family).toBe('CONSUMABLES');
    expect(record.productionDoor).toBe('useHealBatch(itemName, target, count)');
    expect(useHealBatch).toHaveBeenCalledTimes(1);
    expect(useHealBatch).toHaveBeenCalledWith('Medkit', 'self', 2);
  });

  it('supports the dog/golem targets the real quick-bar chip also offers', async () => {
    const useHealBatch = jest.fn();
    const store = makeFakeStore(useHealBatch);
    const executor = new CanonicalActionExecutor(store, {} as never);

    await executor.useHealBatch('Vet Kit', 'dog', 1, { optionId: 'heal', category: 'companion', reason: 'test' });
    await executor.useHealBatch('Repair Kit', 'golem', 1, { optionId: 'heal', category: 'companion', reason: 'test' });

    expect(useHealBatch).toHaveBeenNthCalledWith(1, 'Vet Kit', 'dog', 1);
    expect(useHealBatch).toHaveBeenNthCalledWith(2, 'Repair Kit', 'golem', 1);
  });
});

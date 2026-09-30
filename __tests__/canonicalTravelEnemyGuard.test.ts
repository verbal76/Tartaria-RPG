// Phase 6 methodology correction — apparatus-integrity repair (Section E.1).
//
// Proves the executor-level guard added to CanonicalActionExecutor.travelContinue()
// (test-utils/canonical/actionExecutor.ts) refuses the call under the exact
// condition where no player-facing surface could reach continueTravel() in
// production — live enemies present in currentScene (RCH-002 / I-012).
//
// This is a narrow unit test of the guard's logic only, using a minimal fake
// store/walker rather than a full boot — the guard reads only
// `store.getState().currentScene.enemies` and, when clear, calls
// `store.getState().continueTravel()`. Nothing else in CanonicalActionExecutor's
// constructor dependencies is exercised by this path.

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

function makeFakeStore(enemyCount: number, continueTravel: jest.Mock) {
  // player: null is deliberate — buildPlayerView() short-circuits to null
  // immediately when there is no player (playerView.ts:179), so this
  // exercises the guard's own logic without needing a full, realistic
  // PlayerCharacter fixture (stats/equipment/etc.) that a narrow unit test
  // of travelContinue()'s enemy check has no need to construct.
  const state = {
    player: null as unknown as GameStore['player'],
    currentScene: enemyCount > 0 ? ({ enemies: new Array(enemyCount).fill({}) } as unknown as GameStore['currentScene']) : null,
    worldMemory: undefined as unknown as GameStore['worldMemory'],
    continueTravel,
    gameLog: [] as unknown as GameStore['gameLog'],
  };
  return { getState: () => state as unknown as GameStore };
}

describe('CanonicalActionExecutor.travelContinue — enemy-presence guard (I-012 apparatus repair)', () => {
  beforeEach(() => {
    resetDecisionJournal();
  });

  it('refuses (result: error) when live enemies are present, and never calls continueTravel()', async () => {
    const continueTravel = jest.fn();
    const store = makeFakeStore(2, continueTravel);
    const executor = new CanonicalActionExecutor(store, {} as never);

    const record = await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'test' });

    expect(record.result).toBe('error');
    expect(continueTravel).not.toHaveBeenCalled();
  });

  it('proceeds normally (result: ok) when no enemies are present', async () => {
    const continueTravel = jest.fn();
    const store = makeFakeStore(0, continueTravel);
    const executor = new CanonicalActionExecutor(store, {} as never);

    const record = await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'test' });

    expect(record.result).toBe('ok');
    expect(continueTravel).toHaveBeenCalledTimes(1);
  });

  it('also refuses via the encounterAvoidByContinuing alias (it delegates to travelContinue)', async () => {
    const continueTravel = jest.fn();
    const store = makeFakeStore(1, continueTravel);
    const executor = new CanonicalActionExecutor(store, {} as never);

    const record = await executor.encounterAvoidByContinuing({ optionId: 'continue', category: 'journey', reason: 'test' });

    expect(record.result).toBe('error');
    expect(continueTravel).not.toHaveBeenCalled();
  });
});

// arb-fix (OTA-800) — dismissing the Fusing Crucible chip with its X must SURVIVE a
// vendor round-trip. App.tsx renders exploration vs vendor by a flag, so entering the
// vendor UNMOUNTS ExplorationScreen and the old local useState dismiss was lost — the
// chip popped back on return (player report). The dismiss now lives in the STORE, keyed
// to the view-key, so it persists across the unmount but still re-shows on a real move.

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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

// The chip's visibility rule in ExplorationScreen: dismissed only while the stored key
// equals the current view-key.
const isDismissed = (storedKey: string | null, viewKey: string) => !!storedKey && storedKey === viewKey;

describe('OTA-800 — crucible chip dismiss survives a vendor round-trip', () => {
  it('the stored dismiss key persists across setScreen vendor→exploration', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Fuser', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();

    const viewKey = 'outpost|||';           // the exploration view where the chip was showing
    // Player taps the chip's X.
    store.getState().setCrucibleChipDismissedKey(viewKey);
    expect(isDismissed(store.getState().crucibleChipDismissedKey, viewKey)).toBe(true);

    // Enter the vendor (unmounts exploration) and come back.
    store.getState().setScreen('vendor');
    store.getState().setScreen('exploration');

    // The dismiss survived — the chip stays hidden at the same view.
    expect(store.getState().crucibleChipDismissedKey).toBe(viewKey);
    expect(isDismissed(store.getState().crucibleChipDismissedKey, viewKey)).toBe(true);
  });

  it('a real move to a different location re-shows the chip (key mismatch)', () => {
    const store = useGameStore;
    store.getState().setCrucibleChipDismissedKey('outpost|||');
    // Now standing on a different tile → different view-key → not dismissed.
    expect(isDismissed(store.getState().crucibleChipDismissedKey, 'wastes|||')).toBe(false);
  });

  it('clearing the key un-dismisses', () => {
    const store = useGameStore;
    store.getState().setCrucibleChipDismissedKey('outpost|||');
    store.getState().setCrucibleChipDismissedKey(null);
    expect(isDismissed(store.getState().crucibleChipDismissedKey, 'outpost|||')).toBe(false);
  });
});

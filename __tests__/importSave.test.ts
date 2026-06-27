// Save export → import round-trip: a COPY SAVE blob from one character loads as a
// new playable slot (the Tartaria-save-into-Golem path).

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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { buildSaveSnapshot, stampSaveExport } from '../app/diagnostics/saveSnapshot';

describe('importSaveFromText (Tartaria save → Golem slot)', () => {
  it('round-trips a COPY SAVE export into a playable slot', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    // Character A — the "Tartaria" save to export.
    await store.getState().startNewGame({ name: 'Verbal', raceId: 'mud_golem', factionId: 'eternal_dynasty' });
    store.getState().skipTutorial?.();
    const a = store.getState();
    const exportText = stampSaveExport(buildSaveSnapshot(a.player, a.worldMemory), 'device-summary', a.player?.name);

    // Switch to a DIFFERENT character so we can prove the import replaces it.
    await store.getState().startNewGame({ name: 'Someone Else', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    expect(store.getState().player?.name).toBe('Someone Else');

    // Import the exported save (full stamped text, with === markers + preamble).
    const res = await store.getState().importSaveFromText(exportText);
    expect(res.ok).toBe(true);
    expect(res.name).toBe('Verbal');
    expect(store.getState().player?.name).toBe('Verbal');
    expect(store.getState().player?.raceId).toBe('mud_golem');
    expect(store.getState().player?.factionId).toBe('eternal_dynasty');
    // It's loaded into the active screen + has a slot.
    expect(store.getState().activeSlotId).toBeTruthy();
  });

  it('accepts the bare JSON too (no === markers)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Bare', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    const s = store.getState();
    const bareJson = JSON.stringify({ player: s.player, worldMemory: s.worldMemory });
    const res = await store.getState().importSaveFromText(bareJson);
    expect(res.ok).toBe(true);
    expect(res.name).toBe('Bare');
  });

  it('rejects garbage cleanly without throwing', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const res = await store.getState().importSaveFromText('not a save at all');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

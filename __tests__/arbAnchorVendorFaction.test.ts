// arb-fix — the shared armory anchor vendor "Irma Ironhand" is re-skinned into
// EVERY faction's outpost (hub rooms are re-skinned by player.factionId), but her
// vendor template hard-codes faction 'true_tartarians'. When she spawns as the
// home-hub armory anchor, the scene now re-points her faction to the HOST faction
// (player.factionId) so pricing, buy-rep, theft, and kill-standing all attribute
// to the faction whose outpost it actually is. Regression: a Stone Builders
// character's Irma must read stone_builders, not true_tartarians.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';

describe('arb-fix — anchor vendor faction follows the host outpost', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it("Irma spawns tagged with the player's faction, not her hard-coded true_tartarians", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Builder', raceId: 'tartarian_giant', factionId: 'stone_builders' });
    store.getState().skipTutorial?.();

    // Force the player into the armory anchor room and re-roll the scene until a
    // peaceful scene lands Irma in the vendor slot (combat scenes carry no vendor).
    let irmaFaction: string | null | undefined = undefined;
    let sawIrma = false;
    for (let i = 0; i < 60; i++) {
      useGameStore.setState((s) => ({ player: s.player ? { ...s.player, hubRoomId: 'outpost_armory' } : s.player }));
      await store.getState().beginScene?.();
      const v = store.getState().currentScene?.vendor;
      if (v?.name === 'Irma Ironhand') { sawIrma = true; irmaFaction = v.faction; break; }
    }
    expect(sawIrma).toBe(true);
    expect(irmaFaction).toBe('stone_builders');
  });
});

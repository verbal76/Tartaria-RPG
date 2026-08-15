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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-978 — #120: healing, LIGHT. Root cause: heal numbers were flat in a game
// where max HP scales, and rest only restored stamina. Now a full sleep knits
// ~15% of max HP, kit-grade consumables heal 15%-of-max-or-their-flat, snacks
// 4%-or-flat — floors keep the early game identical, and the owner's "lighter
// side" call keeps supply pressure real.
import { scaledHealHP } from '../app/engine/itemEffect';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

describe('OTA-978 — light healing', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('scaledHealHP: floors protect the early game, percents carry the late game', () => {
    expect(scaledHealHP(25, 40)).toBe(25);   // early: flat kit wins
    expect(scaledHealHP(25, 133)).toBe(25);  // 15% of 133 = 20 — flat still wins
    expect(scaledHealHP(25, 200)).toBe(30);  // late: 15% takes over
    expect(scaledHealHP(6, 133)).toBe(6);    // ration floor
    expect(scaledHealHP(6, 200)).toBe(8);    // 4% of 200
    expect(scaledHealHP(0, 200)).toBe(0);
  });

  it('a full sleep heals ~15% of max HP and still refuses only when truly whole', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Sleeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const p0 = store.getState().player!;
    store.setState((s) => ({ player: { ...s.player!, hp: 10, hpMax: 133, stamina: 2 } }));
    store.getState().submitPlayerAction('rest');
    await new Promise((r) => setTimeout(r, 25));
    const p1 = store.getState().player!;
    expect(p1.hp).toBeGreaterThanOrEqual(10 + Math.floor(133 * 0.10)); // healed a real share
    expect(p1.hp).toBeLessThanOrEqual(10 + Math.ceil(133 * 0.15) + 5); // but LIGHT
    // wounded with FULL stamina must still be allowed to sleep now
    store.setState((s) => ({ player: { ...s.player!, hp: 50, stamina: s.player!.staminaMax, corruption: 0 } }));
    const before = store.getState().player!.hp;
    store.getState().submitPlayerAction('rest');
    await new Promise((r) => setTimeout(r, 25));
    expect(store.getState().player!.hp).toBeGreaterThan(before);
    void p0;
  });
});

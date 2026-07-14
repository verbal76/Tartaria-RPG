// OTA-1089 — buying builds faction standing only as a SLOW GRIND (per the user):
// standing accrues by TC of honest custom (+1 per 500 TC, remainder carried in
// buyRepProgress), replacing the old flat +1 per purchase. Cheap-junk spam can't
// farm it; the mission/sigil paths still dwarf it.

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

import { useGameStore } from '../app/state/gameStore';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Buyer', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

function setVendor(store: ReturnType<typeof useGameStore>, price: number, stock = 999) {
  store.setState((s) => ({
    currentScene: {
      ...s.currentScene!,
      enemies: [],
      vendor: { name: 'Halem', faction: 'reclaimers_guild', offers: [{ itemName: 'Small Rock', price, quantity: stock }] } as any,
    },
    player: { ...s.player!, tc: 100000 },
  }));
}
const standingOf = (store: ReturnType<typeof useGameStore>) =>
  store.getState().player!.factionStanding.find((r) => r.factionId === 'reclaimers_guild')?.standing ?? 0;

describe('OTA-1089 — buy-rep is a slow TC-spent grind', () => {
  it('one cheap purchase grants NO standing yet (below the 500-TC threshold) but banks progress', async () => {
    const store = await boot();
    setVendor(store, 2); // a 2 TC junk buy
    const before = standingOf(store);
    store.getState().buyFromVendor('Small Rock', 1);
    expect(standingOf(store)).toBe(before);                    // no instant +1 (old behavior gone)
    expect(store.getState().player!.buyRepProgress ?? 0).toBe(2); // ...but the coin is banked
  });

  it('spending ~500 TC banks +1 standing, carrying the remainder', async () => {
    const store = await boot();
    setVendor(store, 260);
    const before = standingOf(store);
    store.getState().buyFromVendor('Small Rock', 1); // 260 → pool 260, no grant
    expect(standingOf(store)).toBe(before);
    store.getState().buyFromVendor('Small Rock', 1); // +260 → pool 520 → +1, remainder 20
    expect(standingOf(store)).toBe(before + 1);
    expect(store.getState().player!.buyRepProgress ?? 0).toBe(20);
  });

  it('cheap-junk spam cannot fast-grind standing', async () => {
    const store = await boot();
    setVendor(store, 2);
    const before = standingOf(store);
    for (let i = 0; i < 50; i++) store.getState().buyFromVendor('Small Rock', 1); // 50 × 2 = 100 TC
    // 100 TC of junk is nowhere near the 500-TC/+1 threshold.
    expect(standingOf(store)).toBe(before);
  });
});

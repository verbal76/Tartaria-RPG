// OTA 059 — Verifies CHA-training wire-ins on the four tap-driven
// social paths: buyFromVendor, sellToVendor, giftToVendor, and the
// contract-accept paths. Diplomacy (the typed-verb intent) already
// trains CHA via the OTA 058 skill-check path; this OTA covers the
// quiet majority of players who tap buttons instead of typing
// social verbs.

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

async function setupVendor() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Talker', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      vendor: {
        id: 'cha_test_vendor',
        name: 'Test Merchant',
        faction: 'reclaimers_guild',
        offers: [{ itemName: 'Rusted Blade', price: 8 }],
        greeting: '"Wares."',
      } as any,
    },
    player: { ...p0, tc: 1000, corruption: 0 },
  });
  return store;
}

describe('OTA 059 — CHA training on tap-driven social paths', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('successful BUY trains CHA', async () => {
    const store = await setupVendor();
    const before = store.getState().player!.statProgress?.charisma ?? 0;
    store.getState().buyFromVendor('Rusted Blade');
    const after = store.getState().player!.statProgress?.charisma ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  it('failed BUY (insufficient TC) does NOT train CHA', async () => {
    const store = await setupVendor();
    const p = store.getState().player!;
    store.setState({ player: { ...p, tc: 1 } }); // can't afford
    const before = store.getState().player!.statProgress?.charisma ?? 0;
    store.getState().buyFromVendor('Rusted Blade');
    const after = store.getState().player!.statProgress?.charisma ?? 0;
    expect(after).toBe(before);
  });

  it('successful SELL trains CHA', async () => {
    const store = await setupVendor();
    const p = store.getState().player!;
    // Need a sellable item not equipped. Aether Crystal is generic.
    store.setState({
      player: {
        ...p,
        inventory: [
          ...p.inventory,
          { id: 'xtal_sell', name: 'Aether Crystal', kind: 'misc', quantity: 1, tags: ['aether', 'crystal'] },
        ],
      },
    });
    const before = store.getState().player!.statProgress?.charisma ?? 0;
    store.getState().sellToVendor('Aether Crystal');
    const after = store.getState().player!.statProgress?.charisma ?? 0;
    expect(after).toBeGreaterThan(before);
  });

  // OTA-1088 — gifting was removed (faction standing is earned via missions +
  // sigil turn-ins, not by handing vendors loot), so there's no gift CHA path.

  it('accumulated social actions push toward a level-up', async () => {
    // Player at CHA 10 with progress 96 — one more successful BUY
    // awards +2 (tier-1 rate at stat ≤ 10) → progress hits 98, no
    // level-up yet. A second BUY → 100, levels up.
    const store = await setupVendor();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        stats: { ...p.stats, charisma: 10 },
        statProgress: { ...(p.statProgress ?? {}), charisma: 96 },
      },
      currentScene: {
        ...store.getState().currentScene!,
        vendor: {
          ...(store.getState().currentScene!.vendor as any),
          offers: [
            { itemName: 'Rusted Blade', price: 8 },
            { itemName: 'Climbing Rope', price: 6 },
          ],
        } as any,
      },
    });

    store.getState().buyFromVendor('Rusted Blade');
    // Progress should be 98 after first buy. Still CHA 10.
    expect(store.getState().player!.statProgress?.charisma).toBe(98);
    expect(store.getState().player!.stats.charisma).toBe(10);

    store.getState().buyFromVendor('Climbing Rope');
    // 98 + 2 = 100 → level-up; progress resets to 0, CHA → 11.
    expect(store.getState().player!.stats.charisma).toBe(11);
    expect(store.getState().player!.statProgress?.charisma).toBe(0);

    // The level-up log line should be present.
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/\+1 CHA \(now 11\)/);
  });
});

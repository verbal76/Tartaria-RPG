// OTA-431 — vendor repair targets the right copy when several share a name.
// With per-instance durability (OTA-427) a player can carry several same-named
// pieces at different wear. The old repairWithVendor used `.find` (first damaged
// match), so "repair iron axe" could top off a near-full spare while leaving the
// battered EQUIPPED axe untouched — and still charge for it. Resolution order is
// now: equipped instance first, then the most-damaged copy.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

function axe(id: string, current: number): InventoryItem {
  return {
    id, name: 'Iron Axe', kind: 'weapon', rarity: 'Common', quantity: 1, tags: [],
    durability: { current, max: 50 },
  };
}

describe('OTA-431 — vendor repair picks the equipped / most-damaged copy', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('repairs the battered EQUIPPED axe, not the near-full spare', async () => {
    const store = await boot('Smith');
    const equipped = axe('axe-equipped', 5);   // worn down, in hand
    const spare = axe('axe-spare', 48);        // nearly full, in pack
    useGameStore.setState((s) => ({
      player: {
        ...s.player!,
        tc: 999,
        inventory: [...s.player!.inventory, spare, equipped],
        equipped: { ...(s.player!.equipped ?? {}), main: 'Iron Axe', mainId: 'axe-equipped' },
      },
      currentScene: { ...s.currentScene!, vendor: { name: 'Brann the Smith' } as never },
    }));

    store.getState().repairWithVendor('iron axe');

    const inv = store.getState().player!.inventory;
    const eq = inv.find((i) => i.id === 'axe-equipped')!;
    const sp = inv.find((i) => i.id === 'axe-spare')!;
    expect(eq.durability!.current).toBe(50); // equipped one mended
    expect(sp.durability!.current).toBe(48); // spare untouched
  });

  it('with nothing equipped, repairs the MOST-damaged copy', async () => {
    const store = await boot('Smith2');
    const worse = axe('axe-worse', 3);
    const better = axe('axe-better', 40);
    useGameStore.setState((s) => ({
      player: {
        ...s.player!,
        tc: 999,
        inventory: [...s.player!.inventory, better, worse],
        equipped: { ...(s.player!.equipped ?? {}), main: undefined, mainId: undefined },
      },
      currentScene: { ...s.currentScene!, vendor: { name: 'Brann the Smith' } as never },
    }));

    store.getState().repairWithVendor('iron axe');

    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.id === 'axe-worse')!.durability!.current).toBe(50);
    expect(inv.find((i) => i.id === 'axe-better')!.durability!.current).toBe(40);
  });
});

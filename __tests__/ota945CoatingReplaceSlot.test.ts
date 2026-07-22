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

// OTA-922 — a coat that lands on a FULL item replaces the CHOSEN slot/resist, not blindly slot 1.
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

describe('OTA-922 — coating-slot / resist replace targeting', () => {
  it('WEAPON: replacing slot 2 keeps slot 1 and overwrites only slot 2', async () => {
    const store = await boot('CoatReplWeap');
    const weaponId = 'ota945_weap';
    const acidId = 'ota945_acid';
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          ...s.player!.inventory.filter((i) => i.id !== weaponId && i.id !== acidId),
          {
            id: weaponId, name: 'Rusted Blade', kind: 'weapon', quantity: 1, coatingSlots: 2,
            coating: { kind: 'electrical', dice: '1d4', label: 'Charged' },
            coating2: { kind: 'poison', dice: '1d4', label: 'Poisoned' },
          } as unknown as InventoryItem,
          { id: acidId, name: 'Acid Flask', kind: 'consumable', quantity: 1, tags: ['weapon_coating', 'acid'] } as unknown as InventoryItem,
        ],
      },
    }));

    store.getState().applyCoating(acidId, weaponId, 'coating2');

    const w = store.getState().player!.inventory.find((i) => i.id === weaponId)! as unknown as {
      coating?: { kind?: string }; coating2?: { kind?: string };
    };
    expect(w.coating?.kind).toBe('electrical');
    expect(w.coating2?.kind).toBe('acid');
  });

  it('ARMOR: replacing a picked resist strips only that one and adds the new type', async () => {
    const store = await boot('CoatReplArmor');
    const armorId = 'ota945_armor';
    const tonicId = 'ota945_tonic';
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          ...s.player!.inventory.filter((i) => i.id !== armorId && i.id !== tonicId),
          { id: armorId, name: 'Patched Vest', kind: 'armor', quantity: 1, addedResists: ['poison', 'acid', 'burn'] } as unknown as InventoryItem,
          { id: tonicId, name: 'Corruption Tonic', kind: 'consumable', quantity: 1, tags: ['weapon_coating', 'corruption'] } as unknown as InventoryItem,
        ],
      },
    }));

    store.getState().applyCoatingToArmor(tonicId, armorId, 'poison');

    const a = store.getState().player!.inventory.find((i) => i.id === armorId)! as unknown as { addedResists?: string[] };
    const resists = (a.addedResists ?? []).map((r) => r.toLowerCase());
    expect(resists).not.toContain('poison');
    expect(resists).toContain('corruption');
    expect(resists).toContain('acid');
    expect(resists).toContain('burn');
    expect(resists.length).toBe(3);
  });
});

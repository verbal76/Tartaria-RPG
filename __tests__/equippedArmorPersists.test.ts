// Footwear (and the OTA-486 cloak/gloves) must survive a cold save→reload. The
// backfillPlayer equipped-rebuild spreads `...eq` first and lists feet/feetId, so
// every worn slot persists; this is the regression guard.

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
import type { InventoryItem } from '../app/engine/types';

const armor = (name: string, slot: string): InventoryItem =>
  ({ id: `${slot}-inst`, name, kind: 'armor', rarity: 'Common', quantity: 1, tags: ['armor', slot] } as InventoryItem);

describe('equipped armor slots survive a cold save→reload', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('feet (+ cloak, hands, head, legs, chest) all persist', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Booted', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const slotId = store.getState().activeSlotId!;

    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        inventory: [
          armor("Wanderer's Footwraps", 'feet'),
          armor("Salvager's Trench Coat", 'cloak'),
          armor('Golem Leather Gloves', 'hands'),
          armor("Explorer's Worn Headgear", 'head'),
          armor('Salvager\'s Worn Greaves', 'legs'),
          armor('Wanderer\'s Armor of Wisdom', 'chest'),
        ],
        equipped: {
          ...p0.equipped,
          feet: "Wanderer's Footwraps", feetId: 'feet-inst',
          cloak: "Salvager's Trench Coat", cloakId: 'cloak-inst',
          hands: 'Golem Leather Gloves', handsId: 'hands-inst',
          head: "Explorer's Worn Headgear", headId: 'head-inst',
          legs: 'Salvager\'s Worn Greaves', legsId: 'legs-inst',
          chest: 'Wanderer\'s Armor of Wisdom', chestId: 'chest-inst',
        },
      },
    });
    await store.getState().persist();
    await store.getState().loadSlotIntoGame(slotId);

    const eq = store.getState().player!.equipped!;
    // The footwear specifically.
    expect(eq.feet).toBe("Wanderer's Footwraps");
    expect(eq.feetId).toBe('feet-inst');
    // …and the slots that historically fell off (OTA-486) plus the rest.
    expect(eq.cloak).toBe("Salvager's Trench Coat");
    expect(eq.cloakId).toBe('cloak-inst');
    expect(eq.hands).toBe('Golem Leather Gloves');
    expect(eq.handsId).toBe('hands-inst');
    expect(eq.head).toBe("Explorer's Worn Headgear");
    expect(eq.legs).toBe('Salvager\'s Worn Greaves');
    expect(eq.chest).toBe('Wanderer\'s Armor of Wisdom');
  });
});

// OTA-683 — after a Crucible forge, the "Your forging has formed" popup's
// "View in inventory" button dropped the player onto the pack with every section
// COLLAPSED (sections default folded), so the new piece was hidden ("it took me
// to my inventory but didn't expand the armor row and show it to me"). settleFusion
// now tags the reveal CTA with the forged item's kind (= the category section id),
// and the Inventory screen unfolds that section on arrival via pendingInventoryCategory.

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
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Smith', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

const forged = (kind: 'weapon' | 'armor'): InventoryItem =>
  ({ id: 'forged-1', name: '(forming)', kind, rarity: 'Legendary', quantity: 1, tags: ['fused', 'unique'] } as InventoryItem);

describe('fusion reveal deep-link (OTA-683)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('settleFusion tags the CTA with the forged ARMOR kind so the section can unfold', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, inventory: [...p.inventory, forged('armor')] } });

    store.getState().settleFusion('forged-1', 'Ghost-Forged Cuirass', 'A fused plate.');

    const reveal = store.getState().discoveryReveal;
    expect(reveal).toBeTruthy();
    expect(reveal!.cta?.screen).toBe('inventory');
    expect(reveal!.cta?.inventoryCategory).toBe('armor');
    // OTA-684 — also carries the instance id so the screen can scroll to + highlight it.
    expect(reveal!.cta?.inventoryItemId).toBe('forged-1');
  });

  it('a forged WEAPON tags the weapon section instead', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, inventory: [...p.inventory, forged('weapon')] } });

    store.getState().settleFusion('forged-1', 'Ghost-Charged Gouge', 'A fused blade.');

    expect(store.getState().discoveryReveal!.cta?.inventoryCategory).toBe('weapon');
  });

  it('requestInventoryCategory / clear round-trips the pending field', async () => {
    const store = await freshGame();
    expect(store.getState().pendingInventoryCategory).toBeNull();
    store.getState().requestInventoryCategory('armor');
    expect(store.getState().pendingInventoryCategory).toBe('armor');
    store.getState().clearPendingInventoryCategory();
    expect(store.getState().pendingInventoryCategory).toBeNull();
  });

  it('requestInventoryFocusItem / clear round-trips the focus-item field (OTA-684)', async () => {
    const store = await freshGame();
    expect(store.getState().pendingInventoryItemId).toBeNull();
    store.getState().requestInventoryFocusItem('forged-1');
    expect(store.getState().pendingInventoryItemId).toBe('forged-1');
    store.getState().clearPendingInventoryFocusItem();
    expect(store.getState().pendingInventoryItemId).toBeNull();
  });
});

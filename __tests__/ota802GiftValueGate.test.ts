// OTA-1087 (B1d) — gifting is value-gated + scaled. A near-worthless item is
// politely declined (no rep, no CHA, not consumed — nothing to farm); a valuable
// gift lands and grants rep scaled by its worth.

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

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Giver', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  // Put a faction vendor in the scene so gifting has a rep target.
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      vendor: { name: 'Halem', faction: 'reclaimers_guild', offers: [] } as any,
      enemies: [],
    },
  });
  return store;
}

describe('OTA-1087 (d) — gift value-gate', () => {
  it('a near-worthless item is DECLINED — not consumed, no reward', async () => {
    const store = await boot();
    const junk: InventoryItem = {
      id: 'junk', name: 'Small Rock', kind: 'misc', quantity: 3, tags: [],
    } as unknown as InventoryItem;
    store.setState((s) => ({ player: { ...s.player!, inventory: [...s.player!.inventory, junk] } }));
    store.getState().giftToVendor('Small Rock');
    const inv = store.getState().player!.inventory;
    // Still holding all 3 — nothing was consumed.
    expect(inv.find((i) => i.name === 'Small Rock')?.quantity).toBe(3);
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/worth nothing|hands it back/i);
  });

  it('a valuable gift LANDS — consumed and rep changes', async () => {
    const store = await boot();
    const gift: InventoryItem = {
      id: 'plate', name: 'Rare Plate', kind: 'armor', rarity: 'Rare', quantity: 1, tags: ['armor'],
    } as unknown as InventoryItem;
    store.setState((s) => ({ player: { ...s.player!, inventory: [...s.player!.inventory, gift] } }));
    const repBefore = store.getState().player!.factionStanding.find((r) => r.factionId === 'reclaimers_guild')?.standing ?? 0;
    store.getState().giftToVendor('Rare Plate');
    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Rare Plate')).toBe(false); // consumed
    const repAfter = store.getState().player!.factionStanding.find((r) => r.factionId === 'reclaimers_guild')?.standing ?? 0;
    expect(repAfter).toBeGreaterThan(repBefore); // rep granted
  });
});

// OTA-916 — fixes for two audit findings:
//   (1) the Aetherkin building spawn re-rolled on every entry (enter/exit is free
//       and doesn't move you) → banked per building-tile so a home rolls once.
//   (2) rapport / war-heat / relic-title sell multipliers stacked ON TOP of the
//       RARITY_BUY_FLOOR cap on unstocked items → floor now clamps LAST.

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
import { sellPriceFor, applySellCaps } from '../app/engine/sellPrice';
import type { InventoryItem } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

// ── (2) sell floor binds after every multiplier ─────────────────────────────
describe('OTA-916 — the arbitrage floor is the last word on sell price', () => {
  const tiered = (rarity: InventoryItem['rarity'], kind: InventoryItem['kind']): InventoryItem =>
    ({ id: 'x', name: 'Unstocked Thing', kind, rarity, quantity: 1 } as InventoryItem);

  it('rapport can never lift an unstocked item above its rarity buy-floor', () => {
    for (const rarity of ['Common', 'Uncommon', 'Rare', 'Legendary'] as const) {
      const item = tiered(rarity, 'relic');
      const floor = applySellCaps(item, 1_000_000); // huge input → returns the floor
      // no vendor offer → RARITY_BASE fallback path (the leak path)
      expect(sellPriceFor(item, null, 0)).toBeLessThanOrEqual(floor);
      expect(sellPriceFor(item, null, 0.20)).toBeLessThanOrEqual(floor);
      expect(sellPriceFor(item, null, 0.99)).toBeLessThanOrEqual(floor);
    }
  });

  it('rapport still helps — it lifts the price up to (not past) the floor', () => {
    const item = tiered('Legendary', 'relic');
    expect(sellPriceFor(item, null, 0.20)).toBeGreaterThanOrEqual(sellPriceFor(item, null, 0));
  });
});

// ── (1) Aetherkin building spawn banks per building-tile ─────────────────────
async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Delver', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-916 — Aetherkin building spawn rolls once per structure', () => {
  it('re-entering the same home does not re-roll the spawn (no standing/loot farm)', async () => {
    const store = await boot();
    const orig = Math.random;
    Math.random = () => 0; // force the 28% building spawn to fire when it rolls
    try {
      // First entry into a house on this tile → the roll fires and (at rng 0) spawns.
      store.getState().enterBuilding('flooded_house');
      const key = `${store.getState().player!.currentLocationId}:${store.getState().player!.mapX}:${store.getState().player!.mapY}`;
      expect(store.getState().worldMemory.aetherkinRolledBuildings).toContain(key);
      const firstEnemies = store.getState().currentScene!.enemies.length;
      expect(firstEnemies).toBe(1); // spawned on the first (only) roll

      // Leave and come back to the SAME tile — the roll is banked, so no re-spawn.
      store.getState().exitBuilding();
      store.getState().enterBuilding('flooded_house');
      expect(store.getState().currentScene!.enemies.length).toBe(0);
      // Banked exactly once for this tile — not once per entry.
      const banked = store.getState().worldMemory.aetherkinRolledBuildings ?? [];
      expect(banked.filter((k) => k === key)).toHaveLength(1);
    } finally {
      Math.random = orig;
    }
  });
});

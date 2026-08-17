// OTA-805 — Charisma-scaled vendor pricing, gated per faction by a rapport quest.
//   - pure helpers: the CHA curve, the rapport gate, the combined vendor mod
//   - store: no price break until the faction's rapport quest is completed; then
//     buys are cheaper and sell-backs richer, scaling with Charisma

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
import {
  chaPriceDiscount, hasFactionRapport, vendorPriceMod, rapportQuestId,
} from '../app/engine/factionRapport';
import { sellPriceFor, applySellCaps } from '../app/engine/sellPrice';
import type { InventoryItem } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-805 — rapport pricing helpers', () => {
  it('CHA curve: 2%/pt above 10, capped at 20%', () => {
    expect(chaPriceDiscount(10)).toBeCloseTo(0);
    expect(chaPriceDiscount(15)).toBeCloseTo(0.10);
    expect(chaPriceDiscount(20)).toBeCloseTo(0.20);
    expect(chaPriceDiscount(30)).toBeCloseTo(0.20); // capped
    expect(chaPriceDiscount(8)).toBeCloseTo(0);      // never negative
  });
  it('rapport gate keys off the faction rapport quest id', () => {
    expect(rapportQuestId('reclaimers_guild')).toBe('fq_reclaimers_guild_rapport');
    expect(hasFactionRapport(['fq_reclaimers_guild_rapport'], 'reclaimers_guild')).toBe(true);
    expect(hasFactionRapport([], 'reclaimers_guild')).toBe(false);
    expect(hasFactionRapport(['fq_reclaimers_guild_rapport'], null)).toBe(false); // neutral vendor
  });
  it('vendorPriceMod is 0 until rapport is earned, then the CHA discount', () => {
    expect(vendorPriceMod(20, [], 'reclaimers_guild')).toBe(0);
    expect(vendorPriceMod(20, ['fq_reclaimers_guild_rapport'], 'reclaimers_guild')).toBeCloseTo(0.20);
    expect(vendorPriceMod(20, ['fq_reclaimers_guild_rapport'], null)).toBe(0); // no faction
  });
  it('sellPriceFor lifts the sell price with rapport, but never past the arbitrage floor', () => {
    // OTA-916 — rapport (like war-heat / relic-title) now clamps to RARITY_BUY_FLOOR
    // LAST, so it can raise a below-floor sell but can't open buy-cheap-sell-here
    // arbitrage. A Common vest already sits AT its floor, so rapport can't lift it —
    // that's the fix, not a regression.
    const gear = { id: 'g', name: 'Iron Vest', kind: 'armor', rarity: 'Common', quantity: 1, tags: ['armor'] } as InventoryItem;
    const base = sellPriceFor(gear, null, 0);
    const bonused = sellPriceFor(gear, null, 0.20);
    const floor = applySellCaps(gear, 1_000_000); // huge input → the floor itself
    expect(bonused).toBeGreaterThanOrEqual(base); // helps, or is already capped
    expect(bonused).toBeLessThanOrEqual(floor);   // never above the arbitrage floor
  });
});

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Merchant', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}
function armVendor(store: ReturnType<typeof useGameStore>, opts: { cha: number; unlocked: boolean }) {
  store.setState((s) => ({
    currentScene: {
      ...s.currentScene!,
      enemies: [],
      vendor: { name: 'Tellin Mak', faction: 'reclaimers_guild', offers: [{ itemName: 'Torch', price: 100, quantity: 99 }] } as any,
    },
    player: {
      ...s.player!,
      tc: 100000,
      corruption: 0,
      stats: { ...s.player!.stats, charisma: opts.cha },
      completedFactionQuestIds: opts.unlocked ? ['fq_reclaimers_guild_rapport'] : [],
      // OTA-1337 — zero the ladder so this suite keeps testing the CHA/rapport
      // gate in ISOLATION. A fresh character starts Known (+10) with their own
      // guild, which now honestly knocks 5% off at that guild's counter — the
      // ladder has its own suite (ota1337StandingLadder).
      factionStanding: [],
    },
  }));
}

describe('OTA-805 — buy discount is gated + CHA-scaled', () => {
  it('no discount before rapport, ~20% off after (at CHA 20)', async () => {
    const store = await boot();
    // Locked: CHA 20 but no rapport → full price 100.
    armVendor(store, { cha: 20, unlocked: false });
    let tc = store.getState().player!.tc;
    store.getState().buyFromVendor('Torch', 1);
    expect(tc - store.getState().player!.tc).toBe(100);

    // Unlocked: CHA 20 + rapport → 20% off → 80.
    armVendor(store, { cha: 20, unlocked: true });
    tc = store.getState().player!.tc;
    store.getState().buyFromVendor('Torch', 1);
    expect(tc - store.getState().player!.tc).toBe(80);
  });
});

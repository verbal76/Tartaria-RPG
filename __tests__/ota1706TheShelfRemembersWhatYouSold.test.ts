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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1706 — THE SHELF REMEMBERS WHAT YOU SOLD, AND THE LOOT SWEEP.
 *
 * Owner, 2026-09-06, two things in one breath:
 *
 *   "add the sell all loot button with an 'are you sure' prompt"
 *
 *   "did we cover the buy back where whatever we sell to a vendor is added to
 *    their available buy inventory so we have a chance to buy it back, but of
 *    course whatever we buy back is going to be at a loss"
 *
 * MEASURED BEFORE BUILDING: we had not. `sellToVendor` never touched
 * `vendor.offers` — a grep over the whole function body returned zero — so the
 * item left the pack, the coin arrived, and the thing stopped existing. Now the
 * vendor puts it on the shelf, and the loss is the vendor's own margin rather
 * than a penalty invented for the occasion.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { buyBackAskFor } from '../app/engine/sellPrice';
import { planLootSale, isSweepableLoot } from '../app/engine/bulkSell';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

jest.setTimeout(60_000);

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const store = useGameStore;

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: `i_${Math.random().toString(36).slice(2)}`,
  name: 'Rat Fur', kind: 'material', quantity: 1, tags: ['loot'],
  ...over,
} as InventoryItem);

describe('OTA-1706 — the ask is the vendor’s own margin', () => {
  it('⚠⚠ buying back costs more than they paid, and the floor never rounds to free', () => {
    // SELL_FRACTION is 0.4, so the ask is 2.5x what the sale paid.
    expect(buyBackAskFor(40)).toBe(100);
    expect(buyBackAskFor(13)).toBe(33);
    expect(buyBackAskFor(1)).toBe(3);
    expect(buyBackAskFor(0)).toBe(1);   // never zero — a free shelf is an exploit
    for (const paid of [1, 2, 7, 13, 40, 250]) {
      expect({ paid, loss: buyBackAskFor(paid) > paid }).toEqual({ paid, loss: true });
    }
  });
});

describe('OTA-1706 — the loot sweep sells junk and never the thing you need', () => {
  it('⚠⚠ sweeps plain loot and spares what a recipe calls for', () => {
    const junk = item({ name: 'Rat Fur' });
    expect(isSweepableLoot(junk)).toBe(true);
    // A recipe ingredient carries the same 'loot' tag and must survive.
    const recipeMat = item({ name: 'Aetheric Cloth' });
    expect(isSweepableLoot(recipeMat)).toBe(false);
  });

  it('honours the player’s own marks: reserved for fusion, reserved for a quest, already forged', () => {
    for (const mark of [{ reservedForFusion: true }, { reservedForQuest: true }, { uniqueStats: {} }]) {
      const marked = item({ name: 'Rat Fur', ...(mark as object) });
      expect({ mark: Object.keys(mark)[0], sweep: isSweepableLoot(marked) })
        .toEqual({ mark: Object.keys(mark)[0], sweep: false });
    }
  });

  it('the plan counts stacks, totals the price, and reports what it held back', () => {
    const rows = [
      { item: item({ name: 'Rat Fur', quantity: 3 }), price: 4, base: 4 },
      { item: item({ name: 'Rat Fur', quantity: 1, reservedForFusion: true }), price: 4, base: 4 },
      { item: item({ name: 'Aetheric Cloth', quantity: 5 }), price: 9, base: 9 },
    ];
    const plan = planLootSale(rows as never);
    expect({ count: plan.count, total: plan.total, spared: plan.sparedCoated })
      .toEqual({ count: 3, total: 12, spared: 1 });   // the recipe mat is not "held back", it is simply not loot to sell
  });

  it('never sells equipped-kind gear — that is the other button’s job', () => {
    expect(isSweepableLoot(item({ name: 'Bone Knife', kind: 'weapon' }))).toBe(false);
  });
});

describe('OTA-1706 — the store: what you sell lands on the shelf', () => {
  beforeEach(async () => {
    await store.getState().startNewGame({ name: 'Trader', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  });

  const withVendor = (inv: InventoryItem[]) => {
    store.setState((s) => ({
      player: { ...s.player!, inventory: inv, tc: 500 } as PlayerCharacter,
      currentScene: {
        ...s.currentScene!,
        enemies: [], enemyHps: [],
        vendor: {
          id: 'v_test', name: 'Halem the Trader', title: 'Trader', faction: null,
          description: 'a trader', offers: [],
        },
      } as never,
    }));
  };

  it('⚠⚠ a sold item appears in the vendor’s offers, priced above what they paid', () => {
    const knife = item({ name: 'Bone Knife', kind: 'weapon', quantity: 1, rarity: 'Common', tags: [] });
    withVendor([knife]);
    const tc0 = store.getState().player!.tc;
    store.getState().sellToVendor('Bone Knife', knife.id);
    const paid = store.getState().player!.tc - tc0;
    expect(paid).toBeGreaterThan(0);
    const offers = store.getState().currentScene!.vendor!.offers;
    const row = offers.find((o) => o.itemName === 'Bone Knife');
    expect(row).toBeTruthy();
    expect(row!.quantity).toBe(1);
    expect(row!.price).toBe(buyBackAskFor(paid));
    expect(row!.price).toBeGreaterThan(paid);   // the loss the owner described
  });

  it('selling a second copy grows the quantity and does NOT re-price the line', () => {
    const a = item({ name: 'Bone Knife', kind: 'weapon', quantity: 2, rarity: 'Common', tags: [] });
    withVendor([a]);
    store.getState().sellToVendor('Bone Knife', a.id);
    const first = store.getState().currentScene!.vendor!.offers.find((o) => o.itemName === 'Bone Knife')!;
    const priceAfterOne = first.price;
    store.getState().sellToVendor('Bone Knife', a.id);
    const second = store.getState().currentScene!.vendor!.offers.find((o) => o.itemName === 'Bone Knife')!;
    expect({ qty: second.quantity, price: second.price }).toEqual({ qty: 2, price: priceAfterOne });
  });

  it('the shelf push is wired where the sale lands, and the screen offers both sweeps', () => {
    const slice = src('app', 'state', 'slices', 'vendorSlice.ts');
    expect(slice.includes('price: buyBackAskFor(price), quantity: units')).toBe(true);
    const screen = src('app', 'screens', 'VendorScreen.tsx');
    expect(screen.includes('SELL ALL LOOT — {lootPlan.count} for {lootPlan.total} TC')).toBe(true);
    expect(screen.includes("mode: 'bulkSellLoot'")).toBe(true);
    // The confirm is the safety the owner asked for: a title, a body and two buttons.
    expect(screen.includes("pending?.mode === 'bulkSellLoot'")).toBe(true);
    expect(screen.includes("pending?.mode === 'bulkSellCommonGear' || pending?.mode === 'bulkSellLoot'")).toBe(true);
  });
});

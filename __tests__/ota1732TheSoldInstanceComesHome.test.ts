/**
 * OTA-1732 (F1) - THE THING YOU BUY BACK IS THE THING YOU SOLD.
 *
 * Owner: *"I do NOT accept selling a weapon and buying that same weapon back as
 * creating a new instance. Buyback must preserve the actual sold instance,
 * including durability, temper/instance stats, reinforcement, and other
 * instance-specific state."*
 *
 * WHAT IT DID BEFORE. `sellToVendor` recorded a NAME, a price and a COUNT on the
 * vendor's offer line - the object itself was discarded. `buyFromVendor` then
 * built a brand-new item from `{id, name, kind, rarity, quantity, tags}` and ran
 * `stampDurability`, which RE-ROLLS the OTA-677 temper. So the sword came back
 * with a different id, a different ceiling, different rolled perks and no
 * coating: a stranger wearing the name of the thing you sold.
 *
 * ⚠ THE SHELF IS STILL THE ONE AUTHORITY. `consigned` is a field on the offer row
 * that already tracks the stock, not a second ledger of pawned goods, so the count
 * and the objects cannot drift - they are written in the same set() and shrink in
 * the same set(). `currentScene` is persisted as-is, so a consigned instance
 * survives a save/reload with the shelf it sits on.
 *
 * ⚠ ONLY INSTANCE-BEARING GOODS ARE CONSIGNED. A stack of rations has nothing a
 * rebuild would lose, and minting those fresh stays correct.
 *
 * This is a PRE-EXISTING DEFECT fixed on its own, ahead of and separate from the
 * reinforcement feature that made it matter.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { itemCarriesInstanceState } from '../app/engine/durability';
import type { VendorInstance } from '../app/engine/vendors';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');

const stall = (): VendorInstance => ({
  id: 'roadside_honest_probe', name: 'Duvo', title: 'roadside trader', offers: [],
} as unknown as VendorInstance);

async function boot(tc = 5000): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  const p = st.getState().player!;
  st.setState({
    player: { ...p, tc, inventory: [] },
    currentScene: { ...st.getState().currentScene!, vendor: stall(), enemies: [], enemyHps: [] },
  } as never);
  await flush();
}
function put(item: Record<string, unknown>): void {
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, inventory: [...p.inventory, item] } } as never);
}
const inv = () => useGameStore.getState().player!.inventory;
const shelf = () => useGameStore.getState().currentScene!.vendor!.offers;
const find = (name: string) => inv().find((i) => i.name === name);

/** A tempered, worn, perk-bearing blade — everything a rebuild would lose. */
const BLADE = () => ({
  id: 'blade_original_1', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1,
  tags: ['weapon'], durability: { current: 7, max: 23 },
  instanceStats: { statBonuses: [{ stat: 'dexterity', amount: 2 }] },
  coating: { label: 'Corrupted', dice: '1d4', kind: 'corruption' },
});

describe('OTA-1732 (F1) - the sold instance comes home', () => {
  it('⚠⚠⚠ SELL -> BUY BACK returns the SAME object, not a rebuild', async () => {
    await boot();
    put(BLADE());
    const before = { ...find('Rusted Blade')! };
    useGameStore.getState().sellToVendor('Rusted Blade', before.id); await flush();
    expect(find('Rusted Blade')).toBeUndefined();          // it left the pack
    const line = shelf().find((o) => o.itemName === 'Rusted Blade')!;
    expect(line).toBeDefined();
    expect(line.consigned).toHaveLength(1);                // and landed on the shelf whole
    useGameStore.getState().buyFromVendor('Rusted Blade', 1); await flush();
    const after = find('Rusted Blade')!;
    W(`  sold ${before.durability!.current}/${before.durability!.max} · bought back ${after.durability!.current}/${after.durability!.max}`);
    expect(after.id).toBe(before.id);
    expect(after.durability).toEqual(before.durability);
    expect(after.instanceStats).toEqual(before.instanceStats);
    expect(after.coating).toEqual(before.coating);
  });

  it('⚠⚠ SELL -> SAVE -> RELOAD -> BUY BACK is still the same object', async () => {
    await boot();
    put(BLADE());
    const before = { ...find('Rusted Blade')! };
    useGameStore.getState().sellToVendor('Rusted Blade', before.id); await flush();
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    // the shelf came back with the scene, consignment and all
    const line = shelf().find((o) => o.itemName === 'Rusted Blade')!;
    expect(line?.consigned).toHaveLength(1);
    useGameStore.getState().buyFromVendor('Rusted Blade', 1); await flush();
    const after = find('Rusted Blade')!;
    expect(after.id).toBe(before.id);
    expect(after.durability).toEqual(before.durability);
    expect(after.instanceStats).toEqual(before.instanceStats);
    W('  survived persist -> hydrate with its durability and perks intact');
  });

  it('⚠⚠ TWO DIFFERENT COPIES of one name both come home, newest first', async () => {
    await boot();
    put({ ...BLADE(), id: 'blade_A', durability: { current: 3, max: 11 } });
    put({ ...BLADE(), id: 'blade_B', durability: { current: 19, max: 40 } });
    useGameStore.getState().sellToVendor('Rusted Blade', 'blade_A'); await flush();
    useGameStore.getState().sellToVendor('Rusted Blade', 'blade_B'); await flush();
    const line = shelf().find((o) => o.itemName === 'Rusted Blade')!;
    expect(line.consigned).toHaveLength(2);
    expect(line.quantity).toBe(2);
    // buy-back exists for the sale you regret, and that is the one you just made
    useGameStore.getState().buyFromVendor('Rusted Blade', 1); await flush();
    expect(find('Rusted Blade')!.id).toBe('blade_B');
    useGameStore.getState().buyFromVendor('Rusted Blade', 1); await flush();
    const ids = inv().filter((i) => i.name === 'Rusted Blade').map((i) => i.id).sort();
    expect(ids).toEqual(['blade_A', 'blade_B']);
    W('  both copies returned, each keeping its own ceiling');
  });

  it('⚠⚠ THE PILE SHRINKS WITH THE STOCK — the line cannot resell what it gave back', async () => {
    await boot();
    put({ ...BLADE(), id: 'blade_only' });
    useGameStore.getState().sellToVendor('Rusted Blade', 'blade_only'); await flush();
    useGameStore.getState().buyFromVendor('Rusted Blade', 1); await flush();
    // stock hit 0, so the line is gone entirely — and with it the consignment
    expect(shelf().find((o) => o.itemName === 'Rusted Blade')).toBeUndefined();
  });

  it('⚠ A STACK IS STILL MINTED FRESH — there is nothing on it to preserve', async () => {
    await boot();
    put({ id: 'rats_1', name: 'Trail Rations', kind: 'consumable', rarity: 'Common', quantity: 3, tags: [] });
    expect(itemCarriesInstanceState(find('Trail Rations')! as never)).toBe(false);
    useGameStore.getState().sellToVendor('Trail Rations', 'rats_1', { units: 3 } as never); await flush();
    const line = shelf().find((o) => o.itemName === 'Trail Rations');
    expect(line).toBeDefined();
    expect(line!.consigned).toBeUndefined();
    useGameStore.getState().buyFromVendor('Trail Rations', 1); await flush();
    expect(find('Trail Rations')).toBeDefined();
    expect(find('Trail Rations')!.id).not.toBe('rats_1');   // a fresh mint, as before
  });

  it('⚠ ORDINARY CATALOG STOCK is untouched — a vendor\'s own goods still mint', async () => {
    await boot();
    const st = useGameStore.getState();
    useGameStore.setState({ currentScene: { ...st.currentScene!, vendor: {
      ...stall(), offers: [{ itemName: 'Rusted Blade', price: 5, quantity: 1 }],
    } } } as never);
    useGameStore.getState().buyFromVendor('Rusted Blade', 1); await flush();
    const got = find('Rusted Blade')!;
    expect(got).toBeDefined();
    expect(got.id.startsWith('blade_')).toBe(false);        // minted, not reclaimed
    expect(got.durability).toBeDefined();                   // and tempered as always
  });

  it('⚠ the predicate answers on HISTORY, not on kind', () => {
    const has = (o: Record<string, unknown>) => itemCarriesInstanceState(o as never);
    expect(has({ durability: { current: 1, max: 2 } })).toBe(true);
    expect(has({ instanceStats: { acBonus: 3 } })).toBe(true);
    expect(has({ uniqueStats: { kind: 'weapon' } })).toBe(true);
    expect(has({ coating: { label: 'Corrupted' } })).toBe(true);
    expect(has({ name: 'Scrap Metal', kind: 'material', quantity: 9 })).toBe(false);
  });
});

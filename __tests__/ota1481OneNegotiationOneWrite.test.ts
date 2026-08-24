// OTA-1481 — A STACK SELLS AS ONE TRANSACTION, NOT AS N OF THEM.
//
// ⚠⚠ From the owner's 4.32.11 log: selling a 155-coin stack froze the JS thread
// for 2355ms. The screen looped `sellToVendor` once per unit, and each unit was:
//
//   • three `set()` calls (inventory rebuild, NPC ledger, CHA train check)
//   • one DISK-PERSISTED log line ("Sold Coin … for 2 TC." × 155)
//   • one FULL STATE `persist()` — the entire player + worldMemory serialized
//     to AsyncStorage, 155 times, for one tap.
//
// ⚠ THE ASYMMETRY IS THE STORY. `buyFromVendor` has taken a quantity since arb92
// ("buy in quantity — clamp the requested count to what's in stock"). The sell
// side never got the same treatment, so every convenience built on top of it —
// Sell All (arb57), the group sell (OTA-1099), SELL ALL COMMON GEAR (OTA-1232) —
// inherited the per-unit loop, each one multiplying persists by stack size. One
// half of a symmetric pair gets the fix; the other half waits for a playtest.
//
// The slice takes `units` now. One resolve, one price, one state write, one log
// line (with the unit price still visible so the player can check the
// arithmetic), one ledger entry, one persist. THE RULES DO NOT CHANGE:
//   • price is per-unit constant across a stack (item def + rapport + war heat —
//     none of it depends on the count), so total = price × units, exactly what
//     the loop paid;
//   • the ledger records ONE trade per negotiation (OTA-1438);
//   • CHA trains once per negotiation (OTA-708 / OTA-727);
//   • relic barters count PER PIECE toward the title (arb45), as the loop did;
//   • every refusal (equipped / stolen / unsellable / no vendor / mid-fight)
//     runs before a single unit moves — as it always did, since a stack is
//     copies of one item.
//
// ⚠ The equivalence below is MEASURED, not asserted: the same stack is sold both
// ways in two runs and the ending TC must be identical to the coin.

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

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SLICE = codeOnly(read('app', 'state', 'slices', 'vendorSlice.ts'));
const SCREEN = codeOnly(read('app', 'screens', 'VendorScreen.tsx'));

/** A clean sellable stack — misc, no tags, no reservations, definitely not gear. */
const stackOf = (name: string, quantity: number, id = `stk_${name}`): InventoryItem => ({
  id, name, kind: 'misc', rarity: 'Common', quantity, tags: [],
} as unknown as InventoryItem);

async function setupVendor(stack: InventoryItem, extra: Partial<Record<string, unknown>> = {}) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Seller', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      enemies: [], enemyHps: [],
      vendor: {
        id: 'ota1481_vendor',
        name: 'Ledger-Keeper Vosh',
        faction: 'reclaimers_guild',
        demeanor: 'honest',
        offers: [],
        greeting: '"Weigh it out."',
      } as never,
    },
    player: { ...p0, tc: 100, inventory: [...p0.inventory, stack], ...extra },
  });
  return store;
}

const tc = () => useGameStore.getState().player!.tc;
const qtyOf = (id: string) =>
  useGameStore.getState().player!.inventory.find((i) => i.id === id)?.quantity ?? 0;
const rewardLinesSince = (mark: number) =>
  useGameStore.getState().gameLog.slice(mark).filter((e) => e.channel === 'reward').map((e) => e.text);

describe('self-test', () => {
  it('the scanner reads real code, comments stripped', () => {
    expect(SLICE.length).toBeGreaterThan(10_000);
    expect(SCREEN.length).toBeGreaterThan(10_000);
    expect(SLICE).toContain('sellToVendor(itemName, itemId, opts)');
  });
});

describe('the stack moves as one transaction', () => {
  it("⚠⚠⚠ THE OWNER'S CASE — 155 coins, one write, one line, one persist", async () => {
    const store = await setupVendor(stackOf('Old Coin', 155));
    // Count persists by replacing the action — the slice reads get().persist()
    // live, so the swap is what every call after it sees.
    let persists = 0;
    store.setState({ persist: (async () => { persists++; }) as never });
    const mark = store.getState().gameLog.length;
    const before = tc();

    store.getState().sellToVendor('Old Coin', 'stk_Old Coin', { social: true, units: 155 });

    // One reward line for the whole negotiation — not a 155-line receipt.
    const lines = rewardLinesSince(mark).filter((t) => t.includes('Old Coin'));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('155× Old Coin');
    expect(lines[0]).toMatch(/TC each\)/); // the unit price stays checkable
    // The whole stack left, and the coin is price × 155.
    expect(qtyOf('stk_Old Coin')).toBe(0);
    const perUnit = (tc() - before) / 155;
    expect(Number.isInteger(perUnit)).toBe(true);
    expect(perUnit).toBeGreaterThan(0);
    // ⚠ THE STALL ITSELF: one persist, not 155.
    expect(persists).toBe(1);
  });

  it('⚠⚠ EQUIVALENCE — five singles and one units:5 land the identical coin', async () => {
    // Run A: the old shape, five separate unit sells.
    const a = await setupVendor(stackOf('Brass Weight', 5, 'bw_a'));
    const aBefore = tc();
    for (let i = 0; i < 5; i++) a.getState().sellToVendor('Brass Weight', 'bw_a', { social: i === 0 });
    const aGain = tc() - aBefore;
    expect(qtyOf('bw_a')).toBe(0);

    // Run B: the batched shape.
    const b = await setupVendor(stackOf('Brass Weight', 5, 'bw_b'));
    const bBefore = tc();
    b.getState().sellToVendor('Brass Weight', 'bw_b', { social: true, units: 5 });
    const bGain = tc() - bBefore;
    expect(qtyOf('bw_b')).toBe(0);

    expect(aGain).toBeGreaterThan(0);
    expect(bGain).toBe(aGain); // to the coin
  });

  it('⚠ units clamps to the live stack — asking for more sells what exists', async () => {
    const store = await setupVendor(stackOf('Tin Cup', 3));
    const before = tc();
    store.getState().sellToVendor('Tin Cup', 'stk_Tin Cup', { social: true, units: 999 });
    expect(qtyOf('stk_Tin Cup')).toBe(0);
    const gain = tc() - before;
    expect(gain % 3).toBe(0); // exactly three units' worth, not 999
    expect(gain).toBeGreaterThan(0);
  });

  it('⚠ nonsense units degrade to one unit, never to zero and never to a throw', async () => {
    // ⚠ THE NaN CASE FOUND A REAL BUG in the first draft of the clamp: NaN slides
    // through Math.max/Math.min unchanged, `quantity - NaN` is NaN, and the >0
    // filter then DROPPED the whole stack — 10 nails gone for NaN TC. The slice
    // now guards on Number.isFinite before clamping (OTA-1477's lesson again:
    // Math.max is not the NaN guard everybody assumes it is).
    for (const bad of [0, -5, 0.4, NaN, Infinity, -Infinity]) {
      const store = await setupVendor(stackOf('Bent Nail', 10, `bn_${bad}`));
      const before = tc();
      store.getState().sellToVendor('Bent Nail', `bn_${bad}`, { social: true, units: bad });
      expect(qtyOf(`bn_${bad}`)).toBe(9);
      expect(tc()).toBeGreaterThan(before);
      expect(Number.isFinite(tc())).toBe(true);
    }
  });

  it('⚠ omitted units is exactly the old single sell — no caller changes meaning', async () => {
    const store = await setupVendor(stackOf('Clay Shard', 4));
    const mark = store.getState().gameLog.length;
    store.getState().sellToVendor('Clay Shard', 'stk_Clay Shard');
    expect(qtyOf('stk_Clay Shard')).toBe(3);
    const line = rewardLinesSince(mark).find((t) => t.includes('Clay Shard'))!;
    expect(line).toBeDefined();
    expect(line).not.toContain('×');       // singular grammar for a single unit
    expect(line).not.toContain('each');
  });
});

describe('the rules ride along unchanged', () => {
  it('⚠⚠ ONE negotiation → ONE ledger trade, with the full total on it', async () => {
    // ⚠ recordNpcDealing only writes for an NPC the player has MET (it returns
    // the memory unchanged otherwise) — a first draft of this test learned that
    // by finding no entry at all. Seed the relation the way meeting them would.
    const store = await setupVendor(stackOf('Old Coin', 20));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { npcLedgerId } = require('../app/engine/npcMemory') as typeof import('../app/engine/npcMemory');
    const vendorId = npcLedgerId(store.getState().currentScene!.vendor!);
    store.setState((st) => ({
      worldMemory: {
        ...st.worldMemory,
        npcRelations: {
          ...(st.worldMemory as { npcRelations?: Record<string, unknown> }).npcRelations,
          [vendorId]: { trades: 0, tcTraded: 0 },
        },
      } as never,
    }));
    const before = tc();
    store.getState().sellToVendor('Old Coin', 'stk_Old Coin', { social: true, units: 20 });
    const gain = tc() - before;
    expect(gain).toBeGreaterThan(0);
    const rel = (store.getState().worldMemory as { npcRelations?: Record<string, { trades?: number; tcTraded?: number }> })
      .npcRelations?.[vendorId];
    expect(rel).toBeDefined();
    expect(rel!.trades).toBe(1);              // OTA-1438 — not twenty
    expect(rel!.tcTraded).toBe(gain);         // the whole total, in one entry
  });

  it('⚠ CHA trains once for the negotiation, and not at all when social:false', async () => {
    const a = await setupVendor(stackOf('Old Coin', 30, 'oc_soc'));
    const chaBefore = a.getState().player!.statProgress?.charisma ?? 0;
    a.getState().sellToVendor('Old Coin', 'oc_soc', { social: true, units: 30 });
    const chaAfterSocial = a.getState().player!.statProgress?.charisma ?? 0;
    expect(chaAfterSocial).toBeGreaterThan(chaBefore);
    const gainedOnce = chaAfterSocial - chaBefore;

    const b = await setupVendor(stackOf('Old Coin', 30, 'oc_quiet'));
    const quietBefore = b.getState().player!.statProgress?.charisma ?? 0;
    b.getState().sellToVendor('Old Coin', 'oc_quiet', { social: false, units: 30 });
    expect((b.getState().player!.statProgress?.charisma ?? 0)).toBe(quietBefore);

    // The batch's gain is EXACTLY one single-unit sale's gain — measured in the
    // SAME character, because progressAwardFor scales with the base stat and a
    // fresh character's roll differs run to run. (Two drafts of this assertion
    // were wrong before the code was ever wrong: a guessed '≤3' when the award
    // here is 6, then a cross-store compare between two different rolls.)
    const c = await setupVendor(stackOf('Old Coin', 40, 'oc_pair'));
    const g0 = c.getState().player!.statProgress?.charisma ?? 0;
    c.getState().sellToVendor('Old Coin', 'oc_pair', { social: true, units: 1 });
    const singleGain = (c.getState().player!.statProgress?.charisma ?? 0) - g0;
    c.getState().sellToVendor('Old Coin', 'oc_pair', { social: true, units: 39 });
    const batchGain = (c.getState().player!.statProgress?.charisma ?? 0) - g0 - singleGain;
    expect(singleGain).toBeGreaterThan(0);
    expect(batchGain).toBe(singleGain); // 39 units, one negotiation's training
    expect(qtyOf('oc_pair')).toBe(0);
  });

  it('⚠ a refusal refuses the WHOLE stack — nothing partial moves', async () => {
    const stolen = { ...stackOf('Hot Goods', 12), stolen: true } as InventoryItem;
    const store = await setupVendor(stolen);
    const before = tc();
    store.getState().sellToVendor('Hot Goods', 'stk_Hot Goods', { social: true, units: 12 });
    expect(qtyOf('stk_Hot Goods')).toBe(12); // untouched
    expect(tc()).toBe(before);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/not buying it back/);
  });

  it('⚠ mid-fight the batch refuses exactly as the single always has', async () => {
    const store = await setupVendor(stackOf('Old Coin', 8));
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [{ name: 'Mudling', hp: 5 } as never], enemyHps: [5] },
    }));
    const before = tc();
    store.getState().sellToVendor('Old Coin', 'stk_Old Coin', { social: true, units: 8 });
    expect(qtyOf('stk_Old Coin')).toBe(8);
    expect(tc()).toBe(before);
  });
});

describe('every screen path hands the stack to the slice', () => {
  it('⚠⚠ no per-unit sell loop survives anywhere in the screen', () => {
    // The four sites that looped: doSell, bulkSellCommonGear, doGroupSell, and
    // the single confirm (which was already one unit). A loop whose body calls
    // sellToVendor is the stall coming back under a new name.
    expect(SCREEN).not.toMatch(/for\s*\([^)]*\)\s*(?:\{[^}]*)?sellToVendor\(/);
    expect(SCREEN).not.toMatch(/for \(let i = 0; i < (?:reps|p\.qty)/);
  });

  it('⚠ all quantity paths pass units', () => {
    expect(SCREEN).toMatch(/units:\s*reps/);   // doSell + bulk common gear
    expect(SCREEN).toMatch(/units:\s*p\.qty/); // group sell
  });

  it('⚠ the slice takes the count and clamps it to the live quantity', () => {
    // ⚠ A first draft quoted the clamp's exact spelling and broke ONE HOUR LATER
    // when the NaN guard rewrote it — the quoted-source defect class, self-
    // inflicted mid-OTA. The clamping CLAIM is behavioural and is proven above
    // (999 → stack size, NaN → 1); all that belongs here is that the count
    // reaches the slice and the ledger carries the total.
    expect(SLICE).toMatch(/opts\?\.units/);
    expect(SLICE).toMatch(/item\.quantity/);
    // …and the ledger carries the total, not the unit price (OTA-1438's field).
    expect(SLICE).toMatch(/tcTraded:\s*total/);
  });
});

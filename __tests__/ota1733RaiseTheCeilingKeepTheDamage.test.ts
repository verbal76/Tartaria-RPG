/**
 * OTA-1733 - REINFORCEMENT: RAISE THE CEILING, KEEP THE DAMAGE.
 *
 * Owner's ruling, option B: *"Each reinforcement adds 20% of the weapon's CATALOG
 * BASE durability to that individual weapon's temper-rolled maximum … Temper
 * remains meaningful, but reinforcement must not multiply the advantage of a lucky
 * temper roll."* Three levels, at a vendor/crafter, for TC plus materials, each
 * level dearer than the last.
 *
 *     catalog base 50 → step 10
 *       temper 20 → 30 → 40 → 50
 *       temper 50 → 60 → 70 → 80
 *       temper 90 → 100 → 110 → 120
 *
 * ⚠ A PERCENTAGE OF THE INSTANCE MAX would have paid the lucky roll three times
 * over (90 → 108 → 130 → 156). That is the thing the ruling rules out, and this
 * suite holds the flat step against exactly those three copies.
 *
 * ⚠⚠ NO SECOND DURABILITY AUTHORITY. `baseMax` and `reinforced` live on
 * `item.durability` — the object repair, wear and the item card already read.
 * `max` keeps its meaning; nothing else learns a new field. The catalog is READ
 * once, for the size of the step, and never written.
 *
 * ⚠⚠ OTA-1654's RULE, REUSED: raising a ceiling carries the DAMAGE across rather
 * than repairing it. A 7/23 blade reinforced by 10 becomes 17/33 — still 16 points
 * down, and now more expensive to mend, since repairCost is measured against the
 * live max.
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
import {
  reinforceItem, reinforceStep, reinforceLevel, reinforceRefusal, reinforceTcCost,
  instanceBaseMax, stampDurability, repairItem, repairCost,
  REINFORCE_MAX_LEVEL,
} from '../app/engine/durability';
import { reinforceCostMaterials } from '../app/engine/scrapEngine';
import type { VendorInstance } from '../app/engine/vendors';
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');

/** A catalog weapon with base 50 is the owner's worked example. Find one. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WEAPONS } = require('../app/engine/crafting') as typeof import('../app/engine/crafting');
const BASE50 = WEAPONS.find((w) => w.baseDurability === 50) ?? WEAPONS.find((w) => w.baseDurability)!;
const BASE = BASE50.baseDurability!;

const blade = (max: number, current = max, over: Record<string, unknown> = {}): InventoryItem => ({
  id: 'b_' + max + '_' + Math.random().toString(36).slice(2, 7),
  name: BASE50.name, kind: 'weapon', rarity: BASE50.rarity, quantity: 1, tags: ['weapon'],
  durability: { current, max, baseMax: max, reinforced: 0 },
  ...over,
} as unknown as InventoryItem);

// ===== 1. the ladder ======================================================

describe('OTA-1733 - the ladder is flat, from the catalog', () => {
  it('⚠⚠⚠ THE OWNER\'S THREE COPIES, exactly as specified', () => {
    const step = reinforceStep(blade(BASE));
    expect(step).toBe(Math.round(BASE * 0.2));
    const ladder = (temper: number): number[] => {
      let it = blade(temper);
      const out = [it.durability!.max];
      for (let i = 0; i < REINFORCE_MAX_LEVEL; i++) { it = reinforceItem(it); out.push(it.durability!.max); }
      return out;
    };
    W(`\n  catalog base ${BASE} → step ${step}`);
    for (const t of [Math.round(BASE * 0.4), BASE, Math.round(BASE * 1.8)]) {
      W(`    temper ${t}: ${ladder(t).join(' → ')}`);
    }
    // the SAME flat gain on every copy — a lucky temper is not multiplied
    for (const t of [Math.round(BASE * 0.4), BASE, Math.round(BASE * 1.8)]) {
      const l = ladder(t);
      expect(l).toEqual([t, t + step, t + step * 2, t + step * 3]);
    }
  });

  it('⚠⚠ 0 → 1 → 2 → 3 and the FOURTH is refused', () => {
    let it = blade(BASE);
    for (let lvl = 1; lvl <= REINFORCE_MAX_LEVEL; lvl++) {
      expect(reinforceRefusal(it)).toBeNull();
      it = reinforceItem(it);
      expect(reinforceLevel(it)).toBe(lvl);
    }
    expect(reinforceRefusal(it)).toContain('as far as it will go');
    const frozen = { ...it.durability! };
    expect(reinforceItem(it).durability).toEqual(frozen);   // a refused call changes nothing
  });

  it('⚠⚠ baseMax NEVER MOVES, so the ladder cannot compound on itself', () => {
    let it = blade(BASE);
    for (let i = 0; i < REINFORCE_MAX_LEVEL; i++) it = reinforceItem(it);
    expect(it.durability!.baseMax).toBe(BASE);
    expect(it.durability!.max).toBe(BASE + reinforceStep(blade(BASE)) * 3);
  });

  it('⚠⚠⚠ A DAMAGED WEAPON KEEPS ITS DAMAGE — OTA-1654\'s rule', () => {
    const it = blade(23, 7);
    const step = reinforceStep(it);
    const after = reinforceItem(it).durability!;
    expect(after.max).toBe(23 + step);
    expect(after.current).toBe(7 + step);
    expect(after.max - after.current).toBe(16);      // still exactly as chipped
    W(`  damaged 7/23 → ${after.current}/${after.max} (still 16 points down, not repaired)`);
  });

  it('⚠⚠ REPAIR AFTER REINFORCEMENT fills to the NEW ceiling, and the bill does not move', () => {
    // ⚠ I asserted the mend would cost MORE and the suite corrected me. It does not,
    //   and that is OTA-1654's rule being exactly right: reinforcement carries the
    //   damage across rather than inflicting any, so the same points are missing and
    //   `repairCost = missing × rarity` is the same number. What changed is where a
    //   full mend REACHES. Paying to strengthen a weapon must not quietly also
    //   inflate the price of mending it.
    const it = blade(23, 7);
    const costBefore = repairCost(it);
    const strong = reinforceItem(it);
    expect(repairCost(strong)).toBe(costBefore);
    expect(strong.durability!.max - strong.durability!.current).toBe(16);
    const mended = repairItem([strong], strong.id)[0]!;
    expect(mended.durability!.current).toBe(mended.durability!.max);
    expect(mended.durability!.max).toBe(strong.durability!.max);
    expect(mended.durability!.max).toBeGreaterThan(23);  // the mend reaches higher now
    expect(mended.durability!.reinforced).toBe(1);       // and repair does not undo it
  });

  it('⚠ costs escalate per level, in coin and in parts', () => {
    let it = blade(BASE);
    const tc: number[] = []; const mats: number[] = [];
    for (let i = 0; i < REINFORCE_MAX_LEVEL; i++) {
      tc.push(reinforceTcCost(it));
      mats.push(reinforceCostMaterials(it, reinforceLevel(it)).reduce((n, m) => n + m.quantity, 0));
      it = reinforceItem(it);
    }
    W(`  TC ladder ${tc.join(' → ')} · material units ${mats.join(' → ')}`);
    expect(tc[1]!).toBeGreaterThan(tc[0]!);
    expect(tc[2]!).toBeGreaterThan(tc[1]!);
    expect(mats[1]!).toBeGreaterThan(mats[0]!);
    expect(mats[2]!).toBeGreaterThan(mats[1]!);
    expect(reinforceTcCost(it)).toBe(0);             // nothing more to sell
  });
});

// ===== 2. the shapes that are not a plain catalog weapon ==================

describe('OTA-1733 - fused, generated and legacy objects', () => {
  it('⚠⚠ A FUSED weapon has no catalog base — its own temper roll is the base', () => {
    const fused: InventoryItem = {
      id: 'fused_r1', name: 'Resonant Cleaver', kind: 'weapon', rarity: 'Rare', quantity: 1,
      tags: ['fused', 'unique'],
      durability: { current: 30, max: 40, baseMax: 40, reinforced: 0 },
      uniqueStats: { kind: 'weapon', rarity: 'Rare', damageDice: '2d6', damageType: 'slashing', scalesWith: 'strength', durability: { current: 40, max: 40 } },
    } as unknown as InventoryItem;
    const step = reinforceStep(fused);
    expect(step).toBe(Math.round(40 * 0.2));         // 20% of ITS base, not a catalog miss
    const after = reinforceItem(fused).durability!;
    expect(after.max).toBe(48);
    expect(after.current).toBe(38);                  // damage carried, as everywhere
  });

  it('⚠⚠ A GENERATED weapon that stamped through stampDurability carries baseMax', () => {
    const gen = stampDurability({
      id: 'gen_1', name: BASE50.name, kind: 'weapon', rarity: BASE50.rarity, quantity: 1, tags: ['weapon'],
    } as never);
    expect(gen.durability!.baseMax).toBe(gen.durability!.max);
    expect(gen.durability!.reinforced).toBe(0);
    const after = reinforceItem(gen).durability!;
    expect(after.max).toBe(gen.durability!.max + reinforceStep(gen));
  });

  it('⚠⚠⚠ A LEGACY weapon with NO baseMax / reinforced reads as unreinforced', () => {
    // exactly the shape a save written before this OTA holds
    const legacy = {
      id: 'legacy_1', name: BASE50.name, kind: 'weapon', rarity: BASE50.rarity, quantity: 1,
      tags: ['weapon'], durability: { current: 18, max: 37 },
    } as unknown as InventoryItem;
    expect(instanceBaseMax(legacy)).toBe(37);
    expect(reinforceLevel(legacy)).toBe(0);
    expect(reinforceRefusal(legacy)).toBeNull();
    const after = reinforceItem(legacy).durability!;
    expect(after.baseMax).toBe(37);                  // its live max becomes its floor
    expect(after.reinforced).toBe(1);
    expect(after.max).toBe(37 + reinforceStep(legacy));
    expect(after.current).toBe(18 + reinforceStep(legacy));
    W('  legacy 18/37 with no fields reinforced cleanly — no migration needed');
  });
});

// ===== 3. at the counter, and across every boundary =======================

const stall = (): VendorInstance => ({
  id: 'roadside_honest_probe', name: 'Duvo', title: 'roadside smith', offers: [],
} as unknown as VendorInstance);

async function boot(tc = 100000): Promise<void> {
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
function give(it: Record<string, unknown>): void {
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, inventory: [...p.inventory, it] } } as never);
}
/** Stock the pack with everything the next reinforcement asks for. */
function stockFor(it: Record<string, unknown>, level: number): void {
  const mats = reinforceCostMaterials(it as never, level);
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, inventory: [...p.inventory,
    ...mats.map((m, n) => ({ id: `mat_${level}_${n}_${Math.random()}`, name: m.name, kind: 'material', rarity: 'Common', quantity: m.quantity * 4, tags: [] })),
  ] } } as never);
}
const held = (id: string) => useGameStore.getState().player!.inventory.find((i) => i.id === id);

describe('OTA-1733 - the counter, and the boundaries', () => {
  it('⚠⚠⚠ THREE LEVELS AT THE SMITH, with a SAVE/RELOAD at each one', async () => {
    await boot();
    const it = blade(BASE, BASE - 5, { id: 'anvil_1' });
    give(it as unknown as Record<string, unknown>);
    const step = reinforceStep(it);
    for (let lvl = 1; lvl <= REINFORCE_MAX_LEVEL; lvl++) {
      stockFor(held('anvil_1')! as never, lvl - 1);
      const tcBefore = useGameStore.getState().player!.tc;
      useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
      const d = held('anvil_1')!.durability!;
      expect(d.reinforced).toBe(lvl);
      expect(d.max).toBe(BASE + step * lvl);
      expect(useGameStore.getState().player!.tc).toBeLessThan(tcBefore);   // it charged
      // …and it survives the disk
      await useGameStore.getState().persist();
      await useGameStore.getState().hydrate(); await flush();
      const after = held('anvil_1')!.durability!;
      expect(after).toEqual(d);
      useGameStore.setState({ currentScene: { ...useGameStore.getState().currentScene!, vendor: stall() } } as never);
    }
    W(`  reinforced to ${held('anvil_1')!.durability!.max}, surviving a reload at every level`);
    // fourth is refused at the counter too
    stockFor(held('anvil_1')! as never, 3);
    const before = { ...held('anvil_1')!.durability! };
    const tcBefore = useGameStore.getState().player!.tc;
    useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
    expect(held('anvil_1')!.durability).toEqual(before);
    expect(useGameStore.getState().player!.tc).toBe(tcBefore);             // and charged nothing
  });

  it('⚠⚠ INSUFFICIENT TC: refused, and not a coin or a scrap is spent', async () => {
    await boot(1);
    give(blade(BASE, BASE, { id: 'poor_1' }) as unknown as Record<string, unknown>);
    stockFor(held('poor_1')! as never, 0);
    const invBefore = JSON.stringify(useGameStore.getState().player!.inventory);
    useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
    expect(held('poor_1')!.durability!.reinforced).toBe(0);
    expect(useGameStore.getState().player!.tc).toBe(1);
    expect(JSON.stringify(useGameStore.getState().player!.inventory)).toBe(invBefore);
  });

  it('⚠⚠ INSUFFICIENT MATERIALS: refused, and the TC is not taken', async () => {
    await boot(100000);
    give(blade(BASE, BASE, { id: 'bare_1' }) as unknown as Record<string, unknown>);
    // deliberately no materials stocked
    const tcBefore = useGameStore.getState().player!.tc;
    useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
    expect(held('bare_1')!.durability!.reinforced).toBe(0);
    expect(useGameStore.getState().player!.tc).toBe(tcBefore);
  });

  it('⚠ with NO SMITH present nothing happens at all', async () => {
    await boot();
    useGameStore.setState({ currentScene: { ...useGameStore.getState().currentScene!, vendor: null } } as never);
    give(blade(BASE, BASE, { id: 'nowhere_1' }) as unknown as Record<string, unknown>);
    useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
    expect(held('nowhere_1')!.durability!.reinforced).toBe(0);
  });

  it('⚠⚠⚠ SELL → BUY BACK keeps the reinforcement (the F1 road, walked with it)', async () => {
    await boot();
    give(blade(BASE, BASE - 3, { id: 'traded_1' }) as unknown as Record<string, unknown>);
    stockFor(held('traded_1')! as never, 0);
    useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
    const strong = { ...held('traded_1')!.durability! };
    expect(strong.reinforced).toBe(1);
    useGameStore.getState().sellToVendor(BASE50.name, 'traded_1'); await flush();
    expect(held('traded_1')).toBeUndefined();
    useGameStore.getState().buyFromVendor(BASE50.name, 1); await flush();
    const back = useGameStore.getState().player!.inventory.find((i) => i.id === 'traded_1')!;
    expect(back).toBeDefined();
    expect(back.durability).toEqual(strong);
    W(`  sold a reinforced ${strong.current}/${strong.max} and bought back exactly that`);
  });

  it('⚠⚠ SELL → RELOAD → BUY BACK keeps it too', async () => {
    await boot();
    give(blade(BASE, BASE, { id: 'traded_2' }) as unknown as Record<string, unknown>);
    stockFor(held('traded_2')! as never, 0);
    useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
    const strong = { ...held('traded_2')!.durability! };
    useGameStore.getState().sellToVendor(BASE50.name, 'traded_2'); await flush();
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate(); await flush();
    useGameStore.getState().buyFromVendor(BASE50.name, 1); await flush();
    const back = useGameStore.getState().player!.inventory.find((i) => i.id === 'traded_2')!;
    expect(back.durability).toEqual(strong);
  });

  it('⚠ THE CATALOG IS NEVER TOUCHED — a second copy still mints at its own roll', async () => {
    await boot();
    give(blade(BASE, BASE, { id: 'first_1' }) as unknown as Record<string, unknown>);
    stockFor(held('first_1')! as never, 0);
    useGameStore.getState().reinforceWithVendor(BASE50.name); await flush();
    expect(held('first_1')!.durability!.max).toBeGreaterThan(BASE);
    // the catalog row is unchanged, so a freshly stamped copy is bounded by temper
    const fresh = stampDurability({ id: 'fresh_1', name: BASE50.name, kind: 'weapon', rarity: BASE50.rarity, quantity: 1, tags: ['weapon'] } as never);
    expect(fresh.durability!.reinforced).toBe(0);
    expect(fresh.durability!.max).toBeLessThanOrEqual(Math.round(BASE * 1.8));
    expect(BASE50.baseDurability).toBe(BASE);        // the row itself never moved
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1232 — GOLEM-ONLY TRIAL. Three changes the owner asked to take for a
// spin, all downstream of the take/salvage audit in OTA-1231:
//
//   · the loot picker SORTS — ★ upgrades, then ⚔ weapons, then 🛡 armor, then the
//     rest — so the rows needing a judgement call come before the ones a bulk
//     button will sweep;
//   · a vendor SELL ALL COMMON GEAR button with the count and total on its face;
//   · the scene-feature refusals stop advertising SALVAGE on nouns that have no
//     salvage pool.
//
// ⚠⚠ THIS SHIPS ON GOLEM ONLY, DELIBERATELY, and that breaks the standing
// same-pass parity rule. It is a UX trial the owner wants to play before it goes
// to HAL. See the HANDOFF divergence note — an unrecorded divergence does not stay
// a trial, it silently becomes permanent drift.
import {
  averageDamage, classifyGatherNoun, isUpgradeOverEquipped, sortGatherRows, gatherIcon,
  type GatherRow,
} from '../app/engine/gatherSort';
import { planCommonGearSale, isGearItem } from '../app/engine/bulkSell';
import { hasSalvageYield } from '../app/engine/salvagePools';
import { sceneFeatureRefusalLine } from '../app/engine/portability';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const row = (noun: string, kind: GatherRow['kind'], upgrade = false, consumed = false): GatherRow =>
  ({ noun, kind, upgrade, consumed });

const inv = (name: string, rarity: string, extra: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id: `i_${name}`, name, kind: 'gear', rarity, quantity: 1, tags: [], ...extra } as InventoryItem);

describe('OTA-1232 — the loot picker answers the question it is asked', () => {
  it('⚠⚠ decisions first, sweepable last: ★ → ⚔ → 🛡 → other → scenery', () => {
    const sorted = sortGatherRows([
      row('rubble', 'scenery'),
      row('a helm', 'armor'),
      row('a torch', 'other'),
      row('a blade', 'weapon'),
      row('a better helm', 'armor', true),
    ]);
    expect(sorted.map((r) => r.noun)).toEqual([
      'a better helm', 'a blade', 'a helm', 'a torch', 'rubble',
    ]);
  });

  it('⚠ the order is STABLE — a picker that reshuffles under your thumb is worse than one sorted badly', () => {
    const rows = [row('zeta', 'armor'), row('alpha', 'armor'), row('mid', 'armor')];
    expect(sortGatherRows(rows).map((r) => r.noun)).toEqual(['alpha', 'mid', 'zeta']);
    // Same input, same output — no RNG, no insertion-order dependence.
    expect(sortGatherRows([...rows].reverse()).map((r) => r.noun)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('⚠ consumed rows SINK, they do not jump the order', () => {
    const sorted = sortGatherRows([
      row('spent blade', 'weapon', false, true),
      row('fresh rubble', 'scenery'),
    ]);
    expect(sorted[0]!.noun).toBe('fresh rubble');
  });

  it('⚠⚠ the icon and the lane can never disagree — one source for both', () => {
    expect(gatherIcon({ kind: 'weapon', upgrade: false })).toBe('⚔');
    expect(gatherIcon({ kind: 'armor', upgrade: false })).toBe('🛡');
    expect(gatherIcon({ kind: 'scenery', upgrade: false })).toBe('⚒');
    // ★ outranks the slot icon, because it outranks the slot in the sort too.
    expect(gatherIcon({ kind: 'armor', upgrade: true })).toBe('★');
    expect(gatherIcon({ kind: 'weapon', upgrade: true })).toBe('★');
  });

  it('⚠ scenery is anything the catalog does not know — the salvage lane', () => {
    expect(classifyGatherNoun('brick')).toBe('scenery');
    expect(classifyGatherNoun('bench')).toBe('scenery');
    // ...and a real item is never scenery.
    expect(classifyGatherNoun('Aetheric Torch')).not.toBe('scenery');
  });

  it('⚠⚠ the ★ is STRICT, because an untrustworthy mark is worse than no mark', () => {
    // A tie is not an upgrade — a second identical helm is inventory weight.
    // An unknown is never an upgrade. No player means no claim at all.
    expect(isUpgradeOverEquipped(null, 'anything')).toBe(false);
    const bare = { equipped: {}, inventory: [] } as unknown as PlayerCharacter;
    // An empty slot: anything real beats nothing.
    expect(isUpgradeOverEquipped(bare, 'nonexistent-noun-xyzzy')).toBe(false);
  });

  it('⚠ damage averaging is arithmetic, not string-matching', () => {
    expect(averageDamage('2d6')).toBe(7);
    expect(averageDamage('1d8')).toBe(4.5);
    expect(averageDamage('1d6+2')).toBe(5.5);
    // Unparseable scores 0 rather than ranking first by accident.
    expect(averageDamage('big')).toBe(0);
    expect(averageDamage(null)).toBe(0);
    expect(averageDamage(undefined)).toBe(0);
  });
});

describe('OTA-1232 — SELL ALL COMMON GEAR sells gear, and only gear', () => {
  it('⚠⚠ COMMON IS NOT A JUNK TIER: consumables and materials are never swept', () => {
    // Straight from the owner's device log — all Common, none of it sellable junk.
    const plan = planCommonGearSale([
      { item: inv('Scrap Metal', 'Common'), price: 2 },
      { item: inv('Aether Dust', 'Common'), price: 3 },
      { item: inv('Trail Rations', 'Common'), price: 1 },
      { item: inv('Worn Tartarian Coin', 'Common'), price: 1 },
    ]);
    expect(plan.rows).toEqual([]);
    expect(plan.count).toBe(0);
    expect(plan.total).toBe(0);
  });

  it('⚠⚠ selection is on rarity === Common, NOT on the beige colour', () => {
    // Beige is the `default:` branch of the rarity colour switch, so it renders
    // Common AND anything unrecognised. Selecting on the colour would sweep the
    // unknowns; this must leave them alone.
    const plan = planCommonGearSale([
      { item: inv('Rusted Blade', 'Common'), price: 5 },
      { item: inv('Odd Blade', undefined as unknown as string), price: 5 },
      { item: inv('Mystery Blade', 'Whatever'), price: 5 },
    ]);
    expect(plan.rows.map((r) => r.item.name)).toEqual(['Rusted Blade']);
  });

  it('⚠ a Crucible-forged piece is never swept, whatever its rarity says', () => {
    const forged = inv('Rusted Blade', 'Common', { uniqueStats: { kind: 'weapon' } } as Partial<InventoryItem>);
    const plan = planCommonGearSale([{ item: forged, price: 5 }]);
    expect(plan.rows).toEqual([]);
  });

  it('⚠⚠ the count and the total are quantity-aware — they are the safety on the button', () => {
    const plan = planCommonGearSale([
      { item: inv('Rusted Blade', 'Common', { quantity: 3 }), price: 4 },
    ]);
    expect(plan.count).toBe(3);
    expect(plan.total).toBe(12);
  });

  it('⚠ gear means weapons and armor, from the catalogs themselves', () => {
    expect(isGearItem({ name: 'Rusted Blade' })).toBe(true);
    expect(isGearItem({ name: 'Scrap Metal' })).toBe(false);
    expect(isGearItem({ name: 'First Aid Kit' })).toBe(false);
  });
});

describe('OTA-1232 — the refusal stops sending players somewhere empty', () => {
  it('⚠⚠ SALVAGE is advertised only where there is something to salvage', () => {
    // sign / arch / wall match no pool. Sampled hard, because the line is
    // picked at random from eight and a single draw proves nothing.
    for (const noun of ['sign', 'arch', 'wall']) {
      expect(hasSalvageYield(noun)).toBe(false);
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(sceneFeatureRefusalLine(noun));
      expect([...seen].some((l) => l.includes('SALVAGE'))).toBe(false);
      // All eight variants still reachable — the variety is why a hoarder does
      // not read one sentence forty times.
      expect(seen.size).toBe(8);
    }
  });

  it('⚠⚠ ...and it IS advertised where the pry pays, so the teaching still happens', () => {
    for (const noun of ['brick', 'bench', 'gate', 'crate']) {
      expect(hasSalvageYield(noun)).toBe(true);
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(sceneFeatureRefusalLine(noun));
      // OTA-137's rule holds on these: EVERY line teaches the verb, so one tap
      // is enough to learn it.
      expect([...seen].every((l) => l.includes('SALVAGE'))).toBe(true);
      expect(seen.size).toBe(8);
    }
  });

  it('⚠ the scenery lines promise nothing, and never name a verb that will refuse', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(sceneFeatureRefusalLine('sign'));
    for (const line of seen) {
      expect(line).not.toContain('SALVAGE');
      expect(line).toContain('sign');
    }
  });

  it('⚠ hasSalvageYield is PURE — the refusal is a fact about the noun, not a dice throw', () => {
    for (const noun of ['brick', 'sign', 'arch', 'bench']) {
      const first = hasSalvageYield(noun);
      for (let i = 0; i < 50; i++) expect(hasSalvageYield(noun)).toBe(first);
    }
  });
});

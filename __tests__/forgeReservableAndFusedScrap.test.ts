// OTA-737 — three forge changes:
//   (1a) authored 'loot' reagents with NO recipe use become forge-reservable;
//        recipe-critical loot stays protected.
//   (2a) inferred weapons/armor are NOT forge-reservable (they used to show a ♥
//        the Crucible then silently ignored).
//   (3)  scrapping a FUSED weapon/armor yields Uncommon/Rare stock only — no Commons.

import { isForgeReservableItem, isForgeableLootReagent, synthesizeFusionDeterministic } from '../app/engine/itemFusion';
import { scrapOutputFor } from '../app/engine/scrapEngine';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

const mk = (p: Partial<InventoryItem> & { name: string }): InventoryItem =>
  ({ id: p.name, kind: 'misc', quantity: 1, rarity: 'Common', tags: [], ...p } as InventoryItem);

// Common mats a fused forge must NEVER scrap into.
const COMMON_MATS = new Set([
  'Scrap Metal', 'Stick', 'Small Rock', 'Big Rock', 'Patched Cloth',
  'Spider Silk', 'Aether Crystal', 'Aether Residue',
]);

describe('OTA-737 (1a/2a) — forge reservability', () => {
  it('inferred misc junk is reservable', () => {
    expect(isForgeReservableItem(mk({ name: 'Weird Goo', kind: 'misc', tags: ['organic'] }))).toBe(true);
  });

  it('(2a) an inferred WEAPON/ARMOR is NOT reservable', () => {
    expect(isForgeReservableItem(mk({ name: 'Junk Blade', kind: 'weapon', tags: ['improvised'] }))).toBe(false);
    expect(isForgeReservableItem(mk({ name: 'Junk Plate', kind: 'armor', tags: ['improvised'] }))).toBe(false);
  });

  it('a fused one-of-a-kind is never re-reservable', () => {
    const u = { kind: 'weapon' } as unknown as UniqueItemStats;
    expect(isForgeReservableItem(mk({ name: 'Ghostblade', kind: 'weapon', tags: ['fused'], uniqueStats: u }))).toBe(false);
  });

  it('(1a) a catalog LOOT reagent with no recipe use is reservable (Rat Fur)', () => {
    const ratFur = mk({ name: 'Rat Fur', kind: 'misc', tags: ['organic', 'fur', 'vermin', 'loot'] });
    expect(isForgeableLootReagent(ratFur)).toBe(true);
    expect(isForgeReservableItem(ratFur)).toBe(true);
  });

  it('(1a) a recipe-critical LOOT reagent stays protected (Aetheric Cloth)', () => {
    const cloth = mk({ name: 'Aetheric Cloth', kind: 'misc', rarity: 'Rare', tags: ['fiber', 'aether', 'loot'] });
    expect(isForgeableLootReagent(cloth)).toBe(false);
    expect(isForgeReservableItem(cloth)).toBe(false);
  });

  it('a throwable/keepsake LOOT item is excluded even with the loot tag', () => {
    expect(isForgeableLootReagent(mk({ name: 'Disease Sample', kind: 'misc', tags: ['organic', 'throwable', 'loot'] }))).toBe(false);
    expect(isForgeableLootReagent(mk({ name: "Giants' Servant Sigil", kind: 'misc', tags: ['sigil', 'keepsake', 'loot'] }))).toBe(false);
  });
});

describe('OTA-737 (3) — fused weapon/armor scraps to Uncommon/Rare only', () => {
  const fusedWeapon = mk({ name: 'Ghost-Charged Gouge', kind: 'weapon', rarity: 'Legendary', tags: ['fused', 'unique', 'aetheric'], uniqueStats: {} as UniqueItemStats });
  const fusedArmorRare = mk({ name: 'Pulse-Woven Cuirass', kind: 'armor', rarity: 'Rare', tags: ['fused', 'unique', 'aetheric'], uniqueStats: {} as UniqueItemStats });

  it('a fused weapon yields no Common mats', () => {
    const out = scrapOutputFor(fusedWeapon);
    expect(out.grants.length).toBeGreaterThan(0);
    for (const g of out.grants) expect(COMMON_MATS.has(g.name)).toBe(false);
    expect(out.grants.map((g) => g.name)).toContain('Golem Core'); // Rare on a Rare+ weapon
  });

  it('a fused armor yields no Common mats + a Rare fiber', () => {
    const out = scrapOutputFor(fusedArmorRare);
    for (const g of out.grants) expect(COMMON_MATS.has(g.name)).toBe(false);
    expect(out.grants.map((g) => g.name)).toContain('Aetheric Cloth');
  });

  it('always includes the Uncommon aether staples', () => {
    const names = scrapOutputFor(fusedWeapon).grants.map((g) => g.name);
    expect(names).toContain('Aetheric Shard');
    expect(names).toContain('Aetheric Dust');
  });
});

describe('OTA-740 — fused resistance follows the DOMINANT material, not always aether', () => {
  const mkI = (name: string, tags: string[]): InventoryItem =>
    ({ id: name, name, kind: 'misc', rarity: 'Common', quantity: 1, tags } as InventoryItem);

  it('an organic/fur-majority reserved set forges poison resist (was always aetheric)', () => {
    const inputs = [
      mkI('Alpha Fur', ['organic', 'loot']),
      mkI('Hound Fur', ['organic', 'loot']),
      mkI('Crab Meat', ['organic', 'loot']),
      mkI('Fragmented Aether', ['aether', 'improvised', 'loot']),
    ];
    const r = synthesizeFusionDeterministic(inputs, ['organic', 'aether', 'improvised'], 'dog_armor');
    expect(r.stats.resistance).toBe('poison');
  });

  it('an aether-majority reserved set still forges aetheric resist', () => {
    const inputs = [
      mkI('Aetheric Blood', ['aether', 'loot']),
      mkI('Fragmented Aether', ['aether', 'improvised', 'loot']),
      mkI('Aetheric Residue', ['aether', 'loot']),
      mkI('Alpha Fur', ['organic', 'loot']),
    ];
    const r = synthesizeFusionDeterministic(inputs, ['aether', 'organic', 'improvised'], 'dog_armor');
    expect(r.stats.resistance).toBe('aetheric');
  });
});

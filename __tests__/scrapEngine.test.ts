// Scrap engine — disassemble built items into stock materials.

import { canScrap, scrapOutputFor, hasTagScrapOutput, isStockMaterial, randomMaterialScrap, realizeScrapOutput } from '../app/engine/scrapEngine';
import type { InventoryItem } from '../app/engine/types';

function mk(name: string, kind: InventoryItem['kind'], tags: string[] = []): InventoryItem {
  return { id: `t_${name}`, name, kind, rarity: 'Common', quantity: 1, tags };
}

describe('canScrap', () => {
  it('accepts weapons / armor / relics', () => {
    expect(canScrap(mk('Rusted Blade', 'weapon'))).toBe(true);
    expect(canScrap(mk('Patched Cuirass', 'armor'))).toBe(true);
    expect(canScrap(mk('Aetheric Locket', 'relic'))).toBe(true);
  });

  it('accepts misc gear with material tags (Compass, Torch)', () => {
    expect(canScrap(mk('Aetheric Torch', 'misc', ['light', 'metal']))).toBe(true);
    expect(canScrap(mk('Aetheric Compass', 'misc', ['metal']))).toBe(true);
  });

  it('OTA-742 — accepts a weapon/armor mis-stamped as misc (vendor-bought Rust Dagger)', () => {
    const rustDagger = mk('Rust Dagger', 'misc', ['weapon', 'melee', 'dual_wield', 'knife', 'mud_dwellers']);
    expect(canScrap(rustDagger)).toBe(true);
    const out = scrapOutputFor(rustDagger);
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Scrap Metal');
    expect(canScrap(mk('Aetheric Helm', 'misc', ['armor', 'head', 'cloth']))).toBe(true);
  });

  it('refuses raw stock materials (would scrap into themselves)', () => {
    expect(canScrap(mk('Scrap Metal', 'misc', ['metal']))).toBe(false);
    expect(canScrap(mk('Stick', 'misc', ['wood']))).toBe(false);
    expect(canScrap(mk('Small Rock', 'misc', ['stone']))).toBe(false);
    expect(canScrap(mk('Aetheric Shard', 'misc', ['aether', 'crystal']))).toBe(false);
  });

  it('refuses quest-bound items', () => {
    expect(canScrap(mk('Sealed Crate', 'misc', ['quest']))).toBe(false);
  });

  // engine_Dev — unrecognized items (consumables, plain misc) no longer dead-end
  // at "nothing to break down"; they scrap into a random material from the pool.
  it('accepts unrecognized items (consumables / plain misc) so they never dead-end', () => {
    expect(canScrap(mk('Trail Rations', 'consumable'))).toBe(true);
    expect(canScrap(mk('Mystery Object', 'misc', []))).toBe(true);
    // These have NO tag-driven output — they take the random-material path.
    expect(hasTagScrapOutput(mk('Trail Rations', 'consumable'))).toBe(false);
    expect(hasTagScrapOutput(mk('Mystery Object', 'misc', []))).toBe(false);
  });
});

describe('engine_Dev — stock-material guard + random-material fallback', () => {
  it('isStockMaterial flags real pool materials, not gear', () => {
    expect(isStockMaterial(mk('Scrap Metal', 'misc', ['metal']))).toBe(true);
    expect(isStockMaterial(mk('Rusted Blade', 'weapon'))).toBe(false);
    expect(isStockMaterial(mk('Trail Rations', 'consumable'))).toBe(false);
  });

  it('randomMaterialScrap pulls a REAL name from the materials pool (never invented)', () => {
    const out = randomMaterialScrap();
    expect(out.grants.length).toBe(1);
    expect(out.grants[0]!.quantity).toBe(1);
    // The picked name must be a genuine, non-empty material name.
    expect(typeof out.grants[0]!.name).toBe('string');
    expect(out.grants[0]!.name.length).toBeGreaterThan(0);
    expect(out.summary).toBe(out.grants[0]!.name);
    expect(isStockMaterial(mk(out.grants[0]!.name, 'misc'))).toBe(true); // it IS a real pool material
  });

  it('realizeScrapOutput leaves real (built-in) materials untouched', () => {
    const out = realizeScrapOutput({ grants: [{ name: 'Scrap Metal', quantity: 2 }, { name: 'Stick', quantity: 1 }], summary: 'Scrap Metal x2, Stick' });
    const names = out.grants.map((g) => g.name).sort();
    expect(names).toEqual(['Scrap Metal', 'Stick']);
  });

  it('realizeScrapOutput swaps a PHANTOM material (not in this game\'s pool) for a real one', () => {
    const out = realizeScrapOutput({ grants: [{ name: 'Imaginarium Widget', quantity: 1 }], summary: 'Imaginarium Widget' });
    expect(out.grants.length).toBe(1);
    expect(out.grants[0]!.name).not.toBe('Imaginarium Widget');
    expect(isStockMaterial(mk(out.grants[0]!.name, 'misc'))).toBe(true); // real pool material
    expect(out.summary).toBe(out.grants[0]!.name);
  });

  it('pickRandomMaterial avoids immediate repeats across a run (pool is large enough)', () => {
    const picks: string[] = [];
    for (let i = 0; i < 8; i++) picks.push(randomMaterialScrap().grants[0]!.name);
    // No two consecutive picks identical (the built-in pool has many Commons).
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1]);
  });
});

describe('scrapOutputFor — every scrap yields at least one material', () => {
  it('weapons yield Scrap Metal + Stick by default', () => {
    const out = scrapOutputFor(mk('Rusted Blade', 'weapon', ['blade', 'metal']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Scrap Metal');
    expect(names).toContain('Stick');
  });

  it('armor yields Patched Cloth (and any tagged metal)', () => {
    const out = scrapOutputFor(mk('Patched Cuirass', 'armor', ['cloth']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Patched Cloth');
  });

  it('relics yield Aetheric Shard', () => {
    const out = scrapOutputFor(mk('Aetheric Locket', 'relic', ['aether']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Aetheric Shard');
  });

  it('stone-tagged improvised gear yields Small Rock', () => {
    const out = scrapOutputFor(mk('Cudgel', 'weapon', ['stone', 'improvised']));
    const names = out.grants.map((g) => g.name);
    expect(names).toContain('Small Rock');
  });

  it('untagged misc fallback gives Stick + Small Rock so the click is never wasted', () => {
    const out = scrapOutputFor(mk('Mystery Object', 'misc', []));
    expect(out.grants.length).toBeGreaterThan(0);
  });

  it('summary string lists every grant', () => {
    const out = scrapOutputFor(mk('Aetheric Torch', 'misc', ['metal', 'aether']));
    expect(out.summary.length).toBeGreaterThan(0);
    for (const g of out.grants) {
      expect(out.summary).toContain(g.name);
    }
  });

  it('de-dupes grants (two paths to Scrap Metal collapse to one)', () => {
    const out = scrapOutputFor(mk('Iron Blade', 'weapon', ['metal', 'blade', 'iron']));
    const scrapEntries = out.grants.filter((g) => g.name === 'Scrap Metal');
    expect(scrapEntries.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// OTA-443 — richer, rarity-scaled, representative, golem-geared scrap output
// ---------------------------------------------------------------------------

function mkR(name: string, kind: InventoryItem['kind'], rarity: InventoryItem['rarity'], tags: string[] = []): InventoryItem {
  return { id: `t_${name}`, name, kind, rarity, quantity: 1, tags };
}
const qty = (out: { grants: { name: string; quantity: number }[] }, name: string) =>
  out.grants.find((g) => g.name === name)?.quantity ?? 0;

describe('OTA-443 — scrap yields more, scaled by rarity, geared to crafting', () => {
  it('a Common metal weapon gives 2 Scrap Metal + a Stick (>=2 items)', () => {
    const out = scrapOutputFor(mkR('Iron Spear', 'weapon', 'Common', ['metal', 'blade', 'weapon']));
    expect(qty(out, 'Scrap Metal')).toBe(2);
    expect(qty(out, 'Stick')).toBe(1);
  });

  it('higher rarity yields strictly more of the primary material', () => {
    const common = scrapOutputFor(mkR('Blade', 'weapon', 'Common', ['metal', 'blade']));
    const rare = scrapOutputFor(mkR('Blade', 'weapon', 'Rare', ['metal', 'blade']));
    const legendary = scrapOutputFor(mkR('Blade', 'weapon', 'Legendary', ['metal', 'blade']));
    expect(qty(rare, 'Scrap Metal')).toBeGreaterThan(qty(common, 'Scrap Metal'));
    expect(qty(legendary, 'Scrap Metal')).toBeGreaterThan(qty(rare, 'Scrap Metal'));
  });

  it('a Rare+ metal piece yields a Golem Core (Iron-Golem fuel)', () => {
    const rare = scrapOutputFor(mkR('Iron Cuirass', 'armor', 'Rare', ['metal', 'plate', 'armor']));
    expect(qty(rare, 'Golem Core')).toBe(1);
    // A Common metal piece does NOT.
    const common = scrapOutputFor(mkR('Iron Cuirass', 'armor', 'Common', ['metal', 'plate', 'armor']));
    expect(qty(common, 'Golem Core')).toBe(0);
  });

  it('aether gear yields Aether Crystal (golem fuel) + Aether Dust on Uncommon+', () => {
    const out = scrapOutputFor(mkR('Aether Relic', 'relic', 'Rare', ['aether', 'crystal']));
    expect(qty(out, 'Aetheric Shard')).toBeGreaterThanOrEqual(2);
    expect(qty(out, 'Aether Crystal')).toBe(1);
    expect(qty(out, 'Aether Dust')).toBe(1);
  });

  it('mud/stone gear yields Mudstone (Mud-Golem fuel)', () => {
    const out = scrapOutputFor(mkR('Mudstone Maul', 'weapon', 'Uncommon', ['stone', 'mud', 'weapon']));
    expect(qty(out, 'Mudstone')).toBe(1);
  });

  it('OTA-447 — a mud-tagged-but-not-stone piece still yields Mudstone', () => {
    // Mud-Rend Blade is metal/mud/blade — no stone tag. Pre-fix it gave none.
    const out = scrapOutputFor(mkR('Mud-Rend Blade', 'weapon', 'Uncommon', ['metal', 'mud', 'blade']));
    expect(qty(out, 'Mudstone')).toBe(1);
    expect(qty(out, 'Scrap Metal')).toBeGreaterThanOrEqual(2); // still metal-representative
    expect(qty(out, 'Small Rock')).toBe(0); // not stone → no rock
  });

  it('stays REPRESENTATIVE — an iron spear never yields mud or aether mats', () => {
    const out = scrapOutputFor(mkR('Iron Spear', 'weapon', 'Rare', ['metal', 'blade', 'weapon']));
    const names = out.grants.map((g) => g.name);
    expect(names).not.toContain('Mudstone');
    expect(names).not.toContain('Aether Crystal');
    expect(names).not.toContain('Aetheric Shard');
  });

  it('preserves the OTA-423 guard — improvised weapons give no Scrap Metal', () => {
    const out = scrapOutputFor(mkR('Stick Club', 'weapon', 'Common', ['wood', 'improvised', 'weapon']));
    expect(qty(out, 'Scrap Metal')).toBe(0);
  });

  it('the new higher-tier mats cannot be re-scrapped (no loop)', () => {
    expect(canScrap(mkR('Golem Core', 'misc', 'Rare', ['construct', 'aether']))).toBe(false);
    expect(canScrap(mkR('Mudstone', 'misc', 'Rare', ['mud', 'stone']))).toBe(false);
    expect(canScrap(mkR('Aether Dust', 'misc', 'Common', ['aether', 'dust']))).toBe(false);
  });
});

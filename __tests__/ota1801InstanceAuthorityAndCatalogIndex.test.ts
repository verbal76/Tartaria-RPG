/* OTA-1801 — WHAT AN ITEM IS, ASKED ONCE.
 *
 * Two repairs, two proofs, one suite.
 *
 * PKG-1a — THE CATALOG INDEX. Eight static JSON catalogs (1,008 rows) were
 * searched by linear `.find()` / `.some()` on every identity question. They
 * are now indexed by lowercased name, ONCE, at module load. The index is NOT
 * a cache: it is built from frozen JSON that cannot change at runtime, it has
 * no eviction, no TTL, no invalidation and no lifetime. The proof obligation
 * is therefore EQUIVALENCE, not freshness — for every input the index must
 * answer exactly what the scan it replaced answered, INCLUDING first-wins on
 * duplicate names, which is `.find()`'s own rule.
 *
 * PKG-1b — INSTANCE AUTHORITY. A fused item carries its identity on the
 * instance (`uniqueStats`). Two consumers used to throw that away — they
 * mapped the inventory to `.name` and asked the catalogs to reconstruct what
 * the instance already knew. That is both slow (a miss is the most expensive
 * path: up to eight full scans, then inference) and WRONG (a generated name
 * that happened to match a catalog row would lend that row's effect to a
 * completely unrelated fused piece). The owner ruled: instance authority wins.
 *
 * ⚠ THE BEHAVIOUR CHANGE IS PINNED EXPLICITLY IN SECTION E5/E6. It is not
 * reachable by any name the deterministic namer can currently produce — the
 * collision census enumerated that space exhaustively (1,144 names) against
 * all 1,008 catalog names and found ZERO exact collisions. The change closes
 * the hole the unbounded forge/LLM name space could otherwise walk into.
 *
 * ⚠ WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT: speed. Timing lives in the
 * performance matrix, which is not a blocking test — a shared CI runner is not
 * a place to assert milliseconds.
 */

import {
  WEAPONS,
  ARMOR,
  AMULETS,
  RINGS,
  MATERIALS,
  EXPLORATION,
  GEAR,
  DOG_GEAR,
  _catalogIndexesForTest,
  _indexByNameForTest,
  findWeaponByName,
  findArmorByName,
  findAmuletByName,
  findRingByName,
  findMaterialByName,
  findExplorationItemByName,
  findGearByName,
  fuzzyFindWeapon,
  fuzzyFindArmor,
} from '../app/engine/crafting';
import {
  itemCarriesOwnIdentity,
  aggregateInventoryPassivesFromItems,
  inventoryHasGateFromItems,
  aggregateInventoryPassives,
  inventoryHasGate,
  type EffectResolver,
} from '../app/engine/itemEffect';

/* The EFFECT_RESOLVERS list inside equipment.ts is module-private. This is a
 * byte-for-byte copy of its ORDER (exploration → armor → gear → materials →
 * amulets → rings). The differential tests below compare the item-aware helper
 * against the name-based one THROUGH THE SAME LIST, so the comparison isolates
 * exactly one variable: whether the instance was kept or discarded. */
const RESOLVERS: EffectResolver[] = [
  (n) => findExplorationItemByName(n),
  (n) => findArmorByName(n),
  (n) => findGearByName(n),
  (n) => findMaterialByName(n),
  (n) => findAmuletByName(n),
  (n) => findRingByName(n),
];

/* The SLOT precedence chain is a DIFFERENT order (weapon → armor → amulet →
 * ring → shield) and lives in equipment.ts. It is named here only so a future
 * reader does not "simplify" the two into one list. They are not the same. */

type Catalog = { label: string; rows: ReadonlyArray<{ name: string }>; index: ReadonlyMap<string, { name: string }> };

const CATALOGS: Catalog[] = [
  { label: 'weapons', rows: WEAPONS, index: _catalogIndexesForTest.weapons },
  { label: 'armor', rows: ARMOR, index: _catalogIndexesForTest.armor },
  { label: 'amulets', rows: AMULETS, index: _catalogIndexesForTest.amulets },
  { label: 'rings', rows: RINGS, index: _catalogIndexesForTest.rings },
  { label: 'materials', rows: MATERIALS, index: _catalogIndexesForTest.materials },
  { label: 'exploration', rows: EXPLORATION, index: _catalogIndexesForTest.exploration },
  { label: 'gear', rows: GEAR, index: _catalogIndexesForTest.gear },
  { label: 'dogGear', rows: DOG_GEAR, index: _catalogIndexesForTest.dogGear },
];

/** The exact expression the indexed code replaced. Kept verbatim so the
 *  differential is against the real prior behaviour, not a paraphrase of it. */
function linearScan(rows: ReadonlyArray<{ name: string }>, t: string): { name: string } | null {
  return rows.find((r) => r.name.toLowerCase() === t) ?? null;
}

describe('OTA-1801 §A — the index answers exactly what the scan answered', () => {
  it.each(CATALOGS.map((c) => [c.label, c] as const))(
    '%s: every authored row resolves to the SAME OBJECT the scan returned',
    (_label, cat) => {
      for (const row of cat.rows) {
        const t = row.name.toLowerCase();
        expect(cat.index.get(t)).toBe(linearScan(cat.rows, t));
      }
    },
  );

  it.each(CATALOGS.map((c) => [c.label, c] as const))(
    '%s: the index is a Map — no prototype key can masquerade as a row',
    (_label, cat) => {
      expect(cat.index).toBeInstanceOf(Map);
      // A plain object would answer these with inherited members. A Map does not.
      for (const hostile of ['__proto__', 'constructor', 'tostring', 'hasownproperty', 'valueof']) {
        expect(cat.index.get(hostile) ?? null).toBe(linearScan(cat.rows, hostile));
      }
    },
  );

  it.each(CATALOGS.map((c) => [c.label, c] as const))(
    '%s: every row name is a real string, so String(name) is a no-op',
    (_label, cat) => {
      for (const row of cat.rows) {
        expect(typeof row.name).toBe('string');
        expect(String(row.name)).toBe(row.name);
      }
    },
  );

  it.each(CATALOGS.map((c) => [c.label, c] as const))(
    '%s: index size equals the count of DISTINCT lowercased names (duplicates collapse first-wins)',
    (_label, cat) => {
      const distinct = new Set(cat.rows.map((r) => r.name.toLowerCase()));
      expect(cat.index.size).toBe(distinct.size);
    },
  );

  it('the catalog population is the one the census measured', () => {
    const total = CATALOGS.reduce((n, c) => n + c.rows.length, 0);
    // Not a magic number: this pins the surface the equivalence proof covers.
    // If a catalog grows, this suite must be re-read, not silently widened.
    expect(total).toBe(1008);
    expect(CATALOGS).toHaveLength(8);
  });

  /* ⚠⚠⚠ THIS TEST EXISTS BECAUSE A NEGATIVE CONTROL PASSED.
   *
   * NC-2 flipped the builder from first-wins to last-wins and the whole suite
   * stayed GREEN. The reason is not that the rule doesn't matter — it is that
   * all 1,008 static rows carry 1,008 DISTINCT names, so no catalog contains a
   * duplicate and the two rules build identical Maps. The equivalence tests
   * above therefore cannot see the difference, and never could.
   *
   * So the rule is proven DIRECTLY, on a synthetic catalog that does contain a
   * duplicate. The day an author lands a duplicate name — and `.find()` would
   * quietly keep the first — this is already pinned. */
  it('the BUILDER is first-wins, proven on a duplicate the real catalogs do not have', () => {
    const first = { name: 'Twin Name', tag: 'first' };
    const second = { name: 'twin name', tag: 'second' }; // same key, different case
    const third = { name: 'TWIN NAME', tag: 'third' };
    const rows = [first, second, third, { name: 'Other', tag: 'other' }];
    const idx = _indexByNameForTest(rows);
    expect(idx.size).toBe(2);
    // `.find()` returns the FIRST match. The index must return the same object.
    expect(idx.get('twin name')).toBe(first);
    expect(idx.get('twin name')).toBe(rows.find((r) => r.name.toLowerCase() === 'twin name'));
    expect(idx.get('twin name')!.tag).toBe('first');
  });

  it('the builder lowercases the key and tolerates a non-string name without throwing', () => {
    const odd = [{ name: 'Mixed Case Row' }, { name: 42 as unknown as string }];
    const idx = _indexByNameForTest(odd);
    expect(idx.get('mixed case row')).toBe(odd[0]);
    expect(idx.get('42')).toBe(odd[1]);
  });

  it('no static name appears in two catalogs (the premise both precedence chains rely on)', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const cat of CATALOGS) {
      for (const row of cat.rows) {
        const t = row.name.toLowerCase();
        const prior = seen.get(t);
        if (prior && prior !== cat.label) collisions.push(`${row.name}: ${prior} + ${cat.label}`);
        else seen.set(t, cat.label);
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe('OTA-1801 §B — differential over a hostile corpus', () => {
  /* Every catalog name, plus case/whitespace variants of a sample, plus the
   * strings most likely to break an object-backed index, plus names that are
   * in no catalog at all. For each, the index and the scan must agree. */
  const corpus: string[] = (() => {
    const out = new Set<string>();
    for (const cat of CATALOGS) {
      for (const row of cat.rows) {
        out.add(row.name.toLowerCase());
        out.add(row.name.toUpperCase().toLowerCase());
      }
    }
    for (const hostile of [
      '__proto__', 'constructor', 'prototype', 'tostring', 'valueof', 'hasownproperty',
      '', ' ', '0', 'null', 'undefined', 'nan', 'true',
      'no such item anywhere', 'resonant cleaver', 'sword', 'a',
    ]) out.add(hostile);
    return [...out];
  })();

  it.each(CATALOGS.map((c) => [c.label, c] as const))(
    '%s: index.get(t) ?? null === scan(t) for every corpus input',
    (_label, cat) => {
      let checked = 0;
      for (const t of corpus) {
        expect(cat.index.get(t) ?? null).toBe(linearScan(cat.rows, t));
        checked++;
      }
      expect(checked).toBe(corpus.length);
      expect(checked).toBeGreaterThan(1000);
    },
  );
});

describe('OTA-1801 §C — the public resolvers still resolve, and still refuse', () => {
  it('every weapon name resolves to its own row', () => {
    for (const w of WEAPONS) expect(findWeaponByName(w.name)?.name).toBe(w.name);
  });
  it('every armor name resolves to its own row', () => {
    for (const a of ARMOR) expect(findArmorByName(a.name)?.name).toBe(a.name);
  });
  it('every amulet / ring / material / exploration / gear name resolves to its own row', () => {
    for (const x of AMULETS) expect(findAmuletByName(x.name)?.name).toBe(x.name);
    for (const x of RINGS) expect(findRingByName(x.name)?.name).toBe(x.name);
    for (const x of MATERIALS) expect(findMaterialByName(x.name)?.name).toBe(x.name);
    for (const x of EXPLORATION) expect(findExplorationItemByName(x.name)?.name).toBe(x.name);
    for (const x of GEAR) expect(findGearByName(x.name)?.name).toBe(x.name);
  });

  it('the cross-catalog guard still refuses: a weapon name is never armor, and vice versa', () => {
    for (const w of WEAPONS) expect(findArmorByName(w.name)).toBeNull();
    for (const a of ARMOR) expect(findWeaponByName(a.name)).toBeNull();
  });

  it('exploration / material / gear names are never promoted into weapons or armor', () => {
    for (const rows of [EXPLORATION, MATERIALS, GEAR]) {
      for (const x of rows) {
        expect(findWeaponByName(x.name)).toBeNull();
        expect(findArmorByName(x.name)).toBeNull();
      }
    }
  });

  it('case and surrounding whitespace resolve the same as the authored spelling', () => {
    const w = WEAPONS[0]!.name;
    expect(findWeaponByName(w.toUpperCase())?.name).toBe(w);
    expect(findWeaponByName(`  ${w}  `)?.name).toBe(w);
    expect(findWeaponByName(w.toLowerCase())?.name).toBe(w);
  });

  it('the empty name resolves to nothing everywhere', () => {
    for (const f of [findWeaponByName, findArmorByName, findAmuletByName, findRingByName,
                     findMaterialByName, findExplorationItemByName, findGearByName]) {
      expect(f('')).toBeNull();
      expect(f('   ')).toBeNull();
    }
  });

  it('fuzzy lookups still prefer the exact row before falling back to substring', () => {
    const w = WEAPONS[0]!;
    expect(fuzzyFindWeapon(w.name)).toBe(w);
    const a = ARMOR[0]!;
    expect(fuzzyFindArmor(a.name)).toBe(a);
  });
});

describe('OTA-1801 §D — the inference fallback is untouched', () => {
  /* The index replaced ONE STEP: the exact-match lookup. The guard that runs
   * after it and the inference that runs after THAT were not indexed and must
   * still fire. "Resonant Cleaver" is the census's own specimen: it is in no
   * catalog, but it READS as a weapon, so inference promotes it. */
  it('a catalog-absent name that reads as a weapon is still inferred, not refused', () => {
    expect(_catalogIndexesForTest.weapons.has('resonant cleaver')).toBe(false);
    const inferred = findWeaponByName('Resonant Cleaver');
    expect(inferred).not.toBeNull();
    expect(WEAPONS.some((w) => w.name === 'Resonant Cleaver')).toBe(false);
  });

  it('a catalog-absent name that reads like nothing is still refused', () => {
    expect(findWeaponByName('Quiet Afternoon')).toBeNull();
    expect(findAmuletByName('Quiet Afternoon')).toBeNull();
    expect(findRingByName('Quiet Afternoon')).toBeNull();
  });

  it('accessory inference still keys on its own vocabulary', () => {
    expect(findAmuletByName('Whispering Pendant')).not.toBeNull();
    expect(findRingByName('Whispering Signet')).not.toBeNull();
    expect(findAmuletByName('Whispering Signet')).toBeNull();
  });

  it('the closed catalogs still have NO inference fallback', () => {
    for (const f of [findMaterialByName, findExplorationItemByName, findGearByName]) {
      expect(f('Resonant Cleaver')).toBeNull();
      expect(f('Whispering Pendant')).toBeNull();
    }
  });
});

/* ── PKG-1b fixtures ─────────────────────────────────────────────────────── */

type TestItem = { name: string; uniqueStats?: unknown };

const ORDINARY_PASSIVE: TestItem = { name: 'Mapping Device' };          // exploration → intelligence +1
const ORDINARY_PASSIVE_2: TestItem = { name: 'Basic Tent' };            // exploration → wisdom +1
const ORDINARY_PASSIVE_BIG: TestItem = { name: 'Aetheric Sentinel Lantern' }; // exploration → wisdom +2
const GEAR_PASSIVE: TestItem = { name: 'Aetheric Compass' };            // gear → wisdom +1
const ORDINARY_GATE: TestItem = { name: 'Climbing Rope' };              // gear → climb_steep
const EXPLORATION_GATE: TestItem = { name: 'Aetheric Beacon' };         // exploration → detect_aether
const ARMOR_GATE: TestItem = { name: 'Aetheric Mask' };                 // armor → breathe_toxic

/** A fused instance as the Crucible actually mints one: generated name, own
 *  `uniqueStats`, `fused`/`unique` tags. The NAME here is deliberately the
 *  name of a passive-granting catalog row — the collision the owner ruled on. */
const FUSED_WEARING_A_CATALOG_NAME: TestItem = {
  name: 'Mapping Device',
  uniqueStats: { kind: 'weapon', rarity: 'Legendary', durability: 40, damageDice: '1d8', damageType: 'slashing' },
};

const FUSED_WEARING_A_GATE_NAME: TestItem = {
  name: 'Climbing Rope',
  uniqueStats: { kind: 'weapon', rarity: 'Rare', durability: 30, damageDice: '1d6', damageType: 'bludgeoning' },
};

const FUSED_ORDINARY: TestItem = {
  name: 'Resonant Cleaver of the Ninth Hour',
  uniqueStats: { kind: 'weapon', rarity: 'Epic', durability: 55, damageDice: '1d10', damageType: 'slashing' },
};

describe('OTA-1801 §E — instance authority', () => {
  it('E1 itemCarriesOwnIdentity is true only when the instance actually carries uniqueStats', () => {
    expect(itemCarriesOwnIdentity(FUSED_ORDINARY)).toBe(true);
    expect(itemCarriesOwnIdentity(ORDINARY_PASSIVE)).toBe(false);
    // The signature asks for the ONLY field it reads. That narrowness is
    // deliberate: the helper must not be able to consult anything else.
    expect(itemCarriesOwnIdentity({ uniqueStats: undefined })).toBe(false);
    expect(itemCarriesOwnIdentity({ uniqueStats: null })).toBe(false);
    expect(itemCarriesOwnIdentity({})).toBe(false);
    expect(itemCarriesOwnIdentity(null)).toBe(false);
    expect(itemCarriesOwnIdentity(undefined)).toBe(false);
  });

  it('E2 an all-ordinary inventory sums IDENTICALLY to the name-based helper', () => {
    const items = [ORDINARY_PASSIVE, ORDINARY_PASSIVE_2, GEAR_PASSIVE, ORDINARY_GATE, ARMOR_GATE];
    expect(aggregateInventoryPassivesFromItems(items, RESOLVERS))
      .toEqual(aggregateInventoryPassives(items.map((i) => i.name), RESOLVERS));
  });

  it('E2b the differential holds across EVERY effect-bearing catalog row, one at a time', () => {
    let covered = 0;
    for (const rows of [EXPLORATION, GEAR, MATERIALS, ARMOR, AMULETS, RINGS]) {
      for (const row of rows) {
        const one: TestItem[] = [{ name: row.name }];
        expect(aggregateInventoryPassivesFromItems(one, RESOLVERS))
          .toEqual(aggregateInventoryPassives([row.name], RESOLVERS));
        covered++;
      }
    }
    expect(covered).toBe(EXPLORATION.length + GEAR.length + MATERIALS.length + ARMOR.length + AMULETS.length + RINGS.length);
  });

  it('E3 the per-stat cap and first-wins stacking are unchanged', () => {
    // wisdom +1, +1, +2 → capped at PASSIVE_STAT_CAP (2), contributors in order.
    const items = [ORDINARY_PASSIVE_2, GEAR_PASSIVE, ORDINARY_PASSIVE_BIG];
    const viaItems = aggregateInventoryPassivesFromItems(items, RESOLVERS);
    expect(viaItems).toEqual(aggregateInventoryPassives(items.map((i) => i.name), RESOLVERS));
    expect(viaItems.wisdom).toBe(2);
  });

  it('E4 gates resolve identically for ordinary items, through each caller\'s own resolver order', () => {
    const items = [ORDINARY_GATE, EXPLORATION_GATE, ARMOR_GATE];
    for (const gate of ['climb_steep', 'detect_aether', 'breathe_toxic', 'fly'] as const) {
      expect(inventoryHasGateFromItems(items, gate, RESOLVERS))
        .toBe(inventoryHasGate(items.map((i) => i.name), gate, RESOLVERS));
    }
    // The climb callers use a SHORTER, DIFFERENT list. It must keep its own answer.
    const climbResolvers: EffectResolver[] = [
      (n) => findGearByName(n),
      (n) => findMaterialByName(n),
      (n) => findExplorationItemByName(n),
    ];
    expect(inventoryHasGateFromItems(items, 'climb_steep', climbResolvers)).toBe(true);
    // …and that list genuinely cannot see armor, which is why it is a separate list.
    expect(inventoryHasGateFromItems([ARMOR_GATE], 'breathe_toxic', climbResolvers)).toBe(false);
    expect(inventoryHasGateFromItems([ARMOR_GATE], 'breathe_toxic', RESOLVERS)).toBe(true);
  });

  /* ⚠⚠⚠ E5/E6 PIN THE DELIBERATE BEHAVIOUR CHANGE. Read the banner at the top
   * of this file before touching either. A fused instance does not borrow a
   * catalog row's effect just because its generated name happened to match. */
  it('E5 a fused instance does NOT lend itself a catalog row\'s passive by name', () => {
    const byName = aggregateInventoryPassives([FUSED_WEARING_A_CATALOG_NAME.name], RESOLVERS);
    const byItem = aggregateInventoryPassivesFromItems([FUSED_WEARING_A_CATALOG_NAME], RESOLVERS);
    expect(byName).toEqual({ intelligence: 1 }); // what the OLD path did
    expect(byItem).toEqual({});                  // what instance authority does
  });

  it('E6 a fused instance does NOT unlock a gate by name', () => {
    expect(inventoryHasGate([FUSED_WEARING_A_GATE_NAME.name], 'climb_steep', RESOLVERS)).toBe(true);
    expect(inventoryHasGateFromItems([FUSED_WEARING_A_GATE_NAME], 'climb_steep', RESOLVERS)).toBe(false);
  });

  it('E7 an ordinary item sitting NEXT TO a fused one is unaffected', () => {
    const mixed = [FUSED_ORDINARY, ORDINARY_PASSIVE, FUSED_WEARING_A_GATE_NAME, GEAR_PASSIVE, ORDINARY_GATE];
    expect(aggregateInventoryPassivesFromItems(mixed, RESOLVERS))
      .toEqual({ intelligence: 1, wisdom: 1 });
    // The real Climbing Rope is still in the pack and still unlocks the climb.
    expect(inventoryHasGateFromItems(mixed, 'climb_steep', RESOLVERS)).toBe(true);
  });

  it('E8 an empty inventory, and one made entirely of fused pieces, answer safely', () => {
    expect(aggregateInventoryPassivesFromItems([], RESOLVERS)).toEqual({});
    expect(inventoryHasGateFromItems([], 'climb_steep', RESOLVERS)).toBe(false);
    const allFused = [FUSED_ORDINARY, FUSED_WEARING_A_CATALOG_NAME, FUSED_WEARING_A_GATE_NAME];
    expect(aggregateInventoryPassivesFromItems(allFused, RESOLVERS)).toEqual({});
    expect(inventoryHasGateFromItems(allFused, 'climb_steep', RESOLVERS)).toBe(false);
  });

  it('E9 CATALOG MISS != INVALID ITEM — a catalog-absent ORDINARY item is asked, and answers nothing', () => {
    // No uniqueStats, no catalog row. It still goes through the resolvers (it is
    // not short-circuited), and contributes nothing because nothing matched.
    const stranger: TestItem = { name: 'Resonant Cleaver of the Ninth Hour' };
    expect(itemCarriesOwnIdentity(stranger)).toBe(false);
    expect(aggregateInventoryPassivesFromItems([stranger], RESOLVERS))
      .toEqual(aggregateInventoryPassives([stranger.name], RESOLVERS));
    expect(aggregateInventoryPassivesFromItems([stranger], RESOLVERS)).toEqual({});
  });

  it('E10 an old save lacking uniqueStats behaves exactly as it did before this OTA', () => {
    // A pre-OTA fused row persisted without uniqueStats reads as ordinary. That
    // is the PRE-OTA behaviour and is preserved, not "repaired" behind the
    // player's back.
    const legacy: TestItem = { name: 'Mapping Device' };
    expect(aggregateInventoryPassivesFromItems([legacy], RESOLVERS)).toEqual({ intelligence: 1 });
  });
});

describe('OTA-1801 §F — the index cannot be mutated through an item', () => {
  it('F1 the exported indexes hand back the catalog rows themselves, and the catalogs are the module\'s own', () => {
    // This is the honest statement of the boundary: the index stores REFERENCES
    // to the same row objects the arrays hold, exactly as `.find()` returned
    // them. Indexing introduced no new sharing — a caller that mutated a row
    // before this OTA mutated the same object it mutates now.
    for (const cat of CATALOGS) {
      for (const row of cat.rows.slice(0, 5)) {
        expect(cat.index.get(row.name.toLowerCase())).toBe(row);
      }
    }
  });

  it('F2 an inventory instance is never the catalog row it resolved from', () => {
    const row = findExplorationItemByName('Mapping Device');
    expect(row).not.toBeNull();
    const instance: TestItem = { name: 'Mapping Device' };
    expect(instance).not.toBe(row);
    // Mutating the instance does not reach the index.
    (instance as { quantity?: number }).quantity = 99;
    expect((findExplorationItemByName('Mapping Device') as unknown as { quantity?: number }).quantity)
      .toBeUndefined();
  });
});

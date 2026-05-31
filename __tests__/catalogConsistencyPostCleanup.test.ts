// Post-OTA-140 stress: catalog consistency under random lookup chaos.
//
// Hammers the eight find* catalog functions with 500 randomized name
// lookups drawn from the actual catalog inventory (plus a few negative
// controls) and asserts the invariants the cleanup OTAs locked in:
//
//   • OTA-110 / OTA-136 — no false inferred-stats warnings ever
//     surface for items that are catalogued in any of the 8 buckets.
//   • OTA-134 — no duplicate names within a single catalog file
//     (Aetheric Shield rename).
//   • OTA-135 — no duplicate names across catalog files (5 cross-
//     file dups removed from exploration.json).
//   • Every find* returns either null OR the canonical entry — never
//     a garbage object with mismatched name.
//
// Iteration cap: 500 lookups (documented), single-pass.

import {
  AMULETS,
  ARMOR,
  DOG_GEAR,
  EXPLORATION,
  GEAR,
  MATERIALS,
  RINGS,
  WEAPONS,
  findAmuletByName,
  findArmorByName,
  findDogGearByName,
  findExplorationItemByName,
  findGearByName,
  findMaterialByName,
  findRingByName,
  findWeaponByName,
} from '../app/engine/crafting';
import { setOnInferred } from '../app/engine/itemDefaults';

jest.setTimeout(15000);

type FindFn = (n: string) => { name: string } | null | undefined;

const FIND_FNS: Array<{ label: string; fn: FindFn }> = [
  { label: 'findWeaponByName', fn: findWeaponByName as FindFn },
  { label: 'findArmorByName', fn: findArmorByName as FindFn },
  { label: 'findAmuletByName', fn: findAmuletByName as FindFn },
  { label: 'findRingByName', fn: findRingByName as FindFn },
  { label: 'findMaterialByName', fn: findMaterialByName as FindFn },
  { label: 'findExplorationItemByName', fn: findExplorationItemByName as FindFn },
  { label: 'findGearByName', fn: findGearByName as FindFn },
  { label: 'findDogGearByName', fn: (n: string) => findDogGearByName(n) ?? null },
];

function allCatalogNames(): string[] {
  return [
    ...WEAPONS.map((w) => w.name),
    ...ARMOR.map((a) => a.name),
    ...AMULETS.map((a) => a.name),
    ...RINGS.map((r) => r.name),
    ...MATERIALS.map((m) => m.name),
    ...EXPLORATION.map((e) => e.name),
    ...GEAR.map((g) => g.name),
    ...DOG_GEAR.map((d) => d.name),
  ];
}

// Seeded pseudo-random so the chaos run is reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('catalog consistency under 500-lookup chaos (post-cleanup)', () => {
  let inferredCalls: string[] = [];
  beforeAll(() => {
    inferredCalls = [];
    setOnInferred((label: string) => inferredCalls.push(label));
  });
  afterAll(() => {
    setOnInferred(null);
  });
  beforeEach(() => {
    inferredCalls = [];
  });

  it('500 random lookups against catalogued names: 0 inference fires, every hit returns canonical entry', () => {
    const names = allCatalogNames();
    const rand = mulberry32(0xC0FFEE);
    const ITERATIONS = 500; // cap per task spec
    for (let i = 0; i < ITERATIONS; i++) {
      const name = names[Math.floor(rand() * names.length)]!;
      const finder = FIND_FNS[Math.floor(rand() * FIND_FNS.length)]!;
      const result = finder.fn(name);
      // The result is either null (this find* doesn't own this kind)
      // or a real catalog entry whose name matches (case-insensitively)
      // what we asked for.
      if (result) {
        expect(typeof result.name).toBe('string');
        expect(result.name.toLowerCase()).toBe(name.toLowerCase());
      }
    }
    // OTA-110/136 invariant: no inferred-stats event for ANY catalogued
    // item, period. Every match in inferredCalls would be a regression.
    const catalogNamesLower = new Set(names.map((n) => n.toLowerCase()));
    const offenders = inferredCalls.filter((label) => {
      const head = label.split(' —')[0]?.trim().toLowerCase() ?? '';
      return catalogNamesLower.has(head);
    });
    expect(offenders).toEqual([]);
  });

  it('every uncatalogued garbage name returns null (no false promotion) — except weapon-noun inference', () => {
    const rand = mulberry32(0xDEAD);
    // 50 garbage strings (cap well below 500 — keeps test fast)
    for (let i = 0; i < 50; i++) {
      const garbage = `Zglorp${Math.floor(rand() * 1e6)}Xqz`;
      for (const { label, fn } of FIND_FNS) {
        const result = fn(garbage);
        // findWeaponByName has an inference fallback for names that
        // READ as weapons; "Zglorp...Xqz" doesn't, so all 8 should
        // return null.
        if (result) {
          throw new Error(`${label}("${garbage}") returned non-null: ${JSON.stringify(result)}`);
        }
      }
    }
  });

  it('OTA-134 invariant — no duplicate names WITHIN any single catalog file', () => {
    const buckets: Array<{ source: string; items: ReadonlyArray<{ name: string }> }> = [
      { source: 'weapons', items: WEAPONS },
      { source: 'armor', items: ARMOR },
      { source: 'amulets', items: AMULETS },
      { source: 'rings', items: RINGS },
      { source: 'materials', items: MATERIALS },
      { source: 'exploration', items: EXPLORATION },
      { source: 'gear', items: GEAR },
      { source: 'dogGear', items: DOG_GEAR },
    ];
    const offenders: Array<{ source: string; name: string }> = [];
    for (const { source, items } of buckets) {
      const seen = new Set<string>();
      for (const it of items) {
        const key = it.name.toLowerCase();
        if (seen.has(key)) offenders.push({ source, name: it.name });
        seen.add(key);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('OTA-135 invariant — no duplicate names ACROSS catalog files', () => {
    const all: Array<{ name: string; source: string }> = [];
    for (const w of WEAPONS) all.push({ name: w.name, source: 'weapons' });
    for (const a of ARMOR) all.push({ name: a.name, source: 'armor' });
    for (const a of AMULETS) all.push({ name: a.name, source: 'amulets' });
    for (const r of RINGS) all.push({ name: r.name, source: 'rings' });
    for (const m of MATERIALS) all.push({ name: m.name, source: 'materials' });
    for (const e of EXPLORATION) all.push({ name: e.name, source: 'exploration' });
    for (const g of GEAR) all.push({ name: g.name, source: 'gear' });
    for (const d of DOG_GEAR) all.push({ name: d.name, source: 'dogGear' });
    const byName = new Map<string, Set<string>>();
    for (const { name, source } of all) {
      const k = name.toLowerCase();
      if (!byName.has(k)) byName.set(k, new Set());
      byName.get(k)!.add(source);
    }
    const dups: Array<{ name: string; sources: string[] }> = [];
    for (const [name, sources] of byName.entries()) {
      if (sources.size > 1) dups.push({ name, sources: Array.from(sources) });
    }
    expect(dups).toEqual([]);
  });

  it('500-lookup chaos: case-insensitivity holds — UPPER, lower, MiXeD all resolve identically', () => {
    const names = allCatalogNames();
    const rand = mulberry32(0xBEEF);
    const ITERATIONS = 500;
    for (let i = 0; i < ITERATIONS; i++) {
      const name = names[Math.floor(rand() * names.length)]!;
      const finder = FIND_FNS[Math.floor(rand() * FIND_FNS.length)]!;
      const baseline = finder.fn(name);
      const upper = finder.fn(name.toUpperCase());
      const lower = finder.fn(name.toLowerCase());
      // Either all three are null, or all three resolved to the same
      // canonical row (compare by name).
      const baseName = baseline?.name ?? null;
      expect(upper?.name ?? null).toBe(baseName);
      expect(lower?.name ?? null).toBe(baseName);
    }
  });

  it('whitespace + empty string lookups return null cleanly across all 8 finders', () => {
    const garbage = ['', ' ', '   ', '\t', '\n', '\r\n', ' \t \n '];
    for (const g of garbage) {
      for (const { label, fn } of FIND_FNS) {
        const r = fn(g);
        if (r) throw new Error(`${label}("${JSON.stringify(g)}") returned non-null: ${JSON.stringify(r)}`);
      }
    }
  });

  it('OTA-136 lock — no inferred fires across a randomised name shuffle of the catalog', () => {
    const names = allCatalogNames();
    // Shuffle deterministically
    const rand = mulberry32(0x1234);
    const shuffled = [...names].sort(() => rand() - 0.5);
    for (const n of shuffled) {
      findWeaponByName(n);
      findArmorByName(n);
      findAmuletByName(n);
      findRingByName(n);
    }
    const catalogNamesLower = new Set(names.map((n) => n.toLowerCase()));
    const offenders = inferredCalls.filter((label) => {
      const head = label.split(' —')[0]?.trim().toLowerCase() ?? '';
      return catalogNamesLower.has(head);
    });
    expect(offenders).toEqual([]);
  });
});

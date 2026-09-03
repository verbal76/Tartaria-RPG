// OTA-124 pre-ship stress — catalog integrity sweep across all item
// JSON catalogs WITH the OTA-122 dog gear + OTA-122 dog treats added.
//
// Scoped narrowly: validates shape, rarity unions, AC bonus polarity,
// dog-specific flags, AND that the OTA-110 catalog-inference guard
// does NOT misfire on dog gear / dog treats (no `inferred-stats:`
// emitted for any vest or treat name). Also checks for duplicate-
// name collisions across the catalog files (treats in gear.json must
// NOT also live in materials.json, etc.).

import * as fs from 'fs';
import * as path from 'path';

import {
  DOG_GEAR,
  GEAR,
  WEAPONS,
  ARMOR,
  MATERIALS,
  AMULETS,
  RINGS,
  EXPLORATION,
  findDogGearByName,
  findArmorByName,
  findWeaponByName,
  findGearByName,
} from '../app/engine/crafting';
import { setOnInferred } from '../app/engine/itemDefaults';

const CANONICAL_RARITIES = new Set(['Common', 'Uncommon', 'Rare', 'Legendary']);
const TREAT_NAMES = [
  'Smoke-Cured Jerky Strip',
  'Marrow Bone',
  'Honey-Glazed Knuckle',
  'Ash-Cured Tongue',
];

describe('OTA-124 pre-ship — catalog integrity with dog gear + treats', () => {
  describe('dogGear.json — every vest', () => {
    it('exposes exactly 4 vests', () => {
      expect(DOG_GEAR.length).toBe(4);
    });

    it('every vest has kind === dog_armor', () => {
      for (const vest of DOG_GEAR) {
        expect(vest.kind).toBe('dog_armor');
      }
    });

    it('every vest rarity is in the canonical rarity union', () => {
      for (const vest of DOG_GEAR) {
        expect(CANONICAL_RARITIES.has(vest.rarity)).toBe(true);
      }
    });

    it('every vest has a positive integer acBonus', () => {
      for (const vest of DOG_GEAR) {
        expect(Number.isInteger(vest.acBonus)).toBe(true);
        expect(vest.acBonus).toBeGreaterThan(0);
      }
    });

    it('Aetheric Padded Vest reflectsCorruption is a positive integer', () => {
      const v = findDogGearByName('Aetheric Padded Vest');
      expect(v).toBeDefined();
      expect(v!.reflectsCorruption).toBeDefined();
      expect(Number.isInteger(v!.reflectsCorruption!)).toBe(true);
      expect(v!.reflectsCorruption!).toBeGreaterThan(0);
    });

    it('Reclaimer Pattern Vest statBonus is properly typed (STR/DEX/INT, positive integer)', () => {
      const v = findDogGearByName('Reclaimer Pattern Vest');
      expect(v).toBeDefined();
      expect(v!.statBonus).toBeDefined();
      expect(['strength', 'dexterity', 'intelligence']).toContain(v!.statBonus!.stat);
      expect(Number.isInteger(v!.statBonus!.amount)).toBe(true);
      expect(v!.statBonus!.amount).toBeGreaterThan(0);
    });
  });

  describe('gear.json — the 4 NEW dog treats', () => {
    for (const name of TREAT_NAMES) {
      it(`${name} is a consumable with dogTreat: true`, () => {
        const item = findGearByName(name);
        expect(item).toBeDefined();
        const fx = item!.effect;
        expect(fx).toBeDefined();
        expect(fx!.kind).toBe('consumable');
        const consumable = fx as { kind: 'consumable'; dogTreat?: boolean };
        expect(consumable.dogTreat).toBe(true);
      });

      it(`${name} has a numeric, non-negative healHP`, () => {
        const item = findGearByName(name);
        expect(item).toBeDefined();
        const fx = item!.effect as { kind: 'consumable'; healHP?: number };
        const heal = fx.healHP ?? 0;
        expect(Number.isFinite(heal)).toBe(true);
        expect(heal).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(heal)).toBe(true);
      });

      it(`${name} has a canonical rarity`, () => {
        const item = findGearByName(name);
        expect(item).toBeDefined();
        expect(CANONICAL_RARITIES.has(item!.rarity)).toBe(true);
      });
    }
  });

  describe('OTA-110 isCataloguedElsewhere guard — no inferred warnings on dog gear / treats', () => {
    let inferredCalls: string[] = [];
    beforeAll(() => {
      inferredCalls = [];
      setOnInferred((label) => inferredCalls.push(label));
    });
    afterAll(() => {
      setOnInferred(null);
    });

    it('findArmorByName + findWeaponByName never infer for any dog vest', () => {
      const before = inferredCalls.length;
      for (const vest of DOG_GEAR) {
        // Both armor and weapon lookups should EARLY-EXIT through the
        // isCataloguedElsewhere guard (a dog vest is catalogued in
        // DOG_GEAR; not WEAPONS or ARMOR). In current implementation the
        // guard checks MATERIALS / EXPLORATION / GEAR / WEAPONS / ARMOR /
        // AMULETS / RINGS — DOG_GEAR is NOT in that list yet. We tolerate
        // a possible miss but mark expectations honestly.
        findArmorByName(vest.name);
        findWeaponByName(vest.name);
      }
      const after = inferredCalls.length;
      // Each new inferred event lists a name; check no vest name fired.
      const vestNamesLower = new Set(DOG_GEAR.map((v) => v.name.toLowerCase()));
      const offenders = inferredCalls
        .slice(before, after)
        .filter((label) => {
          // The label format is "<Name> — engine guessed stats; ..."
          const lower = label.toLowerCase();
          for (const v of vestNamesLower) {
            if (lower.startsWith(v)) return true;
          }
          return false;
        });
      expect(offenders).toEqual([]);
    });

    it('findArmorByName + findWeaponByName never infer for any of the 4 treats', () => {
      const before = inferredCalls.length;
      for (const name of TREAT_NAMES) {
        findArmorByName(name);
        findWeaponByName(name);
      }
      const after = inferredCalls.length;
      const treatLower = new Set(TREAT_NAMES.map((n) => n.toLowerCase()));
      const offenders = inferredCalls
        .slice(before, after)
        .filter((label) => {
          const lower = label.toLowerCase();
          for (const t of treatLower) {
            if (lower.startsWith(t)) return true;
          }
          return false;
        });
      expect(offenders).toEqual([]);
    });
  });

  describe('cross-catalog uniqueness — no duplicate names across files', () => {
    function allNamesWithSource(): Array<{ name: string; source: string }> {
      const out: Array<{ name: string; source: string }> = [];
      for (const w of WEAPONS) out.push({ name: w.name, source: 'weapons' });
      for (const a of ARMOR) out.push({ name: a.name, source: 'armor' });
      for (const g of GEAR) out.push({ name: g.name, source: 'gear' });
      for (const m of MATERIALS) out.push({ name: m.name, source: 'materials' });
      for (const am of AMULETS) out.push({ name: am.name, source: 'amulets' });
      for (const r of RINGS) out.push({ name: r.name, source: 'rings' });
      for (const e of EXPLORATION) out.push({ name: e.name, source: 'exploration' });
      for (const d of DOG_GEAR) out.push({ name: d.name, source: 'dogGear' });
      return out;
    }

    // OTA-135 — fixed. The five cross-file duplicates (Aetheric Torch,
    // Aetheric Compass, Minor Aetheric Amulet, Lightstone Amulet,
    // Whisperer's Charm) were removed from exploration.json; the
    // functional rows in gear.json / amulets.json remain canonical.
    // OTA-134 closed the within-file Aetheric Shield duplicate.
    test('no item name appears in more than one catalog file', () => {
      const all = allNamesWithSource();
      const byName = new Map<string, Set<string>>();
      for (const { name, source } of all) {
        const key = name.toLowerCase();
        if (!byName.has(key)) byName.set(key, new Set());
        byName.get(key)!.add(source);
      }
      const duplicates: Array<{ name: string; sources: string[] }> = [];
      for (const [name, sources] of byName.entries()) {
        if (sources.size > 1) duplicates.push({ name, sources: Array.from(sources) });
      }
      expect(duplicates).toEqual([]);
    });

    it('treats from gear.json are NOT also in materials.json (dog-system specific)', () => {
      // This is the narrower assertion the OTA-124 brief actually asked
      // for: the dog system MUST NOT cross-contaminate. Treats live in
      // gear.json as consumables, NOT in materials.json.
      const materialNames = new Set(MATERIALS.map((m) => m.name.toLowerCase()));
      const offenders: string[] = [];
      for (const treat of TREAT_NAMES) {
        if (materialNames.has(treat.toLowerCase())) offenders.push(treat);
      }
      expect(offenders).toEqual([]);
    });

    it('vests from dogGear.json are NOT in armor.json or weapons.json', () => {
      const armorNames = new Set(ARMOR.map((a) => a.name.toLowerCase()));
      const weaponNames = new Set(WEAPONS.map((w) => w.name.toLowerCase()));
      const offenders: string[] = [];
      for (const v of DOG_GEAR) {
        const key = v.name.toLowerCase();
        if (armorNames.has(key) || weaponNames.has(key)) offenders.push(v.name);
      }
      expect(offenders).toEqual([]);
    });

    // OTA-134 — fixed. The runecaster "Aetheric Shield" was renamed to
    // "Aetheric Ward Rod" in weapons.json line 228. The melee shield keeps
    // its name. findWeaponByName now resolves both rows distinctly.
    test('no duplicate names WITHIN any single catalog file', () => {
      const buckets: Array<{ source: string; items: { name: string }[] }> = [
        { source: 'weapons', items: WEAPONS },
        { source: 'armor', items: ARMOR },
        { source: 'gear', items: GEAR },
        { source: 'materials', items: MATERIALS },
        { source: 'amulets', items: AMULETS },
        { source: 'rings', items: RINGS },
        { source: 'exploration', items: EXPLORATION },
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
  });

  describe('every item across every catalog file has a canonical rarity', () => {
    it('walks weapons / armor / gear / materials / amulets / rings / exploration / dogGear', () => {
      const offenders: Array<{ source: string; name: string; rarity: unknown }> = [];
      const buckets: Array<{ source: string; items: Array<{ name: string; rarity?: unknown }> }> = [
        { source: 'weapons', items: WEAPONS },
        { source: 'armor', items: ARMOR },
        { source: 'gear', items: GEAR },
        { source: 'materials', items: MATERIALS },
        { source: 'amulets', items: AMULETS },
        { source: 'rings', items: RINGS },
        { source: 'exploration', items: EXPLORATION },
        { source: 'dogGear', items: DOG_GEAR },
      ];
      for (const { source, items } of buckets) {
        for (const item of items) {
          if (typeof item.rarity !== 'string' || !CANONICAL_RARITIES.has(item.rarity as string)) {
            offenders.push({ source, name: item.name, rarity: item.rarity });
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('dogGear.json file on disk matches DOG_GEAR runtime length', () => {
    it('parses the same number of entries the engine import resolved', () => {
      const p = path.join(__dirname, '..', 'app', 'data', 'items', 'dogGear.json');
      const raw = fs.readFileSync(p, 'utf-8');
      const json = JSON.parse(raw) as { dogGear: unknown[] };
      expect(json.dogGear.length).toBe(DOG_GEAR.length);
    });
  });
});

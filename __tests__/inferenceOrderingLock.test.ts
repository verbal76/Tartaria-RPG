// OTA-136 — Regression lock for the "inference engine doesn't check
// materials.json before warning" open issue. The issue predates the
// OTA-110 `isCataloguedElsewhere` guard + OTA-124 catalog-elsewhere
// extension + OTA-133 DOG_GEAR add. Each of the 4 find* functions
// (findWeaponByName, findArmorByName, findAmuletByName,
// findRingByName) now early-exits via the guard before invoking the
// inferWeapon/Armor/Accessory callbacks that emit the warning.
//
// This file walks EVERY item in MATERIALS, CONSUMABLES (gear.json),
// EXPLORATION, and DOG_GEAR and asserts no false inference fires
// when those names are queried through the weapon/armor/amulet/ring
// find paths. Locks the OTA-110/124/133 fix so a future regression
// in isCataloguedElsewhere ordering surfaces immediately.

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
  findRingByName,
  findWeaponByName,
} from '../app/engine/crafting';
import { setOnInferred } from '../app/engine/itemDefaults';

jest.setTimeout(15000);

describe('OTA-136 inference ordering — no false inferred-stats fires for catalogued items', () => {
  let inferredCalls: string[] = [];

  beforeAll(() => {
    setOnInferred((label: string) => {
      inferredCalls.push(label);
    });
  });

  afterAll(() => {
    setOnInferred(null);
  });

  beforeEach(() => {
    inferredCalls = [];
  });

  it('walks every MATERIALS item through all 4 find* paths — no inference fires', () => {
    for (const m of MATERIALS) {
      findWeaponByName(m.name);
      findArmorByName(m.name);
      findAmuletByName(m.name);
      findRingByName(m.name);
    }
    expect(inferredCalls).toEqual([]);
  });

  it('walks every EXPLORATION item — no inference fires', () => {
    for (const e of EXPLORATION) {
      findWeaponByName(e.name);
      findArmorByName(e.name);
      findAmuletByName(e.name);
      findRingByName(e.name);
    }
    expect(inferredCalls).toEqual([]);
  });

  it('walks every GEAR (consumable / relic / misc) item — no inference fires', () => {
    for (const g of GEAR) {
      findWeaponByName(g.name);
      findArmorByName(g.name);
      findAmuletByName(g.name);
      findRingByName(g.name);
    }
    expect(inferredCalls).toEqual([]);
  });

  it('walks every DOG_GEAR vest — no inference fires', () => {
    for (const v of DOG_GEAR) {
      findWeaponByName(v.name);
      findArmorByName(v.name);
      findAmuletByName(v.name);
      findRingByName(v.name);
    }
    expect(inferredCalls).toEqual([]);
  });

  it('Sentinel Core Plate (the original OTA-110 repro) does not infer through any path', () => {
    findWeaponByName('Sentinel Core Plate');
    findArmorByName('Sentinel Core Plate');
    findAmuletByName('Sentinel Core Plate');
    findRingByName('Sentinel Core Plate');
    expect(inferredCalls).toEqual([]);
  });

  it('truly uncatalogued names that READ as weapons still infer (control case)', () => {
    findWeaponByName('Unicorn Glaive of the Lost Sky');
    expect(inferredCalls.length).toBeGreaterThan(0);
  });

  it('weapons.json items round-trip directly (control case — no inference needed)', () => {
    for (const w of WEAPONS) {
      const result = findWeaponByName(w.name);
      expect(result).not.toBeNull();
      expect(result?.name).toBe(w.name);
    }
    expect(inferredCalls).toEqual([]);
  });

  it('armor.json items round-trip directly (control case)', () => {
    for (const a of ARMOR) {
      const result = findArmorByName(a.name);
      expect(result).not.toBeNull();
      expect(result?.name).toBe(a.name);
    }
    expect(inferredCalls).toEqual([]);
  });

  it('amulets.json items round-trip directly (control case)', () => {
    for (const am of AMULETS) {
      const result = findAmuletByName(am.name);
      expect(result).not.toBeNull();
      expect(result?.name).toBe(am.name);
    }
    expect(inferredCalls).toEqual([]);
  });

  it('rings.json items round-trip directly (control case)', () => {
    for (const r of RINGS) {
      const result = findRingByName(r.name);
      expect(result).not.toBeNull();
      expect(result?.name).toBe(r.name);
    }
    expect(inferredCalls).toEqual([]);
  });
});

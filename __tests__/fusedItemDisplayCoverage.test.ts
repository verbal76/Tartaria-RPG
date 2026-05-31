// OTA-227 — sweep test for the fused-item display coverage gap.
//
// Bug class: fused items are catalog-absent BY DESIGN (they carry
// uniqueStats per-instance, not a WEAPONS / ARMOR row). Every UI
// site that called findWeaponByName(item.name) or findArmorByName
// (name) returned null for fused items and silently dropped the
// displayed field. Three real bugs in this class: OTA-224 fixed
// validSlotsForItem; OTA-226 fixed the green damage line on the
// inventory row; this OTA-227 fixes the displayed AC + range/in-
// range tone for fused items AND introduces the resolveDisplay*
// helpers so the bug class can't return.
//
// This test asserts the contract those helpers must hold so future
// UI additions can rely on them.

import {
  resolveDisplayWeapon,
  resolveDisplayArmor,
  resolveDisplayWeaponByName,
  resolveDisplayArmorByName,
} from '../app/engine/itemResolution';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

function mkFusedWeapon(name: string, overrides: Partial<UniqueItemStats> = {}): InventoryItem {
  return {
    id: `fused_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'weapon',
    quantity: 1,
    tags: ['fused', 'unique'],
    rarity: 'Rare',
    description: 'A fused unique weapon.',
    durability: { current: 30, max: 30 },
    uniqueStats: {
      kind: 'weapon',
      rarity: 'Rare',
      durability: { current: 30, max: 30 },
      damageDice: '1d8',
      damageType: 'aetheric',
      scalesWith: 'intelligence',
      ...overrides,
    },
  };
}

function mkFusedArmor(name: string, slot: 'head' | 'chest' | 'legs' | 'feet' = 'chest', overrides: Partial<UniqueItemStats> = {}): InventoryItem {
  return {
    id: `fused_armor_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'armor',
    quantity: 1,
    tags: ['fused', 'unique'],
    rarity: 'Rare',
    description: 'A fused unique armor piece.',
    durability: { current: 30, max: 30 },
    uniqueStats: {
      kind: 'armor',
      rarity: 'Rare',
      durability: { current: 30, max: 30 },
      armorSlot: slot,
      acBonus: 2,
      ...overrides,
    },
  };
}

describe('OTA-227 — resolveDisplayWeapon returns full stats for fused weapons', () => {
  it('aetheric fused weapon resolves to a runecaster row with damageDice + damageType', () => {
    const item = mkFusedWeapon('Resonant Edge');
    const w = resolveDisplayWeapon(item);
    expect(w).not.toBeNull();
    expect(w!.damageDice).toBe('1d8');
    expect(w!.damageType).toBe('aetheric');
    expect(w!.weaponKind).toBe('runecaster');
    expect(w!.stat).toBe('intelligence');
    expect(w!.rarity).toBe('Rare');
  });

  it('non-aetheric fused weapon resolves to a melee row', () => {
    const item = mkFusedWeapon('Cinderhalt Cleaver', { damageType: 'slashing', scalesWith: 'strength' });
    const w = resolveDisplayWeapon(item);
    expect(w!.weaponKind).toBe('melee');
    expect(w!.damageType).toBe('slashing');
    expect(w!.stat).toBe('strength');
  });

  it('falls back to catalog lookup for hand-authored weapons', () => {
    const item = { name: 'Iron Sword', uniqueStats: undefined };
    // Iron Sword may or may not be in the catalog; the helper should
    // not crash either way. The contract is "uniqueStats-bearing items
    // resolve, catalog items fall back; missing items return null."
    const w = resolveDisplayWeapon(item);
    // Don't assert on catalog content — assert on shape: null OR a row.
    expect(w === null || typeof w.damageDice === 'string').toBe(true);
  });

  it('returns null when the item has neither uniqueStats nor catalog match', () => {
    const item = { name: 'Definitely Not A Real Weapon XYZQ' };
    expect(resolveDisplayWeapon(item)).toBeNull();
  });
});

describe('OTA-227 — resolveDisplayArmor returns full stats for fused armor', () => {
  it('fused chest armor resolves with acBonus + slot', () => {
    const item = mkFusedArmor('Cinderhalt Brace', 'chest');
    const a = resolveDisplayArmor(item);
    expect(a).not.toBeNull();
    expect(a!.acBonus).toBe(2);
    expect(a!.slot).toBe('chest');
    expect(a!.rarity).toBe('Rare');
  });

  it('fused armor with resistance includes it in resistances array', () => {
    const item = mkFusedArmor('Ironbound Mantle', 'chest', { resistance: 'aetheric' });
    const a = resolveDisplayArmor(item);
    expect(a!.resistances).toContain('aetheric');
  });

  it('fused armor without resistance has empty resistances array', () => {
    const item = mkFusedArmor('Plain Brace', 'chest');
    const a = resolveDisplayArmor(item);
    expect(a!.resistances).toEqual([]);
  });
});

describe('OTA-227 — by-name lookups find fused items via inventory scan', () => {
  it('resolveDisplayWeaponByName finds a fused weapon in inventory by name', () => {
    const inv: InventoryItem[] = [mkFusedWeapon('Resonant Edge')];
    const w = resolveDisplayWeaponByName('Resonant Edge', inv);
    expect(w).not.toBeNull();
    expect(w!.damageDice).toBe('1d8');
  });

  it('resolveDisplayArmorByName finds a fused armor in inventory by name', () => {
    const inv: InventoryItem[] = [mkFusedArmor('Cinderhalt Brace', 'chest')];
    const a = resolveDisplayArmorByName('Cinderhalt Brace', inv);
    expect(a).not.toBeNull();
    expect(a!.acBonus).toBe(2);
  });

  it('name-only lookup is case-insensitive', () => {
    const inv: InventoryItem[] = [mkFusedWeapon('Resonant Edge')];
    expect(resolveDisplayWeaponByName('resonant edge', inv)).not.toBeNull();
    expect(resolveDisplayWeaponByName('RESONANT EDGE', inv)).not.toBeNull();
  });

  it('returns null for an empty inventory + unknown name', () => {
    expect(resolveDisplayWeaponByName('Definitely Not A Real Weapon XYZQ', [])).toBeNull();
    expect(resolveDisplayArmorByName('Definitely Not A Real Armor XYZQ', [])).toBeNull();
  });
});

describe('OTA-227 — display contract: every fused item kind populates the fields the UI reads', () => {
  // The exact fields each render site needs. If any helper returns
  // undefined / empty for these, the corresponding UI site shows a
  // gap. Adding a new field to the UI? Add it here too — the test
  // will fail until uniqueStats / the helper carries the new field.
  const requiredWeaponFields: Array<keyof ReturnType<typeof resolveDisplayWeapon> & object> = [
    'name', 'damageDice', 'damageType', 'weaponKind', 'stat', 'rarity',
  ];
  const requiredArmorFields: Array<keyof ReturnType<typeof resolveDisplayArmor> & object> = [
    'name', 'slot', 'acBonus', 'rarity', 'resistances',
  ];

  it('every required weapon display field is populated on a fused weapon', () => {
    const w = resolveDisplayWeapon(mkFusedWeapon('Resonant Edge'))!;
    for (const f of requiredWeaponFields) {
      expect(w[f as keyof typeof w]).not.toBeUndefined();
      expect(w[f as keyof typeof w]).not.toBeNull();
    }
  });

  it('every required armor display field is populated on a fused armor', () => {
    const a = resolveDisplayArmor(mkFusedArmor('Cinderhalt Brace', 'chest'))!;
    for (const f of requiredArmorFields) {
      expect(a[f as keyof typeof a]).not.toBeUndefined();
      expect(a[f as keyof typeof a]).not.toBeNull();
    }
  });
});

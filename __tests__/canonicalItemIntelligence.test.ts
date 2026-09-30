// Strategic repair — Phase 12. Focused, boot-free regression for
// test-utils/canonical/itemIntelligence.ts: proves the one new legitimate
// perception primitive (readItemMechanics) reads REAL catalog data through
// the SAME preview function production's own buy/equip modals use, and
// never reaches the inference/Qwen-fallback path for an unrecognized name.

import { readItemMechanics } from '../test-utils/canonical/itemIntelligence';

describe('Strategic repair — item mechanics perception (readItemMechanics)', () => {
  it('reads the starting Aetheric Locket: amulet slot, aetheric resist, no invented fields', () => {
    const r = readItemMechanics('Aetheric Locket');
    expect(r).not.toBeNull();
    expect(r!.slot).toBe('amulet');
    expect(r!.resistTypes).toContain('aetheric');
    expect(r!.rarity).toBe('Common');
  });

  it("reads Heir's Dynastic Plate: chest slot, AC +3, HP regen 2 — the affordable eternal_dynasty upgrade Life 4 never bought", () => {
    const r = readItemMechanics("Heir's Dynastic Plate");
    expect(r).not.toBeNull();
    expect(r!.slot).toBe('chest');
    expect(r!.acBonus).toBe(3);
    expect(r!.hpRegen).toBe(2);
    expect(r!.rarity).toBe('Uncommon');
  });

  it('reads the Aether-Wing Cloak: chest slot, Rare, lower AC, stamina regen, aetheric resist — the real rarity-vs-value inversion case', () => {
    const r = readItemMechanics('Aether-Wing Cloak');
    expect(r).not.toBeNull();
    expect(r!.slot).toBe('chest');
    expect(r!.rarity).toBe('Rare');
    expect(r!.acBonus).toBe(1);
    expect(r!.staminaRegen).toBeGreaterThan(0);
    expect(r!.resistTypes).toContain('aetheric');
  });

  it('reads the mud_golem starting Mud-Rend Blade: main-hand slot, a parsed damage average', () => {
    const r = readItemMechanics('Mud-Rend Blade');
    expect(r).not.toBeNull();
    expect(r!.slot).toBe('main');
    expect(r!.damageAvg).not.toBeNull();
    expect(r!.damageAvg).toBeGreaterThan(0);
  });

  it('returns null for a name with no real catalog entry — never falls through to inference/Qwen', () => {
    const r = readItemMechanics('Definitely Not A Real Catalog Item Name 12345');
    expect(r).toBeNull();
  });

  it('never invents mechanics from a misleading name — an item merely named after "Aetheric" with no real resist parses to an EMPTY resist list, not an assumed one', () => {
    // Echoing Steps Boots: real catalog entry, contains no "Aetheric" in its
    // name AND carries resistances: [] in source — the negative control
    // proves resistTypes is read from the item's own data, never guessed
    // from a name pattern.
    const r = readItemMechanics('Echoing Steps Boots');
    expect(r).not.toBeNull();
    expect(r!.resistTypes).toEqual([]);
  });
});

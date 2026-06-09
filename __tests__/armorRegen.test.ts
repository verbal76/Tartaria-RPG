import { aggregateEquippedRegen, STAMINA_REGEN_CAP, HP_REGEN_CAP } from '../app/engine/equipment';
import armorData from '../app/data/items/armor.json';
import type { PlayerCharacter } from '../app/engine/types';

// OTA-376 — passive per-action regen on worn armor. A few pieces in
// every body slot, across all rarity tiers, carry a mild staminaRegen or
// (more limited) hpRegen — never both. Faction pieces grant a little
// more. aggregateEquippedRegen sums across equipped armor and clamps to
// the caps so a full regen build is noticeable, not OP.

const ARMOR = (armorData as { armor: Array<Record<string, any>> }).armor;
const SLOTS = ['head', 'chest', 'legs', 'feet', 'hands', 'cloak'];

describe('armor regen data', () => {
  it('every body slot has both stamina-regen and hp-regen pieces', () => {
    for (const slot of SLOTS) {
      const inSlot = ARMOR.filter((p) => p.slot === slot);
      expect(inSlot.some((p) => (p.staminaRegen ?? 0) > 0)).toBe(true);
      expect(inSlot.some((p) => (p.hpRegen ?? 0) > 0)).toBe(true);
    }
  });

  it('regen appears across all rarity tiers', () => {
    for (const rarity of ['Common', 'Uncommon', 'Rare', 'Legendary']) {
      const tier = ARMOR.filter((p) => p.rarity === rarity);
      expect(tier.some((p) => (p.staminaRegen ?? 0) > 0 || (p.hpRegen ?? 0) > 0)).toBe(true);
    }
  });

  it('no piece carries BOTH stamina and hp regen', () => {
    expect(ARMOR.filter((p) => (p.staminaRegen ?? 0) > 0 && (p.hpRegen ?? 0) > 0)).toHaveLength(0);
  });

  it('per-piece values are mild (≤2)', () => {
    for (const p of ARMOR) {
      expect(p.staminaRegen ?? 0).toBeLessThanOrEqual(2);
      expect(p.hpRegen ?? 0).toBeLessThanOrEqual(2);
    }
  });

  it('faction pieces grant a little more than the rest', () => {
    const FAC = ['mud_monarchs', 'forgotten_order', 'reclaimers_guild', 'true_tartarians', 'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants', 'stone_builders', 'tartarian_revivalists'];
    const isFac = (p: Record<string, any>) => (p.tags ?? []).some((t: string) => FAC.includes(t)) || !!p.faction;
    const facRegen = ARMOR.filter((p) => isFac(p) && ((p.staminaRegen ?? 0) > 0 || (p.hpRegen ?? 0) > 0));
    expect(facRegen.length).toBeGreaterThan(0);
    // Every faction regen piece is at the higher value (2).
    for (const p of facRegen) {
      expect(Math.max(p.staminaRegen ?? 0, p.hpRegen ?? 0)).toBe(2);
    }
  });
});

describe('aggregateEquippedRegen', () => {
  const equipOne = (slot: string, name: string): PlayerCharacter =>
    ({ equipped: { [slot]: name } } as unknown as PlayerCharacter);

  it('reads a single equipped stamina piece', () => {
    const piece = ARMOR.find((p) => (p.staminaRegen ?? 0) > 0)!;
    const r = aggregateEquippedRegen(equipOne(piece.slot, piece.name));
    expect(r.stamina).toBe(Math.min(STAMINA_REGEN_CAP, piece.staminaRegen));
    expect(r.hp).toBe(0);
  });

  it('sums across slots but clamps to the caps (no OP stacking)', () => {
    // Equip a stamina-regen piece in every slot.
    const eq: Record<string, string> = {};
    for (const slot of SLOTS) {
      const p = ARMOR.find((x) => x.slot === slot && (x.staminaRegen ?? 0) > 0);
      if (p) eq[slot] = p.name;
    }
    const r = aggregateEquippedRegen({ equipped: eq } as unknown as PlayerCharacter);
    expect(r.stamina).toBe(STAMINA_REGEN_CAP); // clamped, not 6
    expect(r.stamina).toBeLessThanOrEqual(STAMINA_REGEN_CAP);
    expect(r.hp).toBeLessThanOrEqual(HP_REGEN_CAP);
  });

  it('no equipped armor → no regen', () => {
    expect(aggregateEquippedRegen({ equipped: {} } as unknown as PlayerCharacter)).toEqual({ stamina: 0, hp: 0 });
  });
});

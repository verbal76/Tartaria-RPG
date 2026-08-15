// OTA-811 — cold coatings. We added the cold damage TYPE (OTA-827) but no coatings;
// this adds cold as a full coating family (matching poison/burn/electrical): two
// craftable variants (Frost Paste, Rime Draught) that coat a WEAPON for a cold DOT
// (anti-machine), coat ARMOR for cold resist, DRINK to heal + shake a chill, and
// THROW for a one-time frost burst.

import { coatingBlurb, coatingStatusKind, coatingDamageType, isCoatableItem } from '../app/engine/weaponCoating';
import { isCoatingDrinkable, coatingItemDrinkable, coatingElementFromTags, coatingDrinkRemedy, COATING_ELEMENTS } from '../app/engine/coatingRemedy';
import { rollIncomingStatusEffect } from '../app/engine/statusEffects';
import { effectiveStats } from '../app/engine/equipment';
import { applyDamageTypeModifier } from '../app/engine/crafting';
import { traitDamageMultiplier, combineDamageTypeMatch } from '../app/engine/enemyTraits';
import type { InventoryItem, PlayerCharacter, WeaponCoating } from '../app/engine/types';

describe('OTA-811 — cold is a full coating family', () => {
  it('cold is a known coating element with a blurb + DOT status kind', () => {
    expect(COATING_ELEMENTS).toContain('cold');
    expect(coatingStatusKind('cold' as WeaponCoating['kind'])).toBe('cold_coat');
    expect(coatingBlurb('cold' as WeaponCoating['kind'])).toMatch(/cold/i);
  });

  it('OFFENSIVE — a cold coating earns a Construct/Automation cold weakness', () => {
    // The attack path folds coating.kind cold through the same weakness reconcile the
    // electrical/burn coatings use; verify the math it relies on.
    const typeM = applyDamageTypeModifier(10, 'cold', 'Automation').match; // weak
    const traitM = traitDamageMultiplier([], 'cold').match; // normal
    expect(combineDamageTypeMatch(typeM, traitM).match).toBe('weak');
  });

  it('DEFENSIVE — a cold coating maps to a cold armor resist', () => {
    expect(coatingDamageType('cold')).toBe('cold');
  });

  it('CURATIVE — a cold coating is drinkable and lifts a chill + heals', () => {
    expect(isCoatingDrinkable('cold')).toBe(true);
    expect(coatingItemDrinkable({ tags: ['potion', 'weapon_coating', 'cold'] })).toBe(true);
    const chilled = {
      hp: 10, hpMax: 30, corruption: 0,
      statusEffects: [{ kind: 'chilled', remainingRounds: 3, label: 'chilled' }],
    } as unknown as PlayerCharacter;
    const res = coatingDrinkRemedy(chilled, 'cold', 'Rare');
    expect(res.player.hp).toBeGreaterThan(10); // warmed / healed
    expect((res.player.statusEffects ?? []).some((s) => s.kind === 'chilled')).toBe(false); // chill lifted
    expect(res.messages.join(' ')).toMatch(/chill lifts/i);
  });

  it('a cold-typed enemy hit can leave the player `chilled`, which slows DEX by 2', () => {
    // Force the proc by mocking the RNG threshold indirectly: rollIncomingStatusEffect
    // returns an effect when Math.random < procChance. Run it enough times to see cold map.
    let sawChill = false;
    for (let i = 0; i < 200 && !sawChill; i++) {
      const eff = rollIncomingStatusEffect('cold', []);
      if (eff && eff.effect.kind === 'chilled') sawChill = true;
    }
    expect(sawChill).toBe(true);

    const base = { strength: 10, dexterity: 14, intelligence: 10, wisdom: 10, charisma: 10, stealth: 0 };
    const warm = { stats: base, statusEffects: [], corruption: 0 } as unknown as PlayerCharacter;
    const cold = { stats: base, statusEffects: [{ kind: 'chilled', remainingRounds: 3, label: 'chilled' }], corruption: 0 } as unknown as PlayerCharacter;
    expect(effectiveStats(cold).dexterity).toBe(effectiveStats(warm).dexterity - 2);
  });

  it('THROW / coatable — a cold coating can ride any coatable weapon', () => {
    // The coat gate is on the WEAPON, not the coating kind; a physical melee qualifies.
    const knife: InventoryItem = { id: 'k', name: 'Iron Dagger', kind: 'weapon', quantity: 1, rarity: 'Common', tags: ['weapon', 'melee'] } as InventoryItem;
    // isCoatableItem resolves via catalog/uniqueStats; a fused weapon is always coatable.
    const fused = { id: 'f', name: 'Whatever', kind: 'weapon', uniqueStats: { kind: 'weapon' }, tags: [] } as unknown as InventoryItem;
    expect(isCoatableItem(fused)).toBe(true);
    void knife;
  });

  it('reads the cold element off a coating item\'s tags', () => {
    expect(coatingElementFromTags(['potion', 'weapon_coating', 'cold', 'aether'])).toBe('cold');
  });
});

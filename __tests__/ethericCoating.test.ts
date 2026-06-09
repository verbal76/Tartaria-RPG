import { aggregateEquippedStatBonuses } from '../app/engine/equipment';
import { coatingStatusKind, coatingBlurb } from '../app/engine/weaponCoating';
import { findRecipeByResult, findGearByName } from '../app/engine/crafting';
import { resolveItemEffect } from '../app/engine/itemEffect';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

// OTA-386 — etheric (electrical) weapon coatings: an aether-dust paste that
// arcs electrical damage (exploits the construct/automaton weakness) and, in
// its flavored variants, grants a passive stat bonus while the weapon is held.

const effect = (name: string) =>
  resolveItemEffect(name, [findGearByName]) as
    | { kind: string; coating?: { kind: string; dice: string; statBonus?: { stat: string; amount: number } } }
    | null;

describe('etheric (electrical) coatings', () => {
  it('coating helpers handle the electrical kind', () => {
    expect(coatingStatusKind('electrical')).toBe('electrical_coat');
    expect(coatingBlurb('electrical')).toMatch(/electrical/i);
  });

  it('Static / Galvanic / Resonant pastes craft into electrical coatings', () => {
    for (const name of ['Static Paste', 'Galvanic Paste', 'Resonant Paste']) {
      const r = findRecipeByResult(name);
      expect(r).toBeTruthy();
      expect(r!.ingredients.map((i) => i.name)).toEqual(
        expect.arrayContaining(['Aether Dust', 'Speckled Egg']),
      );
      expect(effect(name)?.coating?.kind).toBe('electrical');
    }
  });

  it('flavored pastes carry the right stat bonus', () => {
    expect(effect('Static Paste')?.coating?.statBonus).toBeUndefined();
    expect(effect('Galvanic Paste')?.coating?.statBonus).toEqual({ stat: 'stealth', amount: 1 });
    expect(effect('Resonant Paste')?.coating?.statBonus).toEqual({ stat: 'charisma', amount: 1 });
  });

  it('a coated weapon grants its statBonus while wielded', () => {
    const weapon: InventoryItem = {
      id: 'w1', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [],
      coating: { kind: 'electrical', dice: '1d4', label: 'Galvanic', statBonus: { stat: 'stealth', amount: 1 } },
    };
    const player = {
      inventory: [weapon],
      equipped: { main: 'Rusted Blade', mainId: 'w1' },
    } as unknown as PlayerCharacter;
    expect(aggregateEquippedStatBonuses(player).stealth).toBeGreaterThanOrEqual(1);
  });
});

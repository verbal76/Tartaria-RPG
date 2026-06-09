import { coatingStatusKind, coatingBlurb } from '../app/engine/weaponCoating';
import { findRecipeByResult, findGearByName } from '../app/engine/crafting';
import { resolveItemEffect } from '../app/engine/itemEffect';
import { aggregateEquippedStatBonuses } from '../app/engine/equipment';
import { applyDamageTypeModifier } from '../app/engine/crafting';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

// OTA-387 — burn weapon coatings, parallel to the etheric (electrical) family.
// An aether-dust paste run hot that sears burn damage (weakness-aware vs mud
// creatures / burn-weak foes), with flavored +stat variants.

const effect = (name: string) =>
  resolveItemEffect(name, [findGearByName]) as
    | { kind: string; coating?: { kind: string; dice: string; statBonus?: { stat: string; amount: number } } }
    | null;

describe('burn coatings', () => {
  it('coating helpers handle the burn kind', () => {
    expect(coatingStatusKind('burn')).toBe('burn_coat');
    expect(coatingBlurb('burn')).toMatch(/burn/i);
  });

  it('Incendiary / Searing / Smoldering pastes craft into burn coatings', () => {
    for (const name of ['Incendiary Paste', 'Searing Paste', 'Smoldering Paste']) {
      const r = findRecipeByResult(name);
      expect(r).toBeTruthy();
      expect(r!.ingredients.map((i) => i.name)).toEqual(
        expect.arrayContaining(['Aether Dust', 'Aether Crystal']),
      );
      expect(effect(name)?.coating?.kind).toBe('burn');
    }
    expect(effect('Searing Paste')?.coating?.statBonus).toEqual({ stat: 'strength', amount: 1 });
    expect(effect('Smoldering Paste')?.coating?.statBonus).toEqual({ stat: 'intelligence', amount: 1 });
  });

  it('a burn-coated weapon grants its statBonus while wielded', () => {
    const weapon: InventoryItem = {
      id: 'w1', name: 'Rusted Blade', kind: 'weapon', quantity: 1, tags: [],
      coating: { kind: 'burn', dice: '1d4', label: 'Searing', statBonus: { stat: 'strength', amount: 1 } },
    };
    const player = {
      inventory: [weapon],
      equipped: { main: 'Rusted Blade', mainId: 'w1' },
    } as unknown as PlayerCharacter;
    expect(aggregateEquippedStatBonuses(player).strength).toBeGreaterThanOrEqual(1);
  });

  it('burn is a real weakness type (1.5× vs mud creatures) for the proc to exploit', () => {
    expect(applyDamageTypeModifier(10, 'burn', 'Mud Creature').match).toBe('weak');
  });
});

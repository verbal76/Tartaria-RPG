// OTA-931 — a bare-hand keyword inside the EQUIPPED weapon's own name must not force a
// bare-hand swing. The Tartarian Giant's "Mud-fist Wraps" (contains "fist") is the
// regression case: attacking WITH it should use the weapon (1d10), while a standalone
// "punch it" still uses the Giant's bare fists (1d6+2).
import { buildCombatSteps } from '../app/engine/combatRules';
import type { Enemy, PlayerCharacter } from '../app/engine/types';

const giantWithWraps = (): PlayerCharacter =>
  ({
    raceId: 'tartarian_giant',
    stats: { strength: 11, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 5 },
    hp: 20, hpMax: 20, ac: 12,
    equipped: { main: 'Mud-fist Wraps', mainId: 'w1' },
    inventory: [{ id: 'w1', name: 'Mud-fist Wraps', kind: 'weapon', quantity: 1, tags: ['weapon', 'barehanded', 'melee'], rarity: 'Common', description: 'x' }],
    statusEffects: [],
  } as unknown as PlayerCharacter);

const enemy: Enemy =
  ({ name: 'Drowned Aetherkin', type: 'aetheric undead', abilityPoint: 'Strength 3', attack: '2', damage: '1d6', hp: 12, rarity: 'Common', loot: [] } as unknown as Enemy);

const dmgSides = (actionText: string): number => {
  const step = buildCombatSteps(actionText, giantWithWraps(), enemy).find((s) => s.id === 'damage');
  if (!step) throw new Error('damage step missing');
  return step.sides;
};

describe('OTA-931 — weapon name containing "fist" does not force barehand', () => {
  it('attacking WITH the Mud-fist Wraps uses the weapon die (1d10), not the Giant bare fists (1d6)', () => {
    expect(dmgSides('attack with the mud-fist wraps')).toBe(10);
  });
  it('a plain attack also uses the weapon', () => {
    expect(dmgSides('attack the Drowned Aetherkin')).toBe(10);
  });
  it('a standalone "punch it" still swings bare-handed (Giant 1d6+2)', () => {
    expect(dmgSides('punch it')).toBe(6);
  });
});

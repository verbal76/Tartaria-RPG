// OTA-931/932 — hand weapons are used, never mistaken for a bare-fist swing.
//  OTA-931: a bare-hand keyword inside the weapon's NAME ("Mud-fist Wraps" has "fist")
//           must not force barehanded.
//  OTA-932: a weapon tagged 'barehanded' (a fist/gauntlet/knuckle weapon) IS the player's
//           fist, so "punch"/"kick" swings IT — only an empty hand (or a non-hand weapon)
//           drops to bare skin. (The matching UI change hides the PUNCH/KICK buttons.)
import { buildCombatSteps } from '../app/engine/combatRules';
import type { Enemy, PlayerCharacter } from '../app/engine/types';

const enemy: Enemy =
  ({ name: 'Drowned Aetherkin', type: 'aetheric undead', abilityPoint: 'Strength 3', attack: '2', damage: '1d6', hp: 12, rarity: 'Common', loot: [] } as unknown as Enemy);

const giant = (equipped: Record<string, unknown>, inventory: unknown[] = []): PlayerCharacter =>
  ({
    raceId: 'tartarian_giant',
    stats: { strength: 11, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 5 },
    hp: 20, hpMax: 20, ac: 12, equipped, inventory, statusEffects: [],
  } as unknown as PlayerCharacter);

const wraps = giant(
  { main: 'Mud-fist Wraps', mainId: 'w1' },
  [{ id: 'w1', name: 'Mud-fist Wraps', kind: 'weapon', quantity: 1, tags: ['weapon', 'barehanded', 'melee'], rarity: 'Common', description: 'x' }],
);
const barefist = giant({}, []);

const dmgSides = (p: PlayerCharacter, text: string): number => {
  const step = buildCombatSteps(text, p, enemy).find((s) => s.id === 'damage');
  if (!step) throw new Error('damage step missing');
  return step.sides;
};

describe('OTA-931/932 — hand weapons never fall into the bare-fist trap', () => {
  it('attacking WITH the Mud-fist Wraps uses the weapon die (1d10), not the Giant fists — its "fist" name no longer forces barehand', () => {
    expect(dmgSides(wraps, 'attack with the mud-fist wraps')).toBe(10);
  });
  it('a plain attack uses the weapon too', () => {
    expect(dmgSides(wraps, 'attack the Drowned Aetherkin')).toBe(10);
  });
  it('"punch it" while wearing a HAND weapon swings the weapon (1d10), not bare skin', () => {
    expect(dmgSides(wraps, 'punch it')).toBe(10);
  });
  it('"kick it" while wearing a HAND weapon also swings the weapon', () => {
    expect(dmgSides(wraps, 'kick it')).toBe(10);
  });
  it('"punch it" with NO weapon equipped still swings the Giant bare fists (1d6)', () => {
    expect(dmgSides(barefist, 'punch it')).toBe(6);
  });
});

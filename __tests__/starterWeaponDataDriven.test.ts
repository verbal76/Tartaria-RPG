// engine_Dev — a custom race starts holding a weapon from the UPLOADED tables
// (not the Tartaria "Rusted Blade"), and an optional race.startingWeapon wins.

import { createCharacter } from '../app/engine/character';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

const RACES = [
  { id: 'unaltered_human', name: 'Unaltered Human', baseAC: 10, racialACBonus: '', racialStatBonuses: { constitution: 1 }, startingTCFormula: '3d6 x 10', startingHPBonus: 5, barehandDamage: '1d4', tags: [], traits: [], description: 'd', flavor: 'f' },
  { id: 'steel_grafted', name: 'Steel-Grafted', baseAC: 13, racialACBonus: '', racialStatBonuses: { strength: 2 }, startingTCFormula: '4d6 x 10', startingHPBonus: 12, barehandDamage: '1d6', tags: [], traits: [], description: 'd', flavor: 'f', startingWeapon: 'Trench Knife' },
];
const FACTIONS = [
  { id: 'us_navy', name: 'US Navy', subtitle: 'The fleet', goal: 'Win the war', flavor: 'f' },
];
const WEAPONS = [
  { name: 'M1 Garand', rarity: 'Common', weaponKind: 'ranged', damageType: 'piercing', damageDice: '1d10', stat: 'dexterity', tags: ['weapon', 'rifle'], description: 'A .30-06 service rifle.' },
  { name: 'Trench Knife', rarity: 'Common', weaponKind: 'melee', damageType: 'slashing', damageDice: '1d4', stat: 'strength', tags: ['weapon', 'knife'], description: 'Knuckle-dustered blade.' },
];

describe('engine_Dev — starter weapon is data-driven', () => {
  beforeEach(() => {
    setTableOverride('races', RACES);
    setTableOverride('factions', FACTIONS);
    setTableOverride('weapons', WEAPONS);
  });
  afterEach(() => clearAllOverrides());

  it('a custom race with no mapping equips the first Common weapon from the pack', () => {
    const pc = createCharacter({ name: 'Test', raceId: 'unaltered_human', factionId: 'us_navy' });
    expect(pc.equipped.main).toBe('M1 Garand');
    expect(pc.equipped.main).not.toBe('Rusted Blade');
    // ...and it's in the starter inventory.
    expect(pc.inventory.some((i) => i.name === 'M1 Garand')).toBe(true);
  });

  it('a race.startingWeapon field wins over the table default', () => {
    const pc = createCharacter({ name: 'Test', raceId: 'steel_grafted', factionId: 'us_navy' });
    expect(pc.equipped.main).toBe('Trench Knife');
  });
});

// engine_Dev — dog gear is author-definable as a first-class content table.
// An uploaded 'dogGear' table must (1) drive getDogGear()/findDogGearByName at
// call time with no reload, and (2) make a dog-armor CRAFTING/loot result resolve
// to kind 'dog_armor' (equippable on the companion dog) instead of a blank 'misc'.

import {
  getDogGear,
  findDogGearByName,
  lookupCraftedItem,
} from '../app/engine/crafting';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — dogGear override (author-defined dog armor)', () => {
  afterEach(() => clearAllOverrides());

  it('an uploaded dogGear table drives the live catalog', () => {
    expect(findDogGearByName('Trench Hound Cuirass')).toBeUndefined();
    setTableOverride('dogGear', [
      {
        name: 'Trench Hound Cuirass',
        kind: 'dog_armor',
        rarity: 'Rare',
        acBonus: 4,
        baseDurability: 40,
        statBonus: { stat: 'strength', amount: 2 },
        tags: ['dog', 'armor'],
        description: 'Riveted plate cut down to fit the dog.',
      },
    ]);
    const live = getDogGear();
    expect(live).toHaveLength(1);
    expect(live[0].name).toBe('Trench Hound Cuirass');
    expect(findDogGearByName('trench hound cuirass')?.acBonus).toBe(4);
  });

  it('an author dog-vest result crafts/loots to kind dog_armor, not misc', () => {
    // Before upload the name is unknown → blank misc.
    expect(lookupCraftedItem('Trench Hound Cuirass').kind).toBe('misc');
    setTableOverride('dogGear', [
      {
        name: 'Trench Hound Cuirass',
        kind: 'dog_armor',
        rarity: 'Rare',
        acBonus: 4,
        baseDurability: 40,
        tags: ['dog', 'armor'],
        description: 'Riveted plate cut down to fit the dog.',
      },
    ]);
    const crafted = lookupCraftedItem('Trench Hound Cuirass');
    expect(crafted.kind).toBe('dog_armor');
    expect(crafted.rarity).toBe('Rare');
    expect(crafted.baseDurability).toBe(40);
  });

  it('with no override, getDogGear falls back to the built-in vests', () => {
    expect(getDogGear().length).toBeGreaterThan(0);
  });
});

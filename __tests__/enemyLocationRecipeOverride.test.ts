// engine_Dev — uploaded enemies / locations / recipes reach their consumers
// (encounter + crafting), at call time, with no reload.

import { findEnemyByName } from '../app/engine/encounter';
import { getLocationById } from '../app/engine/encounter';
import { findRecipeByResult } from '../app/engine/crafting';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — enemies / locations / recipes overrides take effect', () => {
  afterEach(() => clearAllOverrides());

  it('an uploaded enemies table drives enemy lookup', () => {
    expect(findEnemyByName('Fog Wraith')).toBeNull();
    setTableOverride('enemies', [
      { name: 'Fog Wraith', hp: 12, rarity: 'Common', stats: { strength: 6, dexterity: 8 }, damageDice: '1d6' },
    ]);
    expect(findEnemyByName('Fog Wraith')?.name).toBe('Fog Wraith');
  });

  it('an uploaded locations table drives location lookup', () => {
    setTableOverride('locations', [
      { id: 'pier4', name: 'Pier 4', type: 'dock', danger: 1, description: 'Fog over grey water.', tags: ['dock'], discoverable: true },
    ]);
    expect(getLocationById('pier4').name).toBe('Pier 4');
  });

  it('an uploaded recipes table drives recipe lookup', () => {
    expect(findRecipeByResult('Degaussing Coil')).toBeNull();
    setTableOverride('recipes', [
      { result: 'Degaussing Coil', ingredients: [{ name: 'Copper Wire', quantity: 3 }] },
    ]);
    expect(findRecipeByResult('Degaussing Coil')?.result).toBe('Degaussing Coil');
  });
});

// engine_Dev — roadside traders are now author-overridable + carry a generic-game
// default (the last content type that was hardcoded outside the override system). Lock:
// override replaces the pool, the generic game supplies its own (no Tartaria leak),
// malformed rows drop, and clearing restores the built-in pool.

import { getActiveRoadside, pickRoadsideTrader } from '../app/engine/vendors';
import {
  setRoadsideOverride,
  getGenericRoadside,
  installGenericDefaults,
  clearGenericDefaults,
} from '../app/engine/contentPack';
import { GENERIC_GAME } from '../app/engine/genericGame';

describe('engine_Dev — roadside traders override + generic default', () => {
  afterEach(() => {
    setRoadsideOverride(null);
    clearGenericDefaults();
  });

  it('an uploaded archetype array replaces the built-in pool; clear restores it', () => {
    const builtinFirst = getActiveRoadside()[0]!.name; // a built-in Tartaria archetype
    setRoadsideOverride([
      { id: 'gi_blackmarket', name: 'Black-Market G.I.', title: 'quartermaster (off the books)', demeanor: 'sketchy', description: 'Sells what the requisition forms never saw.', pool: [{ itemName: 'Trail Rations', priceMin: 5, priceMax: 9, weight: 10 }] },
    ]);
    expect(getActiveRoadside().map((a) => a.name)).toEqual(['Black-Market G.I.']);
    // the spawner uses the override
    expect(pickRoadsideTrader().name).toBe('Black-Market G.I.');

    setRoadsideOverride(null);
    expect(getActiveRoadside()[0]!.name).toBe(builtinFirst);
  });

  it('the GENERIC game supplies its own roadside traders (no Tartaria fallback)', () => {
    installGenericDefaults(GENERIC_GAME);
    expect(getGenericRoadside()).toBeTruthy();
    const names = getActiveRoadside().map((a) => a.name);
    expect(names).toContain('Roadside Vendor'); // data-driven generic archetype (sampled from catalog)
    expect(JSON.stringify(getActiveRoadside())).not.toMatch(/tartar|aether/i);
  });

  it('drops malformed archetypes (missing name/pool) so a bad upload cannot crash spawning', () => {
    setRoadsideOverride([
      { id: 'ok', name: 'Good Stall', title: 't', demeanor: 'honest', description: 'd', pool: [{ itemName: 'Trail Rations', priceMin: 1, priceMax: 2, weight: 1 }] },
      { id: 'bad', title: 'no name', pool: [] },
      { name: 'no pool' },
    ]);
    expect(getActiveRoadside().map((a) => a.name)).toEqual(['Good Stall']);
  });
});

// engine_Dev — the three gameStore flavor pools (travel beats, ambient-search factoids,
// mystery seeds) + location/scene flavors now resolve through the Flavor block override
// (author → installed generic default → built-in Tartaria), so a reskin / the stock generic
// game never falls back to the Tartaria pools.

import { resolveFlavor, installGenericDefaults, clearGenericDefaults, setLoreOverride } from '../app/engine/contentPack';

const BUILTIN_TRAVEL = ['BUILTIN travel beat'];

afterEach(() => {
  clearGenericDefaults();
  setLoreOverride('flavor', null);
});

describe('engine_Dev — flavor pools resolve through the override layer', () => {
  it('with nothing installed, returns the built-in pool', () => {
    expect(resolveFlavor('travelBeats', BUILTIN_TRAVEL)).toBe(BUILTIN_TRAVEL);
  });

  it('an installed generic default shadows the built-in', () => {
    installGenericDefaults({ tables: {}, missions: {}, flavor: { travelBeats: ['GENERIC neutral beat'] } });
    expect(resolveFlavor('travelBeats', BUILTIN_TRAVEL)).toEqual(['GENERIC neutral beat']);
  });

  it('an author Flavor override wins over both generic and built-in', () => {
    installGenericDefaults({ tables: {}, missions: {}, flavor: { travelBeats: ['GENERIC neutral beat'] } });
    setLoreOverride('flavor', { travelBeats: ['AUTHOR beat'], ambientFlavor: ['author {noun} line'] });
    expect(resolveFlavor('travelBeats', BUILTIN_TRAVEL)).toEqual(['AUTHOR beat']);
    expect(resolveFlavor('ambientFlavor', ['builtin'])).toEqual(['author {noun} line']);
  });

  it('the installed generic game ships neutral travel/ambient/mystery pools (no Tartaria fallback)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GENERIC_GAME } = require('../app/engine/genericGame') as typeof import('../app/engine/genericGame');
    const f = GENERIC_GAME.flavor as unknown as Record<string, string[]>;
    for (const key of ['travelBeats', 'ambientFlavor', 'mysterySeeds']) {
      const pool = f[key] ?? [];
      expect(Array.isArray(pool) && pool.length > 0).toBe(true);
      expect(pool.join(' ')).not.toMatch(/Tartar|Aether|Reclaimer|Mud Monarch/i);
    }
  });
});

// engine_Dev — the Narration-flavor box: an uploaded 'flavor' lore block replaces
// the narrator's canned line-pools per key; omitted keys keep the built-ins.

import { resolveFlavor, setLoreOverride, clearAllOverrides } from '../app/engine/contentPack';
import { BUILTIN_FLAVOR_POOLS, buildFlavorTemplate } from '../app/engine/narrativeGenerator';

describe('engine_Dev — narration flavor override', () => {
  afterEach(() => clearAllOverrides());

  it('falls back to the built-in pool when nothing is uploaded', () => {
    expect(resolveFlavor('genericRemarks', BUILTIN_FLAVOR_POOLS.genericRemarks))
      .toBe(BUILTIN_FLAVOR_POOLS.genericRemarks);
  });

  it('an uploaded flavor key replaces only that pool', () => {
    setLoreOverride('flavor', { genericRemarks: ['You press on.', 'The quiet holds.'] });
    expect(resolveFlavor('genericRemarks', BUILTIN_FLAVOR_POOLS.genericRemarks))
      .toEqual(['You press on.', 'The quiet holds.']);
    // A key the author DIDN'T provide stays built-in (expand/contract friendly).
    expect(resolveFlavor('combatRemarks', BUILTIN_FLAVOR_POOLS.combatRemarks))
      .toBe(BUILTIN_FLAVOR_POOLS.combatRemarks);
  });

  it('the template exposes the real pool keys', () => {
    const t = buildFlavorTemplate(2);
    expect(Object.keys(t)).toEqual(expect.arrayContaining(['genericRemarks', 'combatRemarks', 'raceRemarks', 'factionRemarks']));
    expect(Array.isArray(t.genericRemarks)).toBe(true);
    expect((t.genericRemarks as string[]).length).toBeLessThanOrEqual(2);
  });
});

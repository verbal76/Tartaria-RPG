// engine_Dev — the content-pack seam: engine modules read content through the
// registry, which returns a developer override when one is loaded, else the
// built-in Tartaria default. These lock that contract.

import {
  resolveTable,
  setTableOverride,
  getWorldTone,
  getNarratorPersona,
  getNarratorName,
  setLoreOverride,
  clearAllOverrides,
  hasTableOverride,
  tableOverrideCount,
  DEFAULT_WORLD_TONE,
  DEFAULT_NARRATOR_NAME,
} from '../app/engine/contentPack';

describe('engine_Dev — content-pack registry', () => {
  afterEach(() => clearAllOverrides());

  it('resolveTable returns the built-in default when nothing is overridden', () => {
    const builtin = [{ name: 'Cudgel' }, { name: 'Iron Spear' }];
    expect(resolveTable('weapons', builtin)).toBe(builtin);
    expect(hasTableOverride('weapons')).toBe(false);
  });

  it('resolveTable returns the override once one is loaded', () => {
    const builtin = [{ name: 'Cudgel' }];
    const override = [{ name: 'Service Revolver' }, { name: 'Trench Knife' }];
    setTableOverride('weapons', override);
    expect(resolveTable('weapons', builtin)).toBe(override);
    expect(hasTableOverride('weapons')).toBe(true);
    expect(tableOverrideCount('weapons')).toBe(2);
  });

  it('clearing an override falls back to the built-in', () => {
    setTableOverride('weapons', [{ name: 'X' }]);
    setTableOverride('weapons', null);
    const builtin = [{ name: 'Cudgel' }];
    expect(resolveTable('weapons', builtin)).toBe(builtin);
  });

  it('world tone defaults to Tartaria + narrator persona is built from the name; both swap with a world-lore override', () => {
    expect(getWorldTone()).toBe(DEFAULT_WORLD_TONE);
    expect(getNarratorName()).toBe(DEFAULT_NARRATOR_NAME);
    expect(getNarratorPersona()).toContain(DEFAULT_NARRATOR_NAME);

    setLoreOverride('world', {
      narrator: 'You are the Operator, a clipped voice on a 1943 naval radio.',
      tone: 'Sailors vanish in a green haze off the USS Eldridge; time will not hold its shape.',
    });
    expect(getWorldTone()).toMatch(/USS Eldridge/);
    expect(getNarratorPersona()).toMatch(/Operator/);
  });

  it('a world-lore block without narrator/tone keeps the defaults', () => {
    setLoreOverride('world', { setting: 'Philadelphia, 1943' });
    expect(getWorldTone()).toBe(DEFAULT_WORLD_TONE);
    expect(getNarratorPersona()).toContain(DEFAULT_NARRATOR_NAME);
  });

  it('clearAllOverrides resets everything to built-in', () => {
    setTableOverride('armor', [{ name: 'flak jacket' }]);
    setLoreOverride('world', { tone: 'x' });
    clearAllOverrides();
    expect(hasTableOverride('armor')).toBe(false);
    expect(getWorldTone()).toBe(DEFAULT_WORLD_TONE);
  });
});

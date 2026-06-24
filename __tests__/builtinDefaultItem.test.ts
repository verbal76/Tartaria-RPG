// engine_Dev — Pink Phase 2 (provenance): an item still coming from the BUILT-IN catalog
// is un-authored "template" material the author should replace; the UI tints such names
// pink. Lock the detection: built-in names match (incl. the salvage/inventory leaks the
// WWII playtest surfaced), author-supplied names do not.

import { isBuiltInDefaultItem, builtInItemCount } from '../app/engine/builtinCatalogNames';

describe('engine_Dev — built-in default item detection (pink-flag Phase 2)', () => {
  it('indexes the whole built-in catalog', () => {
    // ~265 themed names plus the neutral ones — sanity floor.
    expect(builtInItemCount()).toBeGreaterThan(150);
  });

  it('flags built-in catalog items (the leaks the playtest surfaced)', () => {
    expect(isBuiltInDefaultItem('Aether Crystal')).toBe(true);
    expect(isBuiltInDefaultItem('Aetheric Shard')).toBe(true);
    expect(isBuiltInDefaultItem('Rusted Blade')).toBe(true);
  });

  it('matches case- and rarity-suffix-insensitively', () => {
    expect(isBuiltInDefaultItem('  aether crystal ')).toBe(true);
    // loot names carry a " (Common)" suffix that inventory names drop
    expect(isBuiltInDefaultItem('Rune Caster Shell')).toBe(true);
    expect(isBuiltInDefaultItem('Rune Caster Shell (Common)')).toBe(true);
  });

  it('does NOT flag author-supplied / unknown names', () => {
    expect(isBuiltInDefaultItem('Enfield No. 2 Revolver')).toBe(false); // WWII author item
    expect(isBuiltInDefaultItem('Louisville Slugger')).toBe(false);
    expect(isBuiltInDefaultItem('')).toBe(false);
    expect(isBuiltInDefaultItem(null)).toBe(false);
    expect(isBuiltInDefaultItem(undefined)).toBe(false);
  });
});

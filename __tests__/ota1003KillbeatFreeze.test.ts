// OTA-1003 — the kill-beat freeze, fixed. The canonical identity helpers ran
// up to nine linear catalog scans per call; the kill path multiplied that
// into a blocked JS thread (the owner's 7-8s "resolving" hang on the final
// blow). Per-name memo caches make repeats O(1) with identical semantics.
import * as fs from 'fs';
import * as path from 'path';
import { canonicalItemTags, canonicalItemKind, canonicalItemRarity } from '../app/engine/crafting';

describe('OTA-1003 — memoized canonical identity keeps its semantics', () => {
  it('repeat calls return identical results (cache is transparent)', () => {
    const vial = { name: 'Poison Vial', tags: ['potion'] };
    const first = canonicalItemTags(vial);
    const again = canonicalItemTags({ name: 'Poison Vial', tags: ['potion'] });
    expect(again).toEqual(first);
    expect(first).toContain('weapon_coating');
    expect(canonicalItemKind({ name: 'Climbing Rope', kind: 'relic' } as any))
      .toBe(canonicalItemKind({ name: 'Climbing Rope', kind: 'relic' } as any));
    expect(canonicalItemRarity({ name: 'Beast Fang', rarity: 'Common' } as any)).toBe('Rare');
  });
  it('instance-only differences still flow through the cached catalog half', () => {
    expect(canonicalItemTags({ name: 'Poison Vial', tags: ['loot'] })).toContain('loot');
    expect(canonicalItemTags({ name: 'Poison Vial', tags: [] })).not.toContain('loot');
    expect(canonicalItemTags({ name: 'zz-not-real', tags: ['thrown'] })).toEqual(['thrown']);
  });
  it('the hot loop is O(1) after first resolution (coarse, non-flaky bound)', () => {
    canonicalItemTags({ name: 'Titan Core', tags: [] }); // prime
    const t0 = Date.now();
    for (let i = 0; i < 5000; i++) canonicalItemTags({ name: 'Titan Core', tags: ['loot'] });
    expect(Date.now() - t0).toBeLessThan(250);
  });
  it('the caches exist at the choke point (source lock)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'crafting.ts'), 'utf8');
    expect(src).toContain('CANON_TAG_CACHE');
    expect(src).toContain('CANON_ROW_CACHE');
    expect(src).toContain('function canonicalRowFor(');
  });
});

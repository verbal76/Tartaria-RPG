// OTA-1204 — TROPHY COHERENCE ACROSS EVERY MINT. The 2026-08-10 audit's pricing gap:
// an uncatalogued part minted by a SEARCH carried no 'trophy' tag and sold at FULL
// rarity base, while the IDENTICAL part minted by a KILL was trophy-halved (OTA-943).
// Same part, same vendor, two prices — decided by which verb produced it. EV was
// trivial (~0.14 TC/search worst case); the fix is for coherence, not economy.
//
// The fix: every noun-harvest mint (break / attack-fallback / salvage / scan /
// search / rest-trinket) classifies through resolveLootItem — the kill path's OWN
// canonical resolver (OTA-938) — instead of lookupCraftedItem, whose uncatalogued
// fallback is TAGLESS. Name and rarity still come from the outcome; only the
// kind/tags classification moved.
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveLootItem, findCatalogItem } from '../app/engine/crafting';
import { sellPriceFor } from '../app/engine/sellPrice';
import type { InventoryItem } from '../app/engine/types';
import { blockAt } from '../test-utils/srcBlock';

const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

function mk(over: Partial<InventoryItem>): InventoryItem {
  return {
    id: 't', name: 'X', kind: 'misc', rarity: 'Legendary', quantity: 1,
    tags: [], ...over,
  } as InventoryItem;
}

describe('OTA-1204 — the resolver the mints now share', () => {
  it('an uncatalogued name mints WITH the trophy tag, at the rarity handed in', () => {
    const minted = resolveLootItem('Definitely Uncatalogued Gizzard', 'Rare');
    expect(minted.tags).toContain('trophy');
    expect(minted.rarity).toBe('Rare');
    // Sanity on the premise: the name really is catalog-absent.
    expect(findCatalogItem('Definitely Uncatalogued Gizzard', { aliases: false })).toBeNull();
  });

  it('a REAL catalog name keeps its own tags — no trophy stamp on genuine items', () => {
    const real = resolveLootItem('Dragon Scale');
    expect(real.tags).not.toContain('trophy');
  });

  it('the tag is what halves the sale — the gap this OTA closes, priced', () => {
    const untagged = sellPriceFor(mk({ name: 'Uncatalogued Gizzard', tags: [] }), null);
    const tagged = sellPriceFor(mk({ name: 'Uncatalogued Gizzard', tags: ['trophy'] }), null);
    expect(tagged).toBeLessThan(untagged);
    expect(tagged).toBeGreaterThanOrEqual(Math.floor(untagged / 2) - 1);
    expect(tagged).toBeLessThanOrEqual(Math.ceil(untagged / 2) + 1);
  });
});

describe('OTA-1204 — every noun-harvest mint classifies through resolveLootItem', () => {
  // ⚠ Source pin, by mint id. Each stampDurability block is found by its own id
  // template; the classifier assignment sits within the preceding few hundred
  // characters. A regression back to lookupCraftedItem at ANY of the six mints
  // reopens the two-price gap silently — sellPrice has no way to see it.
  const MINT_IDS = ['`break_', '`search_', '`salvage_', '`scan_', '`rest_'] as const;

  for (const idPrefix of MINT_IDS) {
    it(`the ${idPrefix.slice(1)} mint(s) use the kill path's resolver`, () => {
      let from = 0;
      let found = 0;
      for (;;) {
        const at = store.indexOf(`id: ${idPrefix}`, from);
        if (at === -1) break;
        from = at + 1;
        // A mint with NO classifier (the hard-coded Aether Residue sleight-of-hand
        // grant authors its own tags by hand) has nothing to pin — skip it rather
        // than judging some unrelated earlier assignment.
        if (!blockAt(store, `id: ${idPrefix}`).includes('itemCat')) continue;
        found += 1;
        // ⚠ The judged text is the mint's OWN classifier — the `const itemCat =`
        // assignment nearest above the id. A plain no-lookupCraftedItem-nearby
        // window flags NEIGHBOURS (the recipe-learned log line, the medkit mint)
        // and the first spelling of this pin did exactly that.
        const assignAt = store.lastIndexOf('const itemCat = ', at);
        expect(assignAt).toBeGreaterThan(-1);
        const assign = store.slice(assignAt, store.indexOf('\n', assignAt));
        expect({ id: idPrefix, assign, resolver: assign.includes('resolveLootItem(') })
          .toEqual({ id: idPrefix, assign, resolver: true });
      }
      expect(found).toBeGreaterThan(0);
    });
  }
});

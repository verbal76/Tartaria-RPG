import { itemIsTool } from '../app/engine/pouchEligibility';
import { validSlotsForItem } from '../app/engine/equipment';
import explorationData from '../app/data/items/exploration.json';
import type { InventoryItem } from '../app/engine/types';

// arb-fix — "Echoing Steps Boots" (a Reclaimer race-starter) were authored in
// exploration.json with kind 'exploration' + a 'tool' tag, so they were granted
// as a misc TOOL and showed in the pouch. Boots are feet ARMOR. The catalog
// entry is now kind 'armor' + ['armor','feet'] tags (no 'tool'/'exploration'),
// and explorationToInventoryKind grants 'armor'-tagged starter items as armor.
const BOOTS = (explorationData as Array<{ name: string; kind?: string; tags: string[] }>)
  .find((x) => x.name === 'Echoing Steps Boots')!;

describe('Echoing Steps Boots are armor, not a tool', () => {
  it('catalog entry is kind armor with feet/armor tags and no tool tag', () => {
    expect(BOOTS.kind).toBe('armor');
    expect(BOOTS.tags).toContain('armor');
    expect(BOOTS.tags).toContain('feet');
    expect(BOOTS.tags).not.toContain('tool');
    expect(BOOTS.tags).not.toContain('exploration');
    // wardrobe would mis-route to the cloak slot — must NOT be present.
    expect(BOOTS.tags).not.toContain('wardrobe');
  });

  it('as an inventory item it is NOT a tool and equips to the feet slot', () => {
    const inv: InventoryItem = {
      id: 'b1', name: 'Echoing Steps Boots', kind: 'armor', quantity: 1,
      rarity: 'Common', tags: ['armor', 'feet', 'common', 'race_starter', 'reclaimer'],
    };
    expect(itemIsTool(inv)).toBe(false);
    expect(validSlotsForItem(inv)).toEqual(['feet']);
  });
});

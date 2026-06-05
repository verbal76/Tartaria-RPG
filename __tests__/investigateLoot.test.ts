// investigate loot economy (arb61, Piece C). Investigate's NORM is clues +
// mission hooks; its ONLY item drop is a RARE Uncommon gear-or-material find,
// never the common ground junk it used to forage. Search/harvest are unchanged.

import { rollAreaSearch } from '../app/engine/areaSearch';
import { lookupCraftedItem } from '../app/engine/crafting';

describe('investigate loot economy', () => {
  it('norm is clues/hooks; item drops are RARE Uncommon finds that resolve to catalog gear/material', () => {
    const N = 6000;
    let nothing = 0, material = 0, tc = 0, hookish = 0;
    const mats = new Set<string>();
    for (let i = 0; i < N; i++) {
      const o = rollAreaSearch('research chart', { intent: 'investigate' });
      if (o.kind === 'nothing') nothing++;
      else if (o.kind === 'material') { material++; if (o.itemName) mats.add(o.itemName); }
      else if (o.kind === 'tc') tc++;
      else hookish++; // hook / directional_find / cool_story
    }
    // clues/hooks dominate the norm; material drops are the rare exception
    expect(hookish / N).toBeGreaterThan(0.6);
    expect(material / N).toBeLessThan(0.12);
    // never the old common ground junk
    expect(mats.has('Big Rock')).toBe(false);
    expect(mats.has('Stick')).toBe(false);
    // every investigate find is Uncommon and resolves to a real catalog item;
    // gear lands as weapon/armor (not inert misc)
    for (const name of mats) {
      const cat = lookupCraftedItem(name);
      expect(cat).toBeTruthy();
    }
    expect(lookupCraftedItem('Mud-Rend Blade').kind).toBe('weapon');
    expect(lookupCraftedItem("Aether-Seeker's Cap").kind).toBe('armor');
  });

  it('search (non-investigate) still forages common SMALL_FINDS', () => {
    let sawCommon = false;
    for (let i = 0; i < 3000 && !sawCommon; i++) {
      const o = rollAreaSearch('rubble', { intent: 'search' });
      if (o.kind === 'material' && o.rarity === 'Common') sawCommon = true;
    }
    expect(sawCommon).toBe(true);
  });
});

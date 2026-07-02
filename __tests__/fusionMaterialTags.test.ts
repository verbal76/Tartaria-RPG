// OTA — the info block tells the player what material an item contributes to a fusion.
// Output rarity is driven by DISTINCT-material diversity, so this helper must surface
// the material tag(s) from both the item's tags and its name.
import { fusionMaterialTags } from '../app/engine/itemFusion';

describe('fusionMaterialTags', () => {
  it('reads material tags off the item tags', () => {
    expect(fusionMaterialTags({ name: 'Odd Cog', tags: ['loot', 'metal'] })).toContain('metal');
  });
  it('derives material from the name when tags are sparse', () => {
    // "claw" → organic via inferGearTagPack (same path gateFusion uses).
    expect(fusionMaterialTags({ name: 'Shrike Claw', tags: [] })).toContain('organic');
  });
  it('returns [] for a material-less name/tags', () => {
    expect(fusionMaterialTags({ name: 'Nondescript Thing', tags: ['loot'] })).toEqual([]);
  });
});

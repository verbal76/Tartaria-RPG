// OTA-661 — a Climbing Rope repaired with Sticks and Small Rocks. repairCostMaterials
// is scrapOutputFor × 2, and scrapEngine only recognized metal/stone/cloth/fiber/wood/
// aether/mud — so a `rope`-tagged (but not fiber-tagged) rope, and the "cold iron" Pry
// Bar (tool/pry/utility, no metal tag), both fell through to the bare Stick+Small Rock
// fallback. Rope is now treated as fiber (→ Patched Cloth) and the Pry Bar carries a
// `metal` tag (→ Scrap Metal), so both scrap/repair into the right stock.

import { repairCostMaterials, scrapOutputFor } from '../app/engine/scrapEngine';
import { findCatalogItem } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

function inv(name: string): InventoryItem {
  const cat = findCatalogItem(name)!;
  return { id: `t_${name}`, name: cat.name, kind: cat.kind, rarity: cat.rarity, tags: cat.tags, quantity: 1 } as unknown as InventoryItem;
}
const names = (list: Array<{ name: string }>) => list.map((g) => g.name);

describe('rope/tool scrap + repair use the right material (OTA-661)', () => {
  it('a Climbing Rope scraps/repairs into Patched Cloth, not Stick + Small Rock', () => {
    const rope = inv('Climbing Rope');
    const scrap = names(scrapOutputFor(rope).grants);
    expect(scrap).toContain('Patched Cloth');
    expect(scrap).not.toContain('Stick');
    expect(scrap).not.toContain('Small Rock');
    const repair = names(repairCostMaterials(rope));
    expect(repair).toContain('Patched Cloth');
    expect(repair).not.toContain('Stick');
    expect(repair).not.toContain('Small Rock');
  });

  it('the cold-iron Pry Bar scraps/repairs into Scrap Metal', () => {
    const pry = inv('Pry Bar');
    expect(names(scrapOutputFor(pry).grants)).toContain('Scrap Metal');
    const repair = names(repairCostMaterials(pry));
    expect(repair).toContain('Scrap Metal');
    expect(repair).not.toContain('Small Rock');
  });
});

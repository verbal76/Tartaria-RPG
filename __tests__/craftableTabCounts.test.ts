// OTA-708 — the crafting-screen tab badges show how many blueprints the player can
// make RIGHT NOW (materials in hand), split the same way the tabs are: consumable
// results → RECIPES tab, everything else → CRAFT tab. craftableRecipeCounts is the
// engine helper behind those badges.

import { craftableRecipeCounts } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const mat = (name: string, quantity: number): InventoryItem =>
  ({ id: name.toLowerCase().replace(/\s+/g, '_'), name, kind: 'material', quantity, tags: [] } as InventoryItem);

describe('craftableRecipeCounts (OTA-708)', () => {
  it('nothing is craftable with an empty pack', () => {
    const c = craftableRecipeCounts([]);
    expect(c.craft).toBe(0);
    expect(c.recipes).toBe(0);
  });

  it('a WEAPON recipe (Throwing Knife = Scrap Metal + Stick) counts toward CRAFT', () => {
    const c = craftableRecipeCounts([mat('Scrap Metal', 1), mat('Stick', 1)]);
    expect(c.craft).toBeGreaterThanOrEqual(1);
  });

  it('a CONSUMABLE recipe (Static Paste = 2 Aether Dust + Speckled Egg) counts toward RECIPES', () => {
    const c = craftableRecipeCounts([mat('Aether Dust', 2), mat('Speckled Egg', 1)]);
    expect(c.recipes).toBeGreaterThanOrEqual(1);
  });

  it('only affordable recipes count — adding materials never lowers a count', () => {
    const empty = craftableRecipeCounts([]);
    const withMats = craftableRecipeCounts([mat('Scrap Metal', 1), mat('Stick', 1)]);
    expect(withMats.craft).toBeGreaterThan(empty.craft);
  });
});

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

  // OTA-718 — a discoverable (rare/legendary-result) recipe does NOT count as
  // craftable while it's still LOCKED, even with its materials in the pack. It
  // only counts once the player has learned it (player.knownRecipes). Mudstone
  // (Rare) = 3× Mud Fragment is a clean single-ingredient discoverable recipe.
  it('a locked discoverable recipe is not counted until learned', () => {
    const pack = [mat('Mud Fragment', 3)];
    // A real player always carries a knownRecipes array (empty or grandfathered),
    // so gating applies. Passing undefined is the legacy "count everything" path.
    const locked = craftableRecipeCounts(pack, []);            // Mudstone (Rare) locked → excluded
    const learned = craftableRecipeCounts(pack, ['Mudstone']); // now unlocked
    expect(learned.craft).toBe(locked.craft + 1);
    // Basic recipes are unaffected by an empty knownRecipes list: with only Mud
    // Fragment in hand, Mudstone is the ONLY thing makeable, so locked drops to 0.
    expect(locked.craft).toBe(0);
  });
});

// OTA-763 — mud recipes accept the cheap mud the player actually forages, and a
// craft never eats a Rare+ material as a low-tier substitute.
//
// Playtest: a pack with Mud Essence ×9 / Aetheric Sludge / Aether Mud still couldn't
// build the Common Mud Scanner (needs "Aether Mud ×3" + "Mud Fragment ×2") because the
// substitution map had NO mud rule — those mud mats couldn't stand in. Now they can;
// and the rarity guard keeps a Rare Mudstone out of the cheap slot.

import { RECIPES, missingIngredientsList, consumeIngredientsList } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const mk = (name: string, quantity: number, tags: string[], rarity = 'Common'): InventoryItem =>
  ({ id: name, name, kind: 'misc', quantity, rarity, tags } as InventoryItem);

// Mirrors the reported pack: abundant cheap mud + Rare Mudstone + the rest on hand.
const pack = (): InventoryItem[] => [
  mk('Aether Mud', 1, ['mud', 'aether']),
  mk('Mud Essence', 9, ['mud', 'aether'], 'Uncommon'),
  mk('Aetheric Sludge', 1, ['mud', 'aether']),
  mk('Mudstone', 2, ['mud', 'stone'], 'Rare'),
  mk('Aether Crystal', 40, ['aether', 'crystal']),
  mk('Scrap Metal', 80, ['metal']),
];

describe('OTA-763 — Mud Scanner builds from foraged mud; Rare Mudstone is preserved', () => {
  const recipe = RECIPES.find((r) => r.result === 'Mud Scanner');

  it('the recipe exists', () => {
    expect(recipe).toBeTruthy();
  });

  it('is craftable — cheap mud satisfies the "Aether Mud" / "Mud Fragment" slots', () => {
    expect(missingIngredientsList(recipe!.ingredients, pack())).toEqual([]);
  });

  it('consumes cheap mud but never the Rare Mudstone', () => {
    const after = consumeIngredientsList(pack(), recipe!.ingredients);
    const mudstone = after.find((i) => i.name === 'Mudstone');
    expect(mudstone?.quantity).toBe(2); // untouched
    // 5 mud total spent (3 Aether Mud + 2 Mud Fragment): 1 exact Aether Mud + 4 cheap subs.
    const cheapMudLeft = after
      .filter((i) => ['Aether Mud', 'Mud Essence', 'Aetheric Sludge'].includes(i.name))
      .reduce((n, i) => n + i.quantity, 0);
    expect(cheapMudLeft).toBe(11 - 5);
  });

  it('a Rare-only mud pack cannot cheat the slot (rarity guard holds)', () => {
    const rareOnly = [
      mk('Mudstone', 5, ['mud', 'stone'], 'Rare'),
      mk('Aether Crystal', 40, ['aether', 'crystal']),
      mk('Scrap Metal', 80, ['metal']),
    ];
    // Aether Mud ×3 + Mud Fragment ×2 still short — Rare mud can't substitute.
    expect(missingIngredientsList(recipe!.ingredients, rareOnly).length).toBeGreaterThan(0);
  });
});

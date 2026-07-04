// OTA-968 — a rope repaired with the bare Stick+Small Rock fallback. repairCostMaterials
// is scrapOutputFor × 2, and scrapEngine only recognized metal/stone/cloth/fiber/wood/
// aether/mud — so a `rope`-tagged item with no fiber tag (and the "cold iron" Pry Bar with
// no metal tag) fell through to the fallback. `rope` is now treated as fiber. engine_Dev
// resolves material names through data-driven roles, so this asserts the engine RULE with
// synthetic items rather than hard-coding role names.

import { scrapOutputFor } from '../app/engine/scrapEngine';
import type { InventoryItem } from '../app/engine/types';

function item(tags: string[], kind = 'misc'): InventoryItem {
  return { id: 't', name: 't', kind, rarity: 'Common', tags, quantity: 1 } as unknown as InventoryItem;
}
const names = (l: Array<{ name: string }>) => l.map((g) => g.name);

// Derive THIS game's role material names behaviorally (data-driven; may be
// "Patched Cloth"/"Scrap Metal" or a generic pack's names).
const CLOTH = names(scrapOutputFor(item(['cloth'])).grants)[0]!;
const METAL = names(scrapOutputFor(item(['metal'])).grants)[0]!;
const FALLBACK = names(scrapOutputFor(item(['nonsense_tag'])).grants); // wood + stone roles

describe('rope/tool scrap use the right material role (OTA-968)', () => {
  it('a rope-tagged item scraps into the cloth role, not the bare fallback', () => {
    const rope = item(['utility', 'gate', 'rope']); // mirrors the Climbing Rope
    const out = names(scrapOutputFor(rope).grants);
    expect(out).toContain(CLOTH);
    // Not the bare fallback set (which an untagged misc gets).
    expect(out).not.toEqual(FALLBACK);
  });

  it('a metal-tagged tool (Pry Bar) scraps into the metal role', () => {
    const pry = item(['tool', 'pry', 'utility', 'metal']);
    expect(names(scrapOutputFor(pry).grants)).toContain(METAL);
  });
});

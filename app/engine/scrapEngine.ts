// scrapEngine — disassemble built items into stock materials.
//
// Players who outgrow a starter weapon or pick up redundant gear at a
// vendor have no use for the item but can't easily turn it into
// crafting stock without it. Scrapping closes the loop: any built
// item (weapon / armor / relic / gear) breaks down into 1–2 common
// materials chosen by the item's tags.
//
// Output is intentionally modest — the player should never out-earn
// dig + recipe by just buying-and-scrapping at vendors. One scrap =
// roughly one common dig.

import type { InventoryItem } from './types';

export interface ScrapOutput {
  /** Materials granted to the player. */
  grants: Array<{ name: string; quantity: number }>;
  /** Human-readable summary for the world-channel log. */
  summary: string;
}

/** True if the item can be scrapped — weapons, armor, relics, and
 *  durable gear all qualify. Materials (`misc` / `consumable`) are
 *  already stock and refuse scrapping. */
export function canScrap(item: InventoryItem): boolean {
  if (item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'relic') return true;
  // Some gear (compass, torch, rope) carries useful base materials —
  // allow scrap as long as the item isn't a raw commodity.
  if (item.kind === 'misc' && (item.tags ?? []).some((t) =>
    /metal|wood|stone|aether|crystal|fiber|cloth|plate|scaled/i.test(t),
  )) {
    // Materials with these tags already ARE the scrap output — refuse
    // to scrap them into themselves.
    const rawNames = new Set([
      'Scrap Metal', 'Stick', 'Small Rock', 'Big Rock', 'Patched Cloth',
      'Spider Silk', 'Aether Crystal', 'Aetheric Shard', 'Aether Residue',
      'Mud Fragment', 'Aether Mud',
    ]);
    return !rawNames.has(item.name);
  }
  return false;
}

/** Derive the scrap output for an item. Tag-driven so any new item
 *  added to the catalog with sensible tags scraps cleanly without
 *  needing a manual mapping. */
export function scrapOutputFor(item: InventoryItem): ScrapOutput {
  const tags = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
  const grants: Array<{ name: string; quantity: number }> = [];
  // Metal content → Scrap Metal. Bolt-casters / blades / armor plates
  // all carry it.
  if (tags.has('metal') || tags.has('plate') || tags.has('iron') || tags.has('blade') || item.kind === 'weapon') {
    grants.push({ name: 'Scrap Metal', quantity: 1 });
  }
  // Wooden handle / haft → Stick.
  if (tags.has('wood') || tags.has('haft') || item.kind === 'weapon') {
    grants.push({ name: 'Stick', quantity: 1 });
  }
  // Stone / mud heads → Small Rock.
  if (tags.has('stone') || tags.has('mudstone') || tags.has('improvised')) {
    grants.push({ name: 'Small Rock', quantity: 1 });
  }
  // Cloth / fiber → Patched Cloth.
  if (tags.has('cloth') || tags.has('fiber') || tags.has('organic') || item.kind === 'armor') {
    grants.push({ name: 'Patched Cloth', quantity: 1 });
  }
  // Aether content → Aetheric Shard. Relics + Aether-tagged gear.
  if (tags.has('aether') || tags.has('crystal') || item.kind === 'relic') {
    grants.push({ name: 'Aetheric Shard', quantity: 1 });
  }
  // Fallback — every scrap should give SOMETHING, otherwise the
  // player wasted the click. A bare misc gives a Stick + Small Rock.
  if (grants.length === 0) {
    grants.push({ name: 'Stick', quantity: 1 });
    grants.push({ name: 'Small Rock', quantity: 1 });
  }
  // De-dupe — if both "weapon" and "metal" tags pushed Scrap Metal,
  // collapse to a single grant rather than 2.
  const merged = new Map<string, number>();
  for (const g of grants) {
    merged.set(g.name, (merged.get(g.name) ?? 0) + g.quantity);
  }
  const finalGrants = Array.from(merged.entries()).map(([name, quantity]) => ({ name, quantity }));
  const summary = finalGrants
    .map((g) => g.quantity > 1 ? `${g.name} x${g.quantity}` : g.name)
    .join(', ');
  return { grants: finalGrants, summary };
}

/** Material cost to fully repair an item — exactly 2× its scrap
 *  output. Playtester spec: "if your helmet scraps to 4 scrap metal
 *  and 2 cloth, it should cost 8 scrap metal and 4 cloth to repair.
 *  double the drop rate for the repair rate."
 *
 *  Returns an empty list when the item has no scrap output (raw
 *  materials, consumables) — caller should not surface repair for
 *  such items. */
export function repairCostMaterials(item: InventoryItem): Array<{ name: string; quantity: number }> {
  const out = scrapOutputFor(item);
  return out.grants.map((g) => ({ name: g.name, quantity: g.quantity * 2 }));
}

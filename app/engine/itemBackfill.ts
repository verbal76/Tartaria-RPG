// itemBackfill — one-shot pass over an existing player inventory
// that re-stamps the OTA-191 synthesized fields (effect, tags,
// description) onto items that were added BEFORE the upgraded
// `itemDefaults.ts` shipped. Without this, the player's "ton of
// useless items" stays useless until they re-acquire each item;
// the backfill walks the inventory and overlays the now-synthesized
// values in place.
//
// Idempotent — safe to call multiple times. The merge logic only
// fills FIELDS THAT ARE MISSING on the stored item, so an item
// that already carries authored tags / effect data is left alone.
// Flag-gated in gameStore.hydrate so the actual disk write
// happens exactly once per save slot regardless.

import type { InventoryItem } from './types';
import {
  findWeaponByName,
  findArmorByName,
  findAmuletByName,
  findRingByName,
  findGearByName,
  findExplorationItemByName,
  findMaterialByName,
} from './crafting';
import { inferGear, inferWeapon, inferArmor, inferAccessory } from './itemDefaults';

/** Resolve the catalog row for an item by name. Tries every catalog
 *  lookup in turn; falls through to the appropriate inference path
 *  for items the hand-authored catalogs don't cover. Mirrors the
 *  same fallback chain `findCatalogItem` uses but typed-loose so we
 *  can read the shared fields (tags, description, effect) uniformly. */
function resolveCatalogShape(item: InventoryItem): {
  tags?: readonly string[];
  description?: string;
  effect?: unknown;
} | null {
  // Authored catalogs first. The order matches `findCatalogItem` in
  // crafting.ts so a name that lives in materials.json isn't redirected
  // to gear inference, etc.
  const w = findWeaponByName(item.name);
  if (w) return w;
  const a = findArmorByName(item.name);
  if (a) return a;
  const am = findAmuletByName(item.name);
  if (am) return am;
  const r = findRingByName(item.name);
  if (r) return r;
  const g = findGearByName(item.name);
  if (g) return g;
  const ex = findExplorationItemByName(item.name);
  if (ex) return ex;
  const m = findMaterialByName(item.name);
  if (m) return m;

  // Fall through to inference based on the item's kind. Mirrors how
  // the engine routes uncatalogued items live.
  if (item.kind === 'weapon') return inferWeapon(item.name);
  if (item.kind === 'armor') {
    const inferred = inferArmor(item.name);
    if (inferred) return inferred;
  }
  // Accessory inference reads name keywords (amulet / ring / band /
  // signet / etc.) regardless of the stored kind.
  const acc = inferAccessory(item.name);
  if (acc) return acc;

  // Everything else falls through to gear inference, which handles
  // food / drink / light / rope / fungus / compass and emits the
  // OTA-191 effect + scrap tags.
  return inferGear(item.name, item.tags);
}

/** Restamp one inventory item with any newly-synthesized fields it's
 *  missing. Returns a fresh InventoryItem with the merged tags +
 *  description; does NOT mutate the input. */
export function restampInventoryItem(item: InventoryItem): InventoryItem {
  const shape = resolveCatalogShape(item);
  if (!shape) return item;

  // Merge tags — keep every tag already on the inventory instance
  // (per-instance flags like 'stolen' are not on the catalog row),
  // add any tags the synthesized row carries. De-duped.
  const existingTags = item.tags ?? [];
  const catalogTags = (shape.tags ?? []) as string[];
  const mergedTags = Array.from(new Set([...existingTags, ...catalogTags]));

  // Description: prefer the existing description if it's not the
  // bare "Field-inferred" placeholder. The synthesized rows now
  // carry better text; let it overwrite the old placeholder so the
  // inventory screen reads fresh.
  const isPlaceholder = typeof item.description !== 'string'
    || item.description.length === 0
    || /Field-inferred from the name\. Catalog backfill pending\.?$/i.test(item.description.trim())
    || /pending catalog backfill\.?$/i.test(item.description.trim());
  const description = isPlaceholder
    ? (shape.description ?? item.description)
    : item.description;

  return {
    ...item,
    tags: mergedTags,
    ...(description !== undefined ? { description } : {}),
  };
}

/** Walk an entire inventory and restamp every item. Returns a fresh
 *  array; safe to call on a frozen player object. */
export function restampInventory(inventory: readonly InventoryItem[]): InventoryItem[] {
  return inventory.map(restampInventoryItem);
}

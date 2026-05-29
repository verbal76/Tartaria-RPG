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
 *  for items the hand-authored catalogs don't cover. The `source`
 *  flag distinguishes catalog hits (authored — preserve the in-pack
 *  description) from inferred rows (synthesized — let the freshest
 *  description win when restamping). */
type ResolvedShape = {
  tags?: readonly string[];
  description?: string;
  effect?: unknown;
};
function resolveCatalogShape(item: InventoryItem):
  | { shape: ResolvedShape; source: 'catalog' | 'inferred' }
  | null {
  // Authored catalogs first. The order matches `findCatalogItem` in
  // crafting.ts so a name that lives in materials.json isn't redirected
  // to gear inference, etc.
  const w = findWeaponByName(item.name);
  if (w) return { shape: w, source: 'catalog' };
  const a = findArmorByName(item.name);
  if (a) return { shape: a, source: 'catalog' };
  const am = findAmuletByName(item.name);
  if (am) return { shape: am, source: 'catalog' };
  const r = findRingByName(item.name);
  if (r) return { shape: r, source: 'catalog' };
  const g = findGearByName(item.name);
  if (g) return { shape: g, source: 'catalog' };
  const ex = findExplorationItemByName(item.name);
  if (ex) return { shape: ex, source: 'catalog' };
  const m = findMaterialByName(item.name);
  if (m) return { shape: m, source: 'catalog' };

  // Fall through to inference based on the item's kind. Mirrors how
  // the engine routes uncatalogued items live.
  if (item.kind === 'weapon') return { shape: inferWeapon(item.name), source: 'inferred' };
  if (item.kind === 'armor') {
    const inferred = inferArmor(item.name);
    if (inferred) return { shape: inferred, source: 'inferred' };
  }
  // Accessory inference reads name keywords (amulet / ring / band /
  // signet / etc.) regardless of the stored kind.
  const acc = inferAccessory(item.name);
  if (acc) return { shape: acc, source: 'inferred' };

  // Everything else falls through to gear inference, which handles
  // food / drink / light / rope / fungus / compass and emits the
  // OTA-191 effect + scrap tags.
  return { shape: inferGear(item.name, item.tags), source: 'inferred' };
}

/** Restamp one inventory item with any newly-synthesized fields it's
 *  missing. Returns a fresh InventoryItem with the merged tags +
 *  description; does NOT mutate the input. */
export function restampInventoryItem(item: InventoryItem): InventoryItem {
  const resolved = resolveCatalogShape(item);
  if (!resolved) return item;
  const { shape, source } = resolved;

  // Merge tags — keep every tag already on the inventory instance
  // (per-instance flags like 'stolen' are not on the catalog row),
  // add any tags the synthesized row carries. De-duped.
  const existingTags = item.tags ?? [];
  const catalogTags = (shape.tags ?? []) as string[];
  const mergedTags = Array.from(new Set([...existingTags, ...catalogTags]));

  // Description policy:
  //   - Catalog hits (authored) — leave the stored description alone
  //     unless it's the legacy placeholder string. Hand-authored copy
  //     is canonical.
  //   - Inferred items — the fresh shape.description IS the canonical
  //     one (it picks up any Qwen overlay from the cache), so prefer
  //     it. This lets a live restamp on Qwen-lands actually update
  //     what the player sees without a save reload.
  const stored = typeof item.description === 'string' ? item.description.trim() : '';
  const isLegacyPlaceholder = stored.length === 0
    || /Field-inferred from the name\. Catalog backfill pending\.?$/i.test(stored)
    || /pending catalog backfill\.?$/i.test(stored);
  const description = source === 'inferred'
    ? (shape.description ?? item.description)
    : (isLegacyPlaceholder ? (shape.description ?? item.description) : item.description);

  return {
    ...item,
    tags: mergedTags,
    ...(description !== undefined ? { description } : {}),
  };
}

/** OTA-192 — restamp every inventory entry that matches the given
 *  name (case-insensitive). Returns the new inventory array, or the
 *  input untouched if nothing changed. Used by the Qwen-cache-lands
 *  listener so a freshly synthesized item updates in-session. */
export function restampInventoryForName(
  inventory: readonly InventoryItem[],
  name: string,
): { inventory: InventoryItem[]; changed: boolean } {
  const lower = name.toLowerCase();
  let changed = false;
  const next = inventory.map((item) => {
    if (item.name.toLowerCase() !== lower) return item;
    const fresh = restampInventoryItem(item);
    if (
      fresh.description !== item.description
      || (fresh.tags ?? []).join('|') !== (item.tags ?? []).join('|')
    ) {
      changed = true;
      return fresh;
    }
    return item;
  });
  return { inventory: changed ? next : [...inventory], changed };
}

/** Walk an entire inventory and restamp every item. Returns a fresh
 *  array; safe to call on a frozen player object. */
export function restampInventory(inventory: readonly InventoryItem[]): InventoryItem[] {
  return inventory.map(restampInventoryItem);
}

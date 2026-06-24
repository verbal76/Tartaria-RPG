// engine_Dev — the set of every built-in catalog item NAME, used by the template-flag
// (pink) system to mark items that are still built-in DEFAULTS — un-authored "template"
// material the author should replace with their own. Built straight from the built-in
// JSON (the DEFAULT pack), independent of runtime overrides: an item whose name is in
// this set is engine-supplied; an author's uploaded item (a different name) is not.

import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import gearData from '../data/items/gear.json';
import materialsData from '../data/items/materials.json';
import amuletsData from '../data/items/amulets.json';
import ringsData from '../data/items/rings.json';
import explorationData from '../data/items/exploration.json';
import lootData from '../data/relics/loot_tables.json';

/** Normalize a display name for matching: lowercased, trimmed, and with a trailing
 *  " (Rarity)" suffix stripped (loot names carry it; inventory names usually don't). */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s*\((common|uncommon|rare|legendary|mythic)\)\s*$/i, '');
}

function names(raw: unknown, key?: string): string[] {
  const arr = Array.isArray(raw)
    ? raw
    : key && raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)[key]
      : null;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => (r && typeof r === 'object' && typeof (r as { name?: unknown }).name === 'string' ? (r as { name: string }).name : ''))
    .filter((n) => n.length > 0);
}

const BUILTIN_ITEM_NAMES: ReadonlySet<string> = new Set(
  [
    ...names(weaponsData, 'weapons'),
    ...names(armorData, 'armor'),
    ...names(gearData, 'gear'),
    ...names(materialsData, 'materials'),
    ...names(amuletsData, 'amulets'),
    ...names(ringsData, 'rings'),
    ...names(explorationData),
    ...names(lootData),
  ].map(norm),
);

/** True if `name` is a built-in catalog default — i.e. un-authored "template" material
 *  the author should replace with their own. Drives the pink template-flag tint on
 *  item names in the UI. An author's uploaded item (a name not in the built-in catalog)
 *  returns false. */
export function isBuiltInDefaultItem(name: string | null | undefined): boolean {
  if (!name) return false;
  return BUILTIN_ITEM_NAMES.has(norm(name));
}

/** Test/diagnostic: how many built-in catalog names are indexed. */
export function builtInItemCount(): number {
  return BUILTIN_ITEM_NAMES.size;
}

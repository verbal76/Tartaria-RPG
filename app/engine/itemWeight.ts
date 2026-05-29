// Item weight / mass for throw damage and other physics-driven mechanics.
// Rather than annotating every item in every JSON catalog, derive weight
// from kind + name heuristics. Returns a damage-die descriptor the throw
// handler can use:
//
//   1 → 1 damage (tossed lockets, paper, residue)
//   2 → 1d3   (small tools, knives, light gear)
//   3 → 1d4   (rations, weapons, medium items)
//   4 → 1d6   (heavy weapons, armor pieces, big tools)
//   5 → 1d8   (cores, ingots, blocks)
//
// Caller multiplies by a modifier if the item type is sharp (knives at
// the same weight do slightly more), but for throwing we keep it simple.

import type { InventoryItem } from './types';
import { rollDie } from './rng';

export type ItemWeight = 1 | 2 | 3 | 4 | 5;

const HEAVY_NAME_PATTERNS = /\b(core|stone|brick|ingot|anvil|hammer|axe|club|mace|maul|sword|greatsword|warhammer)\b/i;
const MEDIUM_NAME_PATTERNS = /\b(blade|knife|shiv|trowel|wand|wrench|tool|pickaxe|book|scroll)\b/i;
const LIGHT_NAME_PATTERNS = /\b(locket|ring|amulet|feather|powder|dust|residue|silk|fragment|shard|paper|cloth)\b/i;
const RATION_NAME_PATTERNS = /\b(ration|food|bread|meat|jerky|fungus)\b/i;

export function itemWeight(item: InventoryItem): ItemWeight {
  const name = (item.name ?? '').toLowerCase();
  // Catalog hints first.
  if (HEAVY_NAME_PATTERNS.test(name)) return 5;
  if (MEDIUM_NAME_PATTERNS.test(name)) return 3;
  if (LIGHT_NAME_PATTERNS.test(name)) return 1;
  if (RATION_NAME_PATTERNS.test(name)) return 2;
  // Kind fallbacks for unmatched names.
  switch (item.kind) {
    case 'weapon': return 4;
    case 'armor': return 4;
    case 'consumable': return 2;
    case 'relic': return 2;
    case 'runecaster': return 3;
    default: return 2;
  }
}

/** Roll the damage die a thrown item of this weight produces, plus a
 *  small flat bonus for the heaviest tier. Minimum 1.
 *
 *  OTA-198 / OTA-200 — name-based overrides for hand-shaped throwables.
 *  Both "Aetheric Shard" (looted crystal) and "Shaped Aetheric Shard"
 *  (Aethercrafted refinement) deal 2d20 on throw. Author intent: the
 *  raw shard already has the resonant edge; shaping just makes it
 *  fly cleaner (no flavor difference today; same dice). The player
 *  can throw either, trading a crafting material for one big hit.
 *  Single-use is enforced by the throw-consume path. */
export function rollThrowDamage(item: InventoryItem | null): number {
  if (!item) return 1; // bare rock
  const lower = (item.name ?? '').toLowerCase();
  if (lower === 'shaped aetheric shard' || lower === 'aetheric shard') {
    return rollDie(20) + rollDie(20);
  }
  const w = itemWeight(item);
  switch (w) {
    case 1: return 1;
    case 2: return rollDie(3);
    case 3: return rollDie(4);
    case 4: return rollDie(6);
    case 5: return rollDie(8) + 1;
  }
}

/** OTA-208 — dice-notation form of the throw damage for an item.
 *  Used by combat (getEquippedWeapon) when a throwable is equipped:
 *  the synthesized CatalogWeapon's damageDice is read by the attack
 *  roller. Mirrors the same name-override table that rollThrowDamage
 *  uses, so the two paths stay aligned. */
export function throwDamageNotation(item: InventoryItem | null): string {
  if (!item) return '1';
  const lower = (item.name ?? '').toLowerCase();
  if (lower === 'shaped aetheric shard' || lower === 'aetheric shard') return '2d20';
  const w = itemWeight(item);
  switch (w) {
    case 1: return '1';
    case 2: return '1d3';
    case 3: return '1d4';
    case 4: return '1d6';
    case 5: return '1d8+1';
  }
}

export function weightLabel(w: ItemWeight): string {
  switch (w) {
    case 1: return 'feather-light';
    case 2: return 'light';
    case 3: return 'balanced';
    case 4: return 'heavy';
    case 5: return 'crushing';
  }
}

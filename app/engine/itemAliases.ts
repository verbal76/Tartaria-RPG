// Ambient-noun → catalog-item aliases. The location interactables
// hold many variants of portable items ('rope coil', 'broken compass',
// 'dust lantern', 'rusted knife', 'sealed letter') that aren't an
// exact catalog match but reasonably resolve to one. This layer
// gives the pickup path more coverage without authoring 100+ new
// catalog entries.
//
// Conservative mappings only — when the alias is unambiguous AND
// the catalog target is a sensible portable item for the player to
// carry. Multi-word variants (e.g., 'aether lantern', 'frost
// lantern') all collapse to the same canonical 'Aetheric Torch'
// because they're all "a light source" mechanically.
//
// Anything NOT in this map AND not in the catalog directly stays
// as a scene feature → salvage redirect path.

import { isReskinActive } from './contentPack';

// engine_Dev — the built-in (Tartaria) ambient-noun -> catalog-item alias map
// lives in data now (app/data/aliases/item-aliases.json). resolveItemAlias()
// short-circuits for reskins (isReskinActive), so this map is built-in-only; a
// non-Tartaria pack matches scene nouns against its OWN catalog / salvage path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ALIAS_MAP: Record<string, string> = require('../data/aliases/item-aliases.json');

/** Returns the canonical catalog item name for an alias, or null. */
export function resolveItemAlias(name: string): string | null {
  if (!name) return null;
  // engine_Dev — these aliases all resolve to Tartaria catalog items (lantern →
  // Aetheric Torch, etc.). For a non-Tartaria pack, skip them entirely so a scene
  // noun resolves against the loaded pack's own catalog (or falls through to the
  // salvage path) instead of leaking a Tartaria item name.
  if (isReskinActive()) return null;
  const q = name.trim().toLowerCase();
  return ALIAS_MAP[q] ?? null;
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { ALIAS_MAP };

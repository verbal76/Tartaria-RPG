// OTA-269 — Tool pouch eligibility predicate.
//
// Player asked for the pouch to behave like extended equipment slots:
// "anything that is a tool that isn't worn should be able to go there
// in those three slots. it keeps you from swapping items all the time."
//
// This module is the single source of truth for "can this item be
// stowed in the tool pouch?" Used in two places:
//   1. gameStore.ts:stowInPouch — refuse the stow with an Arbiter
//      line if the item isn't eligible (prevents weapons / food /
//      armor from clogging pouch slots that should hold tools).
//   2. InventoryScreen.tsx — when the player taps an empty pouch
//      slot, the inventory below filters to only eligible items so
//      they don't have to scroll past 40 entries to find the one
//      tool they want to stow.
//
// Eligibility rules:
//
//   ✗ Consumables / food / drink (you eat them, you don't pouch them)
//   ✗ Weapons (wield them — main / off hand)
//   ✗ Armor / wearable (wear them)
//   ✗ Amulets / rings (they have their own slots)
//   ✗ Already in the pouch (no double-stow)
//   ✗ Currently in off-hand (would create a double-reference; player
//     un-equips first, then stows)
//
//   ✓ Items with kind `exploration` or `relic` (the typical tool kinds:
//     scanners, torches, compasses, lenses, ropes, masks, kits, etc.)
//   ✓ Items tagged `tool` / `light` / `detection` / `utility` / `rope` /
//     `scanner` / `gate` / `aetheric` — catches misc-kind items that
//     still behave as tools (Climbing Rope is `kind: relic` `tag:
//     utility,gate,rope`; covered either way).
//
// Returns a `{ eligible, reason }` shape so the call site can either
// branch on the boolean OR surface the reason to the Arbiter for a
// more grounded refusal ("That's lunch, not a tool." instead of
// "STOW FAILED").

import type { InventoryItem, PlayerCharacter } from './types';

const TOOL_KINDS = ['exploration', 'relic'] as const;
const TOOL_TAGS = [
  'tool', 'light', 'detection', 'utility',
  'rope', 'scanner', 'gate', 'aetheric',
] as const;

export interface PouchEligibility {
  eligible: boolean;
  /** Short Arbiter-friendly explanation when ineligible. Empty
   *  when eligible. */
  reason?: string;
}

export function isPouchEligible(
  item: InventoryItem,
  player: PlayerCharacter,
): PouchEligibility {
  const eq = player.equipped ?? {};

  // Already in the pouch — no-op.
  if ((eq.toolPouchIds ?? []).includes(item.id)) {
    return { eligible: false, reason: "already on your belt" };
  }
  // Currently held in the off-hand. The pouch is an alternative to
  // the off-hand slot for tools; can't be in both at once.
  if (eq.off?.toLowerCase() === item.name.toLowerCase()) {
    return {
      eligible: false,
      reason: "it's in your off-hand — un-equip it first",
    };
  }

  // Wrong-kind refusals — clearer wording per category.
  const kind = (item.kind ?? '').toLowerCase();
  if (kind === 'consumable') {
    return { eligible: false, reason: "that's lunch, not a tool" };
  }
  if (kind === 'weapon') {
    return { eligible: false, reason: "a weapon — wield it, don't pouch it" };
  }
  if (kind === 'armor') {
    return { eligible: false, reason: "armor — wear it" };
  }
  if (kind === 'accessory' || kind === 'amulet' || kind === 'ring') {
    return { eligible: false, reason: "that's jewelry — equip it on a ring or amulet slot" };
  }

  // Positive checks: tool kinds OR tool tags.
  if ((TOOL_KINDS as readonly string[]).includes(kind)) {
    return { eligible: true };
  }
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => (TOOL_TAGS as readonly string[]).includes(t))) {
    return { eligible: true };
  }

  return { eligible: false, reason: "that's not a tool" };
}

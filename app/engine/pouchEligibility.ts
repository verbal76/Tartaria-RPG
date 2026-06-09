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

import type { InventoryItem } from './types';
import type { PlayerCharacter } from './types';

const TOOL_KINDS = ['exploration', 'relic'] as const;
const TOOL_TAGS = [
  'tool', 'light', 'detection', 'utility',
  'rope', 'scanner', 'gate', 'aetheric',
  'lens', 'optic', 'pry', 'navigation', 'kit',
] as const;
// arb101 — explicit "this is WORN gear, not a tool" escape hatch. A wardrobe
// piece (e.g. the Hardened Climbing Strap) can be kind:exploration for legacy
// reasons but must NOT count as a tool / pouch item. Tag it `wardrobe`.
const NON_TOOL_TAGS = ['wardrobe', 'worn', 'apparel'] as const;
const NON_TOOL_KINDS = ['consumable', 'weapon', 'armor', 'accessory', 'amulet', 'ring'] as const;

/** arb101 — THE single source of truth for "is this item a tool?" (pure,
 *  item-only — no player context). Used by both the tool-pouch eligibility
 *  here AND the inventory TOOLS category (InventoryCategorize), so the two
 *  can never disagree again. A tool is: not consumable/weapon/armor/jewelry,
 *  not explicitly tagged wardrobe, AND either a tool kind (exploration/relic)
 *  or a tool tag (scanner/light/lens/pry/…). */
export function itemIsTool(item: InventoryItem): boolean {
  const kind = (item.kind ?? '').toLowerCase();
  if ((NON_TOOL_KINDS as readonly string[]).includes(kind)) return false;
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => (NON_TOOL_TAGS as readonly string[]).includes(t))) return false;
  if ((TOOL_KINDS as readonly string[]).includes(kind)) return true;
  return tags.some((t) => (TOOL_TAGS as readonly string[]).includes(t));
}

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

  // arb101 — wardrobe pieces are worn, not pouched (nicer message than the
  // generic fall-through below).
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => (NON_TOOL_TAGS as readonly string[]).includes(t))) {
    return { eligible: false, reason: "you wear that — it's not a tool" };
  }
  // OTA-385 — rope is carried gear, not a pouch tool. A rope grants its climb
  // capability (the `climb_steep` gate) just by sitting in your pack — the gate
  // checks the inventory, not the pouch — so a rope in a tool slot is wasted.
  // (Scanners differ: they only fire when equipped / pouched, so THEY belong
  // there.) Reclaimer's Rope / Climbing Rope are kind:relic + tagged `tool`, so
  // itemIsTool would otherwise wave them in; gate them out here explicitly.
  if (tags.includes('rope')) {
    return { eligible: false, reason: "that's just rope — it works from your pack, no tool slot needed" };
  }
  // Single source of truth (shared with the inventory TOOLS category).
  if (itemIsTool(item)) {
    return { eligible: true };
  }
  return { eligible: false, reason: "that's not a tool" };
}

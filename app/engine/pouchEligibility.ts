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
import { findExplorationItemByName } from './crafting';

// OTA-778 — the pouch is the SCANNER POUCH now. Pouched items apply their
// effect AT ALL TIMES (a scanner in a slot is always running, which is why a
// search surfaces its hidden loot). That "always-on" contract only makes sense
// for scanners — the Aetheric Torch is a deliberate button-use item (it would
// read as "always running" in a slot, which it isn't), and a pry bar / rope
// works straight from the pack. So the pouch holds ONLY scanners now: Pulse,
// Aetheric, Mud (effect.kind === 'scanner'), across three slots.
export function itemIsScanner(item: InventoryItem): boolean {
  const exp = findExplorationItemByName(item.name);
  return exp?.effect?.kind === 'scanner';
}

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
// OTA-491 — weapon-signal tags. A THROWN one-shot weapon (e.g. the Shaped
// Aetheric Shard: kind 'misc' + 'throwable', whose name auto-synthesizes an
// 'aetheric' tag that would otherwise read as a tool) is a WEAPON you hurl, not a
// tool you stow. Exclude any item carrying a weapon tag from the tool definition.
const WEAPON_TAGS = ['weapon', 'throwable', 'thrown'] as const;

/** arb101 — THE single source of truth for "is this item a tool?" (pure,
 *  item-only — no player context). Used by both the tool-pouch eligibility
 *  here AND the inventory TOOLS category (InventoryCategorize), so the two
 *  can never disagree again. A tool is: not consumable/weapon/armor/jewelry,
 *  not explicitly tagged wardrobe, AND either a tool kind (exploration/relic)
 *  or a tool tag (scanner/light/lens/pry/…). */
export function itemIsTool(item: InventoryItem): boolean {
  // OTA-1001 — canonical kind + tags: a stale Climbing Rope vanished from TOOLS and
  // a stale Shard lost its weapon-signal and mis-filed as a tool.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { canonicalItemKind: pk, canonicalItemTags: pt } = require('./crafting') as typeof import('./crafting');
  const kind = pk(item).toLowerCase();
  if ((NON_TOOL_KINDS as readonly string[]).includes(kind)) return false;
  const tags = pt(item);
  if (tags.some((t) => (NON_TOOL_TAGS as readonly string[]).includes(t))) return false;
  // OTA-491 — a thrown/throwable weapon is never a tool, even if its kind is
  // 'misc' and an auto-tag (e.g. 'aetheric' from the name) would otherwise match.
  if (tags.some((t) => (WEAPON_TAGS as readonly string[]).includes(t))) return false;
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
    return { eligible: false, reason: "already in your scanner pouch" };
  }
  // Currently held in the off-hand. The pouch is an alternative to the off-hand
  // slot for a scanner; can't be in both at once.
  if (eq.off?.toLowerCase() === item.name.toLowerCase()) {
    return {
      eligible: false,
      reason: "it's in your off-hand — un-equip it first",
    };
  }

  // OTA-778 — SCANNER-ONLY. The pouch keeps its stowed items ALWAYS RUNNING, so
  // only always-on scanners belong here. Everything else (the Aetheric Torch —
  // a button-use item; pry bars, ropes, lenses — pack gear) is refused with a
  // clear pointer to how it's actually used.
  if (itemIsScanner(item)) {
    return { eligible: true };
  }
  if (/torch|lantern|lamp/i.test(item.name)) {
    return { eligible: false, reason: "the torch isn't always-on — use it from the 🔦 button, not the scanner pouch" };
  }
  return { eligible: false, reason: "the scanner pouch only holds scanners — Pulse, Aetheric, or Mud" };
}

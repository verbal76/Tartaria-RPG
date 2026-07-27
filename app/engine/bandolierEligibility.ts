// arb110 — Bandolier eligibility predicate (the throwables counterpart to
// pouchEligibility). The bandolier holds ONE-SHOT THROWABLES — items the equip
// system treats as a hurled weapon, i.e. anything carrying the `throwable` tag
// (Shaped Aetheric Shard, Disease Sample, Sentinel Core Plate, Throwing Knife,
// thrown weapons.json entries…). It deliberately does NOT accept the improvised
// `thrown` tag (rocks), which validSlotsForItem ignores — those are pack junk you
// chuck, not racked ordnance.
//
// Mirrors isPouchEligible's `{ eligible, reason }` shape so the InventoryScreen
// call site can either branch on the boolean or surface the reason.

import type { InventoryItem, PlayerCharacter } from './types';
// OTA-1020 — tag tests read canonical (instance-union-catalog) tags. Instances mint
// with a tag SNAPSHOT; vials acquired before a catalog tag existed carried a
// stale set forever and refused to rack while identical new ones racked fine.
import { canonicalItemTags } from './crafting';

/** True for a deliberate one-shot throwable (the `throwable` tag, anchored so a
 *  plain `thrown` rock never qualifies). Pure, item-only. */
export function itemIsThrowable(item: InventoryItem): boolean {
  return canonicalItemTags(item).includes('throwable');
}

/** OTA-690 — a weapon-coating vial (poison / acid / burn / electrical / corruption)
 *  is also rackable as a ONE-SHOT throwable: hurled, it bursts for the coating's
 *  full damage-over-time up front (per-turn × COATING_DOT_TURNS) instead of being
 *  painted onto a weapon. Detected by the `weapon_coating` tag. */
export function itemIsThrowableCoating(item: InventoryItem): boolean {
  return canonicalItemTags(item).includes('weapon_coating');
}

export interface BandolierEligibility {
  eligible: boolean;
  reason: string;
}

export function isBandolierEligible(
  item: InventoryItem,
  player: PlayerCharacter,
): BandolierEligibility {
  const eq = player.equipped ?? {};
  if ((eq.bandolierIds ?? []).includes(item.id)) {
    return { eligible: false, reason: "that's already on your bandolier" };
  }
  if (!itemIsThrowable(item) && !itemIsThrowableCoating(item)) {
    return { eligible: false, reason: "that's not a throwable — the bandolier holds one-shot throwables and coating vials" };
  }
  // OTA-605 — a bandolier racks SMALL ordnance (throwing knives, hand axes,
  // shards, vials). Long thrown shafts — javelins and throwing spears, which
  // all carry the `spear` tag — are one-shot throwables but too long to sit on
  // a bandolier; you carry those in hand. They stay throwable-from-hand (and
  // still spend on a throw); they're just not rackable here.
  if (canonicalItemTags(item).includes('spear')) {
    return { eligible: false, reason: "a javelin or spear is too long for the bandolier — carry it in hand" };
  }
  // Mirror the pouch's off-hand guard: an item you're currently wielding can't also
  // be racked (it would double-reference the same instance). Unequip first.
  if (eq.offId && eq.offId === item.id) {
    return { eligible: false, reason: "it's in your off hand — unequip it first, then rack it" };
  }
  if (eq.mainId && eq.mainId === item.id) {
    return { eligible: false, reason: "it's in your main hand — unequip it first, then rack it" };
  }
  return { eligible: true, reason: '' };
}

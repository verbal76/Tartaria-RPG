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

/** True for a deliberate one-shot throwable (the `throwable` tag, anchored so a
 *  plain `thrown` rock never qualifies). Pure, item-only. */
export function itemIsThrowable(item: InventoryItem): boolean {
  return (item.tags ?? []).some((t) => /^throwable$/i.test(t));
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
  if (!itemIsThrowable(item)) {
    return { eligible: false, reason: "that's not a throwable — the bandolier only holds one-shot throwables" };
  }
  // OTA-605 — a bandolier racks SMALL ordnance (throwing knives, hand axes,
  // shards, vials). Long thrown shafts — javelins and throwing spears, which
  // all carry the `spear` tag — are one-shot throwables but too long to sit on
  // a bandolier; you carry those in hand. They stay throwable-from-hand (and
  // still spend on a throw); they're just not rackable here.
  if ((item.tags ?? []).some((t) => /^spear$/i.test(t))) {
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

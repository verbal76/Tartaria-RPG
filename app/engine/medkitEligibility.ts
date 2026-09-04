// app/engine/medkitEligibility.ts — THE HEALING POUCH.
//
// ⚠⚠⚠ OTA-1657 — THE OWNER'S PROBLEM, IN HIS WORDS: *"battle gets slowed down
// when you have to heal… let's make another bandolier and call it the healing
// pouch or something. and we can load it with any three healing items they want
// so… 5 trauma kits, say 3 trail rations and maybe 10 blueberries in it. and we
// open it like a bandolier during combat and can use the preloaded heals from
// there. and when you use it, it acts like they do when being used from
// inventory."*
//
// ⚠ THREE SLOTS, NOT THREE ITEMS, and that distinction is the whole feature. A
// racked id points at an inventory STACK, so one slot is "5 Trauma Kits" and the
// next is "10 Blueberries" — exactly the load-out he described. It is the same
// storage contract the bandolier has had since arb110: the items never leave
// `player.inventory`, this only records WHICH stacks are within reach. Nothing
// is duplicated, nothing can be lost by racking, and a stack that empties simply
// stops resolving.
//
// This module is the single source of truth for "can this go in the pouch?",
// mirroring `pouchEligibility` and `bandolierEligibility` in both shape and
// return type so the three racks read identically at every call site.

import type { InventoryItem, PlayerCharacter } from './types';
import { consumableDoesSomething } from './consumableCures';
import { resolveItemEffect } from './itemEffect';
import { findGearByName, findExplorationItemByName, findMaterialByName } from './crafting';

/** ⚠ Three, because he said three — and because the point is a SHORTLIST. A rack
 *  that holds everything is the pack again, and the pack is what slows the
 *  fight down. */
export const MEDKIT_MAX = 3;

/** ⚠⚠ THE EFFECT COMES FROM THE CATALOG, NOT THE INSTANCE. A saved item carries
 *  a tag snapshot but not always an `effect` — `restampInventoryItem` merges
 *  tags and description and deliberately nothing else — so asking the instance
 *  would refuse to rack a Trauma Kit acquired before the field existed while
 *  racking an identical new one. This is the same resolver, in the same order,
 *  that `useInventoryItem` itself uses to decide what the item does. */
export function healingEffectFor(item: InventoryItem): ReturnType<typeof resolveItemEffect> {
  return resolveItemEffect(item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
}

/** ⚠⚠ WHAT COUNTS AS A HEAL — and it delegates rather than deciding.
 *  `consumableDoesSomething` already answers "does this mend, restore, cleanse
 *  or cure?", and it was written after a defect where a pure antivenom (heal 0,
 *  cure yes) was refused by one screen and accepted by another. Restating that
 *  rule here would recreate exactly that split. All three items the owner named
 *  pass it: Trauma Kit (45 HP + cure bleed), Trail Rations (6 HP + 3 stamina),
 *  Blueberries (4 HP + 1 stamina). A pure stat buff does not. */
export function itemHeals(item: InventoryItem): boolean {
  const fx = healingEffectFor(item);
  if (!fx || fx.kind !== 'consumable') return false;
  return consumableDoesSomething(fx);
}

export interface MedkitEligibility { eligible: boolean; reason: string }

/** Can this item be loaded into the healing pouch? Returns the `{ eligible,
 *  reason }` shape the other two racks use, so a refusal can be spoken in the
 *  Arbiter's voice instead of surfacing as a dead button (the B15 rule:
 *  refusals always speak). */
export function isMedkitEligible(
  item: InventoryItem,
  player: PlayerCharacter | null | undefined,
): MedkitEligibility {
  if ((item.quantity ?? 0) <= 0) {
    return { eligible: false, reason: `You have none of those left` };
  }
  if (!itemHeals(item)) {
    return { eligible: false, reason: `That won't mend anything — the pouch is for kits, food and cures` };
  }
  const loaded = player?.equipped?.medkitIds ?? [];
  if (loaded.includes(item.id)) {
    return { eligible: false, reason: `That's already in the pouch` };
  }
  return { eligible: true, reason: '' };
}

/** ⚠ THE LIVE CONTENTS, and "live" is load-bearing. A racked id can go stale the
 *  moment its stack is eaten, sold, scrapped or dropped by any other path —
 *  OTA-1005 caught exactly that on the tool pouch, where ghosts rendered as
 *  empty slots yet still counted against the cap. Resolving through the
 *  inventory on every read means a ghost simply is not there. */
export function medkitContents(player: PlayerCharacter | null | undefined): InventoryItem[] {
  const inv = player?.inventory ?? [];
  return (player?.equipped?.medkitIds ?? [])
    .map((id) => inv.find((i) => i.id === id))
    .filter((i): i is InventoryItem => !!i && i.quantity > 0);
}

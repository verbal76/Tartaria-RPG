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
import { isGolemRepairPart, isGolemSubstitutePart } from './golems';
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

/** ⚠⚠⚠ OTA-1663 — THE GOLEM EATS FROM THE POUCH TOO. Owner: *"I think we should
 *  allow materials that can be fed to the Golem in the heals pouches, but those
 *  only have the option to go straight to the Golem."*
 *
 *  Same two predicates the inventory's "Heal <golem>" button uses, so a scrap
 *  that mends the golem in the pack mends it from the pouch — an exact fuel
 *  part (full heal) or an element-matched substitute (rarity-scaled). Both are
 *  golem-KIND dependent, which is why this needs the player and not just the
 *  item: a Mud golem's parts are not an Iron golem's. */
export function itemFeedsGolem(
  item: InventoryItem,
  player: PlayerCharacter | null | undefined,
): boolean {
  const golem = player?.golem;
  if (!golem) return false;
  // ⚠ AND IT CANNOT THROW, because this now runs during RENDER — once per racked
  // row, every frame the input bar paints. `golemRepairParts` indexes
  // GOLEM_DEFINITIONS without a guard, so a golem whose stored `kind` has
  // drifted (the OTA-1603 dog-vest failure, one species over) would take the
  // whole input bar down instead of quietly not offering a button. `golemStats`
  // already guards the same lookup; this is the same defence at the new caller.
  try {
    return isGolemRepairPart(golem.kind, item.name) || isGolemSubstitutePart(golem.kind, item);
  } catch {
    return false;
  }
}

/** ⚠⚠ WHAT A RACKED ITEM IS FOR — and it is ONE function on purpose. The pouch
 *  now holds two different kinds of thing, and the screen has to know which it
 *  tapped. Deriving that at the call site is how the eligibility check and the
 *  button drift apart: something gets racked as a heal and then behaves like a
 *  golem part, or the reverse. Everything asks here.
 *
 *  ⚠ HEALS WIN A TIE. A few materials both mend the player and match the
 *  golem's element; the owner's words were "materials that can be fed to the
 *  Golem", not "food", and a Trail Ration that silently went into the frame
 *  instead of his mouth would be the OTA-1662 defect again with the targets
 *  swapped. If it can heal a person, it is a heal. */
export type MedkitRole = 'heal' | 'golem';
export function medkitRole(
  item: InventoryItem,
  player: PlayerCharacter | null | undefined,
): MedkitRole | null {
  if (itemHeals(item)) return 'heal';
  if (itemFeedsGolem(item, player)) return 'golem';
  return null;
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
  // ⚠ OTA-1663 — golem fuel counts now, but only while a golem is actually
  // yours: `itemFeedsGolem` is false without one, so a stranger's scrap metal
  // still cannot be racked, and the refusal below still says why.
  if (!medkitRole(item, player)) {
    return {
      eligible: false,
      reason: player?.golem
        ? `That won't mend anything — the pouch is for kits, food, cures and ${player.golem.name}'s parts`
        : `That won't mend anything — the pouch is for kits, food and cures`,
    };
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

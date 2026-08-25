// OTA-1457 — A TRAILING ACTION CHIP ON THE FEED, AND THE ONE RULE IT OBEYS.
//
// An outside review asked for a single tappable chip on the narrative feed for
// equippable gear, so taking-and-wearing an upgrade is one tap from the place
// the player is already reading. The spec for it is docs/feed-action-chips-spec.md.
//
// ⚠⚠⚠ THE PROPERTY THAT DECIDES WHETHER THIS IS SAFE TO SHIP, and it is not
// "a chip exists". THE CHIP MUST NEVER BE THE ONLY ROUTE TO ITS ACTION. The
// feed scrolls. A chip that scrolls away is gone, and if it had been the only
// way to put the armour on, the game offered something once and silently
// withdrew it — which is OTA-1402's defect (the-game-knows-and-does-not-say)
// wearing new clothes.
//
// So the chip is an ACCELERATOR for something already reachable through the
// gather picker, never a new route. That is enforced structurally, not by
// discipline: `pickFeedActionChip` is handed the picker's own `chips` array and
// can only ever name a row that array already contains, live and unconsumed.
// If the picker would refuse it, the feed cannot offer it — the same guarantee,
// from the same array, that OTA-1455 gave the parser hint.
//
// ⚠⚠ AND WHY THERE IS NO PAYLOAD ON `entry.meta`, WHICH THE SPEC EXPECTED.
// The spec (and the review) put an `{itemId, slotId}` payload on the log
// entry's meta bag at emit time. Building it showed that payload is DEAD WEIGHT
// for this chip kind, and the reasoning is worth keeping because it generalises:
//
//   1. A payload emitted when the line was LOGGED can go stale — the player may
//      have taken the vest by another route since. So the renderer has to
//      re-validate against live state regardless.
//   2. Once it re-validates against live state, the only thing the payload still
//      contributes is WHICH NOUN — and which noun is itself derivable from live
//      state (the live upgrade in this room).
//   3. A payload that is computed, stored, and then ignored at render is not
//      neutral. It is a second source of truth that will drift from the first,
//      and drift is what every "the game says X and does Y" bug is made of.
//
// The `entry.meta` design is still right for chips that DIFFER PER ENTRY — a
// dialogue choice, a specific quest turn-in — because those cannot be re-derived
// from the room alone. It is wrong for this one. Stated here rather than quietly
// deviated from.

import type { PlayerCharacter, EquipSlot } from './types';
import { isUpgradeOverEquipped, upgradeEquipSlot, upgradeReasonClause } from './gatherSort';

/** One row of the gather picker, as `ExplorationScreen` builds it. Structural
 *  rather than imported so this stays a leaf: it imports no screen and no store,
 *  which is what lets the tests drive it directly. */
export interface GatherChipRow {
  noun: string;
  consumed: boolean;
}

/** What the feed renders. Deliberately tiny — there is no `kind` discriminator
 *  yet, because there is exactly one kind and a union of one is a union that
 *  invites a `default:` branch nobody tests. */
export interface FeedActionChip {
  /** The scene noun, exactly as `gatherChips` carries it.
   *  ⚠ NOT an item id: the take path resolves nouns, and a second identifier is
   *  a second thing that can drift out of sync with the first. */
  noun: string;
  /** The equipment slot it would go to, from the same catalog lookup the ★ mark
   *  uses — so a chip cannot offer a wear with nowhere to put it. */
  slot: EquipSlot;
  /** The resolved item name, for the button face. */
  itemName: string;
  /** ⚠ OTA-1498 — WHY it is an upgrade, from the comparator's own lookups
   *  (`upgradeReasonClause`), or null when the comparison cannot be stated
   *  honestly. Owner: "I don't know how it compares — why would I just grab
   *  it?" A chip that asks for a swap owes the player its reasoning. */
  reason: string | null;
}

/**
 * The live upgrade in this room, or null.
 *
 * ⚠ FIRST MATCH IN PICKER ORDER, deliberately — no scoring, no "best" upgrade.
 * A chip that changed which item it named between renders would be unreadable
 * at the exact moment somebody is reaching for it, and a ranking function is a
 * second opinion that can disagree with the ★ marks the picker is showing.
 *
 * ⚠ CONSUMED ROWS ARE SKIPPED using the picker's own flag — the same pass that
 * greys them. This is the whole no-false-promises guarantee.
 */
export function pickFeedActionChip(
  player: PlayerCharacter | null | undefined,
  chips: readonly GatherChipRow[] | null | undefined,
): FeedActionChip | null {
  if (!player || !chips) return null;
  for (const c of chips) {
    if (c.consumed) continue;
    if (!isUpgradeOverEquipped(player, c.noun)) continue;
    const wear = upgradeEquipSlot(player, c.noun);
    // ⚠ `isUpgradeOverEquipped` and `upgradeEquipSlot` are separate lookups, and
    // a chip is only offered when BOTH answer. Trusting the first alone would
    // reproduce the ★-with-nowhere-to-go bug that OTA-1237 existed to fix.
    if (!wear) continue;
    return {
      noun: c.noun,
      slot: wear.slot,
      itemName: wear.name,
      reason: upgradeReasonClause(player, c.noun),
    };
  }
  return null;
}

/** ⚠⚠ OTA-1486 — HAND SLOTS HOLD THINGS YOU WIELD; EVERYTHING ELSE IS WORN.
 *  Owner's report, decoded: he tapped "Take & wear" on an AXE and a KNIFE and
 *  they landed in his hand. The equip was CORRECT — the picker has marked
 *  weapon upgrades since OTA-1252, and a weapon's slot is the hand — but the
 *  button promised "wear", which is an armor word, so a right action read as a
 *  wrong one. One predicate, used by both strings below, so the button face
 *  and the spoken sentence can never disagree about which verb the action
 *  deserves. */
const HAND_SLOTS: ReadonlySet<EquipSlot> = new Set(['main', 'off']);

/** The button face. Kept here beside the picker so the wording and the thing it
 *  acts on cannot drift apart in different files. */
export function feedActionChipLabel(chip: FeedActionChip): string {
  // ⚠ OTA-1498 — the face carries the comparator's verdict. The green ⬆ was
  // read as "pick up", not "upgrade"; the clause makes the claim explicit
  // ("2d8 over your 2d6", "your off hand is free") so the swap is informed.
  const base = HAND_SLOTS.has(chip.slot)
    ? `⬆ Take & wield ${chip.itemName}`
    : `⬆ Take & wear ${chip.itemName}`;
  return chip.reason ? `${base} — ${chip.reason}` : base;
}

/** ⚠ OTA-1498 — THE SECOND DOOR: take it WITHOUT the swap. Owner: "…or there
 *  should be another block to put it in your pack." Same noun, the picker's
 *  plain-take path (`takeAmbientNoun`), no equip — so a player who wants the
 *  javelin for later is not forced to un-wield their axe to have it. */
export function feedPackChipLabel(_chip: FeedActionChip): string {
  return '⤵ Just take it — to your pack';
}

export function feedPackChipA11yLabel(chip: FeedActionChip): string {
  return `Take the ${chip.noun} into your pack without equipping it. What you have equipped stays as it is.`;
}

/** The screen-reader sentence. ⚠ REQUIRED, not optional — the EXIT chip shipped
 *  without one for months and no test could tell, because nothing asserted on a
 *  property that did not exist. It says what will HAPPEN, not what the button
 *  is called: two actions, in order, so a narration-only player is not surprised
 *  by the second one. */
export function feedActionChipA11yLabel(chip: FeedActionChip): string {
  const why = chip.reason ? ` It is offered because ${chip.reason}.` : '';
  if (HAND_SLOTS.has(chip.slot)) {
    const hand = chip.slot === 'main' ? 'main hand' : 'off hand';
    return `Take the ${chip.noun} and wield it in your ${hand}. Replaces what you have equipped there.${why}`;
  }
  return `Take the ${chip.noun} and wear it as your ${chip.slot}. Replaces what you have equipped there.${why}`;
}

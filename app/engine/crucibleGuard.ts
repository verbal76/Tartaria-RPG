// crucibleGuard — OTA-1552. "ARE YOU SURE ABOUT THAT?"
//
// ⚠⚠⚠ THE DEFECT, IN THE OWNER'S WORDS: *"in pokemon if I go to transfer a
// pokémon to the professor and it's an event pokémon … it says, are you sure you
// want to transfer this rare pokémon. in this game you're like, hey, do you want
// to break stuff down and spend it and I'm like well, yeah I can break it down,
// it's just garbage right? you never say are you sure cuz this should be saved
// for the fuse crucible … I'm the one making this game and I work with you on
// every single decision and I didn't even know that was a possibility. I didn't
// even know I could burn my items without knowing it."*
//
// ⚠⚠⚠ AND HE IS EXACTLY RIGHT ABOUT THE MECHANISM. The 23:18:30 REPAIR ALL in
// his log consumed Slate-Weighted Netting, Salt-Cured Dowel, Yellowed Tusk Stub,
// Coiled Snare Thread, Faded Ribbon Coil, Frayed Rigging Twine, Glass-Beaded
// Strap and Tar-Black Lashing — every one of them catalog-absent curiosities,
// which is PRECISELY the `isInferredItem` pool the Fusing Crucible accepts.
// `isSubstitutable` (engine/crafting.ts) does protect fusion material — but only
// material that is ALREADY heart-tapped (`reservedForFusion`). Fodder the player
// has been gathering and has not yet reserved is indistinguishable from junk to
// the substitution drain, so it goes into a boot repair without a word.
//
// ⚠⚠ THE ASYMMETRY IS THE BUG, NOT THE DRAIN. Selling it warns. Gifting it
// refuses (giftEligibility: "it is reserved for the Crucible"). Fusing it asks.
// Repair — the one path that spends it silently and in BULK — said nothing. So
// the fix is not to change what the drain is allowed to take; it is to make the
// drain ANNOUNCE ITSELF before it takes Crucible-grade material, and to offer the
// save on the spot, because a warning the player can't act on is just a slower
// way to lose the item.
//
// ⚠ ONE PREDICATE, SHARED WITH THE FORGE. Whether a stack is "Crucible-grade" is
// answered by `isForgeReservableItem` — the same function the ♥ toggle, the
// FUSABLE filter and `eligibleInputs` use. If the two ever disagreed, the guard
// would warn about material the bench won't take, or stay silent on material it
// would. They cannot disagree: there is one function.
import type { InventoryItem } from './types';
import { previewSubstitutionsList } from './crafting';
import { isForgeReservableItem } from './itemFusion';

/** One stack the substitution drain is about to eat that the Crucible would
 *  have accepted. `quantity` is what the drain wants; `held` is the whole
 *  stack, because saving it saves all of it. */
export interface CrucibleAtRisk {
  id: string;
  name: string;
  /** Units this repair/craft would spend. */
  quantity: number;
  /** Units in the stack — saving reserves the stack, not just the spend. */
  held: number;
}

/**
 * Which of the substitutions this cost would perform are about to burn material
 * the Fusing Crucible would have taken.
 *
 * Reads the drain's OWN preview, so the answer can never describe a different
 * set of items than the one that would actually be spent — the recurring class
 * of bug where a warning and the action it warns about are computed separately
 * and drift apart.
 *
 * `allow` is the set of instance ids the player has already looked at and said
 * "spend it" to. Passing them through is what keeps a bulk REPAIR ALL from
 * asking about the same Faded Ribbon Coil once per boot.
 */
export function crucibleAtRisk(
  ingredients: ReadonlyArray<{ name: string; quantity: number }>,
  inventory: readonly InventoryItem[],
  allow: ReadonlySet<string> = new Set<string>(),
): CrucibleAtRisk[] {
  const byId = new Map<string, CrucibleAtRisk>();
  for (const sub of previewSubstitutionsList(ingredients, inventory)) {
    if (allow.has(sub.id)) continue;
    const item = inventory.find((i) => i.id === sub.id);
    if (!item) continue;
    // Already reserved → the drain skips it anyway (isSubstitutable), so there
    // is nothing to warn about. Belt-and-suspenders: if that guard ever moved,
    // this one would still not double-warn about protected material.
    if (item.reservedForFusion) continue;
    if (!isForgeReservableItem(item)) continue;
    const seen = byId.get(sub.id);
    if (seen) seen.quantity += sub.quantity;
    else byId.set(sub.id, {
      id: sub.id,
      name: item.name,
      quantity: sub.quantity,
      held: item.quantity ?? 1,
    });
  }
  return [...byId.values()];
}

/** How the player answered the guard.
 *   · save-all — reserve every listed stack for the Crucible;
 *   · save     — reserve only the ticked ones;
 *   · spend    — proceed and burn them (this run only, by instance id);
 *   · cancel   — walk away, nothing reserved, nothing spent. */
export type CrucibleGuardMode = 'save-all' | 'save' | 'spend' | 'cancel';

/** The standing question. One shape for both doors it can appear at, so the
 *  modal never has to know whether a repair or a craft raised it. */
export interface CrucibleGuardPrompt {
  action: 'repair' | 'craft';
  /** What the Arbiter was about to work on — a coated display name, or the
   *  recipe's result. Goes straight into the modal's sentence. */
  label: string;
  /** Repair only: every piece still queued, THIS one first, so answering
   *  "spend it" resumes a REPAIR ALL rather than mending one boot. */
  queue: string[];
  /** Craft only: the recipe to re-dispatch on 'spend'. */
  recipeResult?: string;
  atRisk: CrucibleAtRisk[];
  /** Instance ids already blessed for spending earlier in this same run, so a
   *  ten-piece REPAIR ALL asks about each stack at most once. */
  allow: string[];
}

/** Options threaded through a repair job. `allowIds` is the guard's answer. */
export interface RepairOpts {
  allowIds?: readonly string[];
}

/** What one repair did. `crucible` means it stopped and raised the guard —
 *  nothing was consumed and nothing was mended. */
export type RepairVerdict = 'done' | 'refused' | 'crucible';

/** The sentence the Arbiter says when he stops. Kept here so the repair path and
 *  the craft path phrase the same warning the same way. */
export function crucibleWarningLine(atRisk: readonly CrucibleAtRisk[], what: string): string {
  const n = atRisk.reduce((sum, a) => sum + a.quantity, 0);
  const list = atRisk
    .map((a) => (a.quantity > 1 ? `${a.quantity}× ${a.name}` : a.name))
    .join(', ');
  const piece = n === 1 ? 'piece' : 'pieces';
  return `The Arbiter stops with his hand over your pack. "Before I touch ${what} — ${n} ${piece} of this is Crucible stock: ${list}. Say the word and I'll set it aside instead."`;
}

// ⚠⚠ P19 — THE STAGE LAYER. What a staged contract needs in order to mean what it says.
//
// Owner, playing 4.29.x: *"I needed to 'investigate the area' so I typed exactly that, it
// closed the stage, but the next stage spoke about giving the book to his sister. who's
// sister? and what book? … there's nothing in my inventory under mission items and there's
// no way to auto route to anything or at least even guess where it's supposed to be."*
//
// He was describing a structural hole, and the measurement backed him. Before this file a
// stage could carry exactly four things:
//
//     stageType · narration · arbiter · checkKind
//
// No item to grant. No item to require. No location. No person. And `huntAnchorId` takes
// the contract DEF rather than the stage, so ONE anchor served every stage and there was
// nothing to route BETWEEN. The prose was telling a fetch-quest the engine had no way to
// enact: 57 stages across 50 contracts name an object or a person that cannot exist.
//
// So the stage closed because the VERB matched, and nothing else was ever checked. That is
// "completable by accident", which is why this is filed on the Alpha punch list as P19
// rather than as polish.
//
// ⚠ THE FIELDS ARE OPTIONAL AND THE OLD BEHAVIOUR IS THE DEFAULT. A stage with none of
// them behaves exactly as it did — verb at the contract's anchor. That matters: 281 stages
// exist and they are filled in a content pass, not in this commit. Nothing regresses while
// the pass is half-done.
//
// ⚠ CATALOGUE-NOT-INVENT still governs the CONTENT. This file decides what a stage is ABLE
// to say. It does not decide what any individual stage should grant — that is the owner's.

import type { InventoryItem } from './types';

/** An item a stage hands over, or demands. Quantity defaults to 1. */
export interface StageItemRef {
  item: string;
  quantity?: number;
}

/** ⚠ The four things a stage could never say. Mixed into every family's stage def
 *  (hunts, mysteries, storylines) so "what does this stage need and give" has ONE
 *  shape — the same reason `targetLocationName` is one field across all of them. */
export interface StageBinding {
  /** Handed to the player WHEN THE STAGE ADVANCES — this is the "and it didn't give me
   *  the book" half. Granted once; re-entering a completed stage cannot re-grant. */
  grants?: StageItemRef;
  /** Must be in the pack BEFORE the stage can advance. This is what makes "take the
   *  logbook to her" a real instruction instead of a sentence. */
  requires?: StageItemRef;
  /** Where THIS stage happens. Resolved with the same `resolvePosterLocation` a poster
   *  uses, so a stage can move the player across the map — the missing half of "it
   *  didn't auto route me to the next stage". Falls back to the contract's anchor. */
  locationName?: string;
  /** Who is standing there for this stage — "his sister" needs to be somebody. */
  npcName?: string;
}

/**
 * ⚠⚠⚠ OTA-1582 — WHERE A FRESHLY-ACCEPTED CONTRACT ACTUALLY STARTS.
 *
 * THE MEASUREMENT, and it is the largest single finding of the whole mission
 * audit: all 50 staged missions — 18 hunts, 18 mysteries, 14 storylines — open
 * with a NAMED PERSON at a hub handing the player a token and telling them where
 * to go. All 50 of those stages were skipped. Hunts skipped every leading
 * `checkKind: null` stage via `firstActionableHuntStage`; mysteries and
 * storylines did it more bluntly still, writing `stage: 1` as a literal at
 * accept. So the token appeared in the pack and the person who gave it never
 * existed. The owner asked it in exactly those words — *"I have to meet a guy to
 * get a note, right?"* — and the answer, for every mission in the game, was no.
 *
 * ⚠⚠ THE RULE NOW: A STAGE THAT NAMES A PERSON IS A MEETING, AND A MEETING IS
 * NEVER SKIPPED. Pure narration — a stage with no verb AND nobody standing in it
 * — still auto-consumes exactly as before, which is what OTA-1219 and OTA-871
 * built the skip for: a beat no verb can match must not wedge a chain.
 *
 * ⚠ ONE DEFINITION, THREE FAMILIES. The three accept doors had three different
 * answers to the same question, and that is how mysteries and storylines came to
 * carry a hard-coded `1`. There is one answer now, and it lives here.
 */
export function firstActionableStage(
  stages: ReadonlyArray<{ checkKind: string | null; npcName?: string }> | undefined,
): number {
  if (!stages) return 0;
  let i = 0;
  while (i < stages.length && stages[i]!.checkKind === null && !stages[i]!.npcName) i += 1;
  return i;
}

/** Count of a named item in the pack, alias-tolerant on exact name only (a mission
 *  item is authored, so it matches its own name; we deliberately do NOT fuzzy-match
 *  here — a quest gate that accepts a near-miss is a quest gate that lies). */
export function countInPack(inventory: readonly InventoryItem[] | undefined, name: string): number {
  if (!inventory || !name) return 0;
  const want = name.trim().toLowerCase();
  let n = 0;
  for (const it of inventory) {
    if ((it.name ?? '').trim().toLowerCase() === want) n += it.quantity ?? 0;
  }
  return n;
}

/** Does the pack satisfy this stage's `requires`? A stage with no requirement always
 *  passes — the old behaviour, unchanged. */
export function stageRequirementMet(
  stage: StageBinding | undefined,
  inventory: readonly InventoryItem[] | undefined,
): boolean {
  const req = stage?.requires;
  if (!req) return true;
  return countInPack(inventory, req.item) >= (req.quantity ?? 1);
}

/** The refusal a player should read when the verb was right and the pack was not.
 *  ⚠ It NAMES the thing and where it came from. "You need an item" is the silence
 *  this whole item exists to end. */
export function stageRequirementLine(stage: StageBinding, contractTitle: string): string {
  const req = stage.requires!;
  const qty = req.quantity ?? 1;
  const what = qty > 1 ? `${qty}× ${req.item}` : req.item;
  return `The Arbiter stops you. "Not yet — ${contractTitle} wants ${what} in your hands first."`;
}

/** Where a stage happens: its own location if it names one, else the contract's anchor.
 *  ⚠ The resolver is passed in rather than imported, so this module stays free of the
 *  atlas and can be unit-tested on its own. */
export function stageLocationId(
  stage: StageBinding | undefined,
  contractAnchorId: string,
  resolve: (name: string | null | undefined) => string | undefined,
): string {
  return (stage?.locationName ? resolve(stage.locationName) : undefined) ?? contractAnchorId;
}

/** ⚠ THE LINE THAT WAS MISSING ENTIRELY: after a stage advances, say where the next one
 *  is and what it wants. Returns null when the next stage is on the same ground and asks
 *  for nothing — no line is better than a line that says "carry on". */
export function nextStageDirection(
  next: StageBinding | undefined,
  nextLocationName: string | null,
  movedGround: boolean,
): string | null {
  if (!next) return null;
  const bits: string[] = [];
  if (movedGround && nextLocationName) bits.push(`Next: ${nextLocationName}`);
  if (next.npcName) bits.push(`find ${next.npcName}`);
  if (next.requires) {
    const q = next.requires.quantity ?? 1;
    bits.push(`bring ${q > 1 ? `${q}× ` : ''}${next.requires.item}`);
  }
  if (bits.length === 0) return null;
  return `▸ ${bits.join(' · ')}.`;
}

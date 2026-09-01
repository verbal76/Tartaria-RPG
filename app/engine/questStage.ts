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
  /** ⚠ OTA-1600 — the STINGER: one shouted line for the moment this stage
   *  STANDS BODIES UP (a boss commits, an authored escort lands). Shown as the
   *  mission-title popup that pulls attention back into the mission — the
   *  owner's "text cutscene". Authored ONLY on stages that actually put a
   *  fight in front of the player (ota1600 pins the exact set); a prose-only
   *  close must never shout over an empty field. */
  stinger?: string;
  /**
   * ⚠⚠⚠ OTA-1576 — WHAT THIS STAGE ACTUALLY PUTS IN FRONT OF YOU. Every boss
   * stage used to spawn `HuntDef.targetEnemyName` — the hunt's ONE global
   * target — whatever the stage's own prose said. That is fine for an `apex`,
   * and it is exactly backwards for a `false_summit`, a stage type that exists
   * to say THE TARGET WAS NOT HERE:
   *
   *   "You make the camp on the Plains by dusk. Embers still warm. REAVER GONE.
   *    Three of his sworn followers rise … jaw-marked Tartarian raiders."
   *   "You wade in expecting the Queen. THE QUEEN IS [gone] …"
   *
   * Both spawned the very boss the sentence says has left. The owner hit the
   * first one, was told to find three Tartarian raiders, and found none —
   * then typed the problem into the game in plain English.
   *
   * This is OTA-1086's rule, which hooks already got: when the prose names the
   * creature, the spawn honours the name. `count` lets a stage that says
   * "three" mean three.
   *
   * ⚠⚠ OTA-1583 MOVED THIS UP FROM HuntStageDef, because the hole was never
   * hunt-shaped. `story_order_drowned_library` stage 4 says an Aetheric Ooze
   * "bars the only stair" and you "cut through" it; a storyline's boss stage
   * spawns nothing at all, so the stair was never barred and nothing was cut.
   * The three families share one answer to "what is standing here", the same
   * way P19 gave them one answer to grants / requires / locationName / npcName.
   *
   * ⚠⚠⚠ `ambush` IS THE OWNER'S RULING, verbatim: *"identify an appropriate
   * someone derived from the existing catalogue based on the lore and narration
   * of the mission and make them spawn in and draw first blood — sounds like an
   * ambush to me."* First blood is literal: the pack opens at CLOSE range, the
   * player takes the `surprised` penalty the rest of the game already uses, and
   * the enemy group takes one volley before the player acts. It reuses
   * `runEnemyGroupCounters` — the same single volley every other round runs —
   * rather than inventing a second way for enemies to hit you.
   */
  spawn?: { enemyName: string; count?: number; ambush?: boolean };
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

/**
 * ⚠⚠⚠ OTA-1583 — THE SAME QUESTION, ASKED FROM THE MIDDLE, and a bug the
 * mystery/storyline walker caught within the hour.
 *
 * The escort clear in `resolveEnemyDefeat` advances a stage with a bare `+ 1`.
 * That was safe while only hunts could carry a `spawn` and no hunt had a
 * narration-only stage behind one. This OTA gave storylines spawns, and
 * `story_order_drowned_library` has exactly that shape: the Ooze on stage 4, a
 * pure-narration epilogue on stage 5. Killing the Ooze parked the record ON the
 * epilogue, which no verb can pay and the auto-consume loops — which live inside
 * `advance*`, not in the kill path — never saw. Chapter dead, silently, on the
 * very stage this OTA set out to fix.
 *
 * ⚠⚠⚠ AND IT IS NOT THE SAME RULE AS `firstActionableStage`, which the walker
 * proved within minutes of the first attempt to share one. `story_order_drowned_
 * library` stage 5 is a null stage that NAMES A PERSON — Vesryn reading your
 * salvage — so an npcName-aware skip stopped on it, and the chapter died there
 * instead: no verb can pay a null stage, and the conversation card is the only
 * other door. Trading one wedge for another.
 *
 * The two positions are genuinely different questions:
 *
 *   AT ACCEPT — never skip the person who hands you the job. That is the whole
 *     of OTA-1582: fifty missions opened on a named giver and skipped all fifty.
 *   MID-CHAIN — a trailing beat with no verb is an EPILOGUE, and the owner ruled
 *     on exactly these fourteen: *"that sounds like a cue for a remote turn in
 *     with prose, I'm ok with that."* They are consumed and READ OUT, the same
 *     way OTA-871's and OTA-1219's loops have always consumed them, and their
 *     words land as the chain closes.
 *
 * So this one skips on the verb alone — matching the advance loops it exists to
 * agree with — and the npcName guard lives only at the door where it belongs.
 */
export function nextActionableStage(
  stages: ReadonlyArray<{ checkKind: string | null; npcName?: string }> | undefined,
  from: number,
): number {
  if (!stages) return from;
  let i = Math.max(0, from);
  while (i < stages.length && stages[i]!.checkKind === null) i += 1;
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

// ⚠⚠⚠ OTA-1588 — THE VERB THAT PAYS A STAGE, ANSWERED ONCE.
//
// `checkKind: 'boss'` DOES NOT MEAN THE SAME THING IN EVERY FAMILY, and that has
// been true since P19 without ever being written down in one place:
//
//     a HUNT's boss is paid by ATTACK         — the apex is a fight
//     a MYSTERY's boss is paid by INVESTIGATE — the "confirm what you have" beat
//     a STORYLINE's boss is paid by DIPLOMACY — the same beat, talked through
//
// The engine has always known this. It knew it FOUR TIMES — once in
// `stageAwaitsIntentHere` and once in each family's matcher — under a comment
// warning that the map "MUST MIRROR EACH FAMILY'S MATCHER, quirks included".
// That warning was the tell, and OTA-1585 had already named the error class it
// describes: two implementations of one question is one implementation plus a
// time bomb.
//
// ⚠⚠ THE BOMB WENT OFF ON THE OWNER'S DEVICE, INSIDE MY OWN FIX FOR IT.
// OTA-1586 added the arrival line precisely so a player standing on a mission
// tile would never again be told nothing. Its ask table maps `boss → "finish
// it"` for every family. There are THIRTY spawn-less `boss` stages across
// mysteries and storylines and every one of them is the LAST ACTIONABLE BEAT of
// its chain — so after OTA-1586 all 15 mysteries and all 15 storylines in the
// game ended by telling the player to finish a fight that does not exist, on a
// beat actually paid by investigating or by talking. That is the reported bug
// rebuilt one layer up, by the fix for it.
//
// ⚠ SO THE ANSWER LIVES HERE, ONCE, AND EVERY READER ASKS FOR IT: the matchers,
// the arrival line, the mission trace, and the Contracts card. A reader that
// guesses is now the outlier rather than the norm, and check:missionclaims fails
// the build if a second boss map appears anywhere.
export type MissionFamily = 'hunt' | 'mystery' | 'storyline';

/** ⚠ The whole quirk, in three lines, in one place. */
const BOSS_IS_PAID_BY: Record<MissionFamily, string> = {
  hunt: 'attack',
  mystery: 'investigate',
  storyline: 'diplomacy',
};

/** What the player must actually DO to advance this stage, in this family.
 *  `null` for a verbless beat, which advances on its own and must never be
 *  advertised as an action — that promise is the lie OTA-1584 closed. */
export function payingIntent(
  family: MissionFamily,
  stage: { checkKind?: string | null } | null | undefined,
): string | null {
  const kind = stage?.checkKind ?? null;
  if (kind === null) return null;
  if (kind === 'boss') return BOSS_IS_PAID_BY[family];
  // ⚠ `attack_provoke` is a real distinction in the DATA (you are starting the
  // fight rather than finishing one) and no distinction at all to the parser:
  // both are paid by ATTACK. Kept apart in the labels below, folded together
  // here — which is exactly how every matcher has always treated it.
  if (kind === 'attack_provoke') return 'attack';
  return kind;
}

/** The Contracts card's "→ Advance by …" phrasing. ⚠ Keyed on the raw kind where
 *  the raw kind is honest, and resolved through the family only for `boss` —
 *  folding `attack_provoke` into "defeat in combat" would lose a distinction the
 *  writing deliberately makes. */
const VERB_LABEL: Record<string, string> = {
  investigate: 'investigate the area',
  stealth: 'use stealth',
  diplomacy: 'talk it out',
  escape: 'escape / disengage',
  cast: 'use Aethercraft',
  attack_provoke: 'attack to provoke',
  // ⚠ OTA-1596 — was 'defeat in combat', which rendered as "Advance by defeat
  // in combat" — the owner read it as being told to LOSE: *"it should say
  // advance by winning in combat not defeat. that sounds like the opposite of
  // what I want."* The gerund fits the card's "Advance by …" frame.
  attack: 'winning the fight',
};

export function stageVerbLabel(
  family: MissionFamily,
  stage: { checkKind?: string | null } | null | undefined,
): string | null {
  const kind = stage?.checkKind ?? null;
  if (kind === null) return null;
  if (kind !== 'boss') return VERB_LABEL[kind] ?? null;
  return VERB_LABEL[BOSS_IS_PAID_BY[family]] ?? null;
}

/** The arrival line's second-person phrasing — "this is the place — <ask>". Same
 *  table, different register: one is a UI label, one is spoken to a player
 *  standing on the ground. Both resolve `boss` through the same family map. */
const VERB_ASK: Record<string, string> = {
  investigate: 'search this ground',
  stealth: 'go quietly',
  diplomacy: 'talk it through',
  cast: 'work the aether',
  escape: 'break away',
  attack_provoke: 'force the issue',
  attack: 'finish it',
};

export function stageVerbAsk(
  family: MissionFamily,
  stage: { checkKind?: string | null } | null | undefined,
): string | null {
  const kind = stage?.checkKind ?? null;
  if (kind === null) return null;
  if (kind !== 'boss') return VERB_ASK[kind] ?? kind;
  return VERB_ASK[BOSS_IS_PAID_BY[family]] ?? null;
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

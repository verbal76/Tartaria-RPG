// OTA-1058 — PHASE 2, VERTICAL SLICE: GIVE THE WORLD A MOUTH.
//
// A `talk <npc>` exchange with a named vendor: a short list of topics, each
// gated on what has actually passed between you, each with an authored reply.
//
// ⚠ THE MODEL IS NOT IN THE CRITICAL PATH, AND THAT IS THE WHOLE DESIGN.
// A Qwen generation on device measures 14-20 seconds (owner's 4.28.79 log:
// `ambient ✓ 14080ms`). A conversation turn at that speed is not a conversation,
// it is a loading screen with dialogue in it. So the exchange is ENTIRELY
// authored and entirely synchronous: tap a topic, read the reply, no spinner,
// no fallback path, no way for a slow model to make the game feel broken. The
// local narrator's eventual job here (Phase 6) is one optional flourish line
// AFTER the authored reply has already landed — never the reply itself.
//
// GATING IS THE POINT, not decoration. Phase 1 spent nine OTAs building a
// per-person ledger; this is the first feature that reads it for something the
// player chooses rather than something that happens at them. Irma will talk
// about armour to anyone. She talks about the encampments once she places you,
// about the flood once you are a regular, and about what she makes of you only
// if you have actually earned it. Rob her and there is exactly one topic left,
// and it is her telling you to get out of her light.
//
// AUTHORED IN JSON (app/data/npcs/dialogue_topics.json) so the content cost —
// which the build plan flagged as the real cost of this phase — is writing,
// not engineering. Adding an NPC is a JSON entry; no code changes.
import rawTopics from '../data/npcs/dialogue_topics.json';
import type { NpcRegard } from './npcMemory';
import { voiceSaltFor } from './npcMemory';
import type { MainQuestPhase } from './types';

/** OTA-1059 — the story's own order, for `minChapter`. The main quest is a
 *  LINE, not a set, so "from the descent onwards" is a real thing to say and a
 *  topic that only makes sense after the Nexus should not be reachable at the
 *  hook. `ended` sits last so post-ending topics stay open. */
const PHASE_ORDER: MainQuestPhase[] = ['hook', 'revelation', 'cores', 'descent', 'nexus', 'choice', 'ended'];

/** The regard ladder, weakest to strongest, for `minRegard` comparisons.
 *  `wronged` is deliberately NOT on this scale — it is not a rung, it is a
 *  different state, and a gate that treated it as "above trusted" would have a
 *  thief unlocking somebody's most private topic. See gateAllows. */
const REGARD_ORDER: NpcRegard[] = ['stranger', 'met', 'known', 'familiar', 'trusted'];

export interface TopicGate {
  /** Minimum rung on the regard ladder. */
  minRegard?: NpcRegard;
  /** Fires ONLY at this exact regard — used for the wronged apology topic. */
  onlyRegard?: NpcRegard;
  /** Their faction's ground was raided since you last saw them. */
  requiresRecentRaid?: boolean;
  /** Player must hold this title. */
  requiresTitle?: string;
  /** Player must have turned in at least this many contracts for them. */
  minContractsTurnedIn?: number;
  /** Player's standing with the NPC's faction. */
  minStanding?: number;
  /** OTA-1059 — earliest main-quest phase this topic makes sense in. The fifth
   *  and last gate dimension the build plan called for. */
  minChapter?: MainQuestPhase;
  /** OTA-1059 — Cores recovered. `cores` is a long phase (five Cores inside
   *  it), so phase alone cannot express "once you are most of the way". */
  minCores?: number;
  /** ⚠ OTA-1065 — WHAT YOU CHOSE. `"<forkId>:<optionId>"`, matched against
   *  storyForks.choiceKeys(player). This is the third place a Phase 3 decision
   *  lands and the only one that happens in the middle of the game rather than
   *  at the moment of choosing or at the ending: the cast built over
   *  OTA-1058..1087 can know what you did and open a topic about it.
   *
   *  One string rather than two fields, deliberately — a gate that took a fork
   *  and an option separately would have a second way to be half-specified. */
  requiresChoice?: string;
  /** OTA-1090 — gifts this person LOVED (npcMemory rel.lovedGifts). A topic
   *  behind this gate opens because you honored who they are, not because you
   *  showed up often — a different road to intimacy than regard alone, and the
   *  one the OTA-1091 personal topics (marriage, origin, fears) lean on. */
  minLovedGifts?: number;
  /** OTA-1090 — times they have mumbled about losing things after a clean lift
   *  (rel.pocketsMumbled). The DARK gate: a topic only a thief ever hears —
   *  someone airing suspicions to the very person robbing them blind. */
  minPocketsMumbled?: number;
  /** ⚠⚠⚠ OTA-1867 — THE CONVERSATION ITSELF IS A GATE. The id of a topic on
   *  THIS person's set that must already have been asked and answered before
   *  this one is offered.
   *
   *  Every other field on this gate asks about the WORLD — what you carry, who
   *  you are to them, how far the story has run. This one asks about the
   *  CONVERSATION, and it is the only honest way to say "she will not tell you
   *  the second half until you have heard the first". OTA-1866 left six authored
   *  topics holding two disclosures behind one label, which the ask-once
   *  contract cannot represent: a second press is refused, so the second half
   *  was unreachable. Splitting them into two questions needs exactly this.
   *
   *  ⚠ PER PERSON, ALWAYS. The prerequisite is resolved against the SAME npcId
   *  the gated topic is being offered for, through the same
   *  `worldMemory.talkedTopics` ledger everything else reads — there is no
   *  second key scheme and no way to write "ask Irma before Halem will say it".
   *
   *  ⚠ FAIL-CLOSED. A context that carries no conversation memory (every
   *  OTA-1058..1866 test context, and any caller that predates this field)
   *  reads as "nothing has been asked", so the follow-up stays locked. A
   *  missing ledger never OPENS a door. */
  requiresTopic?: string;
}

/** OTA-1061 — what a topic HANDS YOU, once, the first time it is raised.
 *
 *  Until now a conversation was flavour: gated, characterful, and inert. The
 *  neighbouring system already pays — parley gives a lead or their goods — so a
 *  talk that never yields anything reads thin sitting next to one that does.
 *
 *  ⚠ FIRE-ONCE, BY CONSTRUCTION. The effect is keyed off the SAME
 *  worldMemory.talkedTopics counter that drives "I have told you that one", so
 *  a topic that has been raised cannot pay again. That is not a guard bolted on
 *  the side; it is the same fact being read twice, which is why it cannot drift.
 *
 *  ⚠ NO STANDING HERE. Deliberate. OTA-803 deleted gifting because faction
 *  standing had a side door, and OTA-1060 reopened the verb only behind a
 *  lifetime per-faction budget. Letting topics grant standing would be a
 *  SECOND door into the same economy, with no budget on it. Talk pays in
 *  information and occasionally coin — never in reputation. */
export interface TopicGrant {
  /** A traceable lead: plants player.pendingLead, which pays out when the
   *  player next reaches fresh ground. Reuses the OTA-809 parley machinery
   *  rather than inventing a parallel one. */
  lead?: { hint: string; rewardTc: number; rewardItem?: string };
  /** Plants an authored whisper chain by id (engine/whispers.ts CHAINS).
   *  Skipped silently if the player already has it or has finished it — word
   *  reaching you twice is not two rumours. */
  whisper?: string;
  /** A small payment. Bounded deliberately: this is somebody pressing coins on
   *  you, not a contract. */
  tc?: number;
}

/** ⚠⚠ OTA-1437 — WOULD THIS GRANT BOUNCE? A pure look-ahead, so the caller can
 *  decide BEFORE it starts talking.
 *
 *  Only the lead can bounce: the player holds one pending lead at a time, and
 *  overwriting an unclaimed one would silently delete something they were told
 *  to go and find (OTA-1064). Whispers and coin always land — a duplicate
 *  whisper is skipped in silence and coin is coin.
 *
 *  ⚠ AND THAT IS WHY DEFERRING THE WHOLE TOPIC IS SAFE. No authored topic pairs
 *  a lead with a whisper or a payment — checked across dialogue_topics.json — so
 *  holding one back cannot quietly withhold something else that would have
 *  worked. If that ever stops being true this predicate is the place it breaks,
 *  loudly, rather than the player silently losing a whisper. */
export function topicGrantWouldDefer(
  grants: TopicGrant | undefined,
  hasPendingLead: boolean,
): boolean {
  return !!grants?.lead && hasPendingLead;
}

export interface Topic {
  id: string;
  label: string;
  gate?: TopicGate;
  lines: string[];
  grants?: TopicGrant;
  /** ⚠⚠ OTA-1867 — A MIGRATION FIELD, AND DELIBERATELY NOT A RULE.
   *
   *  Before this release six authored topics answered twice under one label.
   *  A save from then can hold `<npc>:<topic> = 2`, which means that player HAS
   *  ALREADY HEARD the second disclosure. Splitting it out into its own
   *  question would offer them, as new, a thing they were told weeks ago.
   *
   *  So a converted follow-up carries the fact explicitly: "I used to be
   *  line N of `topic`, and a counter at `atCount` means it was heard." It is
   *  read in ONE place (`topicSpent`) and it names the exact old parent and the
   *  exact old count, so it cannot generalise.
   *
   *  ⚠ THIS IS NOT "a follow-up inherits its parent's count". That rule would
   *  be wrong for every ordinary follow-up authored after today, which must
   *  start unheard the moment its parent is asked. Six rows carry this field;
   *  no future row should, and `atCount: 2` is already unreachable in new play
   *  because ask-once caps the parent counter at 1. */
  legacyHeardWith?: { topic: string; atCount: number };
}

export interface NpcTopicSet {
  displayName: string;
  topics: Topic[];
}

const TOPICS = (rawTopics as { npcs: Record<string, NpcTopicSet> }).npcs;

/** Everything the gate needs to decide, gathered by the caller so this module
 *  stays free of store and save-shape knowledge. */
export interface TalkContext {
  regard: NpcRegard;
  contractsTurnedIn: number;
  standing: number;
  titles: string[];
  hasRecentRaidNews: boolean;
  /** OTA-1059 — where the player is in the main quest, and how many Cores they
   *  hold. Both default safely for a character who has not started it. */
  chapter: MainQuestPhase;
  cores: number;
  /** OTA-1065 — `"<forkId>:<optionId>"` for every Phase 3 question this
   *  character has answered. Empty for a run that has not been asked one. */
  choices: string[];
  /** OTA-1090 — gifts this person loved / pocket-loss mumbles delivered, read
   *  off the same per-person ledger as everything else. OPTIONAL, defaulting
   *  to 0 in gateAllows, so the many existing TalkContext call sites (and the
   *  OTA-1058..1088 test contexts) stay valid — a missing ledger reads as
   *  "nothing has passed between you", which is also what it means. */
  lovedGifts?: number;
  pocketsMumbled?: number;
  /** ⚠⚠ OTA-1867 — WHAT THIS PERSON HAS ALREADY BEEN ASKED, as a question and
   *  not as a table. Serves `TopicGate.requiresTopic`.
   *
   *  A PREDICATE rather than the ledger, on purpose. The ledger is one map for
   *  the whole world and the gate layer has no business holding it: handed the
   *  map, a future gate could read any person's row, and "spent" would have a
   *  second definition living out here. Handed a closure built by
   *  `conversationMemory(npcId, talked)`, the gate can ask exactly one thing —
   *  "has THIS person answered THIS question" — and the answer still comes from
   *  `topicSpent`, which remains the only definition of spent.
   *
   *  OPTIONAL, and absent means NO. See `requiresTopic`. */
  topicConsumed?: (topicId: string) => boolean;
}

/** OTA-1062 — THE CLASS KEY: topics for people who are not authored one by one.
 *
 *  The vendor cast is 30 named individuals and each got their own entry. The
 *  rest of the population cannot work that way and should not:
 *   - roadside traders are 24 procedurally-named people sharing two archetypes;
 *   - wanderers are ARCHETYPES x FIRST_NAMES, so authoring per person would be
 *     dozens of near-identical entries and the seventh "Corin the refugee"
 *     would read exactly like the first;
 *   - escort leaders are drawn from a name pool at spawn;
 *   - Core Guardians are one voice per Capital.
 *  What makes those people distinct is their KIND, not their name. So identity
 *  falls back to a class entry, and the ledger keeps treating them as
 *  individuals — Corin remembers you personally even though what he SAYS is
 *  what a refugee says.
 *
 *  Exact id always wins, so authoring a specific person later needs no code
 *  change: add `wanderer:refugee:corin` and Corin stops sharing the class set. */
export function classKeyFor(npcId: string): string | null {
  const seg = npcId.split(':');
  if (seg[0] === 'wanderer' && seg[1]) return `class:wanderer:${seg[1]}`;
  if (seg[0] === 'roadside') return 'class:roadside';
  if (seg[0] === 'escort') return 'class:escort';
  if (seg[0] === 'guardian') return 'class:guardian';
  if (seg[0] === 'overlay') return 'class:overlay';
  return null;
}

function setFor(npcId: string): NpcTopicSet | undefined {
  const exact = TOPICS[npcId];
  if (exact) return exact;
  const cls = classKeyFor(npcId);
  return cls ? TOPICS[cls] : undefined;
}

export function hasTopicsFor(npcId: string): boolean {
  return !!setFor(npcId);
}

/** The authored display name, or null when this person is only covered by a
 *  class set — in which case the CALLER already knows their real name and must
 *  use it, because "Refugee" is not what anybody is called. */
export function displayNameFor(npcId: string): string | null {
  return TOPICS[npcId]?.displayName ?? null;
}

export function gateAllows(gate: TopicGate | undefined, ctx: TalkContext): boolean {
  // ⚠ `onlyRegard` first and exclusively. The wronged topic must not also be
  // reachable through minRegard.
  if (gate?.onlyRegard) return ctx.regard === gate.onlyRegard;
  // ⚠ AND THE WRONGED CHECK RUNS BEFORE THE UNGATED SHORT-CIRCUIT. My first
  // version put `if (!gate) return true` at the top, which let every UNGATED
  // topic — the shop-front question each of the three opens with — survive a
  // theft. Caught by this OTA's own test, which is the point of asserting the
  // wronged list is exactly one item rather than merely "contains the apology".
  // Being robbed is not a warmth level; it is a different relationship, and
  // when you have taken something off somebody there is exactly ONE thing left
  // to talk about. Irma says it herself: your money is good, your conversation
  // is not.
  if (ctx.regard === 'wronged') return false;
  if (!gate) return true;
  if (gate.minRegard) {
    const need = REGARD_ORDER.indexOf(gate.minRegard);
    const have = REGARD_ORDER.indexOf(ctx.regard);
    if (need < 0 || have < 0 || have < need) return false;
  }
  if (gate.requiresRecentRaid && !ctx.hasRecentRaidNews) return false;
  if (gate.requiresTitle && !ctx.titles.includes(gate.requiresTitle)) return false;
  if (gate.minContractsTurnedIn !== undefined && ctx.contractsTurnedIn < gate.minContractsTurnedIn) return false;
  if (gate.minStanding !== undefined && ctx.standing < gate.minStanding) return false;
  if (gate.minChapter) {
    const need = PHASE_ORDER.indexOf(gate.minChapter);
    const have = PHASE_ORDER.indexOf(ctx.chapter);
    if (need < 0 || have < 0 || have < need) return false;
  }
  if (gate.minCores !== undefined && ctx.cores < gate.minCores) return false;
  if (gate.requiresChoice && !ctx.choices.includes(gate.requiresChoice)) return false;
  if (gate.minLovedGifts !== undefined && (ctx.lovedGifts ?? 0) < gate.minLovedGifts) return false;
  if (gate.minPocketsMumbled !== undefined && (ctx.pocketsMumbled ?? 0) < gate.minPocketsMumbled) return false;
  // ⚠ OTA-1867 — ADDITIVE, like every clause above it. A follow-up carries its
  // own ordinary gate AND this one, so "trusted, and only after she has told
  // you about the ring" is simply both fields on one gate. No clause is
  // replaced, and a topic without `requiresTopic` reads exactly as before.
  if (gate.requiresTopic && !ctx.topicConsumed?.(gate.requiresTopic)) return false;
  return true;
}

/** The topics this person will discuss with this player, right now.
 *  Order is authored order — deterministic, never shuffled, so the list does not
 *  reshuffle under the player's thumb between taps. */
export function topicsFor(npcId: string, ctx: TalkContext): Topic[] {
  const set = setFor(npcId);
  if (!set) return [];
  return set.topics.filter((t) => gateAllows(t.gate, ctx));
}

/** What they say. Indexed off how many times this topic has been raised rather
 *  than rolled, for the same reason the greeting layer is indexed (OTA-1049):
 *  an NPC who answers the same question differently on a replay of the same
 *  state reads as broken, not as varied. */
/** ⚠⚠⚠ OTA-1784 — TRUE FOR SOMEBODY THE CLASS SET SPEAKS FOR, FALSE FOR AN
 *  AUTHORED PERSON. Irma has her own entry, so she is never voice-laned; a
 *  procedurally-named roadside trader falls back to `class:roadside` and is.
 *  Owner: *"existing named vendors such as Irma are not flattened into the
 *  generic roadside voice."* This is the one line that guarantees it, and it is
 *  the SAME lookup `setFor` already uses, so a person authored later stops
 *  being laned the moment their entry lands, with no code change. */
export function usesClassSet(npcId: string): boolean {
  return !TOPICS[npcId] && classKeyFor(npcId) !== null;
}

/** ⚠⚠⚠ OTA-1784 — THE VOICE LANE.
 *
 *  A class set's `lines` are no longer a REPEAT sequence for one person. They
 *  are PARALLEL VOICES, one per lane, written so that lane *k* of every topic
 *  in the set belongs to the same temperament — so a trader who opens laconic
 *  and watchful is still laconic and watchful four topics later. The salt picks
 *  the lane from the persistent id, so it is that person's voice permanently.
 *
 *  ⚠⚠ AND IT IGNORES `timesAsked` ON PURPOSE. Cycling would walk one trader
 *  through six different personalities as the player re-asked — the exact
 *  instability the owner ruled out: *"If the same interaction with the same NPC
 *  is replayed, the NPC should not suddenly sound like a different person
 *  merely because RNG selected another line."* A person has ONE answer to a
 *  question. Asking again gets OTA-1061's "I have told you that one", which is
 *  also precisely the behaviour these topics had when each held a single line —
 *  so nothing regresses, and all the new depth goes where the owner wanted it:
 *  *"Variety should primarily exist BETWEEN vendors."*
 */
export function voiceLaneFor(npcId: string, lanes: number): number {
  if (lanes <= 1) return 0;
  return voiceSaltFor(npcId) % lanes;
}

/** ⚠⚠⚠ OTA-1867 — ONE QUESTION, ONE ANSWER, FOR EVERYBODY.
 *
 *  This used to be a function, and the thing it computed was an EXCEPTION:
 *  one answer for anybody in a voice lane, `topic.lines.length` for an authored
 *  person. OTA-1784 introduced the split for a good reason and OTA-1866 proved
 *  how expensive it was — the topic list read the other side of it for a year
 *  and nobody could see the two readers disagree.
 *
 *  The exception is now gone at the source. The six authored topics that held
 *  two disclosures under one label are two questions each (see
 *  `TopicGate.requiresTopic`), so no authored topic has a second answer left to
 *  give, and the owner's contract — *"Every visible vendor conversation
 *  question is ask-once"* — is a CONSTANT rather than a branch two readers can
 *  drift across. A class set's six `lines` remain six PARALLEL VOICES, which is
 *  `voiceLaneFor`'s business and was never a count of answers.
 *
 *  ⚠ IT IS A CONSTANT SO THAT IT CANNOT COME BACK. A function whose body
 *  reached for `topic.lines.length` again would restore the divergence in one
 *  line; there is no body here to put it in. The corpus side is held by
 *  ota1867's one-line invariant over every authored set. */
export const ANSWERS_PER_QUESTION = 1;

/**
 * ⚠⚠⚠ OTA-1866 — "HAS THIS ALREADY BEEN ASKED" IS ONE FACT, SO IT GETS ONE
 * READER. The owner's contract for a vendor conversation is ask-once: the
 * answer lands once, the conversation remembers it, and the question is not
 * offered again for that character.
 *
 * ⚠⚠ IT EXISTS BECAUSE TWO READERS DRIFTED APART AND NOTHING COULD SEE IT.
 * OTA-1784 turned a class set's `lines` into PARALLEL VOICES — one answer per
 * person, not a repeat sequence — and `answersAvailable` above was written to
 * say so. `raiseTopic`'s already-said guard and `hasUnspokenTalk`'s glow were
 * moved onto it. THE TOPIC LIST WAS NOT, and went on comparing the counter
 * against `topic.lines.length`.
 *
 * For `class:roadside`, six lanes per topic, that reads `1 >= 6` — false. And
 * permanently false, because `raiseTopic` returns on the already-said path
 * BEFORE the counter write, so the count freezes at 1 and can never climb to
 * 6. The question stayed undimmed and pressable for the rest of that
 * character's life. Measured on hardware 2026-09-22: 79 presses in 25s against
 * Ilva Sidelong, every one answered "I have told you that one." The engine was
 * right the whole time; the list was asking the wrong question.
 *
 * ⚠ SO THIS IS NOT A THIRD COPY — IT IS THE ONLY COPY. It takes the topic and
 * the person rather than a caller-supplied count, so a reader cannot pass the
 * wrong number any more. The divergence is made unrepresentable rather than
 * corrected in two places and hoped about.
 */
export function topicSpent(
  topic: Topic,
  npcId: string,
  talked: Record<string, number> | undefined,
): boolean {
  if ((talked?.[`${npcId}:${topic.id}`] ?? 0) >= ANSWERS_PER_QUESTION) return true;
  // ⚠ OTA-1867 — AND A SAVE FROM BEFORE THE SPLIT HAS ALREADY HEARD IT. See
  // `Topic.legacyHeardWith`. Six rows carry this; it names the old parent and
  // the old count, and it only ever reports MORE spent, never less.
  const prior = topic.legacyHeardWith;
  return !!prior && (talked?.[`${npcId}:${prior.topic}`] ?? 0) >= prior.atCount;
}

/** ⚠⚠ OTA-1867 — the conversation, as the one question a gate may ask of it.
 *  Serves `TalkContext.topicConsumed`; see that field for why it is a closure.
 *
 *  Resolved against THIS person's own set, so a `requiresTopic` naming a topic
 *  somebody else owns finds nothing and reads false forever — the cross-person
 *  prerequisite is not forbidden by a rule, it is simply not expressible. */
export function conversationMemory(
  npcId: string,
  talked: Record<string, number> | undefined,
): (topicId: string) => boolean {
  return (topicId: string) => {
    const prior = setFor(npcId)?.topics.find((t) => t.id === topicId);
    return !!prior && topicSpent(prior, npcId, talked);
  };
}

export function topicReply(topic: Topic, timesAsked: number, npcId?: string): string {
  if (topic.lines.length === 0) return '';
  if (npcId && usesClassSet(npcId)) return topic.lines[voiceLaneFor(npcId, topic.lines.length)]!;
  return topic.lines[timesAsked % topic.lines.length]!;
}

// ─── OTA-1090 — THE DOOR THE PLAYER CAN SEE ─────────────────────────────────
//
// 141 of the cast's topics sit behind gates, and until now a locked topic was
// INVISIBLE: a stranger saw three questions and had no way to know Irma is a
// person with seven more behind them. Invisible depth reads as absent depth —
// the audit's dialogue finding in one line. So the list now ends with a COUNT
// — never the labels: "…things Irma doesn't tell strangers (4)". Knowing WHAT
// she is not telling you would spoil the finding of it; knowing THAT there is
// more is what makes a person feel deeper than her shopfront.
//
// ⚠ ONLY AFTER SHE PLACES YOU. A stranger gets no teaser — the door is earned
// at `known`, same rung where Irma starts talking about the encampments. And
// `wronged` gets nothing: someone you robbed has no hidden depth for you, and
// a count would read as a checklist for winning them back.

/** The regard rung at which the locked-count teaser appears. */
export const TEASER_MIN_REGARD: NpcRegard = 'known';

/** How many of this person's topics exist but are NOT currently open — the
 *  number the teaser shows. `onlyRegard` topics are excluded: the wronged
 *  apology is a repair state, not hidden depth, and counting it would show
 *  every clean-handed player a phantom locked topic. Returns 0 (teaser
 *  suppressed) for strangers/met and for the wronged. */
export function lockedTopicCount(npcId: string, ctx: TalkContext): number {
  if (ctx.regard === 'wronged') return 0;
  const have = REGARD_ORDER.indexOf(ctx.regard);
  const need = REGARD_ORDER.indexOf(TEASER_MIN_REGARD);
  if (have < 0 || have < need) return 0;
  const set = setFor(npcId);
  if (!set) return 0;
  return set.topics.filter((t) => !t.gate?.onlyRegard && !gateAllows(t.gate, ctx)).length;
}

/** The teaser row's label. Wording scales with the rung — the count is the
 *  same fact, but "doesn't tell strangers" to someone she has merely placed
 *  and "isn't ready to say" to someone she trusts are different sentences. */
export function lockedTeaserLabel(npcName: string, regard: NpcRegard, count: number): string {
  const noun = count === 1 ? 'thing' : 'things';
  if (regard === 'trusted') return `…${count === 1 ? 'a thing' : `${count} ${noun}`} ${npcName} isn't ready to say`;
  if (regard === 'familiar') return `…${count} ${noun} ${npcName} still holds back`;
  return `…${count} ${noun} ${npcName} doesn't tell strangers`;
}

/** OTA-1090 — tapping the teaser gets a DEFLECTION, in voice: not a menu
 *  refusal but the person telling you, in character, that the rest is earned.
 *  Three lines per rung, indexed by taps THIS conversation (deterministic —
 *  same state, same line, like every reply in this module). The trusted set
 *  speaks to gates that are not about warmth at all: work, standing, story. */
export function teaserDeflectionLine(npcName: string, regard: NpcRegard, timesTapped: number): string {
  const pools: Partial<Record<NpcRegard, string[]>> = {
    known: [
      `${npcName} waves the question off. "Ask me again when we've traded more than words."`,
      `${npcName} keeps their hands busy. "Some things I keep for people I know better."`,
      `${npcName} half-smiles. "Not that one. Not yet."`,
    ],
    familiar: [
      `${npcName} looks at you a moment longer than usual. "Nearly. You're nearly there."`,
      `${npcName} shakes their head, but slower than they used to. "Keep coming around and we'll see."`,
      `${npcName} drops their voice. "There's more. It costs more than asking, that's all."`,
    ],
    trusted: [
      `${npcName} nods at the question but not to it. "That one isn't about trust. It's about timing."`,
      `${npcName} taps the counter twice. "Do a bit more for my people and I'll say it out loud."`,
      `${npcName} glances at the door. "When things out there are different, ask me again."`,
    ],
  };
  const pool = pools[regard] ?? pools.known!;
  return pool[timesTapped % pool.length]!;
}

/** Said when a topic has been exhausted — they have told you this already and
 *  will not pretend otherwise. Better than repeating the line verbatim as if
 *  neither of you remembers the last two minutes. */
export function alreadySaidLine(npcName: string): string {
  return `${npcName} gives you a look. "I have told you that one."`;
}

/** Somebody with nothing to say to you, which is a real state and should read
 *  as one rather than as a missing feature. */
export function nothingToSayLine(npcName: string): string {
  return `${npcName} is willing enough, but there is nothing between you yet worth a conversation. Trade with them, work for them, and there will be.`;
}

/** Individually-authored people only — class entries are not "an NPC". */
export const TOPIC_NPC_IDS = Object.keys(TOPICS).filter((k) => !k.startsWith('class:'));
export const TOPIC_CLASS_KEYS = Object.keys(TOPICS).filter((k) => k.startsWith('class:'));

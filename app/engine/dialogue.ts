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
}

export interface Topic {
  id: string;
  label: string;
  gate?: TopicGate;
  lines: string[];
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
}

export function hasTopicsFor(npcId: string): boolean {
  return !!TOPICS[npcId];
}

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
  return true;
}

/** The topics this person will discuss with this player, right now.
 *  Order is authored order — deterministic, never shuffled, so the list does not
 *  reshuffle under the player's thumb between taps. */
export function topicsFor(npcId: string, ctx: TalkContext): Topic[] {
  const set = TOPICS[npcId];
  if (!set) return [];
  return set.topics.filter((t) => gateAllows(t.gate, ctx));
}

/** What they say. Indexed off how many times this topic has been raised rather
 *  than rolled, for the same reason the greeting layer is indexed (OTA-1049):
 *  an NPC who answers the same question differently on a replay of the same
 *  state reads as broken, not as varied. */
export function topicReply(topic: Topic, timesAsked: number): string {
  if (topic.lines.length === 0) return '';
  return topic.lines[timesAsked % topic.lines.length]!;
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

export const TOPIC_NPC_IDS = Object.keys(TOPICS);

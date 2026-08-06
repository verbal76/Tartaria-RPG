// OTA-1086 — THE FLOURISH. One short beat of stage business after a reply.
//
// The build plan's wording for this, and the shape of the whole thing:
// "the LLM contributes at most one short flourish line per exchange, off the
// critical path, with a template fallback if it's slow."
//
// ── WHAT A FLOURISH IS ────────────────────────────────────────────────────
// Not more dialogue. The authored reply owns the words; the flourish owns the
// hands. It is what the person is DOING while they answer — a rag over a
// joint, a count that does not falter, a pack that never comes off the
// shoulder. That is the cheapest thing in prose that makes somebody feel
// present, and it is the one thing a topic list cannot do on its own, because
// every topic in a set would need its own copy of it.
//
// ── WHY THE MODEL IS STILL NOT IN THE CRITICAL PATH ───────────────────────
// OTA-1081 shipped the conversation entirely synchronous because a 14-20s
// local generation in front of a tapped topic is a loading screen. Nothing about that has
// changed, so the flourish does NOT wait for a model either. The order is
// inverted instead: the TEMPLATE is the product, always available, always
// instant; a model line can only ever REPLACE a template that has not been
// spent yet, out of a slot that was filled by a request fired one exchange
// earlier. If the model is slow, the slot is empty and the player gets an
// authored line and never knows a request was in flight. If the model is
// broken, dormant, or busy, the feature is exactly as good as it was without
// it. There is no code path anywhere in the exchange that can await.
//
// That is also why every function in this file is synchronous and pure —
// including vetModelFlourish, which is the *judging* of a model line rather
// than the fetching of one. The fetch lives in gameStore next to the other
// generation calls, behind the same runtime locks. A test asserts this file has
// nothing awaitable in it, the same guard dialogue.ts carries.
//
// ── WHY IT IS NOT ON EVERY LINE ───────────────────────────────────────────
// Punctuation stops being punctuation when it is on every word. Three rules
// hold it down: it fires only on the FIRST raise of a topic (a re-tread gets
// nothing), at most FLOURISH_MAX_PER_CONVERSATION times in one exchange, and
// never repeats a line already used in that conversation.
import rawFlourishes from '../data/npcs/flourishes.json';
import type { NpcRegard } from './npcMemory';

/** Beats in one conversation. Deliberately small: the fourth piece of business
 *  in a row stops being characterisation and starts being a tic. */
export const FLOURISH_MAX_PER_CONVERSATION = 3;

/** A model line longer than this is not a flourish, it is a paragraph, and it
 *  will bury the authored reply it is supposed to be decorating. */
export const FLOURISH_MAX_CHARS = 160;
/** ...and below this it is a fragment. */
export const FLOURISH_MIN_CHARS = 16;

/** The trade buckets. A flourish is about what somebody's hands are used to,
 *  and the 30 authored vendors have 30 different job titles but only a handful
 *  of different sets of hands. */
export type FlourishKind =
  | 'forge' | 'arms' | 'counter' | 'curio' | 'books'
  | 'field' | 'quarters' | 'road' | 'escort' | 'guardian';

interface FlourishData {
  byKind: Record<string, string[]>;
  byRegard: Record<string, string[]>;
  fallback: string[];
}
const DATA = rawFlourishes as unknown as FlourishData;

/** ⚠ ORDER IS LOAD-BEARING — first match wins, so the specific trade has to be
 *  tested before the generic shop word. "Mechanical Outfitter" works metal and
 *  "Wilderness Outfitter" works road, and they share a noun; forge is checked
 *  first so the fitter's bench does not swallow the smith. */
const KIND_RULES: { kind: FlourishKind; words: string[] }[] = [
  { kind: 'guardian', words: ['guardian', 'core keeper'] },
  { kind: 'escort', words: ['escort', 'caravan', 'leader'] },
  { kind: 'forge', words: ['smith', 'armorer', 'armourer', 'mason', 'mechanical', 'forge'] },
  { kind: 'books', words: ['scholar', 'tomekeeper', 'keeper', 'archivist', 'clerk'] },
  { kind: 'quarters', words: ['quartermaster', 'agent', 'officer', 'factor'] },
  { kind: 'field', words: ['outfitter', 'wilderness', 'stealth', 'scout', 'ranger'] },
  { kind: 'curio', words: ['relic', 'trinket', 'curio', 'antiquar'] },
  { kind: 'arms', words: ['weapon', 'gear', 'ranged', 'exotic', 'two-handed', 'arms'] },
  { kind: 'road', words: ['wander', 'drift', 'traveler', 'traveller', 'refugee', 'pilgrim', 'scavenger', 'tinker', 'hawker', 'road', 'trader', 'nomad'] },
  { kind: 'counter', words: ['broker', 'goods', 'monger', 'dealer', 'vendor', 'merchant', 'stall', 'shop', 'specialist'] },
];

/** The bucket for a person, from whatever the ledger and the id know about
 *  them. `role` is the vendor's job title where there is one; `npcId` carries
 *  the class key for everybody procedural (OTA-1085). */
export function flourishKindFor(npcId: string, role?: string | null): FlourishKind | null {
  const hay = `${role ?? ''} ${npcId}`.toLowerCase();
  for (const rule of KIND_RULES) {
    if (rule.words.some((w) => hay.includes(w))) return rule.kind;
  }
  return null;
}

/** Stable, cheap, and NOT a random source. Two players in the same state get
 *  the same beat, for the same reason every other line in this system is
 *  deterministic (OTA-1072): a person whose gestures reshuffle on a replay
 *  reads as broken rather than as alive. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Both voices at once: what their trade does to their hands, and what this
 *  relationship does to their posture. Concatenated rather than chosen between
 *  so a familiar smith can draw either. */
export function flourishPool(kind: FlourishKind | null, regard: NpcRegard): string[] {
  const byKind = kind ? (DATA.byKind[kind] ?? []) : [];
  const byRegard = DATA.byRegard[regard] ?? [];
  const pool = [...byKind, ...byRegard];
  return pool.length > 0 ? pool : DATA.fallback;
}

export interface FlourishRequest {
  npcId: string;
  npcName: string;
  role?: string | null;
  regard: NpcRegard;
  /** The topic that just got answered — part of the seed, so the same person
   *  does not do the same thing after every question. */
  topicId: string;
  /** Lines already spent in THIS conversation. */
  used: readonly string[];
}

/** The template line, which is also the fallback line, because there is only
 *  one kind of line here and the model does not get a privileged one.
 *  Returns null when the pool is exhausted for this conversation — silence
 *  beats repeating a gesture the player watched two taps ago. */
export function flourishFor(req: FlourishRequest): string | null {
  const kind = flourishKindFor(req.npcId, req.role);
  const pool = flourishPool(kind, req.regard);
  if (pool.length === 0) return null;
  const start = hash(`${req.npcId}:${req.topicId}`) % pool.length;
  const usedSet = new Set(req.used);
  for (let i = 0; i < pool.length; i++) {
    const line = pool[(start + i) % pool.length]!.replace(/\{npc\}/g, req.npcName);
    if (!usedSet.has(line)) return line;
  }
  return null;
}

/** ⚠ THE JUDGE FOR A MODEL LINE. Pure and synchronous on purpose: the thing
 *  that decides whether a generated line is allowed to speak has to be
 *  testable without a model in the room.
 *
 *  These rules are not style preferences, they are the difference between a
 *  flourish and a hallucination:
 *   - it must NAME the person, because a beat about somebody else is an
 *     ambient musing that has wandered into a conversation;
 *   - one sentence only, and short, because it sits under an authored reply;
 *   - no quotes and no question marks — the model does not get to put words in
 *     anybody's mouth here, that is what the authored topic lines are for;
 *   - no first person and no second-person opener, which are the two registers
 *     the ambient path already proved this model falls into (OTA-1054);
 *   - no instruction echo, which OTA-1053 caught streaming raw to the screen. */
export function vetModelFlourish(raw: string, npcName: string): string | null {
  const first = (raw ?? '').trim().split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
  if (!first) return null;
  if (first.length < FLOURISH_MIN_CHARS || first.length > FLOURISH_MAX_CHARS) return null;
  if (!/[.!]$/.test(first)) return null;
  if (/["“”?]/.test(first)) return null;
  if (/\b(i|i'm|i've|my|me|mine|we|our)\b/i.test(first)) return null;
  if (/^\s*you\b/i.test(first)) return null;
  if (/\b(assistant|system prompt|the user|instruction|rules?:|narrator:|player)\b/i.test(first)) return null;
  if (!npcName || !first.toLowerCase().includes(npcName.toLowerCase())) return null;
  return first;
}

/** The system half of the prompt for the model slot. Kept here beside the
 *  judge so the brief and the rules that grade it cannot drift apart. */
export const FLOURISH_SYSTEM =
  'You write one short line of stage business for a character in a grim, ' +
  'mud-drowned buried world. RULES: exactly one sentence, under 25 words. ' +
  'Describe only what the named person is doing with their hands, eyes or ' +
  'body while they talk — never what they say. Use their name. No dialogue, ' +
  'no quotation marks, no questions. Do not address the reader. Do not ' +
  'invent names of places, factions, items or people. End with a full stop.';

/** The user half. Given the same person and trade this is stable, which keeps
 *  the request cacheable and the debug log readable. */
export function flourishPrompt(npcName: string, role: string | null | undefined, kind: FlourishKind | null): string {
  const trade = (role ?? '').trim() || (kind ?? 'trader');
  return `${npcName} is a ${trade}. Write the one line.`;
}

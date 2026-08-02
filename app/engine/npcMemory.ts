// OTA-1072 — PHASE 1, SLICE 1: NPCs REMEMBER YOU.
//
// Before this, the only record of a person was `worldMemory.npcsMet` — a list
// appended once and never touched again (`recordNpcMet` returns the memory
// unchanged if the id is already present). It answered exactly one question:
// have you ever been in a room with this NPC? That is a checklist, not a
// relationship. Every vendor greeted you identically on visit 1 and visit 40,
// and the only thing that ever varied the greeting was your standing with
// their FACTION — a number they share with hundreds of strangers.
//
// This module is the per-person ledger the greeting layer reads instead.
//
// DETERMINISM IS THE POINT. Nothing here rolls dice. The Arbiter names the
// player on a per-line coin flip (arbiterAddress, ~60%) and that reads as
// variety because the Arbiter is one continuous voice. Applied to an NPC it
// would read as broken: a shopkeeper who uses your name, then doesn't, then
// does, is a shopkeeper with a head injury. So whether someone knows your name
// is a pure function of what has actually passed between you, and which line
// they greet you with is indexed off the meeting count rather than picked at
// random — varied across visits, identical on any replay of the same state.
import type { NpcRelation, NpcMet, WorldMemory } from './types';

/** Three separate arrivals in front of someone and they know your face. */
export const MEETINGS_FOR_NAME = 3;
/** TC across the table that marks you as real custom rather than a browser. */
export const TC_FOR_FAMILIAR = 400;
export const TC_FOR_TRUSTED = 1500;
/** In-game hours away before a greeting acknowledges the gap (3 days). */
export const LONG_ABSENCE_HOURS = 72;

export type NpcRegard =
  | 'wronged'    // you stole from them, or drew on them
  | 'trusted'    // repeat business, finished work
  | 'familiar'   // a regular
  | 'known'      // they place you
  | 'met'        // seen once or twice, no dealings
  | 'stranger';  // never met

export function emptyRelation(npc: NpcMet, nowMs: number, hours: number): NpcRelation {
  return {
    id: npc.id,
    name: npc.name,
    role: npc.role,
    factionId: npc.factionId,
    firstMetAt: npc.firstMetAt ?? nowMs,
    lastSeenAt: nowMs,
    lastSeenHours: hours,
    meetings: 0,
    trades: 0,
    tcTraded: 0,
    contractsTaken: 0,
    contractsTurnedIn: 0,
    wrongs: 0,
  };
}

/** Bring a legacy save forward. Saves written before this OTA hold `npcsMet`
 *  and no relations, and a player who has already spent forty hours building
 *  rapport should not be demoted to a stranger by an update. Everyone on the
 *  old list starts as someone met once — the honest floor, since the old
 *  record genuinely does not say how often or what passed between you. */
export function seedRelationsFromMet(memory: WorldMemory): WorldMemory {
  if (memory.npcRelations) return memory;
  const rels: Record<string, NpcRelation> = {};
  for (const npc of memory.npcsMet ?? []) {
    const at = npc.firstMetAt ?? 0;
    rels[npc.id] = {
      ...emptyRelation(npc, at, npc.hoursElapsed ?? 0),
      meetings: 1,
    };
  }
  return { ...memory, npcRelations: rels };
}

export function getRelation(memory: WorldMemory, id: string): NpcRelation | null {
  return memory.npcRelations?.[id] ?? null;
}

/** One arrival in front of this NPC. Unlike recordNpcMet this is NOT
 *  idempotent — repetition is the whole signal. */
export function recordNpcSighting(
  memory: WorldMemory,
  npc: NpcMet,
  opts: { nowMs: number; hoursElapsed: number },
): WorldMemory {
  const seeded = seedRelationsFromMet(memory);
  const prev = seeded.npcRelations?.[npc.id];
  const base = prev ?? emptyRelation(npc, opts.nowMs, opts.hoursElapsed);
  const next: NpcRelation = {
    ...base,
    // Refresh the display fields — a vendor can be re-minted with a new title.
    name: npc.name || base.name,
    role: npc.role ?? base.role,
    factionId: npc.factionId ?? base.factionId,
    meetings: base.meetings + 1,
    lastSeenAt: opts.nowMs,
    lastSeenHours: opts.hoursElapsed,
  };
  return { ...seeded, npcRelations: { ...(seeded.npcRelations ?? {}), [npc.id]: next } };
}

/** Everything that is not just being in the room: trades, contracts, thefts.
 *  A no-op when the NPC has never been sighted — dealings without a meeting
 *  would mean a bug upstream, and inventing a relation here would hide it. */
export function recordNpcDealing(
  memory: WorldMemory,
  id: string,
  patch: Partial<Pick<NpcRelation, 'trades' | 'tcTraded' | 'contractsTaken' | 'contractsTurnedIn' | 'wrongs'>>,
): WorldMemory {
  const seeded = seedRelationsFromMet(memory);
  const prev = seeded.npcRelations?.[id];
  if (!prev) return seeded;
  const next: NpcRelation = {
    ...prev,
    trades: prev.trades + (patch.trades ?? 0),
    tcTraded: prev.tcTraded + (patch.tcTraded ?? 0),
    contractsTaken: prev.contractsTaken + (patch.contractsTaken ?? 0),
    contractsTurnedIn: prev.contractsTurnedIn + (patch.contractsTurnedIn ?? 0),
    wrongs: prev.wrongs + (patch.wrongs ?? 0),
  };
  return { ...seeded, npcRelations: { ...(seeded.npcRelations ?? {}), [id]: next } };
}

/** DETERMINISTIC. Same relation in, same answer out, every time.
 *
 *  Someone knows your name once something has actually passed between you —
 *  coin, a contract, or enough repeat visits that your face is furniture. A
 *  wrong counts too, and deliberately so: the person you stole from learns
 *  your name faster than the person you bought bread from. */
export function knowsPlayerName(rel: NpcRelation | null | undefined): boolean {
  if (!rel) return false;
  return rel.trades >= 1
    || rel.contractsTaken >= 1
    || rel.contractsTurnedIn >= 1
    || rel.wrongs >= 1
    || rel.meetings >= MEETINGS_FOR_NAME;
}

/** The regard ladder. Ordered most-specific first; `wronged` outranks every
 *  amount of custom, because a knife at the stall is not offset by receipts. */
export function npcRegard(rel: NpcRelation | null | undefined): NpcRegard {
  if (!rel || rel.meetings <= 0) return 'stranger';
  if (rel.wrongs > 0) return 'wronged';
  if (rel.contractsTurnedIn >= 2 || rel.tcTraded >= TC_FOR_TRUSTED) return 'trusted';
  if (rel.trades >= 3 || rel.contractsTurnedIn >= 1 || rel.tcTraded >= TC_FOR_FAMILIAR) return 'familiar';
  if (rel.trades >= 1 || rel.meetings >= MEETINGS_FOR_NAME) return 'known';
  return 'met';
}

/** True when enough in-game time has passed that a greeting should say so. */
export function longAbsence(rel: NpcRelation | null | undefined, hoursNow: number): boolean {
  if (!rel || rel.meetings <= 0) return false;
  return hoursNow - rel.lastSeenHours >= LONG_ABSENCE_HOURS;
}

/** How this NPC addresses the player, out loud.
 *
 *  Uses the first whitespace-separated token so a long custom name ("Verbal of
 *  the Tartarian Giants") doesn't read absurd inside a line of dialogue — the
 *  same rule arbiterAddress has always followed, so the Arbiter and the world
 *  agree on what you are called. */
export function npcAddress(
  rel: NpcRelation | null | undefined,
  playerName: string | null | undefined,
): string {
  const first = playerName?.trim().split(/\s+/)[0];
  if (!knowsPlayerName(rel) || !first) {
    return npcRegard(rel) === 'wronged' ? 'you' : 'traveler';
  }
  return first;
}

/** Greeting variants per rung of the ladder. `{name}` is substituted with
 *  npcAddress(), so a tier the player has reached WITHOUT earning the name
 *  still reads correctly ("Back again, traveler."). */
const GREETINGS: Record<NpcRegard, readonly string[]> = {
  stranger: [
    `{npc} looks up as you approach — the flat, unhurried look of someone sizing up a customer they have never seen.`,
    `{npc} watches you come in without recognition, one hand resting near the strongbox.`,
  ],
  met: [
    `{npc} glances up. "You again." Not warm, not cold — noted.`,
    `{npc} half-recognises you and doesn't say so. The wares stay where they are.`,
  ],
  known: [
    `{npc} places you as you come in. "{name}. What are you after?"`,
    `{npc} nods once. "{name}. Come look — a few things moved since you were last through."`,
    `{npc} sets down what they're holding. "Didn't expect you today, {name}."`,
  ],
  familiar: [
    `{npc} catches your eye and nods — the kind of nod that knows your name. "{name}. Come look at what came in this week."`,
    `{npc} is already reaching under the table before you've said anything. "{name}. Held something back for you."`,
    `{npc} grins. "{name}. Sit a minute. The road's been generous or it hasn't — which is it?"`,
  ],
  trusted: [
    `{npc} looks up before you've finished crossing the room — already reaching for the pot, already smiling. "{name}. Sit. Tell me what kind of day it's been."`,
    `{npc} waves off the customer they were serving. "{name}'s here. Give me a moment." The other one waits.`,
    `{npc} pushes the good stock to the front without being asked. "{name}. You know where everything is."`,
  ],
  wronged: [
    `{npc} sees you and goes still. The strongbox is closed before you're halfway across the floor.`,
    `{npc}'s hand finds the counter's edge. "I know what you are, {name}. Say what you want and go."`,
    `{npc} does not greet you. They watch your hands.`,
  ],
};

const ABSENCE_LINES: Record<NpcRegard, string | null> = {
  stranger: null,
  met: null,
  known: `"Been a while," {npc} says. "Thought the mud had you."`,
  familiar: `{npc} looks you over. "It's been a long stretch, {name}. I'd started asking after you."`,
  trusted: `"{name}." {npc} says it like setting down something heavy. "You've been gone. I kept your usual back anyway."`,
  wronged: null,
};

/** DETERMINISTIC line choice: indexed off the meeting count, not rolled. Two
 *  visits in the same regard tier read differently; the SAME visit replayed
 *  from the same save reads identically. */
export function npcGreeting(
  rel: NpcRelation | null | undefined,
  npcName: string,
  playerName: string | null | undefined,
): string {
  const regard = npcRegard(rel);
  const pool = GREETINGS[regard];
  const idx = pool.length > 0 ? Math.abs(rel?.meetings ?? 0) % pool.length : 0;
  return (pool[idx] ?? '')
    .replace(/\{npc\}/g, npcName)
    .replace(/\{name\}/g, npcAddress(rel, playerName));
}

/** The extra beat for someone you've been away from. Null when the tier has
 *  nothing to say about absence — a stranger cannot miss you. */
export function npcAbsenceLine(
  rel: NpcRelation | null | undefined,
  npcName: string,
  playerName: string | null | undefined,
  hoursNow: number,
): string | null {
  if (!longAbsence(rel, hoursNow)) return null;
  const line = ABSENCE_LINES[npcRegard(rel)];
  if (!line) return null;
  return line
    .replace(/\{npc\}/g, npcName)
    .replace(/\{name\}/g, npcAddress(rel, playerName));
}

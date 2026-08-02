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
// OTA-1075 — rememberNpcMeeting pairs the two stores; see below.
import { recordNpcMet } from './worldMemory';

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
    // OTA-1075 — remember WHEN THEY LAST SAW YOU before overwriting it with
    // "now". The greeting is composed after this write, so an absence line
    // measured against lastSeenHours always saw a gap of zero. Undefined on a
    // first meeting: someone cannot have missed you before they met you.
    prevSeenHours: base.meetings > 0 ? base.lastSeenHours : undefined,
    lastSeenAt: opts.nowMs,
    lastSeenHours: opts.hoursElapsed,
  };
  return { ...seeded, npcRelations: { ...(seeded.npcRelations ?? {}), [npc.id]: next } };
}

/** OTA-1075 — THE ONE WAY TO RECORD MEETING SOMEBODY.
 *
 *  Two stores have to move together and they have opposite rules: `npcsMet` is
 *  a list of PEOPLE and is idempotent (meeting someone twice does not make two
 *  of them), while the relation counts EVERY arrival because repetition is the
 *  only thing that turns a stranger into a regular.
 *
 *  OTA-1072 wired them as two calls at one site and left the other two
 *  recordNpcMet sites (both Core Guardians) unpaired, so a Guardian appeared in
 *  the Chronicle's people column with a blank where its regard should be. That
 *  gap could reopen every time someone adds an NPC. Pairing them here makes the
 *  correct thing the only convenient thing — callers cannot record half of it. */
export function rememberNpcMeeting(
  memory: WorldMemory,
  npc: NpcMet,
  opts: { nowMs: number; hoursElapsed: number },
): WorldMemory {
  // ⚠ SEED FIRST. OTA-1072 wrote these in the order (recordNpcMet, then
  // recordNpcSighting) and that DOUBLE-COUNTED every first meeting: on a save
  // with no npcRelations yet, the sighting's own seedRelationsFromMet ran
  // against an npcsMet list that already contained the person just added, so it
  // manufactured a relation at meetings=1 and then the sighting incremented it
  // to 2. A first-ever arrival therefore read as a SECOND meeting — which
  // OTA-1073's `seenBefore = meetings >= 2` turned into greeting a total
  // stranger as a returning face.
  //
  // Seeding before the append makes the inner seed a no-op (npcRelations is
  // already defined, even if empty), so the newly added row cannot be swept up
  // as a pre-existing acquaintance.
  const seeded = seedRelationsFromMet(memory);
  return recordNpcSighting(recordNpcMet(seeded, npc), npc, opts);
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
  // OTA-1073 — contractsTaken belongs on this rung. Slice 1 let it earn the
  // player's NAME (knowsPlayerName) but not any regard, so someone who had
  // handed you work was ranked below someone you had merely walked past three
  // times. Found by a slice-2 test; the ladder was wrong, not the test.
  if (rel.trades >= 1 || rel.contractsTaken >= 1 || rel.meetings >= MEETINGS_FOR_NAME) return 'known';
  return 'met';
}

/** True when enough in-game time has passed that a greeting should say so.
 *
 *  OTA-1075 — MUST be read AFTER this arrival's recordNpcSighting, which is
 *  where the store calls it. The gap is measured against `prevSeenHours` (the
 *  visit before this one), NOT `lastSeenHours` — the sighting sets that to the
 *  current clock, so the original version compared now against now and returned
 *  false every single time. The absence line was unreachable in play from the
 *  day it shipped; the unit tests missed it because they hand-built relations
 *  in which lastSeenHours still held the previous visit, so they were asserting
 *  the rule without ever exercising the wiring.
 *
 *  Undefined prevSeenHours — a first meeting, or a relation migrated from a
 *  pre-OTA-1072 save — is not an absence. There is no prior visit to be absent
 *  from, and inventing one would greet a brand-new face with "it's been a long
 *  stretch". */
export function longAbsence(rel: NpcRelation | null | undefined, hoursNow: number): boolean {
  if (!rel || rel.meetings <= 0) return false;
  if (rel.prevSeenHours === undefined) return false;
  return hoursNow - rel.prevSeenHours >= LONG_ABSENCE_HOURS;
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

// ---------------------------------------------------------------------------
// OTA-1073 — PHASE 1, SLICE 2.
// ---------------------------------------------------------------------------

/** Player-facing name for a rung of the ladder, for the Chronicle's people
 *  column. Deliberately plain nouns rather than a number: a relationship the
 *  UI renders as "familiar" is legible; one it renders as "62" invites the
 *  player to grind it. */
export const REGARD_LABEL: Record<NpcRegard, string> = {
  stranger: 'unknown',
  met: 'seen once',
  known: 'knows you',
  familiar: 'a regular',
  trusted: 'trusted',
  wronged: 'wary of you',
};

/** One line of what has actually passed between you, for the Chronicle. Empty
 *  string when nothing has — an honest blank beats inventing a history. */
export function dealingsSummary(rel: NpcRelation | null | undefined): string {
  if (!rel) return '';
  const bits: string[] = [];
  if (rel.trades > 0) bits.push(`${rel.trades} trade${rel.trades === 1 ? '' : 's'}`);
  if (rel.tcTraded > 0) bits.push(`${rel.tcTraded} TC`);
  const contracts = rel.contractsTurnedIn;
  if (contracts > 0) bits.push(`${contracts} contract${contracts === 1 ? '' : 's'} finished`);
  else if (rel.contractsTaken > 0) bits.push(`${rel.contractsTaken} taken`);
  if (rel.wrongs > 0) bits.push(rel.wrongs === 1 ? 'caught stealing' : `caught stealing ×${rel.wrongs}`);
  return bits.join(' · ');
}

/** Everyone the player has actually met, best-regarded first, for the
 *  Chronicle. Ties break on meeting count so the list is stable. */
const REGARD_RANK: NpcRegard[] = ['wronged', 'trusted', 'familiar', 'known', 'met', 'stranger'];
export function knownPeople(memory: WorldMemory): NpcRelation[] {
  const all = Object.values(memory.npcRelations ?? {}).filter((r) => r.meetings > 0);
  return all.sort((a, b) => {
    const d = REGARD_RANK.indexOf(npcRegard(a)) - REGARD_RANK.indexOf(npcRegard(b));
    if (d !== 0) return d;
    if (b.meetings !== a.meetings) return b.meetings - a.meetings;
    return a.name.localeCompare(b.name);
  });
}

/** Every fourth visit, a familiar face mentions someone else. Deterministic —
 *  the cadence is read off the meeting count, not rolled — and rare on purpose:
 *  Phase 0 was spent cutting the noise floor, and gossip that fires on every
 *  arrival would put it straight back. */
export const GOSSIP_EVERY = 4;

/** Whoever this NPC would talk about: another person in the same faction the
 *  player is genuinely well regarded by. Returns null when there is nobody
 *  worth mentioning, which is most of the game — word only travels once the
 *  player has actually built something for it to travel about. */
export function gossipSubject(
  memory: WorldMemory,
  speaker: NpcRelation | null | undefined,
): NpcRelation | null {
  if (!speaker || !speaker.factionId) return null;
  if (speaker.meetings <= 0 || speaker.meetings % GOSSIP_EVERY !== 0) return null;
  const speakerRegard = npcRegard(speaker);
  if (speakerRegard !== 'familiar' && speakerRegard !== 'trusted') return null;
  const peers = knownPeople(memory).filter(
    (r) => r.id !== speaker.id
      && r.factionId === speaker.factionId
      && (npcRegard(r) === 'familiar' || npcRegard(r) === 'trusted'),
  );
  return peers[0] ?? null;
}

export function gossipLine(
  speakerName: string,
  subject: NpcRelation,
  playerName: string | null | undefined,
): string {
  // The subject is at familiar-or-better, which cannot be reached without real
  // dealings, so they demonstrably know the player's name — npcAddress here is
  // belt and braces rather than a live fallback.
  const you = npcAddress(subject, playerName);
  return `${speakerName} tilts their head. "${subject.name} mentioned you, ${you}. Said you were worth dealing with — and ${subject.name} doesn't say that about many."`;
}

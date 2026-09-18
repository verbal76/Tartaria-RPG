/* ⚠⚠⚠ OTA-1845 — THE PERSON WHO SENT THEM COMES AND ASKS.
 *
 * Until now the social half of the Ledger of the Fallen ended at the import. A
 * player took another player's dead into their world and the only thing that
 * ever spoke about it again was a line of arrival text. The sender — a real
 * person, with a living character, who wanted something — never appeared.
 *
 * ⚠⚠ THIS FILE KNOWS NOTHING ABOUT COMBAT, and that is architecture rather than
 * a guard clause. There is no enemy row here, no HP, no attack table, no loot
 * roll and no XP. A messenger who could be routed into a fight would need an
 * enemy to be built somewhere; none is, so there is nothing for a hostile path
 * to hook into. It is the same refusal OTA-1844 made for the Last Walk.
 *
 * ⚠⚠ AND NO DICE. Everything here is a pure function of data that already
 * exists — the countdown included. A visit that arrived on a die roll could
 * starve; one derived from the accepted transfer's own timestamp cannot, and it
 * can be asserted rather than sampled.
 */
import type { FallenLogChannel, FallenLogLine } from './fallenDogs';

// ---------------------------------------------------------------------------
// the sender
// ---------------------------------------------------------------------------
export type SenderPronoun = 'he' | 'she' | 'they';

/** ⚠⚠ THE SMALLEST THING THAT CAN CONVINCINGLY BE A PERSON, AND NOTHING MORE.
 *
 *  The audit asked what identity already crosses: `origin.player` — the HOUSE —
 *  has ridden on every foreign record since OTA-1362, and the payload names the
 *  house at its top. What was genuinely absent was the sender's LIVING
 *  character, because nothing about a corpse says who is still standing.
 *
 *  ⚠ SO THREE FIELDS, ALL PRESENTATION. A name, a race word and a pronoun. The
 *  house is NOT duplicated here — it is already on the record. Explicitly
 *  excluded, and excluded by having no field to put them in: stats, hit points,
 *  armour, inventory, currency, gear, quest state, milestones, location, save
 *  slot, device identifiers. This is not a clone and cannot be grown into one
 *  without a schema change somebody would have to write on purpose. */
export interface SenderSnapshot {
  name: string;
  raceName?: string;
  pronoun?: SenderPronoun;
}

const str = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v.trim().slice(0, max) : '');

const PRONOUNS: readonly SenderPronoun[] = ['he', 'she', 'they'];

/** ⚠ THE DOOR, and it is the same shape as `sanitizeForeignFallen`'s: anything
 *  arriving from another phone is rebuilt field by field from bounded primitives,
 *  never spread. An absent or unreadable snapshot is `null` — which is a
 *  perfectly ordinary answer, because a payload written before this OTA has
 *  none, and one written by a player standing on the title screen has none
 *  either. */
export function sanitizeSenderSnapshot(raw: unknown): SenderSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 32);
  if (!name) return null;
  const raceName = str(r.raceName, 32);
  const p = str(r.pronoun, 8).toLowerCase() as SenderPronoun;
  const pronoun = PRONOUNS.includes(p) ? p : undefined;
  return { name, ...(raceName ? { raceName } : {}), ...(pronoun ? { pronoun } : {}) };
}

/** Build one from the living character. `sex` is the only identity field the
 *  character model actually holds, and OTA-1439 already calls it flavour; an
 *  unset one is `they`, which is also what every save predating that pick gets. */
export function senderSnapshotFrom(
  p: { name?: unknown; sex?: unknown } | null | undefined,
  raceName?: string,
): SenderSnapshot | null {
  const name = str(p?.name, 32);
  if (!name) return null;
  const pronoun: SenderPronoun = p?.sex === 'male' ? 'he' : p?.sex === 'female' ? 'she' : 'they';
  const race = str(raceName, 32);
  return { name, ...(race ? { raceName: race } : {}), pronoun };
}

// ---------------------------------------------------------------------------
// the queued visit
// ---------------------------------------------------------------------------
/** ⚠⚠ THE DEDUPE IDENTITY IS THE SENDING INSTALL, NEVER A DISPLAY NAME. Two
 *  different people may both call their character Bob and both call their house
 *  the same thing; no two installs share an id. Keying on anything a sender
 *  types would let one player's visit silently cancel another's. */
export interface LedgerVisit {
  installId: string;
  house: string;
  sender?: SenderSnapshot;
  /** Titled names from the accepted transfer that produced this visit. */
  names: string[];
  dogNames: string[];
  /** Qualifying movements still to come before they appear. Always 1–3. */
  steps: number;
  ts: number;
}

/** ⚠ BOUNDED, because a durable queue that can grow without limit is a defect
 *  whatever it holds. Eight houses waiting to be met is already far past any
 *  real session; past that the newest are kept, because those are the arrivals
 *  the player has actually just seen named on the preview. */
export const LEDGER_VISIT_CAP = 8;

/** The bound §13 asks for, stated as data so a test can assert it rather than
 *  sample it. */
export const VISIT_MIN_STEPS = 1;
export const VISIT_MAX_STEPS = 3;

/** ⚠⚠ DETERMINISTIC, NOT RANDOM. Derived from the accepted transfer's own
 *  timestamp, so the same transfer always produces the same countdown, the
 *  bound is provable at both ends, and there is no die that could roll a fourth
 *  step. `Math.random` does not appear in this file. */
export function visitSteps(ts: number): number {
  const n = Math.abs(Math.round(Number.isFinite(ts) ? ts : 0));
  return (n % (VISIT_MAX_STEPS - VISIT_MIN_STEPS + 1)) + VISIT_MIN_STEPS;
}

const bounded = (xs: readonly string[], max: number): string[] =>
  xs.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 96)).slice(0, max);

/** Rebuild a stored row. Same rule as every other persisted list in this
 *  family: field by field, never spread, and a row that cannot be rebuilt is
 *  dropped rather than half-trusted. */
export function reviveVisit(d: unknown): LedgerVisit[] {
  if (typeof d !== 'object' || d === null) return [];
  const r = d as Record<string, unknown>;
  const installId = str(r.installId, 40);
  if (!installId) return [];
  const ts = typeof r.ts === 'number' && Number.isFinite(r.ts) ? Math.round(r.ts) : 0;
  const rawSteps = typeof r.steps === 'number' && Number.isFinite(r.steps) ? Math.round(r.steps) : VISIT_MAX_STEPS;
  return [{
    installId,
    house: str(r.house, 32),
    ...(sanitizeSenderSnapshot(r.sender) ? { sender: sanitizeSenderSnapshot(r.sender)! } : {}),
    names: Array.isArray(r.names) ? bounded(r.names as string[], 12) : [],
    dogNames: Array.isArray(r.dogNames) ? bounded(r.dogNames as string[], 12) : [],
    // ⚠ Clamped on the way BACK IN as well as on the way out, so a hand-edited
    // save cannot park a visit at 9,999 steps and quietly delete it.
    steps: Math.min(VISIT_MAX_STEPS, Math.max(0, rawSteps)),
    ts,
  }];
}

/** Deterministic order: oldest accepted transfer first, install id breaking a
 *  tie. Two houses that arrive in the same millisecond still queue in a fixed
 *  order rather than in whatever order the array happened to hold. */
function ordered(list: readonly LedgerVisit[]): LedgerVisit[] {
  return [...list].sort((a, b) => (a.ts - b.ts) || a.installId.localeCompare(b.installId));
}

/** ⚠⚠ ONE VISIT PER HOUSE, NOT ONE PER FALLEN AND NOT ONE PER SEND.
 *
 *  §15: an accepted transfer carrying five of a house's dead queues ONE
 *  introduction. §16: a different house queues its own, independently, and
 *  neither overwrites the other. Both fall out of keying on `installId` and
 *  MERGING rather than appending: a second send from the same house before its
 *  rider has been met folds its names into the waiting visit, keeping the
 *  EARLIER countdown so the wait cannot be extended by another send. */
export function queueVisit(list: readonly LedgerVisit[], v: LedgerVisit): LedgerVisit[] {
  const held = list.find((x) => x.installId === v.installId);
  const merged: LedgerVisit = held
    ? {
      ...held,
      house: v.house || held.house,
      sender: v.sender ?? held.sender,
      names: bounded([...held.names, ...v.names.filter((n) => !held.names.includes(n))], 12),
      dogNames: bounded([...held.dogNames, ...v.dogNames.filter((n) => !held.dogNames.includes(n))], 12),
      steps: Math.min(held.steps, v.steps),
      ts: Math.min(held.ts, v.ts),
    }
    : v;
  const rest = list.filter((x) => x.installId !== v.installId);
  return ordered([...rest, merged]).slice(-LEDGER_VISIT_CAP);
}

/** One qualifying movement. Every waiting visit's countdown advances, and the
 *  first one that has run out is the one who walks up. A visit left at zero
 *  because another was due first is simply due next — nothing is lost and
 *  nothing can starve. */
export function tickVisits(list: readonly LedgerVisit[]): { next: LedgerVisit[]; due: LedgerVisit | null } {
  if (list.length === 0) return { next: [], due: null };
  const stepped = ordered(list).map((v) => ({ ...v, steps: Math.max(0, v.steps - 1) }));
  const due = stepped.find((v) => v.steps <= 0) ?? null;
  const next = due ? stepped.filter((v) => v.installId !== due.installId) : stepped;
  return { next, due };
}

// ---------------------------------------------------------------------------
// what they say
// ---------------------------------------------------------------------------
const theirs = (p: SenderPronoun | undefined): string =>
  (p === 'he' ? 'his' : p === 'she' ? 'her' : 'their');

/** How the rider is named on sight. House second, because the thing that
 *  matters is that a person is standing there. */
export function visitTitle(v: LedgerVisit): string {
  const house = v.house.trim();
  const name = v.sender?.name?.trim();
  if (name) return house ? `${name} of House ${house}` : name;
  return house ? `a rider of House ${house}` : 'a rider from another world';
}

/** ⚠ What they are asking for, in the words of the world. A companion is named
 *  as a companion and never folded in with the dead — OTA-1844's separation
 *  survives into the sentence that asks for help with both. */
export function visitAskLine(v: LedgerVisit): string {
  const named = v.names[0];
  const dog = v.dogNames.length > 0;
  const many = v.names.length > 1;
  const who = named && !many ? named : many ? 'my people' : dog ? '' : 'my people';
  if (who && dog) {
    return `${who} are out here somewhere, and ${theirs(v.sender?.pronoun)} dog with them. If you find them, end it — I cannot reach them from where I am.`;
  }
  if (who) {
    return `${who} ${many ? 'are' : 'is'} out here somewhere. If you find ${many ? 'them' : 'them'}, put ${many ? 'them' : 'them'} down for me. I cannot reach ${many ? 'them' : 'them'} from where I am.`;
  }
  return `A dog of mine is still walking out here. If you find them, stay with them a while. That is all I am asking.`;
}

/** ⚠⚠ THE BEAT: they are identified, they are placed with their house, they say
 *  what they came for, and they go. Four lines, and no system word in any of
 *  them — no payload, no pairing, no import, no seal, no file. The player is
 *  meant to come away with "another real player's character asked me to help
 *  their dead", which is what actually happened. */
export function visitLog(v: LedgerVisit): FallenLogLine[] {
  const ch = (channel: FallenLogChannel, text: string): FallenLogLine => ({ channel, text });
  const race = v.sender?.raceName?.trim();
  const out: FallenLogLine[] = [
    ch('world', `Someone is standing on the road ahead, not hiding and not armed for you.`),
    ch('world', race
      ? `⚑ ${visitTitle(v)} — ${race}, a long way from any ground of theirs.`
      : `⚑ ${visitTitle(v)} — a long way from any ground of theirs.`),
    ch('world', `"${visitAskLine(v)}"`),
  ];
  return out;
}

/** They leave. Always — there is no branch in which a rider stays. */
export function visitFarewellLine(v: LedgerVisit): string {
  const name = v.sender?.name?.trim() || 'the rider';
  return `${name} turns back the way they came, and the road is empty again. There was nothing to take and nothing offered.`;
}

/** The one thing the player can say back. It costs nothing and grants nothing —
 *  it is an answer, not a transaction. */
export const VISIT_REPLY_LABEL = 'I WILL LOOK FOR THEM';
export const VISIT_DISMISS_LABEL = 'SAY NOTHING';

export function visitReplyLine(v: LedgerVisit): string {
  const name = v.sender?.name?.trim() || 'the rider';
  return `You tell ${name} you will look. They nod once, as if that were more than they expected.`;
}

/* ⚠⚠⚠ OTA-1845 — THE RIDER'S QUEUE, ORCHESTRATED OUTSIDE THE STORE.
 *
 * `gameStore.ts` is at its ceiling and this was never its job, exactly as
 * OTA-1844 argued for the Last Walk. The store keeps two fields, one action and
 * one call on the movement beat; deciding who is owed a meeting, when it falls
 * due and what is said belongs here, beside the rules.
 *
 * ⚠⚠ NOTHING HERE BUILDS AN ENEMY. No scene enemies array is read or written, no
 * HP, no damage, no loot, no XP, no currency. The rider is a modal and a few
 * lines of log; there is no combatant for a hostile path to reach for, which is
 * the same refusal expressed as architecture rather than as a guard clause.
 *
 * ⚠⚠ AND THE HYDRATION RULE IS OTA-1839'S, NOT A NEW ONE. `null` means "we have
 * not looked at the disk yet" and NOTHING else may mean that. A synchronous
 * reader before the disk answers gets a frozen empty list it cannot install, so
 * the first too-early look costs one movement and never writes an empty queue
 * over a real one.
 */
import type { GameStore } from './gameStore';
import {
  LEDGER_VISIT_CAP,
  queueVisit,
  tickVisits,
  visitFarewellLine,
  visitLog,
  visitReplyLine,
  visitSteps,
  type LedgerVisit,
  type SenderSnapshot,
} from '../engine/senderIntro';
import { loadLedgerVisits, setLedgerVisits } from '../engine/saveSystem';

type Get = () => GameStore;
type Set = (fn: (s: GameStore) => Partial<GameStore>) => void;

let VISITS: LedgerVisit[] | null = null;
let HYDRATION: Promise<LedgerVisit[]> | null = null;

/** Handed to a synchronous reader before the disk has answered. Frozen, and
 *  deliberately NOT installed — it says "not yet", never "nobody owed". */
const UNHYDRATED: readonly LedgerVisit[] = Object.freeze([]);

export async function loadVisits(): Promise<LedgerVisit[]> {
  if (VISITS) return VISITS;
  if (HYDRATION) return HYDRATION;
  const run = (async (): Promise<LedgerVisit[]> => {
    let next: LedgerVisit[];
    try { next = await loadLedgerVisits(); } catch { next = []; }
    // A queue or a tick may have landed while we were reading; it wins.
    if (VISITS === null) VISITS = next;
    return VISITS;
  })();
  HYDRATION = run;
  try { return await run; } finally { if (HYDRATION === run) HYDRATION = null; }
}

/** ⚠ Empty until the disk answers, and it does NOT install that emptiness. */
export function cachedVisits(): readonly LedgerVisit[] {
  if (VISITS) return VISITS;
  void loadVisits();
  return UNHYDRATED;
}

export function _setVisitsForTests(l: LedgerVisit[] | null): void { VISITS = l; HYDRATION = null; }

function commit(next: LedgerVisit[]): void {
  VISITS = next;
  // ⚠ Through `setLedgerVisits`, which goes through `mutateGlobalStash` — so a
  // visit written beside a death cannot erase the memorial, and vice versa.
  void setLedgerVisits(next).catch(() => { /* memory-only this run; the queue is not a promise to the player */ });
}

// ---------------------------------------------------------------------------
// queueing
// ---------------------------------------------------------------------------
/** ⚠⚠⚠ ONLY A GENUINELY NEW ARRIVAL QUEUES A RIDER, AND THAT IS WHAT MAKES
 *  REPLAY IDEMPOTENT FOR FREE.
 *
 *  `added` and `dogsAdded` are what the MERGE actually took in, and the merge
 *  has deduped by `fallenKey` / `dogFallenKey` since OTA-1362. Re-accepting the
 *  same Entry therefore adds zero and queues nothing — not because a second
 *  guard checks a second list, but because there is nothing new to be asked
 *  about. A declined Entry never reaches here at all: DECLINE does not call the
 *  import.
 *
 *  ⚠ AND A FORGED OR UNPAIRED PAYLOAD CANNOT QUEUE ONE EITHER. `fromInstallId`
 *  is empty in both cases by construction upstream, and an empty id is refused
 *  here rather than turned into an anonymous rider. */
export function queueFromImport(out: {
  added: number; dogsAdded: number; forged: boolean;
  fromHouse: string; fromInstallId: string; sender?: SenderSnapshot;
  arrivals: string[]; dogArrivals: string[];
}, now: number = Date.now()): LedgerVisit | null {
  if (out.forged) return null;
  if (!out.fromInstallId) return null;
  if (out.added + out.dogsAdded <= 0) return null;
  const v: LedgerVisit = {
    installId: out.fromInstallId,
    house: out.fromHouse,
    ...(out.sender ? { sender: out.sender } : {}),
    names: [...out.arrivals],
    dogNames: [...out.dogArrivals],
    steps: visitSteps(now),
    ts: now,
  };
  const base = VISITS ?? [];
  const next = queueVisit(base, v);
  commit(next);
  return next.find((x) => x.installId === v.installId) ?? null;
}

// ---------------------------------------------------------------------------
// the movement beat
// ---------------------------------------------------------------------------
/** ⚠⚠ ONE QUALIFYING MOVEMENT, AND THE CALLER DECIDES WHAT QUALIFIES.
 *
 *  §13's rule is that qualifying movement comes from the EXISTING movement
 *  authority rather than from a second one invented here, so this function is
 *  called from inside `stepDirection` at the point that step has already been
 *  taken and the ground has already been judged peaceful by the same expression
 *  the Fallen spawner uses. Menus, inventory and every other non-movement
 *  action never reach it, so they cannot consume the countdown.
 *
 *  ⚠ Returns the rider who is due, or null. It does not open anything: opening
 *  is the store's business because the store owns the modal. */
export function tickLedgerVisit(): LedgerVisit | null {
  // Not hydrated yet — kick the read off and cost this one movement. It cannot
  // starve: the next step reads a real queue.
  if (VISITS === null) { void loadVisits(); return null; }
  if (VISITS.length === 0) return null;
  const { next, due } = tickVisits(VISITS);
  commit(next);
  return due;
}

/** The rider walks up. Non-hostile by construction: no enemy is built, no scene
 *  array is touched, and there is no branch in here that could start a fight. */
export function openLedgerVisit(get: Get, set: Set, v: LedgerVisit): void {
  set(() => ({ ledgerVisitor: { ...v } }));
  for (const ln of visitLog(v)) get().appendLog(ln.channel, ln.text);
  get().appendLog('debug', `ledgervisit: ${v.installId} names=${v.names.length} dogs=${v.dogNames.length} queued=${cachedVisits().length}`);
}

/** ⚠⚠ THE WHOLE RESOLUTION, AND IT IS A SENTENCE EITHER WAY. Answering costs
 *  nothing and grants nothing — no XP, no coin, no item, no reputation, no
 *  quest. The rider says their piece, hears whatever the player chose to say,
 *  and leaves. They are removed from the queue by the tick that made them due,
 *  so there is no second visit to dedupe against. */
export function answerLedgerVisit(get: Get, set: Set, reply: boolean): void {
  const v = get().ledgerVisitor;
  if (!v) return;
  if (reply) get().appendLog('world', visitReplyLine(v));
  get().appendLog('world', visitFarewellLine(v));
  set(() => ({ ledgerVisitor: null }));
  void get().persist();
}

export { LEDGER_VISIT_CAP };

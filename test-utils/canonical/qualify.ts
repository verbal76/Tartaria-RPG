// Phase 5A, Part 4 — the central qualification success-predicate framework.
//
// Repairs I-013 (qualification-no-exception-equals-success): the pre-existing
// pattern — CanonicalActionExecutor.perform() sets ActionRecord.result:'ok'
// unless the wrapped call throws, and qualificationHelpers.fileFromActionRecord()
// files RUNTIME_PROVEN whenever result==='ok' — never inspects whether the
// door's intended consequence actually happened. That is how REINFORCEMENT,
// FUSE and STORY/FORK were filed RUNTIME_PROVEN while producing zero,
// tautological, or fabricated evidence (docs/cartography/evidenceCorrections.json
// EC-001/EC-004/EC-005).
//
// This module makes "did not throw" structurally insufficient for
// RUNTIME_PROVEN. `qualify()` owns the entire lifecycle — precondition,
// reachability gate, before-state capture, execution, after-state capture,
// predicate evaluation, delta measurement — and a caller cannot skip a step
// or supply pre-fabricated before/after objects (see TAUTOLOGICAL CAPTURE
// DEFENSE below). RUNTIME_PROVEN requires an explicit, mechanism-specific
// predicate — defined BEFORE execute() runs — to evaluate true against
// framework-captured state.
//
// This module does NOT replace CanonicalActionExecutor (the production-door
// call surface) or the legacy qualification.ts ledger (Phase 3C/3D history,
// untouched — see evidenceCorrections.json for how that history was
// corrected in place). It is a new, independent lifecycle a caller wraps
// AROUND a production call. Part 4 builds and tests this framework only —
// no mechanism is requalified here (see canonicalQualificationFramework.test.ts:
// every test below uses a controlled fixture action, never a real production
// door). Part 11 will use this framework to produce new, valid replacement
// evidence for the doors Part 2 downgraded/invalidated.
//
// SAFETY: this module must never itself perturb gameplay. It never reads
// Error.stack, never calls Math.random, never advances the virtual clock,
// never writes GameStore, and never persists/hydrates. rngDrawCount() and
// walkerClockNow() (reused from the existing telemetry primitives) are both
// pure reads. captureState()/predicate() are caller-supplied and MUST be
// equally observational — this module cannot enforce that inside caller
// code, but canonicalQualificationFramework.test.ts's NC12 proves the
// framework's OWN machinery adds no RNG/clock/store mutations beyond
// whatever execute() itself performs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rngDrawCount } from './rngLedger';
import { walkerClockNow } from '../playerWalker';

// __dirname, not import.meta.url: this module is loaded through Jest's
// CommonJS/Babel transform (every canonicalX.test.ts imports it transitively
// via ../playerWalker), and import.meta is not available in that transform.
const cartoDir = join(__dirname, '../../docs/cartography');

// ── Result vocabulary ───────────────────────────────────────────────────
//
// The owner's minimum required set is RUNTIME_PROVEN / REFUSED /
// PRECONDITION_NOT_MET / NO_STATE_CHANGE / SUCCESS_PREDICATE_FAILED /
// BLOCKED / UNPROVEN / HARNESS_ERROR. One addition, REACHABILITY_NOT_ESTABLISHED,
// is made and explained here rather than folded into PRECONDITION_NOT_MET:
// Part 3 built the human-reachability model specifically to distinguish "the
// game state doesn't allow this action" from "no human player has a path to
// this action even when the game state allows it" (the STORE_ONLY finding).
// Collapsing the two back into one outcome would erase that distinction
// inside the very framework meant to enforce it. The other 8 outcomes are
// otherwise unchanged from the owner's list, and each is distinct as
// required — no refusal/no-change/predicate-failure collapsing:
//
//   PRECONDITION_NOT_MET          — precondition.verify() returned false; execute() never called.
//   REACHABILITY_NOT_ESTABLISHED  — reachability gate refused; execute() never called.
//   BLOCKED                       — execute() THREW (a production-level refusal via exception).
//   REFUSED                       — execute() returned normally; the predicate identifies an
//                                    explicit production refusal (e.g. a {ok:false,reason} verdict).
//   NO_STATE_CHANGE                — execute() returned normally, predicate failed, and the
//                                    framework's own before/after capture is byte-identical
//                                    (JSON-serialized) — a silent no-op, the REINFORCEMENT bug class.
//   SUCCESS_PREDICATE_FAILED       — execute() returned normally, predicate failed, and SOME state
//                                    changed, but not the consequence the predicate requires.
//   UNPROVEN                       — the framework could not resolve a required piece of evidence
//                                    (e.g. no predicate/reachability wired up yet) — an honest "not
//                                    yet answerable" distinct from a harness bug or a game refusal.
//   HARNESS_ERROR                  — captureState() or predicate() itself threw: a bug in the
//                                    QUALIFICATION machinery, not evidence about production.
//   RUNTIME_PROVEN                 — precondition met, reachability established, execute() did not
//                                    throw, and predicate.passed === true.
export type QualificationOutcome =
  | 'RUNTIME_PROVEN'
  | 'REFUSED'
  | 'PRECONDITION_NOT_MET'
  | 'REACHABILITY_NOT_ESTABLISHED'
  | 'NO_STATE_CHANGE'
  | 'SUCCESS_PREDICATE_FAILED'
  | 'BLOCKED'
  | 'UNPROVEN'
  | 'HARNESS_ERROR';

// ── Reachability integration (Part 3 metadata is authoritative apparatus) ──

interface ReachabilityRow {
  id: string;
  reachability: string;
  accessSurface: string;
  harnessMirrorsGate: string;
}

let reachabilityRowsCache: readonly ReachabilityRow[] | null = null;

/** Reads docs/cartography/reachability.json once and caches it. A pure file
 *  read of a static doc, not game state — not a gameplay perturbation. */
function loadReachabilityRows(): readonly ReachabilityRow[] {
  if (reachabilityRowsCache) return reachabilityRowsCache;
  const raw = JSON.parse(readFileSync(join(cartoDir, 'reachability.json'), 'utf8')) as { rows: ReachabilityRow[] };
  reachabilityRowsCache = raw.rows;
  return reachabilityRowsCache;
}

/** Test-only: force a re-read on the next lookup (e.g. after fixture edits). */
export function resetReachabilityCache(): void {
  reachabilityRowsCache = null;
}

const HUMAN_PLAY_DISALLOWED = new Set(['STORE_ONLY', 'TELEMETRY_ONLY', 'HIDDEN_FUTURE', 'UNRESOLVED']);
const HUMAN_PLAY_ALLOWED = new Set(['PLAYER_UI_REACHABLE', 'PLAYER_COMMAND_REACHABLE', 'PLAYER_DERIVABLE']);

/**
 * How a qualification relates to the Part 3 human-reachability model. This
 * is a required, explicit choice — there is no default and no way to
 * silently skip it, so a caller can never accidentally claim human-play
 * evidence for a STORE_ONLY door, and can never quietly reclassify a
 * reachability row just to make a qualification pass (that would be editing
 * docs/cartography/reachability.json, a Part 3 artifact, not this module).
 */
export type ReachabilityRequirement =
  | { kind: 'HUMAN_PLAY'; rowId: string }
  | { kind: 'AUTOMATIC_CONSEQUENCE'; description: string }
  | { kind: 'NOT_CLAIMED'; reason: string };

interface ReachabilityCheck {
  ok: boolean;
  requirement: ReachabilityRequirement;
  row: ReachabilityRow | null;
  reason: string;
}

function checkReachability(req: ReachabilityRequirement): ReachabilityCheck {
  if (req.kind === 'AUTOMATIC_CONSEQUENCE') {
    return { ok: true, requirement: req, row: null, reason: `automatic consequence, not a player decision: ${req.description}` };
  }
  if (req.kind === 'NOT_CLAIMED') {
    return { ok: true, requirement: req, row: null, reason: `no human-play evidentiary claim made: ${req.reason}` };
  }
  const row = loadReachabilityRows().find((r) => r.id === req.rowId) ?? null;
  if (!row) {
    return { ok: false, requirement: req, row: null, reason: `reachability row ${req.rowId} not found in docs/cartography/reachability.json` };
  }
  if (HUMAN_PLAY_DISALLOWED.has(row.reachability)) {
    return { ok: false, requirement: req, row, reason: `${req.rowId} is ${row.reachability} — not human-play reachable, cannot support canonical human-play RUNTIME_PROVEN` };
  }
  if (!HUMAN_PLAY_ALLOWED.has(row.reachability)) {
    return { ok: false, requirement: req, row, reason: `${req.rowId} has unrecognized reachability class ${row.reachability}` };
  }
  if (row.harnessMirrorsGate !== 'YES') {
    return { ok: false, requirement: req, row, reason: `${req.rowId} harnessMirrorsGate=${row.harnessMirrorsGate} (not YES) — harness does not faithfully mirror the player gate` };
  }
  return { ok: true, requirement: req, row, reason: `${req.rowId} is ${row.reachability} with harnessMirrorsGate=YES` };
}

// ── Success-predicate API ───────────────────────────────────────────────

export interface PredicateResult {
  passed: boolean;
  reason: string;
  observed?: Record<string, unknown>;
  /** Only consulted when passed===false. Lets a mechanism-specific predicate
   *  identify an explicit production refusal (e.g. a {ok:false} verdict) as
   *  REFUSED rather than falling through to the generic NO_STATE_CHANGE /
   *  SUCCESS_PREDICATE_FAILED auto-classification below. */
  classification?: 'REFUSED' | 'NO_STATE_CHANGE' | 'SUCCESS_PREDICATE_FAILED';
}

export interface PredicateContext<S, V> {
  before: S;
  after: S;
  /** The production call's return value, if execute() resolved. Capturing
   *  it is necessary but never sufficient — see EXPLICIT-VERDICT HANDLING
   *  in the Part 4 report: a verdict saying "success" is not proof by
   *  itself, only alongside a passing state-consequence check. */
  verdict: V | undefined;
}

// ── The qualification contract ──────────────────────────────────────────

export interface QualifyArgs<S, V> {
  qualificationId: string;
  mechanismId: string;
  relatedMechanicIds?: readonly string[];
  relatedOpenIssueIds?: readonly string[];
  /** evidenceCorrections.json ids this NEW qualification would, once run for
   *  real against a production door (Part 11), supersede. Left empty for
   *  fixture/smoke qualifications that make no such claim. */
  supersedesEvidence?: readonly string[];
  reachability: ReachabilityRequirement;
  precondition: { description: string; verify: () => boolean };
  /** Called by the FRAMEWORK, twice: once before execute(), once after.
   *  Never accept a caller-supplied "before" and "after" object pair — see
   *  TAUTOLOGICAL CAPTURE DEFENSE in the Part 4 report. Must be a pure,
   *  observational read (no RNG, no clock advance, no store write). */
  captureState: () => S;
  /** The production call. May throw — a throw is recorded as BLOCKED, not
   *  routed into the predicate (see NC10). */
  execute: () => Promise<V> | V;
  /** Must exist before execute() runs (it does — args is fully constructed
   *  by the caller before qualify() is invoked). Never receives raw store
   *  state, only what captureState() chose to expose. */
  predicate: (ctx: PredicateContext<S, V>) => PredicateResult;
  expectedConsequence: string;
  /** Optional mechanism-specific compact delta (e.g. {tcBefore,tcAfter} for
   *  a vendor door) — kept SEPARATE from a generic deep-diff, which the
   *  owner explicitly warned would be noisy for a whole-GameStore compare. */
  measureDelta?: (before: S, after: S) => Record<string, unknown>;
  downstreamConsequence?: string;
  activationCount?: number;
}

export interface QualificationRecord<S, V> {
  qualificationId: string;
  mechanismId: string;
  relatedMechanicIds: readonly string[];
  relatedOpenIssueIds: readonly string[];
  supersedesEvidence: readonly string[];
  sourceSha: string;
  precondition: { description: string; result: boolean };
  reachability: { requirement: ReachabilityRequirement; row: ReachabilityRow | null; result: boolean; reason: string };
  before: S | null;
  produced: { verdict: V | null; threw: boolean; errorMessage: string | null };
  after: S | null;
  successPredicate: { definedBeforeExecution: true; result: PredicateResult | null };
  measuredDelta: Record<string, unknown> | null;
  expectedConsequence: string;
  observedConsequence: string | null;
  downstreamConsequence: string | null;
  rngDrawSpan: readonly [number, number] | null;
  virtualClockMs: { before: number | null; after: number | null };
  activationCount: number | null;
  outcome: QualificationOutcome;
  failureReason: string | null;
}

const SOURCE_SHA = 'f25aee76603c1316985940987def2e125f188b61';

function jsonDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The one entry point. Owns the full lifecycle: DEFINE ACTION (caller's
 * args) -> VERIFY PRECONDITION -> VERIFY REACHABILITY -> CAPTURE BEFORE ->
 * EXECUTE -> CAPTURE AFTER -> EVALUATE PREDICATE -> MEASURE DELTA -> RECORD
 * CONSEQUENCE -> EMIT RESULT. No exception path in this function can produce
 * RUNTIME_PROVEN.
 */
export async function qualify<S, V>(args: QualifyArgs<S, V>): Promise<QualificationRecord<S, V>> {
  const base = {
    qualificationId: args.qualificationId,
    mechanismId: args.mechanismId,
    relatedMechanicIds: args.relatedMechanicIds ?? [],
    relatedOpenIssueIds: args.relatedOpenIssueIds ?? [],
    supersedesEvidence: args.supersedesEvidence ?? [],
    sourceSha: SOURCE_SHA,
    expectedConsequence: args.expectedConsequence,
    activationCount: args.activationCount ?? null,
  };

  // 1-2. DEFINE ACTION / DEFINE PRECONDITION are the caller's args; VERIFY PRECONDITION:
  let preconditionResult: boolean;
  try {
    preconditionResult = args.precondition.verify();
  } catch (e) {
    return {
      ...base,
      precondition: { description: args.precondition.description, result: false },
      reachability: { requirement: args.reachability, row: null, result: false, reason: 'not evaluated — precondition.verify() threw' },
      before: null,
      produced: { verdict: null, threw: false, errorMessage: null },
      after: null,
      successPredicate: { definedBeforeExecution: true, result: null },
      measuredDelta: null,
      observedConsequence: null,
      downstreamConsequence: args.downstreamConsequence ?? null,
      rngDrawSpan: null,
      virtualClockMs: { before: null, after: null },
      outcome: 'HARNESS_ERROR',
      failureReason: `precondition.verify() threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!preconditionResult) {
    return {
      ...base,
      precondition: { description: args.precondition.description, result: false },
      reachability: { requirement: args.reachability, row: null, result: false, reason: 'not evaluated — precondition not met, action never attempted' },
      before: null,
      produced: { verdict: null, threw: false, errorMessage: null },
      after: null,
      successPredicate: { definedBeforeExecution: true, result: null },
      measuredDelta: null,
      observedConsequence: null,
      downstreamConsequence: args.downstreamConsequence ?? null,
      rngDrawSpan: null,
      virtualClockMs: { before: null, after: null },
      outcome: 'PRECONDITION_NOT_MET',
      failureReason: `precondition not met: ${args.precondition.description}`,
    };
  }

  // 4. VERIFY REACHABILITY (before any state capture or execution).
  const reachCheck = checkReachability(args.reachability);
  if (!reachCheck.ok) {
    return {
      ...base,
      precondition: { description: args.precondition.description, result: true },
      reachability: { requirement: args.reachability, row: reachCheck.row, result: false, reason: reachCheck.reason },
      before: null,
      produced: { verdict: null, threw: false, errorMessage: null },
      after: null,
      successPredicate: { definedBeforeExecution: true, result: null },
      measuredDelta: null,
      observedConsequence: null,
      downstreamConsequence: args.downstreamConsequence ?? null,
      rngDrawSpan: null,
      virtualClockMs: { before: null, after: null },
      outcome: 'REACHABILITY_NOT_ESTABLISHED',
      failureReason: reachCheck.reason,
    };
  }

  // 5. CAPTURE BEFORE STATE — framework-owned call, first of the two.
  let before: S;
  const rngBefore = rngDrawCount();
  const clockBefore = walkerClockNow();
  try {
    before = args.captureState();
  } catch (e) {
    return {
      ...base,
      precondition: { description: args.precondition.description, result: true },
      reachability: { requirement: args.reachability, row: reachCheck.row, result: true, reason: reachCheck.reason },
      before: null,
      produced: { verdict: null, threw: false, errorMessage: null },
      after: null,
      successPredicate: { definedBeforeExecution: true, result: null },
      measuredDelta: null,
      observedConsequence: null,
      downstreamConsequence: args.downstreamConsequence ?? null,
      rngDrawSpan: null,
      virtualClockMs: { before: clockBefore, after: null },
      outcome: 'HARNESS_ERROR',
      failureReason: `captureState() (before) threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 6. EXECUTE PRODUCTION ACTION.
  let verdict: V | undefined;
  let threw = false;
  let errorMessage: string | null = null;
  try {
    verdict = await args.execute();
  } catch (e) {
    threw = true;
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  // 7. CAPTURE AFTER STATE — framework-owned call, second of the two, only
  // ever invoked with the SAME captureState function, never a caller-supplied
  // object. This is the structural fix for the SELL/VENDOR-REPAIR bug class
  // (both reads happened after the call in the old pattern).
  let after: S | null = null;
  if (!threw) {
    try {
      after = args.captureState();
    } catch (e) {
      return {
        ...base,
        precondition: { description: args.precondition.description, result: true },
        reachability: { requirement: args.reachability, row: reachCheck.row, result: true, reason: reachCheck.reason },
        before,
        produced: { verdict: verdict ?? null, threw: false, errorMessage: null },
        after: null,
        successPredicate: { definedBeforeExecution: true, result: null },
        measuredDelta: null,
        observedConsequence: null,
        downstreamConsequence: args.downstreamConsequence ?? null,
        rngDrawSpan: [rngBefore + 1, rngDrawCount()],
        virtualClockMs: { before: clockBefore, after: walkerClockNow() },
        outcome: 'HARNESS_ERROR',
        failureReason: `captureState() (after) threw: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const rngAfter = rngDrawCount();
  const clockAfter = walkerClockNow();
  const rngDrawSpan: readonly [number, number] | null = rngAfter > rngBefore ? [rngBefore + 1, rngAfter] : null;

  // NC10 — a thrown production action is recorded distinctly as BLOCKED. It
  // is NEVER routed into the predicate: a throw is not "predicate failed",
  // it is production refusing to even attempt the mechanism.
  if (threw) {
    return {
      ...base,
      precondition: { description: args.precondition.description, result: true },
      reachability: { requirement: args.reachability, row: reachCheck.row, result: true, reason: reachCheck.reason },
      before,
      produced: { verdict: null, threw: true, errorMessage },
      after: null,
      successPredicate: { definedBeforeExecution: true, result: null },
      measuredDelta: null,
      observedConsequence: null,
      downstreamConsequence: args.downstreamConsequence ?? null,
      rngDrawSpan,
      virtualClockMs: { before: clockBefore, after: clockAfter },
      outcome: 'BLOCKED',
      failureReason: `execute() threw: ${errorMessage}`,
    };
  }

  const afterState = after as S; // threw===false, so after was assigned above.

  // 8. EVALUATE SUCCESS PREDICATE. Defined before execution (it's a plain
  // function on args, constructed by the caller before qualify() runs).
  let predicateResult: PredicateResult;
  try {
    predicateResult = args.predicate({ before, after: afterState, verdict });
  } catch (e) {
    return {
      ...base,
      precondition: { description: args.precondition.description, result: true },
      reachability: { requirement: args.reachability, row: reachCheck.row, result: true, reason: reachCheck.reason },
      before,
      produced: { verdict: verdict ?? null, threw: false, errorMessage: null },
      after: afterState,
      successPredicate: { definedBeforeExecution: true, result: null },
      measuredDelta: null,
      observedConsequence: null,
      downstreamConsequence: args.downstreamConsequence ?? null,
      rngDrawSpan,
      virtualClockMs: { before: clockBefore, after: clockAfter },
      outcome: 'HARNESS_ERROR',
      failureReason: `predicate() threw: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 9. MEASURE DELTA (optional, mechanism-specific, compact — never a whole-
  // store deep-diff).
  let measuredDelta: Record<string, unknown> | null = null;
  if (args.measureDelta) {
    try {
      measuredDelta = args.measureDelta(before, afterState);
    } catch {
      measuredDelta = { error: 'measureDelta threw — not fatal, delta omitted' };
    }
  }

  if (predicateResult.passed) {
    // 10-12. RECORD CONSEQUENCE / EMIT RESULT. Only on a PASSING predicate
    // does the "observed consequence" get to equal the expected one — see
    // NO FABRICATED CONSEQUENCE TEXT in the Part 4 report.
    return {
      ...base,
      precondition: { description: args.precondition.description, result: true },
      reachability: { requirement: args.reachability, row: reachCheck.row, result: true, reason: reachCheck.reason },
      before,
      produced: { verdict: verdict ?? null, threw: false, errorMessage: null },
      after: afterState,
      successPredicate: { definedBeforeExecution: true, result: predicateResult },
      measuredDelta,
      observedConsequence: args.expectedConsequence,
      downstreamConsequence: args.downstreamConsequence ?? null,
      rngDrawSpan,
      virtualClockMs: { before: clockBefore, after: clockAfter },
      outcome: 'RUNTIME_PROVEN',
      failureReason: null,
    };
  }

  // Predicate failed — classify WHY. A predicate may say so explicitly
  // (classification), otherwise the framework auto-classifies from its own
  // captured state: byte-identical before/after (JSON-serialized) means the
  // action was a silent no-op (NO_STATE_CHANGE, the REINFORCEMENT bug
  // class); anything else changed means SUCCESS_PREDICATE_FAILED (the wrong
  // consequence happened, not none at all).
  const autoOutcome: QualificationOutcome = jsonDeepEqual(before, afterState) ? 'NO_STATE_CHANGE' : 'SUCCESS_PREDICATE_FAILED';
  const outcome: QualificationOutcome = predicateResult.classification ?? autoOutcome;

  return {
    ...base,
    precondition: { description: args.precondition.description, result: true },
    reachability: { requirement: args.reachability, row: reachCheck.row, result: true, reason: reachCheck.reason },
    before,
    produced: { verdict: verdict ?? null, threw: false, errorMessage: null },
    after: afterState,
    successPredicate: { definedBeforeExecution: true, result: predicateResult },
    measuredDelta,
    observedConsequence: null, // predicate failed — never emit the expected text as observed.
    downstreamConsequence: args.downstreamConsequence ?? null,
    rngDrawSpan,
    virtualClockMs: { before: clockBefore, after: clockAfter },
    outcome,
    failureReason: predicateResult.reason,
  };
}

// ── Ledger (mirrors the shape of test-utils/canonical/qualification.ts's
// existing in-memory pattern, kept as a SEPARATE ledger — this module's
// records are framework-verified evidence, never mixed with the legacy
// Phase 3C/3D entries those files still hold). ──

let ledger: Array<QualificationRecord<unknown, unknown>> = [];

export function recordFrameworkQualification<S, V>(record: QualificationRecord<S, V>): void {
  ledger.push(record as QualificationRecord<unknown, unknown>);
}

export function getFrameworkQualifications(): readonly QualificationRecord<unknown, unknown>[] {
  return ledger;
}

export function resetFrameworkQualifications(): void {
  ledger = [];
}

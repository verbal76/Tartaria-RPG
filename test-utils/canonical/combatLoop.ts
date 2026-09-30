// Phase 9 — combat-loop OBSERVABILITY repair.
//
// canonicalLife3.test.ts's original, inline resolveCombat(maxRounds) returned
// the literal string 'stalled' for two structurally different situations:
//   (a) decide() (or the caller's own option construction) found NOTHING
//       legitimate to do — a genuine deadlock, and
//   (b) the loop simply ran out of its round budget while the player was
//       still alive, at least one enemy still stood, and legitimate options
//       kept being offered every round.
// The outer caller then logged BOTH as "no legitimate option remained" and
// classified both 'APPARATUS' — which is false for (b): budget exhaustion
// says nothing about whether an option existed, only that observation
// stopped before combat reached a terminal state.
//
// This module is the smallest extraction that makes (a) and (b)
// STRUCTURALLY distinct — different CombatOutcome variants, not just
// different log text — so a future caller cannot accidentally collapse them
// back into one string the way the old return type did. It changes nothing
// about HOW combat is played: the round-by-round control flow (dead check ->
// clear check -> option construction -> decide -> execute) is identical to
// the function it replaces. Only the classification and the evidence trail
// are new.
//
// STRUCTURAL FIREWALL, same as policy.ts and actionExecutor.ts: no direct
// game-store import, no RNG, no hidden-state read. Every field on
// CombatLoopDeps is supplied by the caller from information it already had
// (PlayerView, an already-built Decision, an already-executed ActionRecord).
// This loop does not add any new information to what the Walker's policy is
// allowed to see — it only records, for forensic purposes after the fact,
// exactly what the policy WAS shown and what it chose.

import type { PlayerView } from './playerView';
import type { Decision, DecisionOption } from './policy';
import type { ActionRecord } from './actionExecutor';

export type CombatOutcome =
  | { readonly kind: 'DEAD' }
  | { readonly kind: 'CLEARED' }
  | { readonly kind: 'FLED' }
  | { readonly kind: 'NO_LEGAL_ACTION' }
  | { readonly kind: 'ROUND_BUDGET_EXHAUSTED' };

/** One player-visible enemy's identity + HP, as PlayerView already exposes it —
 *  no privileged field added. */
export interface CombatEnemySnapshot {
  readonly name: string;
  readonly type: string;
  readonly hp: number;
  readonly hpMax: number;
}

/** Forensic record of one played round. Every field here was already
 *  computed by the loop in the course of actually playing the round — this
 *  is a record of what happened, not a new capability. */
export interface CombatRoundTrace {
  readonly round: number;
  readonly enemiesBefore: readonly CombatEnemySnapshot[];
  readonly playerHpBefore: number;
  readonly playerHpMax: number;
  readonly optionsPresented: readonly string[];
  readonly optionSelected: string | null;
  readonly policyCategory: string;
  readonly policyReason: string;
  readonly actionResult: ActionRecord['result'];
  readonly logRange: ActionRecord['logRange'];
  /** Phase 10 — the exact production combat-log lines this round's action
   *  produced (the same bounded [start,end] window `logRange` already names,
   *  resolved to text). FORENSIC ONLY: never read by decide() or buildOptions()
   *  — see resolveLogDelta on CombatLoopDeps. Empty array (never undefined)
   *  when logRange is null or the caller did not supply resolveLogDelta, so a
   *  reader never has to distinguish "no delta" from "delta not captured". */
  readonly logDelta: readonly string[];
  readonly playerHpAfter: number;
  readonly enemiesAfter: readonly CombatEnemySnapshot[];
}

export interface CombatLoopResult {
  readonly outcome: CombatOutcome;
  readonly roundsConsumed: number;
  readonly trace: readonly CombatRoundTrace[];
}

export interface CombatLoopDeps {
  /** Is the player dead right now? */
  isDead(): boolean;
  /** Current PlayerView, or null if genuinely unavailable (itself a
   *  NO_LEGAL_ACTION condition — nothing to reason about). */
  view(): PlayerView | null;
  /** Build this round's legitimate options from the current view. An empty
   *  array means nothing legitimate is available this round. */
  buildOptions(view: PlayerView): readonly DecisionOption[];
  /** The pure policy call — decide() or an equivalent. */
  decide(view: PlayerView, options: readonly DecisionOption[]): Decision;
  /** Perform the already-made decision through the real production door and
   *  report what happened. Never chooses, never second-guesses. */
  execute(decision: Decision): Promise<ActionRecord>;
  /** Phase 10 — OPTIONAL, forensic-only. Resolves an ActionRecord's bounded
   *  logRange into the actual production combat-log lines it names, using
   *  whatever log-mirror read mechanism the caller already has (the same
   *  telemetry the dodge-success check already reads). This module never
   *  imports a log mirror itself — it only calls what the caller supplies —
   *  so the STRUCTURAL FIREWALL (no store/telemetry import in this file)
   *  holds. The result is stored on the trace row's `logDelta` and nowhere
   *  else: it is never passed to `decide()` or `buildOptions()`, and its
   *  presence or absence cannot change which round returns which
   *  CombatOutcome — only what the persisted trace can later explain. */
  resolveLogDelta?(range: ActionRecord['logRange']): readonly string[];
}

function snapshotEnemies(view: PlayerView | null): CombatEnemySnapshot[] {
  return (view?.scene?.enemies ?? []).map((e) => ({ name: e.name, type: e.type, hp: e.currentHp, hpMax: e.hpMax }));
}

/**
 * Play up to `maxRounds` real combat rounds. Returns exactly one of five
 * CombatOutcome kinds (see the type) plus the full round-by-round trace,
 * so a caller can tell "the fight ended" apart from "the budget ran out"
 * apart from "there was nothing legitimate left to try" without re-deriving
 * any of it from a log string.
 *
 * `onRound`, if given, fires once per completed round with the same trace
 * row that gets appended to the returned `trace` array — a hook for a
 * caller that needs to update its OWN per-life bookkeeping (e.g. "which
 * enemy names have hurt this Tartarian badly this life") from the same
 * observation, without this loop knowing anything about that bookkeeping.
 */
export async function resolveCombatRounds(
  deps: CombatLoopDeps,
  maxRounds: number,
  onRound?: (row: CombatRoundTrace) => void,
): Promise<CombatLoopResult> {
  const trace: CombatRoundTrace[] = [];
  // Whether the last EXECUTED decision this call was a flee attempt — used
  // only to tell CLEARED (killed everything) apart from FLED (escaped) when
  // the enemy list next reads empty. Nothing here is fed back into policy;
  // it exists purely to make the trace/outcome honest about which happened.
  let lastWasFlee = false;

  for (let round = 0; round < maxRounds; round++) {
    if (deps.isDead()) return { outcome: { kind: 'DEAD' }, roundsConsumed: round, trace };

    const preView = deps.view();
    if (!preView) return { outcome: { kind: 'NO_LEGAL_ACTION' }, roundsConsumed: round, trace };

    const enemiesBefore = snapshotEnemies(preView);
    if (enemiesBefore.length === 0) {
      return { outcome: { kind: lastWasFlee ? 'FLED' : 'CLEARED' }, roundsConsumed: round, trace };
    }

    const options = deps.buildOptions(preView);
    if (options.length === 0) {
      return { outcome: { kind: 'NO_LEGAL_ACTION' }, roundsConsumed: round, trace };
    }

    const decision = deps.decide(preView, options);
    if (decision.optionId === null) {
      return { outcome: { kind: 'NO_LEGAL_ACTION' }, roundsConsumed: round, trace };
    }

    const record = await deps.execute(decision);
    lastWasFlee = decision.category === 'survive-flee';
    const logDelta = deps.resolveLogDelta ? deps.resolveLogDelta(record.logRange) : [];

    const postView = deps.view();
    const row: CombatRoundTrace = {
      round,
      enemiesBefore,
      playerHpBefore: preView.hp,
      playerHpMax: preView.hpMax,
      optionsPresented: options.map((o) => o.id),
      optionSelected: decision.optionId,
      policyCategory: decision.category,
      policyReason: decision.reason,
      actionResult: record.result,
      logRange: record.logRange,
      logDelta,
      playerHpAfter: postView?.hp ?? preView.hp,
      enemiesAfter: snapshotEnemies(postView),
    };
    trace.push(row);
    onRound?.(row);
  }

  return { outcome: { kind: 'ROUND_BUDGET_EXHAUSTED' }, roundsConsumed: maxRounds, trace };
}

/** A human-readable phrase for a CombatOutcome, worded so
 *  ROUND_BUDGET_EXHAUSTED never claims "no legitimate option remained" —
 *  that sentence is reserved for NO_LEGAL_ACTION, which is the only outcome
 *  it is actually true of. */
export function describeCombatOutcome(outcome: CombatOutcome, roundsConsumed: number, maxRounds: number): string {
  switch (outcome.kind) {
    case 'DEAD':
      return 'the player died';
    case 'CLEARED':
      return `all enemies defeated after ${roundsConsumed} round(s)`;
    case 'FLED':
      return `escaped after ${roundsConsumed} round(s)`;
    case 'NO_LEGAL_ACTION':
      return 'no legitimate option remained';
    case 'ROUND_BUDGET_EXHAUSTED':
      return `the ${maxRounds}-round observation budget ended before combat reached a terminal state — this is an apparatus observation limit, not a claim that no legitimate action existed`;
  }
}

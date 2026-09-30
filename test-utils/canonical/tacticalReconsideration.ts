// Phase 14 — IN-COMBAT TACTICAL RECONSIDERATION (Life 5 Silt Thief repair).
//
// Life 5 died fleeing a Silt Thief 20 times in a row: policy.ts's own
// contextual-combat branch (2b) re-derives "should I flee?" fresh every
// round from the CURRENT static picture (threat label, HP, recent damage)
// and has no memory of what happened on any PRIOR round of the SAME
// encounter. Forensics proved a real, mechanically-available, RNG-free
// alternative (tactical retreat) sat unused the entire fight because
// nothing ever asked "is the tactic I keep picking actually working?".
//
// This module is the answer to exactly that question, and nothing more.
// It is a NEW, ADDITIVE sibling to policy.ts — decide() itself is called
// unmodified and is never edited. Guardian's own retry memory
// (LifeMemory.attempts/AttemptRecord, policy.ts's "2a" branch) already
// proves this SHAPE of reasoning — "a capable human does not reflexively
// repeat a tactic that just failed with nothing changed" — is legitimate
// and already qualified; that abstraction operates at WHOLE-ENGAGEMENT
// granularity (one record per Guardian attempt). This module is the same
// principle at IN-ENCOUNTER, PER-ROUND granularity — a different, smaller
// scale, deliberately kept as a SEPARATE structure rather than merged into
// LifeMemory.attempts (see the module-level doc on EncounterTacticalMemory).
//
// STRUCTURAL FIREWALL, same discipline as policy.ts/strategicPolicy.ts: no
// store/telemetry import, no RNG, no production combat-log text is ever
// read here — every input is already a structured, player-visible
// PlayerView/DecisionOption field (rangeLabel, mainHandReach.inRange,
// option category) or a value this module itself derived from two
// consecutive such observations. Nothing here predicts a future round or
// assumes any action's outcome before it has actually executed.

import type { PlayerView } from './playerView';
import { decide, type DecisionOption, type Decision, type LifeMemory, type OptionCategory } from './policy';

/** The three tactics this module is allowed to reconsider. Deliberately
 *  narrow: 'survive-heal' (emergency healing) and every non-survival
 *  category are never touched — the defect is repeated, uncritical
 *  repetition of a SURVIVAL-MOVEMENT tactic, not a general combat planner.
 *  Because 'survive-heal' is not in this list, decideInCombat structurally
 *  cannot ever override decide()'s emergency-floor branch: that branch
 *  returns category 'survive-heal' (or, absent a heal option,
 *  'survive-flee'/'survive-retreat' with nothing yet recorded as futile),
 *  and reconsideration is a no-op whenever the base category isn't one of
 *  these three. */
export const RECONSIDERABLE_CATEGORIES: readonly OptionCategory[] = ['survive-flee', 'survive-retreat', 'engage-approach'];

export function isReconsiderableCategory(category: OptionCategory | 'stop'): category is OptionCategory {
  return (RECONSIDERABLE_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Phase 14 — how many CONSECUTIVE, no-progress observations of the exact
 * same tactic, within THIS encounter, establish "repeatedly failing" rather
 * than "failed once."
 *
 * SOURCE OF THIS NUMBER (per the owner's explicit instruction not to pick
 * one arbitrarily): the only existing governed precedent for "should this
 * capable human repeat a tactic that just failed" is policy.ts's own "2a"
 * Guardian-retry branch, which reconsiders after exactly ONE prior failure
 * with no material change since. That precedent is NOT reused verbatim
 * here, because it operates at a different, much higher-stakes granularity
 * — a whole Guardian engagement (many rounds, real consumables spent,
 * material capability change is the natural reset condition) — where a
 * single failed attempt is already a costly, deliberate commitment. A
 * single in-round tactic pick (one flee roll, one retreat step) is cheap by
 * comparison and is not yet evidence of a bad tactic on its own: the owner's
 * own semantics (design task §5) state "FIRST FAILURE does not by itself
 * prove a tactic is bad" and "REPEATED FAILURE means the tactic has now
 * failed again without material progress." Read literally, that is exactly
 * two observations: the first failure is tolerated (the base decision is
 * left unchanged), and it is only once the SAME tactic fails or makes no
 * progress a SECOND consecutive time, with nothing about the tactical
 * picture having changed for the better in between, that reconsideration
 * becomes eligible on the following round. Hence 2, not 1 (the Guardian
 * threshold, too eager for a cheap in-round retry) and not some larger
 * number (which would just be re-deriving "Life 5 failed 20 times," the
 * exact reasoning the owner explicitly ruled out). */
export const REPEATED_FAILURE_THRESHOLD = 2;

/** Encounter-local, per-tactic-category failure/no-progress bookkeeping.
 *  Deliberately the smallest possible shape: one counter per reconsiderable
 *  category, nothing else. Not a save-state field, not a character field,
 *  not a life-long record — see the lifecycle contract on
 *  EMPTY_ENCOUNTER_TACTICAL_MEMORY below and resolveCombatEncounter in
 *  lifeOrchestrator.ts, the only place instances of this type are created,
 *  updated, and discarded. */
export type EncounterTacticalMemory = Readonly<Partial<Record<OptionCategory, { readonly consecutiveNoProgress: number }>>>;

/** A fresh encounter starts with no tactical history at all — never
 *  hydrated from a prior encounter, a save, or another life (mirrors
 *  production's own scene.fleeAttempts, which resets identically at every
 *  fresh-encounter boundary). */
export const EMPTY_ENCOUNTER_TACTICAL_MEMORY: EncounterTacticalMemory = {};

/** Has `category` accumulated enough consecutive no-progress observations,
 *  THIS encounter, to count as "repeatedly failing" rather than "failed
 *  once"? Categories outside RECONSIDERABLE_CATEGORIES are never futile —
 *  recordTacticalOutcome never writes an entry for them (see below), so a
 *  missing/zero entry reads as "not yet shown to be a problem," the same
 *  default LifeMemory.attempts uses for an objective with no history. */
export function isTacticFutile(memory: EncounterTacticalMemory, category: OptionCategory): boolean {
  return (memory[category]?.consecutiveNoProgress ?? 0) >= REPEATED_FAILURE_THRESHOLD;
}

/** Pure state transition: fold one more observed outcome for `category`
 *  into `memory`, returning a NEW object (never mutates its argument, same
 *  discipline as decide() itself). A 'progress' observation resets that
 *  category's counter to 0 — a tactic that just worked is not "repeatedly
 *  failing" regardless of an older streak; a 'no-progress' observation
 *  increments it by exactly one. Categories outside
 *  RECONSIDERABLE_CATEGORIES are ignored (returned unchanged) — this
 *  module tracks survival-movement tactics only, never attack/loot/economy
 *  choices. */
export function recordTacticalOutcome(
  memory: EncounterTacticalMemory,
  category: OptionCategory,
  outcome: 'progress' | 'no-progress',
): EncounterTacticalMemory {
  if (!isReconsiderableCategory(category)) return memory;
  const prev = memory[category]?.consecutiveNoProgress ?? 0;
  const next = outcome === 'progress' ? 0 : prev + 1;
  return { ...memory, [category]: { consecutiveNoProgress: next } };
}

/** A minimal, already-player-visible snapshot of the active enemy's range
 *  picture — exactly the two PlayerViewEnemy fields (rangeLabel,
 *  mainHandReach.inRange) the real driver's own buildOptions already reads
 *  to decide whether 'attack' or 'advance' is offered (see
 *  __tests__/canonicalLife5.test.ts:432-438). Nothing new is read from
 *  production here; this is a narrower type purely so this module does not
 *  need to import the full PlayerViewEnemy shape. */
export interface RangeSnapshot {
  readonly rangeLabel: string;
  readonly inRange: boolean;
}

export function rangeSnapshotOf(view: PlayerView): RangeSnapshot | null {
  const enemy = view.scene?.enemies[0] ?? null;
  return enemy ? { rangeLabel: enemy.rangeLabel, inRange: enemy.mainHandReach.inRange } : null;
}

/**
 * Did a completed 'survive-retreat' or 'engage-approach' action make
 * OBSERVABLE progress, comparing the range snapshot immediately before it
 * was chosen to the range snapshot on the very next decision? Never assumes
 * retreat always increases range or advance always exposes attack — it
 * only ever reports what the two real observations actually show. A
 * missing before/after snapshot (enemy died, scene changed shape) is
 * treated as 'no-progress' rather than guessed at — the absence of a
 * comparison is never treated as a green light to continue.
 */
export function classifyRepositionProgress(before: RangeSnapshot | null, after: RangeSnapshot | null): 'progress' | 'no-progress' {
  if (!before || !after) return 'no-progress';
  if (before.rangeLabel !== after.rangeLabel) return 'progress';
  if (before.inRange !== after.inRange) return 'progress';
  return 'no-progress';
}

/** Fixed, generic exploration order among the three reconsiderable
 *  categories — never enemy-specific, never encoding "Silt Thief" or "three
 *  retreats." 'survive-retreat' is tried before 'engage-approach' because
 *  creating separation is the lower-risk generic move (proven, per the
 *  preceding forensic task, to draw no counterattack against an enemy
 *  already out of full reach) before committing to closing distance for an
 *  attack (proven to risk a full-reach counter); 'survive-flee' is listed
 *  last so that if retreat itself is the tactic that has gone futile, flee
 *  remains a legal fallback to reconsider back toward rather than being
 *  structurally excluded. This ordering is a deterministic tie-break, not a
 *  hidden probability estimate — every category in it must still be
 *  offered in `options` and not itself already futile before it is chosen. */
const RECONSIDERATION_ORDER: readonly OptionCategory[] = ['survive-retreat', 'engage-approach', 'survive-flee'];

/**
 * THE WRAPPER. Calls the existing, unmodified decide() first; only ever
 * substitutes its answer when (a) that answer is one of the three
 * reconsiderable categories, AND (b) THIS encounter's own tactical memory
 * shows that exact category has already failed/made no progress at least
 * REPEATED_FAILURE_THRESHOLD times in a row, AND (c) a different,
 * currently-legal, not-yet-futile alternative category actually exists in
 * `options`. If any of those three conditions fails, decide()'s original
 * answer is returned completely unchanged — including its exact reason
 * string — so every existing preserved behavior (first flee, emergency
 * heal, Guardian prep, attack-in-range, ordinary non-combat categories) is
 * byte-for-byte identical to today whenever reconsideration does not apply.
 * Never invents an option outside `options`. Never reads anything besides
 * its four parameters. Never consumes RNG.
 */
export function decideInCombat(
  view: PlayerView,
  options: readonly DecisionOption[],
  memory: LifeMemory,
  tactical: EncounterTacticalMemory,
): { readonly decision: Decision; readonly reconsidered: boolean } {
  const base = decide(view, options, memory);
  if (base.category === 'stop' || !isReconsiderableCategory(base.category)) {
    return { decision: base, reconsidered: false };
  }
  if (!isTacticFutile(tactical, base.category)) {
    return { decision: base, reconsidered: false };
  }
  for (const altCategory of RECONSIDERATION_ORDER) {
    if (altCategory === base.category) continue;
    if (isTacticFutile(tactical, altCategory)) continue;
    const altOpt = options.find((o) => o.category === altCategory);
    if (!altOpt) continue;
    return {
      decision: {
        optionId: altOpt.id,
        category: altOpt.category,
        reason: `${base.category} has made no observable progress for ${REPEATED_FAILURE_THRESHOLD} consecutive attempt(s) this encounter — reconsidering toward ${altOpt.category}, a legal option not yet shown futile this encounter. Original reasoning: ${base.reason}`,
      },
      reconsidered: true,
    };
  }
  // No currently-legal, not-yet-futile alternative remained — a bounded
  // reconsideration layer does not manufacture a circular exploration; it
  // falls back to decide()'s own answer, unchanged, exactly as it would
  // have returned without this module existing at all.
  return { decision: base, reconsidered: false };
}

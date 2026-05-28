// Hook-puzzle resolver. OTA-129.
//
// Background — pre-OTA-129 the engine planted narration like:
//   sealed_vault_door stage 0: "The glyphs are a Tartarian tumbler
//     — three rotations, in the right order."
//   submerged_steeple buried-church note: "someone knock on the
//     steeple if you find us."
// ...but the parser had no `rotate` / `knock` intents, so the
// player typed the obvious thing, got intent=unknown, and gave up.
// The hook itself silently progressed on a second `investigate <noun>`
// tap, which made the puzzle narration pure decoration.
//
// OTA-129 wires real puzzles. A `PuzzleDefinition` for each
// supported HookKind owns:
//   - which intents qualify as a puzzle-step attempt
//   - a deterministic per-step validator (right input here = +1
//     correct; wrong input = reset progress, +1 failure)
//   - hint copy at attempt + at failure-thresholds
//   - a mercy-auto-solve threshold so a stuck player isn't trapped
//   - the line that fires on solve
//
// The gameStore hook-routing checks PUZZLE_DEFINITIONS[hook.kind].
// When present AND the hook is at stage 0 AND the player's intent
// matches the puzzle's intentList, the routing calls into
// `applyPuzzleInput` here instead of advancing the hook chain. Once
// the puzzle is solved (correct steps >= sequenceLength, OR failure
// count >= mercyAt), the hook stage advances normally and the
// existing chain-step rewards fire.
//
// Hooks without a puzzle definition keep their old behavior — they
// progress on any hookEligible-intent tap of a matching noun. No
// existing hook is affected unless it appears in PUZZLE_DEFINITIONS.

import type { Intent } from './types';
import type { Hook, HookKind } from './hooks';

// Per-attempt result. 'correct' bumps correctSoFar; 'wrong' resets
// correctSoFar to 0 and bumps failures.
export type AttemptResult = 'correct' | 'wrong';

export interface PuzzleProgress {
  correctSoFar: number;
  failures: number;
  /** Last 6 inputs as `<intent>:<direction|noun>` for debug + hint
   *  shaping. Capped to keep save size small. */
  history: string[];
}

/** Extract a direction word from the input target. Returns the
 *  normalized 'left' / 'right' / 'forward' / 'back' or null when no
 *  direction is present. Tolerates synonyms (counterclockwise → left,
 *  clockwise → right, widdershins → left, deosil → right) so the
 *  player can phrase naturally. */
export function extractDirection(target: string | null | undefined): 'left' | 'right' | null {
  if (!target) return null;
  const t = target.toLowerCase();
  if (/\b(left|ccw|counterclockwise|counter-clockwise|widdershins|anticlockwise)\b/.test(t)) return 'left';
  if (/\b(right|cw|clockwise|deosil|sunwise)\b/.test(t)) return 'right';
  return null;
}

export interface PuzzleDefinition {
  kind: HookKind;
  /** Intents that count as a puzzle-step attempt. Anything else
   *  routed at this hook falls back to the old "ignore the puzzle
   *  state and advance" path so non-puzzle hookEligible verbs
   *  (ask, advance) don't accidentally reset the puzzle. */
  intentList: Intent[];
  /** Total correct steps needed to solve. */
  sequenceLength: number;
  /** Validate one attempt. `stepIndex` is the player's current
   *  progress position (0 = first step). Returns 'correct' on a
   *  match for this step in the canonical sequence; 'wrong' resets. */
  validateStep: (
    args: {
      intent: Intent;
      target: string | null | undefined;
      direction: 'left' | 'right' | null;
      stepIndex: number;
    },
  ) => AttemptResult;
  /** First-encounter line, before any attempt — usually re-states
   *  the puzzle's premise. */
  intro: string;
  /** Per-attempt narration. Receives the post-attempt progress so
   *  it can describe both correct steps ("the ring clicks") and
   *  wrong ones ("the tumbler resets, you feel the springs lift").
   *  Should NOT announce solving — that's the role of
   *  solvedNarration. */
  attemptLine: (args: {
    result: AttemptResult;
    correctSoFar: number;
    failures: number;
    sequenceLength: number;
    direction: 'left' | 'right' | null;
  }) => string;
  /** Hint that surfaces after N failures. Sparse: usually entries
   *  at 3 and 5. */
  failureHints: Record<number, string>;
  /** Failure count where the puzzle auto-solves. Anti-stuck mercy
   *  — the player has bashed it long enough; engine yields. */
  mercyAt: number;
  /** Line that fires on solve (whether through clean play or
   *  mercy). Stage advance + reward fires immediately after via
   *  the existing chain path. */
  solvedNarration: string;
}

// ---------------------------------------------------------------
// Sealed Vault Door — 3-step rotation tumbler.
//
// Canonical sequence: LEFT, RIGHT, RIGHT. Same for every save —
// the hook's planted narration says "the faint markings tell you
// which", which is consistent with a fixed-puzzle that the
// in-fiction markings encode. Player learns the sequence either
// through trial+error within the mercy budget or by reading the
// markings (OTA-130 will wire an `examine the markings` peek).
//
// Per-attempt feedback shapes:
//   correct → "the ring clicks into the second position; a faint
//             warmth spreads through the door."
//   wrong   → "the ring locks. You feel the springs lift the
//             tumbler back to neutral."
// ---------------------------------------------------------------

const VAULT_SEQUENCE: ReadonlyArray<'left' | 'right'> = ['left', 'right', 'right'];

const sealedVaultPuzzle: PuzzleDefinition = {
  kind: 'sealed_vault_door',
  intentList: ['rotate', 'turn', 'twist'],
  sequenceLength: VAULT_SEQUENCE.length,
  validateStep: ({ direction, stepIndex }) => {
    if (!direction) return 'wrong';
    const expected = VAULT_SEQUENCE[stepIndex];
    return direction === expected ? 'correct' : 'wrong';
  },
  intro:
    'You set your hand on the locking ring. The Tartarian tumbler reads cold — three rotations in the right order. The faint markings line the rim above the ring; if you can read them you can solve it.',
  attemptLine: ({ result, correctSoFar, sequenceLength, direction }) => {
    if (result === 'correct') {
      const ordinal = ['first', 'second', 'third'][correctSoFar - 1] ?? `${correctSoFar}th`;
      if (correctSoFar < sequenceLength) {
        return `You rotate the ring ${direction}. The ${ordinal} mark glows briefly, then settles. The tumbler holds.`;
      }
      return `You rotate the ring ${direction}. The final mark catches.`;
    }
    return `You rotate the ring ${direction ?? '— without a direction'}. The springs lift the tumbler back to neutral. You feel the puzzle has reset.`;
  },
  failureHints: {
    3: 'The markings above the ring become legible if you steady your hand against the glow. Try them in the order the light moves — left, then twice the other way.',
    5: 'You can almost hear the pattern. Three rotations, beginning to your off-hand. Two of them go the same way.',
  },
  mercyAt: 7,
  solvedNarration:
    'The tumbler clicks home. The door grinds inward against centuries of mud. Whatever waited inside has been waiting a long time.',
};

// ---------------------------------------------------------------
// Submerged Steeple — knock 3 times.
//
// The hook plant references the child's note from the buried-
// church scene: "someone knock on the steeple if you find us."
// Three knocks is the canonical signal. No direction needed.
// Any non-knock intent counts as 'wrong' (player got distracted,
// went to do something else). Correct knocks cumulate; a wrong
// intent resets to 0 — the responder needs to hear three IN A
// ROW.
// ---------------------------------------------------------------

const steeplePuzzle: PuzzleDefinition = {
  kind: 'submerged_steeple',
  intentList: ['knock', 'rotate', 'turn', 'twist', 'press', 'push', 'pull'],
  sequenceLength: 3,
  validateStep: ({ intent }) => {
    // Anything that ISN'T a knock counts as a wrong attempt — it
    // breaks the rhythm. The puzzle's intentList includes the
    // wrong verbs so they ROUTE here and get rejected, rather than
    // accidentally hitting the generic hook-progression fallthrough
    // and silently advancing the stage.
    return intent === 'knock' ? 'correct' : 'wrong';
  },
  intro:
    'You stand under the leaning steeple, knuckles raised. The child\'s note said three knocks would tell whoever is left that someone\'s found them.',
  attemptLine: ({ result, correctSoFar, sequenceLength }) => {
    if (result === 'wrong') {
      return 'You pause. The rhythm is gone; whatever is listening will need the count from the start.';
    }
    if (correctSoFar < sequenceLength) {
      const remaining = sequenceLength - correctSoFar;
      return `You knock on the steeple. The sound carries down into the mud. ${remaining} more, evenly.`;
    }
    return 'You knock the third time. Silence — then, from below, the sound of something stirring.';
  },
  failureHints: {
    3: 'The note was specific. Three knocks. In a row. Don\'t do anything else between them.',
  },
  mercyAt: 6,
  solvedNarration:
    'A small voice answers, muffled by the mud — old, alive, here. The door at the base of the steeple shifts. The way down opens.',
};

// ---------------------------------------------------------------

export const PUZZLE_DEFINITIONS: Partial<Record<HookKind, PuzzleDefinition>> = {
  sealed_vault_door: sealedVaultPuzzle,
  submerged_steeple: steeplePuzzle,
};

/** Look up a puzzle definition for a hook. Returns null when the
 *  hook has no puzzle (most hooks). */
export function puzzleFor(kind: HookKind): PuzzleDefinition | null {
  return PUZZLE_DEFINITIONS[kind] ?? null;
}

/** Apply a player attempt against a hook's puzzle. Returns the
 *  next puzzle progress + a narration line + a boolean for
 *  whether the puzzle is now solved (caller advances the hook
 *  chain to its next stage when this is true). */
export function applyPuzzleInput(
  hook: Hook,
  args: {
    intent: Intent;
    target: string | null | undefined;
    direction: 'left' | 'right' | null;
  },
): {
  progress: PuzzleProgress;
  line: string;
  hint: string | null;
  solved: boolean;
} {
  const def = puzzleFor(hook.kind);
  if (!def) {
    // Caller guards on puzzleFor before calling — but defensively
    // return a no-op so a future bug doesn't crash the engine.
    return {
      progress: hook.puzzleProgress ?? { correctSoFar: 0, failures: 0, history: [] },
      line: '',
      hint: null,
      solved: false,
    };
  }
  const prior = hook.puzzleProgress ?? { correctSoFar: 0, failures: 0, history: [] };
  const result = def.validateStep({
    intent: args.intent,
    target: args.target,
    direction: args.direction,
    stepIndex: prior.correctSoFar,
  });
  const correctSoFar = result === 'correct' ? prior.correctSoFar + 1 : 0;
  const failures = result === 'wrong' ? prior.failures + 1 : prior.failures;
  const historyEntry = `${args.intent}:${args.direction ?? args.target ?? '-'}`;
  const history = [...prior.history, historyEntry].slice(-6);
  const next: PuzzleProgress = { correctSoFar, failures, history };
  const solved = correctSoFar >= def.sequenceLength || failures >= def.mercyAt;
  const line = solved
    ? def.solvedNarration
    : def.attemptLine({
        result,
        correctSoFar,
        failures,
        sequenceLength: def.sequenceLength,
        direction: args.direction,
      });
  // Failure-hint surfaces at the threshold AND every threshold
  // after, so a player who blows past 3 misses straight to 5 still
  // gets the deeper hint.
  let hint: string | null = null;
  for (const k of Object.keys(def.failureHints).map(Number).sort((a, b) => a - b)) {
    if (failures >= k) hint = def.failureHints[k] ?? hint;
  }
  return { progress: next, line, hint, solved };
}

/** Reset puzzle progress on a hook (used when the player walks
 *  away and comes back to a half-attempted puzzle and we want a
 *  clean start). Optional in v1 — gameStore can choose to preserve
 *  state for save/load (OTA-130). */
export function resetPuzzleProgress(): PuzzleProgress {
  return { correctSoFar: 0, failures: 0, history: [] };
}

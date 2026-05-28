// OTA-129 — hook-puzzle resolver unit tests.
//
// Tests the pure-function puzzle resolver in isolation
// (engine/hookPuzzles.ts) without booting the gameStore. Fast,
// deterministic, no side effects. Pressure-test coverage of the
// full pipeline (parser → store dispatch → puzzle resolver →
// stage advance) lands in OTA-131 with proper guardrails.

import {
  PUZZLE_DEFINITIONS,
  applyPuzzleInput,
  extractDirection,
  puzzleFor,
} from '../app/engine/hookPuzzles';
import type { Hook } from '../app/engine/hooks';

// OTA-131 GUARDRAIL: bound runtime. This file shouldn't take more
// than a second; the timeout catches an accidental infinite loop
// before it can hang CI.
jest.setTimeout(15000);

function fakeVaultHook(): Hook {
  return {
    id: 'test_vault',
    kind: 'sealed_vault_door',
    nouns: ['vault', 'door', 'ring', 'tumbler', 'locking ring'],
    plantedLine: 'A sealed Tartarian vault.',
    stage: 0,
    resolved: false,
  };
}

function fakeSteepleHook(): Hook {
  return {
    id: 'test_steeple',
    kind: 'submerged_steeple',
    nouns: ['steeple', 'church'],
    plantedLine: 'A church steeple breaks the mud.',
    stage: 0,
    resolved: false,
  };
}

describe('OTA-129 hook-puzzle resolver — direction parsing', () => {
  it.each([
    ['rotate left', 'left'],
    ['turn the ring counterclockwise', 'left'],
    ['twist CCW', 'left'],
    ['rotate widdershins', 'left'],
    ['rotate right', 'right'],
    ['turn clockwise', 'right'],
    ['twist deosil', 'right'],
    ['CW', 'right'],
    ['rotate something', null],
    [null, null],
    [undefined, null],
  ])('%j → %j', (input, expected) => {
    expect(extractDirection(input as string | null | undefined)).toBe(expected);
  });
});

describe('OTA-129 sealed vault door — correct sequence [left, right, right]', () => {
  it('clean play: 3 correct attempts solves the puzzle', () => {
    let hook = fakeVaultHook();
    const seq: Array<'left' | 'right'> = ['left', 'right', 'right'];
    let lastSolved = false;
    for (const dir of seq) {
      const outcome = applyPuzzleInput(hook, { intent: 'rotate', target: dir, direction: dir });
      hook = { ...hook, puzzleProgress: outcome.progress };
      lastSolved = outcome.solved;
    }
    expect(lastSolved).toBe(true);
    expect(hook.puzzleProgress?.correctSoFar).toBe(3);
    expect(hook.puzzleProgress?.failures).toBe(0);
  });

  it('wrong direction resets correctSoFar to 0 and increments failures', () => {
    let hook = fakeVaultHook();
    let outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'left', direction: 'left' });
    hook = { ...hook, puzzleProgress: outcome.progress };
    expect(outcome.progress.correctSoFar).toBe(1);
    expect(outcome.solved).toBe(false);

    // Wrong: should reset to 0, failures = 1
    outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'left', direction: 'left' });
    hook = { ...hook, puzzleProgress: outcome.progress };
    expect(outcome.progress.correctSoFar).toBe(0);
    expect(outcome.progress.failures).toBe(1);
    expect(outcome.solved).toBe(false);
  });

  it('mercy auto-solve fires at failure threshold (7 failures)', () => {
    let hook = fakeVaultHook();
    let outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'wrong', direction: null });
    for (let i = 0; i < 6; i++) {
      hook = { ...hook, puzzleProgress: outcome.progress };
      outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'wrong', direction: null });
    }
    // 7th wrong attempt should trip mercy.
    expect(outcome.solved).toBe(true);
    expect(outcome.line).toContain('tumbler clicks home');
  });

  it('hint surfaces at 3 failures', () => {
    let hook = fakeVaultHook();
    let outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'wrong', direction: null });
    for (let i = 0; i < 2; i++) {
      hook = { ...hook, puzzleProgress: outcome.progress };
      outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'wrong', direction: null });
    }
    expect(outcome.progress.failures).toBe(3);
    expect(outcome.hint).toBeTruthy();
    expect(outcome.hint).toContain('order the light moves');
  });
});

describe('OTA-129 submerged steeple — 3-knock pattern', () => {
  it('three knocks solves the puzzle', () => {
    let hook = fakeSteepleHook();
    let outcome = applyPuzzleInput(hook, { intent: 'knock', target: 'steeple', direction: null });
    for (let i = 0; i < 2; i++) {
      hook = { ...hook, puzzleProgress: outcome.progress };
      outcome = applyPuzzleInput(hook, { intent: 'knock', target: 'steeple', direction: null });
    }
    expect(outcome.solved).toBe(true);
    expect(outcome.line).toContain('The door at the base of the steeple shifts');
  });

  it('non-knock intent resets the rhythm', () => {
    let hook = fakeSteepleHook();
    let outcome = applyPuzzleInput(hook, { intent: 'knock', target: 'steeple', direction: null });
    hook = { ...hook, puzzleProgress: outcome.progress };
    expect(outcome.progress.correctSoFar).toBe(1);

    // Wrong intent — the player went and pushed something instead.
    outcome = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    hook = { ...hook, puzzleProgress: outcome.progress };
    expect(outcome.progress.correctSoFar).toBe(0);
    expect(outcome.progress.failures).toBe(1);
  });

  it('mercy fires at 6 failures', () => {
    let hook = fakeSteepleHook();
    let outcome = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    for (let i = 0; i < 5; i++) {
      hook = { ...hook, puzzleProgress: outcome.progress };
      outcome = applyPuzzleInput(hook, { intent: 'push', target: 'steeple', direction: null });
    }
    expect(outcome.solved).toBe(true);
  });
});

describe('OTA-129 puzzleFor lookup', () => {
  it('returns a definition for puzzle-equipped hooks', () => {
    expect(puzzleFor('sealed_vault_door')).not.toBeNull();
    expect(puzzleFor('submerged_steeple')).not.toBeNull();
  });

  it('returns null for hooks without a puzzle', () => {
    expect(puzzleFor('smoke')).toBeNull();
    expect(puzzleFor('footprints')).toBeNull();
    expect(puzzleFor('preserved_corpse')).toBeNull();
  });

  it('every entry in PUZZLE_DEFINITIONS has a non-empty intentList + non-zero sequenceLength + mercyAt > sequenceLength', () => {
    for (const [kind, def] of Object.entries(PUZZLE_DEFINITIONS)) {
      if (!def) continue;
      expect(def.kind).toBe(kind);
      expect(def.intentList.length).toBeGreaterThan(0);
      expect(def.sequenceLength).toBeGreaterThan(0);
      expect(def.mercyAt).toBeGreaterThan(def.sequenceLength);
    }
  });
});

describe('OTA-129 history is bounded to last 6 attempts', () => {
  it('long sequence of wrong attempts truncates history at 6', () => {
    let hook = fakeVaultHook();
    let outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'wrong', direction: null });
    for (let i = 0; i < 15; i++) {
      hook = { ...hook, puzzleProgress: outcome.progress };
      // Stop iterating after mercy solves
      if (outcome.solved) break;
      outcome = applyPuzzleInput(hook, { intent: 'rotate', target: 'wrong', direction: null });
    }
    // History never exceeds 6 (cap is enforced in the resolver)
    expect(outcome.progress.history.length).toBeLessThanOrEqual(6);
  });
});

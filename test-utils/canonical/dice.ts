// P3 — dice fidelity (Phase 2B, UNK-P2-10 / W4: the old walker forces every
// die to 18, even on a d6, and ignores advantage/disadvantage).
//
// Reproduces exactly what app/components/DiceRoller.tsx does on a ROLL tap
// (handleRoll(), DiceRoller.tsx:99-107) and what it keeps (keptValue,
// DiceRoller.tsx:80-86):
//   - roll `step.count` dice of `step.sides` via the production rollDie();
//   - on advantage/disadvantage, roll exactly 2 dice regardless of count,
//     and keep the max (advantage) or min (disadvantage);
//   - the values handed to resolveRollStep are the KEPT die(s) on adv/dis,
//     or the raw array otherwise — matching DiceRoller's onRoll payload
//     shape (`isAdv||isDis ? [kept] : rolledValues`).
//
// Uses the real production rollDie from app/engine/rng.ts — the same
// function DiceRoller.tsx imports — so every roll is a genuine draw from
// whatever Math.random is installed at the time (the seeded harness one,
// optionally wrapped by the RNG ledger).

import { rollDie } from '../../app/engine/rng';
import type { RollStep } from '../../app/engine/types';

export interface ProductionRollResult {
  rawValues: number[];
  /** What resolveRollStep should receive — [kept] on adv/dis, else rawValues. */
  submitValues: number[];
}

export function rollStepLikeProductionUI(step: Pick<RollStep, 'count' | 'sides' | 'rollMode'>): ProductionRollResult {
  const isAdv = step.rollMode === 'advantage';
  const isDis = step.rollMode === 'disadvantage';
  const rollCount = isAdv || isDis ? 2 : step.count;
  const rawValues: number[] = [];
  for (let i = 0; i < rollCount; i++) rawValues.push(rollDie(step.sides));
  if (isAdv || isDis) {
    const kept = isAdv ? Math.max(...rawValues) : Math.min(...rawValues);
    return { rawValues, submitValues: [kept] };
  }
  return { rawValues, submitValues: rawValues };
}

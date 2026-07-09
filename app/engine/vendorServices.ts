// OTA-728 — paid vendor-service tuning (pure + testable). Costs are shaped so
// money keeps MEANING: training scales with the stat you're raising and is capped
// (the top of a stat is earned in play, not bought), and companion care scales
// with how hurt the companion is.

/** A stat can't be PAID past this value — the last points are earned through use. */
export const PAY_TRAIN_CAP = 15;
/** Per-point base: a training session costs PER_POINT × the stat's current value,
 *  so each point costs more than the last (10→11 = 500, 14→15 = 700). */
export const PAY_TRAIN_PER_POINT = 50;
/** Flat fee to revive a dead/abandoned dog — deliberately steep. */
export const REVIVE_DOG_COST = 300;

export function payTrainCost(currentValue: number): number {
  return PAY_TRAIN_PER_POINT * Math.max(0, currentValue);
}

/** True while a stat can still be paid up (below the cap). */
export function canPayTrain(currentValue: number): boolean {
  return currentValue < PAY_TRAIN_CAP;
}

/** Cost to patch a companion back to full — scales with missing HP, with a floor
 *  so a scratch still costs something. Golems cost a touch more to mend. */
export function companionHealCost(missingHp: number, kind: 'dog' | 'golem'): number {
  const per = kind === 'golem' ? 3 : 2;
  const floor = kind === 'golem' ? 15 : 10;
  return Math.max(floor, Math.max(0, missingHp) * per);
}

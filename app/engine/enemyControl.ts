// enemyControl — OTA-1572, slice 2 of the weapon-effects program.
//
// ⚠⚠⚠ THE FINDING: FORTY-TWO WEAPONS PROMISED SOMETHING THE ENEMY COULD NOT
// CARRY. `currentScene.enemyStatuses` has existed for a long time and every one
// of its kinds is damage-over-time — `poison_coat`, `acid_coat`, `typed_dot`.
// There has never been a field on an enemy that could hold "stunned". So
// Sparkstrike's *"1-round stun on a hit"*, Aetheric Shackle's *"paralyzed, 3
// rounds"* and Tangle Roots' *"restrained, 5 rounds"* all resolved to plain
// damage, and the only code that ever looked at a status promise —
// `rollIncomingStatusEffect` — keys off the DAMAGE TYPE and never reads the
// weapon's text at all. Energy Baton and a Rusted Blade behaved identically.
//
// ⚠⚠⚠ AND THE REASON THIS SHIPS WITH ITS GUARD ALREADY ON. OTA-1089 added
// `braced` to the PLAYER for exactly this hazard, and its note records the
// measurement: *"a pack of concussive hitters re-rolling 20% per landed blow
// can't chain the player's turns away (sim: 844 stuns/run before this)."* Giving
// the player thirty-three control weapons without the mirror guard recreates
// that bug pointed the other way — and the worst offender is not a Legendary,
// it is SPARKSTRIKE, a COMMON rune-caster whose stun is unconditional and costs
// nothing. Every fight against a single enemy would end without it swinging
// once. So the brace is not a follow-up; it is half the feature.

import type { ControlKind, OnHitControl } from './weaponEffects';
import { CONTROL_SKIPS } from './weaponEffects';

export interface EnemyControlState {
  kind: ControlKind;
  roundsRemaining: number;
  /** The weapon that did it, for the combat line and the enemy card. */
  sourceName: string;
}

/**
 * ⚠⚠ ROUNDS OF IMMUNITY GRANTED THE MOMENT A SKIP-KIND LANDS. Mirrors the
 * player's `braced` exactly. Two is the smallest number that breaks a lock: at
 * one, a 1-round stun and a 1-round brace expire together and the next swing
 * re-stuns forever; at two, the enemy is guaranteed one swing between any pair
 * of incapacitations, whatever the weapon's proc rate.
 */
export const ENEMY_BRACE_ROUNDS = 2;

/** Hinder kinds never brace. Being slowed twice running is not a lock — it is
 *  just a slow — and bracing on it would spend the immunity that the stun
 *  actually needs. */
export function bracesAgainst(kind: ControlKind): boolean {
  return CONTROL_SKIPS.has(kind);
}

/** Does this control take the enemy's swing away outright? */
export function isSkipControl(c: EnemyControlState | null | undefined): boolean {
  return !!c && CONTROL_SKIPS.has(c.kind) && c.roundsRemaining > 0;
}

/**
 * ⚠⚠ WHAT A HINDER COSTS THEM. A prone or blinded enemy still swings — taking
 * its turn away is what the skip kinds are for — but it swings worse. Returned
 * as an attack-roll penalty so it flows through the same modifier path every
 * other combat adjustment uses rather than inventing a second one.
 */
export function controlAttackPenalty(c: EnemyControlState | null | undefined): number {
  if (!c || c.roundsRemaining <= 0 || CONTROL_SKIPS.has(c.kind)) return 0;
  switch (c.kind) {
    case 'blinded': return -4;   // it cannot see you
    case 'prone': return -2;     // swinging from the ground
    case 'knockback': return -2; // it closed the distance instead of aiming
    case 'pull': return -2;      // OTA-1676 — dragged in off its footing, the mirror of knockback
    case 'slowed': return -2;    // late, and the blow shows it
    default: return 0;
  }
}

/** Human label for the combat line and the enemy card badge. */
export function controlLabel(kind: ControlKind): string {
  switch (kind) {
    case 'knockback': return 'driven back';
    case 'pull': return 'dragged in';
    case 'restrained': return 'restrained';
    case 'paralyzed': return 'paralyzed';
    case 'stunned': return 'stunned';
    case 'blinded': return 'blinded';
    case 'slowed': return 'slowed';
    case 'prone': return 'prone';
  }
}

/**
 * ⚠⚠⚠ THE ONE PLACE A CONTROL IS ALLOWED TO LAND, so the brace cannot be
 * forgotten at a call site. Returns the new control (and the brace it costs) or
 * null when the hit earns nothing. `braceRounds` on the way in is the enemy's
 * CURRENT immunity; anything above zero refuses a skip-kind outright.
 */
export function landControl(args: {
  control: OnHitControl;
  sourceName: string;
  braceRounds: number;
  /** True when the enemy matches `control.restrictedTo`. Callers resolve the
   *  match themselves because the condition matcher lives with the enemy. */
  restrictionMet: boolean;
  /** Already-rolled trigger outcome. The parser knows WHAT is owed; the caller
   *  knows whether this particular swing earned it. */
  triggered: boolean;
}): { control: EnemyControlState; braceRounds: number } | null {
  const { control, sourceName, braceRounds, restrictionMet, triggered } = args;
  if (!triggered) return null;

  // Resolve who it actually lands on. A restricted control that misses its
  // target type falls back where the card names a fallback, and lands nothing
  // where it does not — Killing Frost seizes a Construct's joints and does
  // nothing special to a person, which is what its line says.
  let kind: ControlKind = control.kind;
  if (control.restrictedTo && !restrictionMet) {
    if (!control.fallback) return null;
    kind = control.fallback;
  }

  // ⚠⚠ THE GUARD. A braced enemy refuses further incapacitation outright.
  if (bracesAgainst(kind) && braceRounds > 0) return null;

  return {
    control: { kind, roundsRemaining: Math.max(1, control.rounds), sourceName },
    braceRounds: bracesAgainst(kind) ? ENEMY_BRACE_ROUNDS : braceRounds,
  };
}

/**
 * Tick one combat round. Returns the surviving control (null when it expired)
 * and the remaining brace.
 *
 * ⚠ The brace ticks INDEPENDENTLY of the control it was granted for, and that
 * is the whole point: it must outlive the stun it protects against, or the two
 * expire together and the lock reopens on the very next swing.
 */
export function tickControl(
  control: EnemyControlState | null | undefined,
  braceRounds: number,
): { control: EnemyControlState | null; braceRounds: number } {
  const nextBrace = Math.max(0, braceRounds - 1);
  if (!control) return { control: null, braceRounds: nextBrace };
  const left = control.roundsRemaining - 1;
  return {
    control: left > 0 ? { ...control, roundsRemaining: left } : null,
    braceRounds: nextBrace,
  };
}

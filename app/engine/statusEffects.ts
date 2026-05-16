import type { StatusEffect, StatusEffectKind, PlayerCharacter } from './types';
import { rollDie } from './rng';

// Probability and duration tuning per damage type. Pulled from the
// rulebook chapter on damage effects, with durations and proc rates
// adjusted to feel right in the rolling-loop pacing we have.
interface EffectRule {
  kind: StatusEffectKind;
  procChance: number;       // 0..1, chance of applying on hit
  duration: () => number;   // rounds
  perRoundDamage?: () => number;
  label: string;
}

const TYPE_TO_EFFECT: Record<string, EffectRule> = {
  piercing: {
    kind: 'bleed',
    procChance: 0.3,
    duration: () => 3,
    perRoundDamage: () => Math.max(1, rollDie(6) - 2),
    label: 'bleeding',
  },
  slashing: {
    kind: 'armor_severed',
    procChance: 0.25,
    duration: () => 4,
    label: 'armor severed',
  },
  burn: {
    kind: 'burn_scar',
    procChance: 0.3,
    duration: () => rollDie(6),
    label: 'aetheric scar',
  },
  electrical: {
    kind: 'paralyzed',
    procChance: 0.3,
    duration: () => 1,
    label: 'paralyzed',
  },
  stun: {
    kind: 'stun',
    procChance: 0.5,
    duration: () => 1,
    label: 'stunned',
  },
  poison: {
    kind: 'poisoned',
    procChance: 0.4,
    duration: () => rollDie(6),
    label: 'poisoned',
  },
};

export interface AppliedEffect {
  effect: StatusEffect;
  isNew: boolean;
}

/**
 * Roll for a status effect application based on the damage type of an
 * incoming attack. Returns the new effect to add (if any) and whether
 * this kind was already present (refreshes duration if so).
 */
export function rollIncomingStatusEffect(
  damageType: string | null | undefined,
  existing: readonly StatusEffect[],
): AppliedEffect | null {
  if (!damageType) return null;
  const rule = TYPE_TO_EFFECT[damageType.toLowerCase()];
  if (!rule) return null;
  if (Math.random() >= rule.procChance) return null;

  const isNew = !existing.some((e) => e.kind === rule.kind);
  const newEffect: StatusEffect = {
    kind: rule.kind,
    remainingRounds: rule.duration(),
    perRoundDamage: rule.perRoundDamage?.(),
    label: rule.label,
  };
  return { effect: newEffect, isNew };
}

/**
 * Add or refresh a status effect on a player. Refresh means: if the
 * same kind is already present, keep the higher of the two remaining
 * round counts (so bursting a longer effect doesn't shorten it).
 */
export function applyEffect(
  current: readonly StatusEffect[],
  incoming: StatusEffect,
): StatusEffect[] {
  const idx = current.findIndex((e) => e.kind === incoming.kind);
  if (idx < 0) return [...current, incoming];
  const next = current.map((e) => ({ ...e }));
  next[idx] = {
    ...next[idx]!,
    remainingRounds: Math.max(next[idx]!.remainingRounds, incoming.remainingRounds),
    perRoundDamage: incoming.perRoundDamage ?? next[idx]!.perRoundDamage,
  };
  return next;
}

/**
 * Tick all effects down one round. Returns the new effects array
 * (filtered to those still active) and the total bleed-style DOT to
 * apply to the player's HP this round.
 */
export function tickEffects(
  current: readonly StatusEffect[],
): { effects: StatusEffect[]; dotDamage: number; expired: StatusEffect[] } {
  const next: StatusEffect[] = [];
  const expired: StatusEffect[] = [];
  let dot = 0;
  for (const eff of current) {
    if (eff.perRoundDamage) dot += eff.perRoundDamage;
    const nextRounds = eff.remainingRounds - 1;
    if (nextRounds > 0) {
      next.push({ ...eff, remainingRounds: nextRounds });
    } else {
      expired.push(eff);
    }
  }
  return { effects: next, dotDamage: dot, expired };
}

export function hasEffect(
  current: readonly StatusEffect[] | undefined,
  kind: StatusEffectKind,
): boolean {
  if (!current) return false;
  return current.some((e) => e.kind === kind && e.remainingRounds > 0);
}

/**
 * Effective AC adjustment from status effects. armor_severed is -2,
 * dodging is +4 for the duration of the dodge stance. Stacks with the
 * equipped-armor bonus.
 */
export function statusAcAdjustment(current: readonly StatusEffect[] | undefined): number {
  if (!current) return 0;
  let adj = 0;
  for (const e of current) {
    if (e.remainingRounds <= 0) continue;
    if (e.kind === 'armor_severed') adj -= 2;
    if (e.kind === 'dodging') adj += 4;
  }
  return adj;
}

/**
 * Attack-roll penalty from status effects. Poisoned imposes
 * disadvantage in the rulebook; we approximate with a flat -2.
 */
export function statusAttackPenalty(current: readonly StatusEffect[] | undefined): number {
  if (!current) return 0;
  let pen = 0;
  if (hasEffect(current, 'poisoned')) pen -= 2;
  return pen;
}

/**
 * True if the player cannot act this round — stun or paralysis active.
 */
export function isIncapacitated(current: readonly StatusEffect[] | undefined): boolean {
  return hasEffect(current, 'stun') || hasEffect(current, 'paralyzed');
}

/**
 * Multiplier applied to incoming aetheric damage when a burn scar is
 * active. Per the rulebook, burn scars increase aetheric vulnerability.
 */
export function aethericVulnerabilityMultiplier(current: readonly StatusEffect[] | undefined): number {
  return hasEffect(current, 'burn_scar') ? 1.5 : 1;
}

export function formatEffectSummary(effects: readonly StatusEffect[] | undefined): string {
  if (!effects || effects.length === 0) return '';
  return effects
    .map((e) => `${e.label ?? e.kind} (${e.remainingRounds}r)`)
    .join(', ');
}

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
  // OTA 010 — food_buff identity also depends on buffStat. Two
  // different buffs (Blueberries +INT, Wild Carrot +WIS) used to
  // collapse into one slot because both had kind='food_buff' and
  // applyEffect dedupes by kind only. Now they share a kind but
  // distinguish by stat — eating two foods buffing different
  // stats stacks; eating two of the SAME food refreshes the
  // single buff's duration (intentional, prevents trivial
  // +N stacking from a single food source).
  const matchKey = (e: StatusEffect) =>
    e.kind === 'food_buff'
      ? `food_buff:${e.buffStat ?? ''}`
      : e.kind;
  const incomingKey = matchKey(incoming);
  const idx = current.findIndex((e) => matchKey(e) === incomingKey);
  if (idx < 0) return [...current, incoming];
  const next = current.map((e) => ({ ...e }));
  next[idx] = {
    ...next[idx]!,
    remainingRounds: Math.max(next[idx]!.remainingRounds, incoming.remainingRounds),
    perRoundDamage: incoming.perRoundDamage ?? next[idx]!.perRoundDamage,
    // Preserve the buff payload from the incoming when refreshing
    // (label may include the food name, bonus may have shifted).
    buffStat: incoming.buffStat ?? next[idx]!.buffStat,
    buffBonus: incoming.buffBonus ?? next[idx]!.buffBonus,
    label: incoming.label ?? next[idx]!.label,
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
    if (e.kind === 'in_cover') adj += 4;
    if (e.kind === 'in_cover_full') adj += 8;
    // OTA 039 — Aethercraft 'shape stone' applies a one-round +4 AC
    // ward from raised Aetherstone.
    if (e.kind === 'shaped_stone_ward') adj += 4;
    // 'dodging' deliberately NOT here as of 2026-05-21 — the dodge
    // rework moved it from a passive +4 AC into an active post-hit
    // parry roll handled in applyEnemyCounter. The roll itself is
    // what gates the swing now, not a passive AC bump.
    // 'blocking' status kind is retired (no engine path applies it
    // anymore) but the type-union entry is kept so legacy saves
    // with a cached blocking effect deserialize cleanly.
  }
  return adj;
}

/** True if the player is in full cover and the incoming attack is
 *  ranged — caller treats this as an automatic miss for firearms.
 *  Melee still resolves normally; full cover doesn't block someone
 *  walking up and stabbing you. */
export function hasFullCover(current: readonly StatusEffect[] | undefined): boolean {
  return hasEffect(current, 'in_cover_full');
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

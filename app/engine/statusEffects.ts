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
  // OTA-831 — a cold hit can leave you `chilled`: a timed −DEX slow (applied in
  // effectiveStats). The warming counter is drinking a cold coating.
  cold: {
    kind: 'chilled',
    procChance: 0.3,
    duration: () => rollDie(4),
    label: 'chilled',
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
 *
 * OTA-358 → corrected OTA-359 — a "round" is one player action (tickEffects
 * runs per submitPlayerAction). Combat effects are PER-ENCOUNTER:
 *   - COMBAT-ONLY statuses (stances / next-strike buffs: dodge, stealthed,
 *     shielded, aiming, …) tick normally WHILE you're in the fight, and are
 *     CLEARED the moment there are no enemies (`opts.inCombat` false). A dodge
 *     you used against one attacker is not still active when his buddies show up
 *     three hours later — it's only valid in the encounter it was for.
 *   - STAMINA-GATED statuses (tired / exhausted) NEVER tick here; they're
 *     owned by tickPlayerStaminaStatuses (added/cleared from current stamina).
 *   - DOT (bleed / poison) and timed buffs (food_buff / well_fed) and
 *     afflictions (stun / paralyzed / etc.) tick every action regardless — those
 *     follow you out of a fight (you keep bleeding; the carrot buff keeps its
 *     timer).
 * Default `inCombat: true` preserves prior behavior for any caller that
 * doesn't pass it.
 */
const COMBAT_ONLY_STATUSES: ReadonlySet<StatusEffectKind> = new Set([
  // OTA-365 — 'blocking', 'helping', 'overwhelmed' removed (retired kinds).
  'dodging', 'aiming', 'sprinting', 'in_cover', 'in_cover_full',
  'ready', 'surprised', 'fighting_back', 'quick_fire',
  'stealthed', 'shielded', 'shaped_stone_ward', 'power_attack_pending',
  'defensive_stance', 'distracted',
  // OTA-835 — the Mud Golem's Elemental Control ward is a per-encounter block;
  // clear any unspent soak when the fight ends so it never carries into the next.
  'stone_ward',
  // OTA-1112 — the anti-stun-lock window is per-encounter: it protects the
  // recovery rounds of THIS fight and never carries immunity into the next.
  'braced',
]);
const STAMINA_GATED_STATUSES: ReadonlySet<StatusEffectKind> = new Set(['tired', 'exhausted']);

export function tickEffects(
  current: readonly StatusEffect[],
  opts?: { inCombat?: boolean },
): { effects: StatusEffect[]; dotDamage: number; expired: StatusEffect[] } {
  const inCombat = opts?.inCombat ?? true;
  const next: StatusEffect[] = [];
  const expired: StatusEffect[] = [];
  let dot = 0;
  for (const eff of current) {
    if (eff.perRoundDamage) dot += eff.perRoundDamage; // DOT always applies
    // Stamina-gated: never decremented here (stamina sync owns them).
    if (STAMINA_GATED_STATUSES.has(eff.kind)) { next.push(eff); continue; }
    // Combat-only: per-encounter. Cleared the moment the fight is over so a
    // stance/buff never carries into a separate, later encounter.
    if (COMBAT_ONLY_STATUSES.has(eff.kind) && !inCombat) { expired.push(eff); continue; }
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
    // OTA-936 — successful-dodge group defense: harder for the rest of the volley to land.
    if (e.kind === 'evasive') adj += 3;
    // OTA-1218 — Aether Shield (PUNCHLIST P16). Deliberately +3 against
    // shaped_stone_ward's +4: the ward is one round off a discipline that also needs a
    // Small Rock, this is three rounds off a technique. The longer field is the weaker
    // one per round, or there would be no reason to shape stone again.
    if (e.kind === 'aether_shield') adj += 3;
    // 'dodging' deliberately NOT here as of 2026-05-21 — the dodge
    // rework moved it from a passive +4 AC into an active post-hit
    // parry roll handled in applyEnemyCounter. The roll itself is
    // what gates the swing now, not a passive AC bump.
    // OTA-365 — the retired 'blocking' kind was removed from the union;
    // a legacy save carrying a cached blocking effect simply tick-expires
    // it (no matching case here or in rollMods, so it contributes nothing).
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

// OTA-364 — the orphan statusAttackPenalty() lived here for the poison
// -2 but was never called by any code path, so poison only ticked DOT
// and never degraded the victim's swings. The penalty now rides in
// rollMods (combatRules.ts) — the consumer the attack flow actually
// reads — as a `case 'poisoned'`. Removed the dead function.

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
    .map((e) =>
      // Tired / Exhausted are stamina-gated — they clear the moment stamina
      // recovers, not on a round timer. Their `remainingRounds` is a sentinel
      // (99), so showing "(99r)" is meaningless bookkeeping that leaks to the
      // HUD. The full Character screen already hides it (OTA-357); match here.
      STAMINA_GATED_STATUSES.has(e.kind)
        ? (e.label ?? e.kind)
        : `${e.label ?? e.kind} (${e.remainingRounds}r)`,
    )
    .join(', ');
}

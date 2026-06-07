// Lightweight parser for the rulebook's "Effect or Special Property"
// column on CatalogWeapon. Recognizes a handful of common patterns and
// produces structured hooks the combat code can consume. Anything we
// don't parse stays as flavor on the item preview.
//
// Patterns recognized:
//   "+1d6 against Large creatures"     → large
//   "+1d6 against constructs"           → construct
//   "+1d6 against structures"           → structure (no enemy match yet)
//   "+1d6 against mechanical"           → mechanical
//   "+1d6 against animals"              → animal
//   "+1d6 against energy-shielded"      → shielded
//   "+1d6 against magical creatures"    → magical
//   "+1d6 against airborne enemies"     → aerial
//   "Causes bleed"                      → onHitBleed
//   "Causes burns" / "burn damage"      → onHitBurn (placeholder)
//
// arb-fix — a weapon can now carry MORE THAN ONE "+NdN against X" clause
// (e.g. a longbow that hits Large creatures AND gets an anti-air bonus).
// Every matching clause rolls and stacks additively. Returns null when
// nothing matches — caller falls through.

import { rollFromNotation } from './rng';
import { enemyIsAerial } from './enemyTraits';
import type { Enemy } from './types';

export type BonusCondition =
  | 'large'
  | 'construct'
  | 'structure'
  | 'mechanical'
  | 'animal'
  | 'shielded'
  | 'magical'
  | 'darkness'
  | 'aetheric'
  | 'aerial';

export interface ParsedWeaponEffect {
  /** Every "+NdN against X" clause on the weapon, each stacking additively. */
  bonuses?: Array<{ dice: string; condition: BonusCondition }>;
  onHitBleed?: boolean;
  onHitBurn?: boolean;
}

/** Map the free-text target phrase to a structured condition, or null. */
function conditionFromTarget(tgt: string): BonusCondition | null {
  if (/large/.test(tgt)) return 'large';
  if (/construct/.test(tgt)) return 'construct';
  if (/structure|building|vehicle/.test(tgt)) return 'structure';
  // aerial BEFORE mechanical so "airborne / aerial / flying" targets route to
  // the flyer match (drones are both — the aerial bonus is the point).
  if (/aerial|airborne|flying|flyer/.test(tgt)) return 'aerial';
  if (/mechanical|machine|automaton|drone|sentinel/.test(tgt)) return 'mechanical';
  if (/animal|beast|creature.*natural/.test(tgt)) return 'animal';
  if (/shield|shielded|energy-shield/.test(tgt)) return 'shielded';
  if (/magic|magical|supernatural/.test(tgt)) return 'magical';
  if (/dark|darkness/.test(tgt)) return 'darkness';
  if (/aetheric|aether/.test(tgt)) return 'aetheric';
  return null;
}

export function parseWeaponEffect(effect: string | undefined | null): ParsedWeaponEffect | null {
  if (!effect) return null;
  const text = effect.toLowerCase();
  const out: ParsedWeaponEffect = {};
  let touched = false;

  // "+NdN [type] [damage] against X" — extract dice + condition for EVERY
  // clause. The optional middle group allows a damage-type adjective between
  // the dice and "damage"/"against": "+1d4 aetheric damage against …",
  // "+2d6 burn against …", "+1d6 to large creatures".
  const re = /\+\s*(\d+d\d+)(?:\s+\w+)?\s+(?:damage\s+)?(?:against|to|vs\.?|versus)\s+([^.;,]+)/g;
  const bonuses: Array<{ dice: string; condition: BonusCondition }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const dice = m[1]!;
    const condition = conditionFromTarget(m[2]!.trim());
    if (condition) bonuses.push({ dice, condition });
  }
  if (bonuses.length > 0) {
    out.bonuses = bonuses;
    touched = true;
  }

  if (/\bcauses?\s+bleed\b|\bbleed\s+(?:damage|effect)?\b/.test(text)) {
    out.onHitBleed = true;
    touched = true;
  }
  if (/\bcauses?\s+burn\b/.test(text) || /\bburn(?:ing)?\s+damage\b/.test(text)) {
    out.onHitBurn = true;
    touched = true;
  }

  return touched ? out : null;
}

/** True if the parsed condition matches the given enemy. Used at
 *  damage-application time to know whether to roll the bonus dice. */
export function effectConditionMatches(
  cond: BonusCondition | undefined,
  enemy: Enemy,
): boolean {
  if (!cond) return false;
  const name = enemy.name.toLowerCase();
  const type = (enemy.type ?? '').toLowerCase();
  const sig = `${name} ${type}`;
  switch (cond) {
    case 'large':
      return /titan|giant|leviathan|behemoth|kraken|wyvern|dragon|golem|sentinel|chimera|cyclops/.test(sig);
    case 'construct':
      return /construct|automation|sentinel|drone|spider|knight|warden|mechanism/.test(type) ||
             /construct|automation|sentinel|drone|knight|mechanism/.test(name);
    case 'structure':
      return false; // structures aren't enemies in our schema yet
    case 'mechanical':
      return /automation|mechanism|drone|cog|gear/.test(sig);
    case 'animal':
      return /animal/.test(type);
    case 'shielded':
      return (enemy.traits ?? []).some((t) => /shield|warded/.test(t.toLowerCase()));
    case 'magical':
      return /aetheric|spirit|wraith|apparition|banshee|ghost|phantom/.test(sig);
    case 'darkness':
      return /shade|shadow|phantom|wraith|dark/.test(sig);
    case 'aetheric':
      return /aetheric|aether|aetherkin/.test(sig);
    case 'aerial':
      return enemyIsAerial(enemy);
    default:
      return false;
  }
}

/** Roll the bonus damage for EVERY matching clause and sum them. Returns 0
 *  when no bonus applies. */
export function rollEffectBonusDamage(
  effect: ParsedWeaponEffect | null,
  enemy: Enemy,
): number {
  if (!effect?.bonuses) return 0;
  let total = 0;
  for (const b of effect.bonuses) {
    if (effectConditionMatches(b.condition, enemy)) total += rollFromNotation(b.dice);
  }
  return total;
}

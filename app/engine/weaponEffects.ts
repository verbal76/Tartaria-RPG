// Lightweight parser for the rulebook's "Effect or Special Property"
// column on CatalogWeapon. Recognizes a handful of common patterns and
// produces structured hooks the combat code can consume. Anything we
// don't parse stays as flavor on the item preview.
//
// Patterns recognized in this first pass:
//   "+1d6 against Large creatures"     → bonusVsLarge
//   "+1d6 against constructs"           → bonusVsConstruct
//   "+1d6 against structures"           → bonusVsStructure (no enemy match yet)
//   "+1d6 against mechanical"           → bonusVsMechanical
//   "+1d6 against animals"              → bonusVsAnimal
//   "+1d6 against energy-shielded"      → bonusVsShielded
//   "+1d6 against magical creatures"    → bonusVsMagical
//   "Causes bleed"                      → onHitBleed
//   "Causes burns" / "burn damage"      → onHitBurn (placeholder)
//
// Returns null when nothing matches — caller falls through.

import { rollFromNotation } from './rng';
import type { Enemy } from './types';

export interface ParsedWeaponEffect {
  bonusDamageDice?: string;
  bonusCondition?:
    | 'large'
    | 'construct'
    | 'structure'
    | 'mechanical'
    | 'animal'
    | 'shielded'
    | 'magical'
    | 'darkness'
    | 'aetheric';
  onHitBleed?: boolean;
  onHitBurn?: boolean;
}

export function parseWeaponEffect(effect: string | undefined | null): ParsedWeaponEffect | null {
  if (!effect) return null;
  const text = effect.toLowerCase();
  const out: ParsedWeaponEffect = {};
  let touched = false;

  // "+NdN against X" — extract the dice and the condition.
  const dmgMatch = text.match(/\+\s*(\d+d\d+)\s+(?:damage\s+)?(?:against|to|vs\.?|versus)\s+([^.;,]+)/);
  if (dmgMatch) {
    out.bonusDamageDice = dmgMatch[1];
    const tgt = dmgMatch[2]!.trim();
    if (/large/.test(tgt)) out.bonusCondition = 'large';
    else if (/construct/.test(tgt)) out.bonusCondition = 'construct';
    else if (/structure|building|vehicle/.test(tgt)) out.bonusCondition = 'structure';
    else if (/mechanical|machine|automaton|drone|sentinel/.test(tgt)) out.bonusCondition = 'mechanical';
    else if (/animal|beast|creature.*natural/.test(tgt)) out.bonusCondition = 'animal';
    else if (/shield|shielded|energy-shield/.test(tgt)) out.bonusCondition = 'shielded';
    else if (/magic|magical|supernatural/.test(tgt)) out.bonusCondition = 'magical';
    else if (/dark|darkness/.test(tgt)) out.bonusCondition = 'darkness';
    else if (/aetheric|aether/.test(tgt)) out.bonusCondition = 'aetheric';
    if (out.bonusCondition) touched = true;
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
  cond: ParsedWeaponEffect['bonusCondition'] | undefined,
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
    default:
      return false;
  }
}

/** Roll the bonus damage if the condition matches. Returns 0 when no
 *  bonus applies. */
export function rollEffectBonusDamage(
  effect: ParsedWeaponEffect | null,
  enemy: Enemy,
): number {
  if (!effect?.bonusDamageDice || !effectConditionMatches(effect.bonusCondition, enemy)) return 0;
  return rollFromNotation(effect.bonusDamageDice);
}

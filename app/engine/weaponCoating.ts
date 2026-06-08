// weaponCoating.ts — OTA-360 weapon-coating helpers.
//
// A coating is a consumable substance (poison / acid / corruption)
// painted onto a single weapon INSTANCE. It is permanent for the
// weapon's life: it survives a repair and is lost only when the
// weapon breaks (durability 0 removes the instance). We store the
// coating on the InventoryItem rather than renaming the weapon —
// renaming `name` would break findWeaponByName's stat lookup — and
// derive the player-facing name ("Corrupted Battle Axe") here.
//
// Coatability is gated on damage type, not on a hand-maintained
// list: a coating needs an edge or a point to carry the substance
// into the wound. So a bladed melee weapon (slashing / piercing)
// or a projectile ranged weapon (piercing — arrows, bolts, bolt-
// casters) qualifies; a bludgeoning cudgel or an energy caster
// does not. The combat on-hit wiring (OTA-361) reads coating.kind
// to land a differentiated enemy status: poison = pure DOT, acid =
// DOT + armor shred, corruption = DOT + corruption stacks.

import type { InventoryItem, WeaponCoating } from './types';
import { findWeaponByName } from './crafting';

/** True iff a weapon by this name can carry a coating. Resolves the
 *  weapon via the same catalog/inference path combat uses, then
 *  gates on weaponKind + damageType: a bladed melee weapon
 *  (slashing / piercing) or a projectile ranged weapon (piercing)
 *  qualifies. Returns false for non-weapons, bludgeoning melee, and
 *  energy ranged (electrical / aetheric / burn / radiation). */
export function isCoatableWeapon(name: string): boolean {
  const w = findWeaponByName(name);
  if (!w) return false;
  if (w.weaponKind === 'runecaster') return false;
  if (w.weaponKind === 'melee') {
    return w.damageType === 'slashing' || w.damageType === 'piercing';
  }
  // ranged — only physical projectiles (a point that carries the
  // substance). Energy casters fire no edge to coat.
  return w.damageType === 'piercing';
}

/** The player-facing name for an item, prefixed with the coating
 *  adjective when one is applied ("Corrupted Battle Axe"). The
 *  underlying InventoryItem.name is never mutated. */
export function coatedDisplayName(item: Pick<InventoryItem, 'name' | 'coating'>): string {
  if (item.coating?.label) return `${item.coating.label} ${item.name}`;
  return item.name;
}

/** Short combat/log description of what a coating does, keyed by
 *  kind. Used by the apply confirmation and the inventory detail. */
export function coatingBlurb(kind: WeaponCoating['kind']): string {
  switch (kind) {
    case 'poison':
      return 'leaks poison into the wound (pure damage over time)';
    case 'acid':
      return 'burns and eats the target\'s armor (damage over time + armor shred)';
    case 'corruption':
      return 'pushes corruption into the target (damage over time + sickening stacks)';
  }
}

// ─── OTA-362 — coating combat tuning + on-hit math ──────────────────
//
// On a landing hit, a coated weapon rolls its dice once. That roll
// lands as IMMEDIATE bonus damage on the strike (so it counts toward
// the cumulative knockout threshold and hurts now) AND seeds an
// ongoing DOT for the next COATING_DOT_TURNS turns. The three families
// then diverge, per the locked design:
//   poison     — pure DOT, nothing extra.
//   acid       — DOT + armor shred: each hit drops the target's AC by
//                ACID_SHRED_PER_HIT (capped at ACID_SHRED_MAX), so the
//                more you hit, the easier they are to hit.
//   corruption — DOT + stacks: each hit adds a corruption stack, and
//                the DOT ticks harder by CORRUPTION_STACK_BONUS per
//                stack. Tough foes you hit many times rot faster —
//                "sickening tougher foes."

/** Ongoing DOT duration (turns) after the immediate on-hit tick. */
export const COATING_DOT_TURNS = 3;
/** AC reduction an acid coating inflicts per landing hit. */
export const ACID_SHRED_PER_HIT = 1;
/** Cap on accumulated acid armor shred per enemy. */
export const ACID_SHRED_MAX = 5;
/** Extra DOT-per-turn a corruption coating gains per accumulated stack. */
export const CORRUPTION_STACK_BONUS = 1;

/** The enemyStatuses `kind` string a coating lands as a DOT. */
export function coatingStatusKind(
  kind: WeaponCoating['kind'],
): 'poison_coat' | 'acid_coat' | 'corruption_coat' {
  return `${kind}_coat` as 'poison_coat' | 'acid_coat' | 'corruption_coat';
}

/** DOT damage-per-turn for a coating proc. Poison / acid tick the
 *  rolled amount; corruption ticks the rolled amount plus a bonus per
 *  accumulated stack (stacksAfter includes the stack this hit added). */
export function coatingDotPerTurn(
  kind: WeaponCoating['kind'],
  rolled: number,
  stacksAfter: number,
): number {
  if (kind === 'corruption') {
    return rolled + Math.max(0, stacksAfter - 1) * CORRUPTION_STACK_BONUS;
  }
  return rolled;
}

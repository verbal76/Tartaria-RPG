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

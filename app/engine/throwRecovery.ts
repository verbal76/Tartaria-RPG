// engine_Dev — recoverable thrown weapons.
//
// Throwing in this engine consumes the thrown item outright (see the throw
// handler + the equipped-throwable consume path in gameStore). That's correct
// for one-shot munitions — a grenade, a coating vial, a shaped-aether shard are
// GONE once they leave your hand. But a durable thrown weapon — a tomahawk, a
// hand axe, a throwing knife, a javelin — physically survives the impact; it
// ends up buried in whatever you hit. Permanently destroying it made throwing a
// good weapon strictly worse than swinging it (you lose the weapon for one
// improvised, penalised attack), so nobody would ever do it.
//
// This module draws the line between the two. A weapon that passes
// isRecoverableThrowable() gets stashed when it lands a hit and rolls a chance
// to be pulled back out of the body when the fight is won (resolved in
// gameStore.resolveEnemyDefeat once all enemies are down). One-shot munitions
// never qualify, so they keep vanishing exactly as before.

import type { InventoryItem } from './types';

/** Chance each buried durable weapon is recovered when the fight is WON.
 *  A coin-flip by design — throwing a prized weapon is a real gamble, and a
 *  failed roll ("the haft snapped", "lost in the rubble") keeps a true cost on
 *  it. Tunable in one place. */
export const THROW_RECOVERY_CHANCE = 0.5;

// Tags that mark a throwable as a ONE-SHOT munition — it never survives, no
// matter that it's tagged throwable. Grenades detonate; coating vials shatter;
// anything explicitly flagged consumable/one-shot is spent on use.
const CONSUMABLE_THROW_TAGS = new Set([
  'grenade',
  'weapon_coating',
  'consumable',
  'one_shot',
  'oneshot',
]);

/** True when a thrown item is a DURABLE weapon that should survive impact and
 *  be recoverable from the defeated enemy — as opposed to a one-shot munition
 *  (grenade / vial) or a non-weapon improvised throw (rock, locket, ration).
 *
 *  Rules, in order:
 *   1. Must be an actual weapon (`kind === 'weapon'`). This alone excludes the
 *      misc one-shots — Disease Sample, Shaped Aetheric Shard, Sentinel Core
 *      Plate are all `kind: 'misc'`.
 *   2. Must carry the `throwable` tag (a real thrown weapon, not a melee blade
 *      you improvised into a throw — those go through the generic throw path
 *      and are treated as lost, matching prior behaviour).
 *   3. Must NOT carry a one-shot munition tag (grenade / coating / consumable).
 *
 *  Content-pack safe: a WWII pack's combat knife (weapon + throwable) recovers,
 *  but its frag grenade (grenade tag) does not. */
export function isRecoverableThrowable(
  item: Pick<InventoryItem, 'kind' | 'tags'> | null | undefined,
): boolean {
  if (!item) return false;
  if (item.kind !== 'weapon') return false;
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  if (!tags.includes('throwable')) return false;
  if (tags.some((t) => CONSUMABLE_THROW_TAGS.has(t))) return false;
  return true;
}

/** A clean single-unit snapshot of a thrown weapon, preserving the per-instance
 *  identity (durability, instanceStats, coating, uniqueStats) so a recovered
 *  weapon comes back as the SAME weapon — a thrown +3 STR axe returns +3 STR,
 *  not a fresh catalog copy. Quantity is normalised to 1 (one buried weapon). */
export function snapshotThrownWeapon(item: InventoryItem): InventoryItem {
  return { ...item, quantity: 1 };
}

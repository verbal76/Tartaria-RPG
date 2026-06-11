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
// list. OTA-492 — per the player, coatings now apply to ALL physical
// melee: slashing, piercing AND bludgeoning (a mace head / cudgel still
// smears the substance into the strike). Ranged stays physical-
// projectile only (a point that carries the substance — arrows, bolts,
// bolt-casters); energy casters (runecaster / aetheric / electrical /
// burn) fire no surface to coat. The combat on-hit wiring (OTA-361)
// reads coating.kind to land a differentiated enemy status: poison =
// pure DOT, acid = DOT + armor shred, corruption = DOT + corruption stacks.

import type { InventoryItem, WeaponCoating } from './types';
import { findWeaponByName } from './crafting';

/** True iff a weapon by this name can carry a coating. Resolves the
 *  weapon via the same catalog/inference path combat uses, then
 *  gates on weaponKind + damageType: any PHYSICAL melee weapon
 *  (slashing / piercing / bludgeoning) or a projectile ranged weapon
 *  (piercing) qualifies. Returns false for non-weapons, aetheric/energy
 *  melee, and energy ranged (electrical / aetheric / burn / radiation). */
export function isCoatableWeapon(name: string): boolean {
  const w = findWeaponByName(name);
  if (!w) return false;
  if (w.weaponKind === 'runecaster') return false;
  if (w.weaponKind === 'melee') {
    // OTA-492 — all physical melee, bludgeoning included (per the player).
    return w.damageType === 'slashing'
      || w.damageType === 'piercing'
      || w.damageType === 'bludgeoning';
  }
  // ranged — only physical projectiles (a point that carries the
  // substance). Energy casters fire no edge to coat.
  return w.damageType === 'piercing';
}

/** OTA-453 — instance-aware coatability. A FUSED weapon is unique and
 *  catalog-absent — its stats live on the InventoryItem (`uniqueStats`), so
 *  findWeaponByName (and therefore isCoatableWeapon) misses it entirely, and a
 *  fused weapon never appeared under "coat weapon." A fused weapon is a bespoke
 *  forged piece the player invested in; treat any fused WEAPON as coatable.
 *  Catalog weapons keep the damage-type gate. Prefer this over isCoatableWeapon
 *  wherever an actual InventoryItem is in hand. */
export function isCoatableItem(item: Pick<InventoryItem, 'name' | 'kind' | 'uniqueStats' | 'tags'>): boolean {
  if (item.kind === 'weapon' && item.uniqueStats?.kind === 'weapon') return true;
  // OTA-479 — golem armaments are always coatable regardless of damage type (a
  // construct smears/channels the substance however it strikes), so a coated golem
  // weapon can be the late-game armor-breaker for ANY golem kind — not just the
  // slashing/piercing ones the normal melee gate allows.
  if ((item.tags ?? []).includes('golem_weapon')) return true;
  return isCoatableWeapon(item.name);
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
    case 'electrical':
      return 'arcs electrical damage into the target (counts as electrical — extra-effective vs constructs/automatons)';
    case 'burn':
      return 'sears burn damage into the target (counts as burn — extra-effective vs mud creatures and other burn-weak foes)';
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
/** Base cap on accumulated acid armor shred per enemy (normal foes). */
export const ACID_SHRED_MAX = 5;
/** OTA-480 — extra shred headroom against a BOSS, so acid can strip the +6
 *  boss-AC bonus that makes high-tier Core Guardians a "find another way" wall.
 *  A normal enemy still caps at 5 (no trivialising trash); a guardian can be
 *  worn down to 5+6 = 11 over a long fight, restoring the player's hit rate as
 *  the fight goes. This is the late-game lever a coated golem (the armor-breaker)
 *  drives. */
export const ACID_SHRED_BOSS_BONUS = 6;
/** Per-enemy shred cap: base + boss headroom. */
export function acidShredCap(enemy: { boss?: boolean } | null | undefined): number {
  return ACID_SHRED_MAX + (enemy?.boss ? ACID_SHRED_BOSS_BONUS : 0);
}
/** Extra DOT-per-turn a corruption coating gains per accumulated stack. */
export const CORRUPTION_STACK_BONUS = 1;

/** The enemyStatuses `kind` string a coating lands as a DOT. */
export function coatingStatusKind(
  kind: WeaponCoating['kind'],
): 'poison_coat' | 'acid_coat' | 'corruption_coat' | 'electrical_coat' | 'burn_coat' {
  return `${kind}_coat` as 'poison_coat' | 'acid_coat' | 'corruption_coat' | 'electrical_coat' | 'burn_coat';
}

// ─── OTA-363 — occasional coated-weapon loot ───────────────────────
//
// Coated weapons should turn up in the wild, not only from the bench —
// the acquisition the player locked was "craft + occasional loot." When
// a coatable weapon is granted as loot (a knocked-out humanoid's kit, a
// defeated enemy's weapon drop), it has a small chance to come already
// coated, so a looted blade sometimes drips poison / acid / corruption.

/** Default chance a looted coatable weapon arrives pre-coated. */
export const LOOT_COATING_CHANCE = 0.18;

const LOOT_COATING_LABELS: Record<WeaponCoating['kind'], string> = {
  poison: 'Poisoned',
  acid: 'Acid-Etched',
  corruption: 'Corrupted',
  // Electrical/etheric + burn coatings are craft-only (not in the loot `kinds`
  // roll below), but the label map stays exhaustive over the union.
  electrical: 'Charged',
  burn: 'Burning',
};

/** Roll whether a looted weapon arrives pre-coated. Returns the coating
 *  to stamp (a random family at 1d4) or null. No-op for non-coatable
 *  weapons. `rng` is injectable for tests. */
export function rollLootCoating(
  weaponName: string,
  opts?: { chance?: number; rng?: () => number },
): WeaponCoating | null {
  if (!isCoatableWeapon(weaponName)) return null;
  const rng = opts?.rng ?? Math.random;
  if (rng() >= (opts?.chance ?? LOOT_COATING_CHANCE)) return null;
  const kinds: WeaponCoating['kind'][] = ['poison', 'acid', 'corruption'];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))]!;
  return { kind, dice: '1d4', label: LOOT_COATING_LABELS[kind] };
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

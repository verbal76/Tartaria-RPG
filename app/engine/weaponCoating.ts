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
import { canonicalItemTags, findWeaponByName } from './crafting';

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

/** engine_Dev (armor coating) — the damage type a coating's ARMOR resist counts
 *  as, so it matches incoming enemy damage. Tartaria's coatings are all built-in
 *  (poison / acid / corruption / electrical / burn), where the kind already IS the
 *  damage-type string, so this is identity. Kept as a single helper so the armor-
 *  coating path reads the resist type in one place (and a future custom-coating
 *  layer can override the mapping here without touching call sites). */
export function coatingDamageType(kind: string): string {
  return kind.toLowerCase();
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
  if (canonicalItemTags(item).includes('golem_weapon')) return true;
  return isCoatableWeapon(item.name);
}

/** The player-facing name for an item, prefixed with the coating
 *  adjective(s) when one is applied ("Corrupted Battle Axe"). OTA-873 — a
 *  dual-coat weapon shows BOTH adjectives ("Corrupted Venomous Battle Axe").
 *  The underlying InventoryItem.name is never mutated. */
export function coatedDisplayName(item: Pick<InventoryItem, 'name' | 'coating' | 'coating2'>): string {
  const parts = [item.coating?.label, item.coating2?.label].filter(Boolean);
  if (parts.length) return `${parts.join(' ')} ${item.name}`;
  return item.name;
}

/** OTA-873 — coating capacity of THIS weapon instance: 2 if the Crucible upgrade
 *  granted a second slot, else 1. */
export function coatingCapacity(item: Pick<InventoryItem, 'coatingSlots'>): number {
  return item.coatingSlots && item.coatingSlots >= 2 ? 2 : 1;
}

/** OTA-873 — which coating slot the next "coat a weapon" application should fill:
 *   · 'coating'  — slot 1 is empty (or the weapon is single-slot: always slot 1)
 *   · 'coating2' — slot 1 is full and this is a dual-slot weapon with slot 2 empty
 *   · 'replace'  — both usable slots are full; a new coat replaces slot 1
 *  Lets the apply flow and its UI copy agree on what a fresh coat will do. */
export function nextCoatSlot(
  item: Pick<InventoryItem, 'coating' | 'coating2' | 'coatingSlots'>,
): 'coating' | 'coating2' | 'replace' {
  if (!item.coating) return 'coating';
  if (coatingCapacity(item) >= 2 && !item.coating2) return 'coating2';
  return 'replace';
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
    case 'cold':
      return 'sinks a biting frost into the target (counts as cold — extra-effective vs constructs/automatons and other cold-weak foes)';
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
/** engine_Dev (design call) — chance a coating still "takes" when the enemy RESISTS
 *  its damage type. A coating ALWAYS lands vs a weak or neutral foe; only a resisted
 *  type gets gated to this small chance (a weakness is a guaranteed opening; a resisted
 *  type rarely slips through). Tunable in one place across all lines. */
export const COATING_RESIST_LAND_CHANCE = 0.15;
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
export // ⚠ OTA-1165 (owner tuning) — 6 → 2. The exploit sweep showed 11 points of
// boss shred pushing weakness-hit uptime toward ~95%, turning OTA-1160's
// one-round stagger into a near-permanent lock (two systems fine alone,
// multiplying). At +2 (boss cap 7) acid stays a real boss tool without
// deleting the to-hit roll that keeps the stagger honest.
const ACID_SHRED_BOSS_BONUS = 2;
/** Per-enemy shred cap: base + boss headroom. */
export function acidShredCap(enemy: { boss?: boolean } | null | undefined): number {
  return ACID_SHRED_MAX + (enemy?.boss ? ACID_SHRED_BOSS_BONUS : 0);
}
/** Extra DOT-per-turn a corruption coating gains per accumulated stack. */
export const CORRUPTION_STACK_BONUS = 1;
// arb118 — corruption stacks are now CAPPED (mirrors acid's acidShredCap). Without
// this the stack counter grew +1 per hit forever, so a single permanent corruption
// coating's DOT climbed without limit (30 hits → 30+ dmg/turn) and guaranteed a
// kill on any HP pool. The "accelerating rot, worst against tough foes" design is
// preserved — it escalates over the first several hits, more so against bosses —
// it just can't grow unbounded.
export const CORRUPTION_STACK_MAX = 5;
export const CORRUPTION_STACK_BOSS_BONUS = 6;
export function corruptionStackCap(enemy: { boss?: boolean } | null | undefined): number {
  return CORRUPTION_STACK_MAX + (enemy?.boss ? CORRUPTION_STACK_BOSS_BONUS : 0);
}

/** The enemyStatuses `kind` string a coating lands as a DOT. */
export function coatingStatusKind(
  kind: WeaponCoating['kind'],
): 'poison_coat' | 'acid_coat' | 'corruption_coat' | 'electrical_coat' | 'burn_coat' | 'cold_coat' {
  return `${kind}_coat` as 'poison_coat' | 'acid_coat' | 'corruption_coat' | 'electrical_coat' | 'burn_coat' | 'cold_coat';
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
  // Electrical/etheric + burn + cold coatings are craft-only (not in the loot
  // `kinds` roll below), but the label map stays exhaustive over the union.
  electrical: 'Charged',
  burn: 'Burning',
  cold: 'Frost-Rimed',
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

/** OTA-1020 — THE ONE ANSWER to "is this item a weapon coating?". Reads canonical
 *  (instance-union-catalog) tags, because inventory instances persist stale tag
 *  snapshots — the owner's pre-tag vials refused to rack on the bandolier while
 *  identical newly-minted ones racked fine. Every consumer (bandolier gate,
 *  throw burst, coat-a-weapon button, equip guard, drinkable gate) routes
 *  through here so the category can never split again. */
export function isWeaponCoatingItem(item: { name: string; tags?: readonly string[] }): boolean {
  return canonicalItemTags(item).includes('weapon_coating');
}

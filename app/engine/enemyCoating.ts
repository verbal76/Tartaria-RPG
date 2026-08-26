/**
 * app/engine/enemyCoating.ts — THE OTHER SIDE OF THE VIAL.
 *
 * ⚠⚠⚠ OTA-1513 — THE OWNER'S PROBLEM, IN HIS WORDS: *"my stacked AC makes me a
 * little overpowered mid game… enemies should have weapon coatings as well. we
 * need a roll when the enemy is born to see if it will have a coating, and what
 * it will be if it does. and we need to take damage from it like they do, it
 * will have to factor in resists from my armor, so it will have to roll on each
 * attack what piece of armor their attack lands on. that way we can see if my
 * coatings have any effect."*
 *
 * ⚠⚠ WHY THIS IS THE RIGHT LEVER, AND NOT JUST A DIFFICULTY DIAL. AC is a
 * MISS-CHANCE stat: every point he stacks removes enemy attacks from the game
 * entirely, and the curve compounds — at high AC most swings never resolve, so
 * nothing downstream of the to-hit roll ever runs. A coating rides on the blows
 * that DO land. It cannot be stacked out of existence, so it restores a floor
 * of pressure without touching the number he spent the mid-game earning. The
 * player has had exactly this weapon since OTA-360; the enemies never did.
 *
 * ⚠⚠ AND IT GIVES ARMOUR RESISTS SOMETHING TO DO. Resistances have been the
 * quiet half of every piece he wears — arb116 put one on nearly all 279 of
 * them, and almost nothing in the game asks about them, because a resist only
 * matters against TYPED damage and typed damage was rare. Coating damage is
 * always typed. The hit-location roll below is what makes it legible: ONE
 * piece takes the blow and ONE piece's resist answers it, so a poison-resistant
 * pair of tassets visibly earns its slot instead of vanishing into an
 * aggregate. (Ordinary weapon damage keeps the arb119 weighted stack — this
 * roll is for coatings only, where "which piece" is the whole question.)
 *
 * ⚠ THIS FILE IS A LEAF: pure functions over plain data, no store and no
 * screens, so the whole roll can be tested without a renderer.
 */
import type { Enemy, EquipSlot, StatusEffectKind } from './types';

/** The six coating families, identical to the player's (types.ts WeaponCoating).
 *  Enemies draw from the same table the player paints from — the symmetry is
 *  the point: he can read an enemy's coating because he knows his own. */
export type EnemyCoatingKind = 'poison' | 'acid' | 'corruption' | 'electrical' | 'burn' | 'cold';

export interface EnemyCoating {
  kind: EnemyCoatingKind;
  /** Per-turn dice, same notation the player's coatings use. */
  dice: string;
}

/** ⚠⚠ THE CURVE BITES WHERE HE ACTUALLY IS. He named the problem as MID-GAME
 *  ("overpowered mid game"), so the chance is deliberately near-nothing on the
 *  commons a new character meets and real on the rarities that only show up
 *  once the AC stack exists. Making early fights harder would answer a
 *  complaint nobody made. */
const CHANCE_BY_RARITY: Readonly<Record<string, number>> = {
  common: 0.06,
  uncommon: 0.14,
  rare: 0.26,
  legendary: 0.4,
};
/** A boss is armed deliberately, not by chance — its handlers coat its weapon. */
const BOSS_CHANCE = 0.55;

/** ⚠ Danger nudges it, it does not drive it: a common bandit on a bad tile is
 *  still mostly a common bandit. Capped so no tile turns every swing toxic. */
const DANGER_STEP = 0.03;
const MAX_CHANCE = 0.6;

export function coatingChanceFor(enemy: Enemy, danger = 0): number {
  const rarity = String(enemy.rarity ?? 'Common').toLowerCase();
  const base = enemy.boss ? BOSS_CHANCE : (CHANCE_BY_RARITY[rarity] ?? CHANCE_BY_RARITY.common!);
  return Math.min(MAX_CHANCE, base + Math.max(0, danger) * DANGER_STEP);
}

/** ⚠⚠ WHAT A THING CARRIES FOLLOWS FROM WHAT IT IS. A mud-dweller's blade is
 *  filthy; an aether construct arcs; the burned masses carry fire. Drawing
 *  uniformly would have made the coating a slot-machine result instead of a
 *  fact about the enemy in front of him — and he reads enemy types closely
 *  enough that a Mud Raider with a plasma edge would read as a bug. */
const KIND_BY_TYPE: ReadonlyArray<{ match: RegExp; kinds: readonly EnemyCoatingKind[] }> = [
  { match: /mud|silt|dweller|revenant|bog/i, kinds: ['poison', 'acid'] },
  { match: /aether|construct|sentinel|architect/i, kinds: ['electrical', 'corruption'] },
  { match: /plasma|unknowing|mass|burned/i, kinds: ['burn', 'electrical'] },
  { match: /giant|bone|titan/i, kinds: ['poison', 'cold'] },
  { match: /beast|hound|wolf|rat|spider|wyrm/i, kinds: ['poison'] },
];
/** Anything unclassified: the two most mundane battlefield poisons. */
const DEFAULT_KINDS: readonly EnemyCoatingKind[] = ['poison', 'acid'];

/** ⚠⚠ TYPE OUTRANKS NAME, and the suite caught this on its first run: matching
 *  against `type + name` as one string let a NAME decide, so an
 *  `aether_construct` that happened to be called a "Mud Raider" drew mud
 *  poisons instead of arcing. The type is the authored fact about what a thing
 *  IS; the name is flavour that often carries a place or a faction. Ask the
 *  type first and only fall back to the name when the type says nothing. */
export function coatingKindsFor(enemy: Enemy): readonly EnemyCoatingKind[] {
  const type = String(enemy.type ?? '');
  for (const row of KIND_BY_TYPE) if (row.match.test(type)) return row.kinds;
  const name = String(enemy.name ?? '');
  for (const row of KIND_BY_TYPE) if (row.match.test(name)) return row.kinds;
  return DEFAULT_KINDS;
}

/** ⚠ Dice scale with the enemy's standing, not with the player's, so a coating
 *  never becomes the reason a common kills him — it is chip damage that gets
 *  through, which is exactly the pressure AC had removed. */
function diceFor(enemy: Enemy): string {
  if (enemy.boss) return '1d6';
  const rarity = String(enemy.rarity ?? 'Common').toLowerCase();
  if (rarity === 'legendary') return '1d6';
  if (rarity === 'rare') return '1d4';
  return '1d3';
}

/**
 * ⚠⚠⚠ THE ROLL AT BIRTH, exactly as he specified: *"a roll when the enemy is
 * born to see if it will have a coating, and what it will be if it does."*
 * Once, at spawn — NOT per attack. An enemy either came to the fight with a
 * coated weapon or it did not, and re-rolling per swing would make the same
 * blade poisoned and clean in the same fight.
 *
 * `roll01` is injected (0 ≤ r < 1) so the caller owns the RNG and the whole
 * thing is deterministic under test.
 */
export function rollEnemyCoating(
  enemy: Enemy,
  roll01: () => number,
  danger = 0,
): EnemyCoating | null {
  if (roll01() >= coatingChanceFor(enemy, danger)) return null;
  const kinds = coatingKindsFor(enemy);
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(roll01() * kinds.length))]!;
  return { kind, dice: diceFor(enemy) };
}

/**
 * ⚠⚠⚠ WHERE THE BLOW LANDS, his second requirement: *"it will have to roll on
 * each attack what piece of armor their attack lands on."* Weighted the way a
 * body is: the chest is most of the target and the head is the hardest thing
 * to hit, which is also why head pieces carry the scarcer resists.
 *
 * ⚠ The cloak is IN the table on purpose. It is the slot players fill last and
 * value least, and a cloak that can actually catch a blow is a cloak worth
 * coating — the whole feature exists so his gear choices show up in the log.
 */
const HIT_LOCATION_TABLE: ReadonlyArray<{ slot: EquipSlot; weight: number }> = [
  { slot: 'chest', weight: 34 },
  { slot: 'legs', weight: 22 },
  { slot: 'hands', weight: 14 },
  { slot: 'feet', weight: 12 },
  { slot: 'cloak', weight: 10 },
  { slot: 'head', weight: 8 },
];

export function rollHitLocation(roll01: () => number): EquipSlot {
  const total = HIT_LOCATION_TABLE.reduce((n, r) => n + r.weight, 0);
  let ticket = roll01() * total;
  for (const row of HIT_LOCATION_TABLE) {
    ticket -= row.weight;
    if (ticket < 0) return row.slot;
  }
  return 'chest'; // unreachable for r < 1; the body's biggest target is the honest fallback
}

/** Exposed for the suite: the table must stay a real distribution. */
export const HIT_LOCATION_WEIGHTS = HIT_LOCATION_TABLE;

/**
 * ⚠⚠ THE AILMENT A KIND LEAVES BEHIND — and it is the SAME status the player
 * already knows from the other side of the vial. `chilled` is the precedent
 * OTA-831 set and even wrote the drink-cure into its own type comment
 * ("Cleared by drinking a cold coating"); this simply gives the other five
 * kinds the same shape. Elemental kinds that leave no scar return null: their
 * damage is the whole effect, resisted by the struck piece and done.
 */
export function ailmentForCoating(kind: EnemyCoatingKind): StatusEffectKind | null {
  switch (kind) {
    case 'poison': return 'poisoned';
    case 'acid': return 'armor_severed';   // acid eats the plate — arb-consistent
    case 'cold': return 'chilled';
    case 'burn': return 'burn_scar';
    // ⚠⚠ CORRUPTION IS NOT A STATUS — it is the player's own `corruption`
    // meter, and `coatingDrinkRemedy` already answers it by that name
    // ("-N corruption"). Seeding 'poisoned' here would have been the classic
    // asymmetry bug: an ailment inflicted by one kind and cured by another, so
    // drinking the RIGHT vial would do nothing. Handled at the damage site
    // instead — see corruptionFromCoating below.
    case 'corruption': return null;
    case 'electrical': return null;        // it arcs and is gone
    default: return null;
  }
}

/** ⚠⚠⚠ THE ONE KIND THAT MOVES A METER INSTEAD OF SETTING A STATUS.
 *
 *  `coatingRemedy.isCoatingDrinkable` admits corruption, poison, burn,
 *  electrical and cold — and its corruption branch subtracts from
 *  `player.corruption`. For the loop the owner described to actually close
 *  ("if I have a lot of corruption I can use a coating to be drunk to use
 *  that"), a corruption-coated blade has to ADD to the same meter the vial
 *  subtracts from. Returns 0 for every other kind.
 *
 *  ⚠ ACID HAS NO DRINKABLE ANSWER ON PURPOSE — `isCoatingDrinkable` excludes
 *  it, and it should: acid eats the ARMOUR (`armor_severed`), and the answer
 *  to a chewed plate is the repair bench, not a swallow. */
export function corruptionFromCoating(kind: EnemyCoatingKind, rolled: number): number {
  return kind === 'corruption' ? Math.max(1, Math.ceil(rolled / 2)) : 0;
}

/** The word the log uses for a kind — one spelling, so the enemy's coating and
 *  the player's read identically in the feed. */
export function coatingWord(kind: EnemyCoatingKind): string {
  return kind;
}

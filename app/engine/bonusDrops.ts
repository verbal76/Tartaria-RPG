// bonusDrops — a Fallout-4-ish "sprinkle" of GOOD crafting materials on top
// of the normal loot flood.
//
// Playtest ask: "we have a ton of basic drops — I don't want to substitute,
// but sprinkle in some better drops at the same frequency as Fallout 4, as a
// reward for reading." So this is purely ADDITIVE: it never replaces the
// existing Scrap Metal / Bent Nail / Stick / Smooth Stone / Worn Coin loot;
// it occasionally hands the player a nicer material ON TOP, at two moments
// that reward engagement:
//   1. HARD-WON COMBAT — a long/tough fight coughs up a bonus material.
//   2. A COMPLETED STORY THREAD — following an easy-to-miss hook pays off.
//
// Deliberately materials only (no weapons/armor), so it enriches the crafting
// economy without reshaping the item structure. None of these are quest-bound
// (all are ordinary recipe components).

export interface BonusMaterial {
  name: string;
  rarity: 'Uncommon' | 'Rare' | 'Legendary';
}

// The "good material" pools, tiered. All exist in data/items/materials.json.
const UNCOMMON: readonly string[] = [
  'Aetheric Shard', 'Aetheric Dust', 'Mud Essence', 'Drone Core', 'Energy Fragment', 'Sentinel Core Plate',
];
const RARE: readonly string[] = [
  'Aetheric Cloth', 'Aetheric Pelt', 'Golem Core', 'Mudstone', 'Hardened Mudstone', 'Mud Gem', 'Aether Shard', 'Aetheric Song',
];
const LEGENDARY: readonly string[] = [
  'Iron Core', 'Wyrm Fang', 'Mud-Iron Heart', 'Aetherstone Heart',
];

// ── Cadence knobs (tune here) ────────────────────────────────────────────
// Fallout-4-ish: a nice drop is a treat, not every fight. These are the
// chance a QUALIFYING event yields any bonus at all.
export const HARD_WON_COMBAT_BONUS_CHANCE = 0.22; // per hard-won kill
export const LORE_HOOK_BONUS_CHANCE = 0.4;        // per completed story thread
// Within a bonus, weight toward Uncommon; Rare is the "good," Legendary the
// rare "wow" (roughly 68 / 26 / 6).
const RARE_CUTOFF = 0.68;
const LEGENDARY_CUTOFF = 0.94;

function pick(pool: readonly string[], rng: () => number): string {
  return pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
}

/** Roll WHICH bonus material drops (assumes a drop has already been decided). */
export function rollBonusMaterial(rng: () => number = Math.random): BonusMaterial {
  const t = rng();
  if (t < RARE_CUTOFF) return { name: pick(UNCOMMON, rng), rarity: 'Uncommon' };
  if (t < LEGENDARY_CUTOFF) return { name: pick(RARE, rng), rarity: 'Rare' };
  return { name: pick(LEGENDARY, rng), rarity: 'Legendary' };
}

/** "Long / hard-won combat" proxy. No per-round counter exists, so gate on
 *  the enemy being genuinely tanky/tough — the fights that actually drag on:
 *  high max-HP, Rare/Legendary rarity, or a boss/guardian. */
export function isHardWonFight(enemy: { hp?: number; rarity?: string; boss?: boolean }): boolean {
  return (enemy.hp ?? 0) >= 40
    || enemy.rarity === 'Rare'
    || enemy.rarity === 'Legendary'
    || !!enemy.boss;
}

/** A hard-won kill's bonus material, or null (no bonus this time / not a hard
 *  fight). Additive to normal loot. */
export function maybeCombatBonus(
  enemy: { hp?: number; rarity?: string; boss?: boolean },
  rng: () => number = Math.random,
): BonusMaterial | null {
  if (!isHardWonFight(enemy)) return null;
  if (rng() >= HARD_WON_COMBAT_BONUS_CHANCE) return null;
  return rollBonusMaterial(rng);
}

/** A completed story-thread's bonus material, or null. The reward for
 *  reading + following an easy-to-miss hook to its end. */
export function maybeLoreHookBonus(rng: () => number = Math.random): BonusMaterial | null {
  if (rng() >= LORE_HOOK_BONUS_CHANCE) return null;
  return rollBonusMaterial(rng);
}

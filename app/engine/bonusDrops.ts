// bonusDrops — a Fallout-4-ish "sprinkle" of GOOD crafting materials on top
// of the normal loot flood.
//
// Playtest ask: "we have a ton of basic drops — I don't want to substitute,
// but sprinkle in some better drops at the same frequency as Fallout 4, as a
// reward for reading." Purely ADDITIVE: it never replaces the existing basic
// loot; it occasionally hands the player a nicer material ON TOP, at two
// moments that reward engagement:
//   1. HARD-WON COMBAT — a long/tough fight coughs up a bonus material.
//   2. A COMPLETED STORY THREAD — following an easy-to-miss hook pays off.
//
// engine_Dev note: the material NAMES are NOT hardcoded here (that would bake
// Tartaria lore into the engine). Instead the candidate pools are pulled from
// the LIVE content-pack material table by rarity, so a reskin's own materials
// flow through automatically and the engine stays lore-agnostic.

import { resolveTable } from './contentPack';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const materialsData = require('../data/items/materials.json') as { materials: Array<{ name?: string; rarity?: string }> };

export interface BonusMaterial {
  name: string;
  rarity: 'Uncommon' | 'Rare' | 'Legendary';
}

// ── Cadence knobs (tune here) ────────────────────────────────────────────
// Fallout-4-ish: a nice drop is a treat, not every fight. These are the
// chance a QUALIFYING event yields any bonus at all.
export const HARD_WON_COMBAT_BONUS_CHANCE = 0.22; // per hard-won kill
export const LORE_HOOK_BONUS_CHANCE = 0.4;        // per completed story thread
// Within a bonus, weight toward Uncommon; Rare is the "good," Legendary the
// rare "wow" (roughly 68 / 26 / 6).
const RARE_CUTOFF = 0.68;
const LEGENDARY_CUTOFF = 0.94;

/** Candidate materials of each tier, pulled from the active content-pack
 *  material table (default = the built-in set). Blank runecaster casings and
 *  the like are filtered out so a "bonus" always reads as a real reward. */
function materialsByRarity(): Record<'Uncommon' | 'Rare' | 'Legendary', string[]> {
  const mats = resolveTable('materials', materialsData.materials) as Array<{ name?: string; rarity?: string }>;
  const buckets: Record<'Uncommon' | 'Rare' | 'Legendary', string[]> = { Uncommon: [], Rare: [], Legendary: [] };
  for (const m of mats) {
    if (!m.name) continue;
    if (/blank .*casing/i.test(m.name)) continue;
    if (m.rarity === 'Uncommon') buckets.Uncommon.push(m.name);
    else if (m.rarity === 'Rare') buckets.Rare.push(m.name);
    else if (m.rarity === 'Legendary') buckets.Legendary.push(m.name);
  }
  return buckets;
}

function pick(pool: string[], rng: () => number): string | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
}

/** Roll WHICH bonus material drops (assumes a drop has already been decided).
 *  Falls DOWN a tier if the rolled tier has no materials in the active pack,
 *  so a sparse content pack never yields a nameless bonus. */
export function rollBonusMaterial(rng: () => number = Math.random): BonusMaterial | null {
  const buckets = materialsByRarity();
  const t = rng();
  // Tier preference order, starting at the rolled band and falling down.
  const order: Array<'Uncommon' | 'Rare' | 'Legendary'> =
    t < RARE_CUTOFF ? ['Uncommon', 'Rare', 'Legendary']
    : t < LEGENDARY_CUTOFF ? ['Rare', 'Uncommon', 'Legendary']
    : ['Legendary', 'Rare', 'Uncommon'];
  for (const tier of order) {
    const name = pick(buckets[tier], rng);
    if (name) return { name, rarity: tier };
  }
  return null;
}

/** "Long / hard-won combat" proxy. No per-round counter exists, so gate on
 *  the enemy being genuinely tanky/tough — the fights that actually drag on:
 *  high max-HP, Rare/Legendary rarity, or a boss. */
export function isHardWonFight(enemy: { hp?: number; rarity?: string; boss?: boolean }): boolean {
  return (enemy.hp ?? 0) >= 40
    || enemy.rarity === 'Rare'
    || enemy.rarity === 'Legendary'
    || !!enemy.boss;
}

/** A hard-won kill's bonus material, or null. Additive to normal loot. */
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

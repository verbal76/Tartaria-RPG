// OTA-963 — BOSS SPOILS TABLE. Owner spec: "there shouldn't be any boss fight that ends
// in mud cloth and scrap metal — they're supposed to be dropping high-end materials,
// some good recipes, rare-but-not-Legendary armor and weapons; Guardians and Tower
// bosses drop Legendary but already have their own loot table."
//
// Every boss-flagged kill therefore rolls this table ON TOP OF (never instead of) its
// authored drops. The pools are built from the live catalogs, so the OTA-962 promoted
// trophy materials (Dragon Scale, Titan Core, ...) are automatically in stock. Floors
// are structural: every pool is Rare-or-better, so a sub-Rare boss payout is
// impossible by construction, not by tuning.
//
// APEX bosses — Core Guardians (core_guardian trait) and summit/tower bosses
// (summit_climb: trait) — take the MATERIALS half only: their Legendary signature
// gear is already the deterministic reward their own tables hand out. Recipes ride
// the existing OTA-718 hard-won recipe roll, which the kill path boosts for bosses.

import type { Enemy } from './types';
import { MATERIALS, WEAPONS, ARMOR } from './crafting';
import { CORE_GUARDIAN_TRAIT } from './coreGuardians';
import { SUMMIT_BOSS_TRAIT_PREFIX } from './greatClimbs';

/** Rare materials the table can roll. Live view of the catalog. */
export const BOSS_RARE_MATERIALS: readonly string[] = MATERIALS
  .filter((m) => m.rarity === 'Rare')
  .map((m) => m.name);

/** Legendary materials the table can roll (the boss-heart tier). */
export const BOSS_LEGENDARY_MATERIALS: readonly string[] = MATERIALS
  .filter((m) => m.rarity === 'Legendary')
  .map((m) => m.name);

/** Rare — deliberately NOT Legendary — weapons/armor for non-apex bosses.
 *  collect_only pieces (title trophies) are excluded. */
export const BOSS_RARE_GEAR: readonly string[] = [...WEAPONS, ...ARMOR]
  .filter((x) => x.rarity === 'Rare' && !(x.tags ?? []).includes('collect_only'))
  .map((x) => x.name);

/** A Core Guardian or summit/tower boss — Legendary-by-signature-table bosses. */
export function isApexBoss(enemy: Enemy): boolean {
  const traits = enemy.traits ?? [];
  return traits.includes(CORE_GUARDIAN_TRAIT)
    || traits.some((t) => t.startsWith(SUMMIT_BOSS_TRAIT_PREFIX));
}

/** Roll the boss spoils for a boss-flagged kill. `power` is enemyPowerScore(enemy);
 *  `rand` is injectable for tests. Non-boss enemies roll nothing.
 *    - 2 material rolls (3 at power >= 80), each Rare with a Legendary chance that
 *      scales with the fight (apex 50%, heavy boss 30%, boss 15%).
 *    - Non-apex bosses add one RARE weapon/armor 60% of the time.
 *  Every name returned is a real catalog row — resolveLootItem grants it as such. */
export function rollBossSpoils(
  enemy: Enemy,
  power: number,
  rand: () => number = Math.random,
): string[] {
  if (!enemy.boss) return [];
  const spoils: string[] = [];
  const apex = isApexBoss(enemy);
  const matRolls = power >= 80 ? 3 : 2;
  const legChance = apex ? 0.5 : power >= 80 ? 0.3 : 0.15;
  for (let i = 0; i < matRolls; i++) {
    const pool = rand() < legChance ? BOSS_LEGENDARY_MATERIALS : BOSS_RARE_MATERIALS;
    if (pool.length > 0) spoils.push(pool[Math.floor(rand() * pool.length)]!);
  }
  if (!apex && BOSS_RARE_GEAR.length > 0 && rand() < 0.6) {
    spoils.push(BOSS_RARE_GEAR[Math.floor(rand() * BOSS_RARE_GEAR.length)]!);
  }
  return spoils;
}

// takeableGearSpawns — revives the `take` verb as the GEAR loop.
//
// REGRESSION-1 follow-up (player-confirmed 2026-06-05): scenes surfaced
// takeable NOUNS but none resolved to a catalog item, so `take` paid out
// nothing and the loot loop ran entirely through investigate/salvage/climb.
// The take handler in gameStore already grants a fully-specced copy when an
// ambient noun's text matches a catalog item (findCatalogItem). The missing
// piece was simply that no catalog GEAR was ever placed as a scene noun.
//
// This module picks 1–3 common catalog weapons/armor by their REAL names so
// the existing handler resolves + grants them. Per the design: take is gear,
// ~99% common (a rare uncommon slips in), 1–3 per scene.
//
// Determinism: seeded by the scene's room key so a given tile/room always
// offers the SAME gear set. Combined with the take handler's per-room
// consumed-dedup, that closes the leave-and-return farm (a fresh random set
// each visit would be farmable).

import weaponsData from '../data/items/weapons.json';
import armorData from '../data/items/armor.json';
import { isOversized } from './portability';

interface CatRow { name?: string; rarity?: string }

const rows = (d: unknown): CatRow[] => {
  const v = d as CatRow[] | { weapons?: CatRow[]; armor?: CatRow[]; items?: CatRow[] };
  if (Array.isArray(v)) return v;
  return v.weapons ?? v.armor ?? v.items ?? [];
};
// Exclude oversized pieces (two-handers, bulky armor) — the TakeModal filters
// those out (isOversized), so spawning one would just be an invisible no-op.
const namesOf = (data: unknown, rarity: string): string[] =>
  rows(data)
    .filter((r) => r.rarity === rarity && !!r.name && !isOversized(r.name as string))
    .map((r) => r.name as string);

const COMMON_GEAR: string[] = [...namesOf(weaponsData, 'Common'), ...namesOf(armorData, 'Common')];
const UNCOMMON_GEAR: string[] = [...namesOf(weaponsData, 'Uncommon'), ...namesOf(armorData, 'Uncommon')];

// ── tiny seeded PRNG (string → deterministic stream) ────────────────────────
// OTA-611 — exported so the climbable/salvageable spawn pickers can seed off
// the same room key (closing the leave-and-return salvage/climb-loot farm the
// way this take-gear module already does).
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1–3 common catalog gear names (real names, so the take handler resolves
 *  them), deterministic for a given `seedKey`. ~1-in-50 picks upgrades to an
 *  Uncommon so the loop stays mostly-common per the design. */
export function pickTakeableGearForScene(
  seedKey: string,
  // OTA — #119a: recently-spawned names (lowercase) to avoid — the caller
  // keeps a small cross-tile ring so adjacent tiles stop rolling the same
  // gear. The guard cap below prevents a large exclude set from starving
  // the loop; worst case a tile offers fewer picks, never an infinite spin.
  exclude?: ReadonlySet<string>,
): string[] {
  if (COMMON_GEAR.length === 0) return [];
  const rng = mulberry32(hashSeed(`take-gear:${seedKey}`));
  const count = 1 + Math.floor(rng() * 3); // 1..3
  const picks: string[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (picks.length < count && guard < 40) {
    guard++;
    const uncommon = UNCOMMON_GEAR.length > 0 && rng() < 0.02; // ~99% common
    const pool = uncommon ? UNCOMMON_GEAR : COMMON_GEAR;
    const name = pool[Math.floor(rng() * pool.length)];
    if (!name || seen.has(name)) continue;
    if (exclude?.has(name.toLowerCase())) continue; // OTA — #119a
    seen.add(name);
    picks.push(name);
  }
  return picks;
}

/** Test/diagnostic accessors. */
export const _gearCounts = { common: COMMON_GEAR.length, uncommon: UNCOMMON_GEAR.length };

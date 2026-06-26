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
import { resolveTable } from './contentPack';

interface CatRow { name?: string; rarity?: string }

const rows = (d: unknown): CatRow[] => {
  const v = d as CatRow[] | { weapons?: CatRow[]; armor?: CatRow[]; items?: CatRow[] };
  if (Array.isArray(v)) return v;
  return v.weapons ?? v.armor ?? v.items ?? [];
};
// Exclude oversized pieces (two-handers, bulky armor) — the TakeModal filters
// those out (isOversized), so spawning one would just be an invisible no-op.
const namesOf = (arr: readonly CatRow[], rarity: string): string[] =>
  arr
    .filter((r) => r.rarity === rarity && !!r.name && !isOversized(r.name as string))
    .map((r) => r.name as string);

// engine_Dev — built-in defaults; the gear pools resolve through resolveTable()
// at SPAWN time so an uploaded weapons/armor override actually shows up as
// takeable scene loot instead of the built-in Tartaria catalog.
const BUILTIN_WEAPONS = rows(weaponsData);
const BUILTIN_ARMOR = rows(armorData);
function commonGear(): string[] {
  return [
    ...namesOf(resolveTable('weapons', BUILTIN_WEAPONS), 'Common'),
    ...namesOf(resolveTable('armor', BUILTIN_ARMOR), 'Common'),
  ];
}
function uncommonGear(): string[] {
  return [
    ...namesOf(resolveTable('weapons', BUILTIN_WEAPONS), 'Uncommon'),
    ...namesOf(resolveTable('armor', BUILTIN_ARMOR), 'Uncommon'),
  ];
}
// engine_Dev — the low-tier ARMOR pool on its own. The combined gear pool is
// weapon-heavy (the weapon catalog dwarfs armor), so a plain random draw rarely
// surfaces armor; we use this to GUARANTEE one armor piece on every take list.
// Common preferred (sell/scrap fodder), Uncommon as fallback. Resolves through
// the active armor table so re-skins stay on-theme.
function lowTierArmor(): string[] {
  return namesOf(resolveTable('armor', BUILTIN_ARMOR), 'Common');
}
function anyArmor(): string[] {
  return [
    ...namesOf(resolveTable('armor', BUILTIN_ARMOR), 'Common'),
    ...namesOf(resolveTable('armor', BUILTIN_ARMOR), 'Uncommon'),
  ];
}

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
export function pickTakeableGearForScene(seedKey: string): string[] {
  const common = commonGear();
  if (common.length === 0) return [];
  const uncommonPool = uncommonGear();
  const rng = mulberry32(hashSeed(`take-gear:${seedKey}`));
  const count = 1 + Math.floor(rng() * 3); // 1..3
  const picks: string[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (picks.length < count && guard < 40) {
    guard++;
    const uncommon = uncommonPool.length > 0 && rng() < 0.02; // ~99% common
    const pool = uncommon ? uncommonPool : common;
    const name = pool[Math.floor(rng() * pool.length)];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    picks.push(name);
  }
  // engine_Dev — GUARANTEE one armor piece on the take list. Takes skew
  // weapon-heavy and the drop economy runs on cheap kit the player sells/scraps
  // for coin + materials, so armor was under-supplied. If none of the rolled
  // picks is armor, fold one low-tier armor piece in: ADD it when there's room
  // (a 1-weapon scene becomes weapon + armor), or REPLACE the last pick when the
  // list is already at the 1–3 cap (so a weapon still leads). Seeded off the same
  // key → stable per tile (not farmable). Skipped only when the active armor
  // table has no low-tier entries (a re-skin that ships no armor).
  const armorNames = anyArmor();
  if (armorNames.length > 0) {
    const armorSet = new Set(armorNames);
    if (!picks.some((n) => armorSet.has(n))) {
      const pool = lowTierArmor().length > 0 ? lowTierArmor() : armorNames;
      let armorName = pool[Math.floor(rng() * pool.length)];
      let g2 = 0;
      while (armorName && seen.has(armorName) && g2 < 20) {
        armorName = pool[Math.floor(rng() * pool.length)];
        g2++;
      }
      if (armorName && !seen.has(armorName)) {
        if (picks.length >= 3) picks[picks.length - 1] = armorName;
        else picks.push(armorName);
      }
    }
  }
  return picks;
}

/** Test/diagnostic accessors. */
export const _gearCounts = { get common() { return commonGear().length; }, get uncommon() { return uncommonGear().length; } };

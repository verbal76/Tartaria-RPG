// resonanceLantern.ts — the Aetheric Torch "resonance probe" gamble.
//
// The torch stopped being a passive scene-revealer (its old revealScene
// effect only echoed hooks that look-around already names) and became a
// SCARCE, deliberate resource. Using one on a room that still holds an
// unresolved hook spends a charge and rolls a low, WISDOM-scaled chance at a
// single Rare/Legendary drop — material, weapon, or armor. A miss is a dead
// miss: the charge is gone, the hook remains for a future pull.
//
// Torch scarcity is the only throttle — we deliberately DON'T resolve the
// hook (that would clobber story/quest threads and cancel authored content),
// so the tension lives in "spend it now, or save it for a better room." WIS
// scales BOTH the hit chance and the Rare-vs-Legendary tier of a hit, so an
// appraisal build pays off.
//
// Pure + rng-injectable so the odds are unit-testable.

import { WEAPONS, ARMOR, MATERIALS } from './crafting';

export type ProbeRarity = 'Rare' | 'Legendary';
export type ProbeCategory = 'material' | 'weapon' | 'armor';

export interface TorchReward {
  name: string;
  category: ProbeCategory;
  rarity: ProbeRarity;
}
export interface TorchProbeResult {
  hit: boolean;
  reward: TorchReward | null;
}

// ── Tuning knobs (all in one place) ──────────────────────────────────────
// "Rare treat": ~18% base, climbing to ~30% at high WISDOM.
export const PROBE_BASE_HIT = 0.18;
export const PROBE_WIS_HIT_STEP = 0.015; // per WIS point above 10
export const PROBE_WIS_HIT_CAP = 0.12; // +12% max → ~30% around WIS 18
// The rarity TIER of a hit also scales on WISDOM: ~12% Legendary at base,
// up to ~40% at high WIS (the rest Rare).
export const PROBE_BASE_LEGENDARY = 0.12;
export const PROBE_WIS_LEG_STEP = 0.02;
export const PROBE_WIS_LEG_CAP = 0.28;
// Category split of a hit: mostly materials, with real gear as the "wow".
// < .55 material · < .775 weapon · else armor  (≈55 / 22.5 / 22.5).
const CATEGORY_MATERIAL_CUTOFF = 0.55;
const CATEGORY_WEAPON_CUTOFF = 0.775;

const namesByRarity = (
  list: readonly { name: string; rarity: string; tags?: readonly string[] }[],
  rarity: ProbeRarity,
  extra?: (x: { tags?: readonly string[] }) => boolean,
): string[] =>
  list.filter((x) => x.rarity === rarity && (!extra || extra(x))).map((x) => x.name);

// Real, equippable weapons only — exclude the Aethercraft "power" rows in
// weapons.json (Mud Wave, Displace Aether, …) which carry rune_power but not
// the 'weapon' tag and would read as junk if handed over as a physical drop.
const isRealWeapon = (x: { tags?: readonly string[] }): boolean =>
  (x.tags ?? []).includes('weapon');
const notPower = (x: { tags?: readonly string[] }): boolean =>
  !(x.tags ?? []).includes('rune_power');

const POOLS: Record<ProbeCategory, Record<ProbeRarity, readonly string[]>> = {
  material: {
    Rare: namesByRarity(MATERIALS, 'Rare'),
    Legendary: namesByRarity(MATERIALS, 'Legendary'),
  },
  weapon: {
    Rare: namesByRarity(WEAPONS, 'Rare', isRealWeapon),
    Legendary: namesByRarity(WEAPONS, 'Legendary', isRealWeapon),
  },
  armor: {
    Rare: namesByRarity(ARMOR, 'Rare', notPower),
    Legendary: namesByRarity(ARMOR, 'Legendary', notPower),
  },
};

/** Effective chance a single torch use HITS (grants a reward), given the
 *  player's effective wisdom. */
export function probeHitChance(wisdom: number): number {
  const bonus = Math.min(PROBE_WIS_HIT_CAP, Math.max(0, wisdom - 10) * PROBE_WIS_HIT_STEP);
  return PROBE_BASE_HIT + bonus;
}

/** Given that a hit landed, the chance its tier is Legendary (else Rare). */
export function probeLegendaryChance(wisdom: number): number {
  const bonus = Math.min(PROBE_WIS_LEG_CAP, Math.max(0, wisdom - 10) * PROBE_WIS_LEG_STEP);
  return PROBE_BASE_LEGENDARY + bonus;
}

function pick(pool: readonly string[], rng: () => number): string | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
}

/** Roll a single torch probe. `wisdom` is the player's EFFECTIVE wisdom
 *  (base + gear + food). Returns { hit: false } for a dead miss. */
export function rollTorchProbe(
  wisdom: number,
  rng: () => number = Math.random,
): TorchProbeResult {
  if (rng() >= probeHitChance(wisdom)) return { hit: false, reward: null };
  const rarity: ProbeRarity = rng() < probeLegendaryChance(wisdom) ? 'Legendary' : 'Rare';
  const t = rng();
  let category: ProbeCategory =
    t < CATEGORY_MATERIAL_CUTOFF ? 'material' : t < CATEGORY_WEAPON_CUTOFF ? 'weapon' : 'armor';
  let name = pick(POOLS[category][rarity], rng);
  // Defensive: if a gear pool is somehow empty at this rarity, fall back to
  // material (always populated) so a hit never silently drops nothing.
  if (!name) {
    category = 'material';
    name = pick(POOLS.material[rarity], rng) ?? pick(POOLS.material.Rare, rng);
  }
  if (!name) return { hit: false, reward: null };
  return { hit: true, reward: { name, category, rarity } };
}

/** Is this item a resonance lantern (the Aetheric Torch or a future lantern
 *  variant)? Gates the gamble path so other revealScene detectors — Signal
 *  Flare, Aetheric Flare, Basic Aether Detector — keep their plain
 *  hook-ping behavior. */
export function isResonanceLantern(item: { name: string }): boolean {
  return /\b(torch|lantern|lamp)\b/i.test(item.name);
}

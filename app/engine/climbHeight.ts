// OTA 030 — variable-height climb tiers. The OTA 027 climb verb was a
// single DEX vs DC 12 roll that resolved the whole climb in one tap.
// Playtester wanted real height — a wall is quick, a tower or cliff
// is a multi-stage commitment with progress notifications and a
// chance-based unique drop at the top.
//
// Lookup is substring-based so phrasings like "stone wall" or "tall
// tower" still resolve. First match wins; order doesn't matter
// because every key is a distinct climbable noun.

import type { Rarity } from './types';

const CLIMB_HEIGHT: Record<string, number> = {
  // 1 tier — step up; barely counts as a climb
  ledge: 1, rail: 1, rung: 1, walkway: 1, balcony: 1,
  // 2 tiers — short climb
  wall: 2, window: 2, fence: 2, stair: 2, beam: 2, ladder: 2,
  vine: 2, rope: 2,
  // 3 tiers — committed climb
  pillar: 3, column: 3, arch: 3, tree: 3, scaffold: 3, crag: 3,
  bridge: 3, pole: 3,
  // 4 tiers — tall
  tower: 4, spire: 4, steeple: 4, obelisk: 4,
  // 5 tiers — cliff
  cliff: 5,
};

export function climbHeightFor(noun: string): number {
  const n = noun.toLowerCase();
  for (const k of Object.keys(CLIMB_HEIGHT)) {
    if (n.includes(k)) return CLIMB_HEIGHT[k]!;
  }
  return 2; // sensible default for unfamiliar climbables
}

// Tier label for progress narration. The player sees these per
// successful tier so the climb has a sense of altitude.
export function climbTierLabel(tier: number, total: number): string {
  if (tier === total) return 'top';
  if (tier === 1) return 'first hold';
  if (tier === total - 1) return 'last stretch';
  return `tier ${tier}/${total}`;
}

// OTA 046 — extract the cleared-state lookup the climb verb has done
// inline since OTA 033. The CLIMB modal needs the same answer to dim
// cleared chips, so the parse logic lives here and gameStore / the
// modal both call it. Marker format is 'climbed:<noun>:t<N>' written
// per cleared tier.
export function maxClimbedTier(noun: string, marks: readonly string[]): number {
  const prefix = `climbed:${noun.toLowerCase()}:`;
  let max = 0;
  for (const m of marks) {
    if (!m.startsWith(prefix)) continue;
    const parts = m.split(':');
    if (parts.length < 3) continue;
    const seg = parts[2] ?? '';
    const numStr = seg.startsWith('t') ? seg.slice(1) : seg;
    const t = parseInt(numStr, 10);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max;
}

export function isClimbCleared(noun: string, marks: readonly string[]): boolean {
  const total = climbHeightFor(noun);
  return maxClimbedTier(noun, marks) >= total;
}

// Chance-based top-of-climb loot. ~50% of crested climbs yield
// nothing (preserves the RNG-driven incentive the playtester asked
// for); the other ~50% rolls one item from a pool that's chunkier
// than ground-search (Uncommon-skewed, with a thin Rare tail).
export const CLIMB_TOP_LOOT: { name: string; rarity: Rarity; weight: number }[] = [
  { name: 'Aetheric Locket',       rarity: 'Common',   weight: 4 },
  { name: 'Aetheric Shard',        rarity: 'Uncommon', weight: 6 },
  { name: 'Speckled Egg',          rarity: 'Uncommon', weight: 5 },
  { name: 'Bioluminescent Fungus', rarity: 'Uncommon', weight: 3 },
  { name: 'First Aid Kit',         rarity: 'Uncommon', weight: 4 },
  { name: 'Aether Crystal',        rarity: 'Common',   weight: 8 },
  { name: 'Drone Core',            rarity: 'Uncommon', weight: 2 },
  { name: 'Aetheric Cloth',        rarity: 'Rare',     weight: 1 },
];

export function rollClimbTopLoot(): { name: string; rarity: Rarity } | null {
  if (Math.random() < 0.5) return null;
  const total = CLIMB_TOP_LOOT.reduce((s, x) => s + x.weight, 0);
  // OTA 036 — guard against an empty/zero-weight pool. Without this,
  // r = Math.random() * 0 = 0 and the loop's r -= weight never satisfies
  // r <= 0, falling through to the implicit `return null`. Safer to be
  // explicit.
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const x of CLIMB_TOP_LOOT) {
    r -= x.weight;
    if (r <= 0) return { name: x.name, rarity: x.rarity };
  }
  return null;
}

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

// v2.4.1 (OTA 023) — word-boundary match. `n.includes(k)` was matching
// `rail` inside `trail`, which made "dust trail" a tier-1 climbable
// (the player got a free climb-top loot roll on what should have been
// a non-climbable scene noun). Word boundaries require the pattern to
// appear as a discrete word.
const HEIGHT_REGEX_CACHE = new Map<string, RegExp>();
function heightPatternMatches(noun: string, pattern: string): boolean {
  let re = HEIGHT_REGEX_CACHE.get(pattern);
  if (!re) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`, 'i');
    HEIGHT_REGEX_CACHE.set(pattern, re);
  }
  return re.test(noun);
}

export function climbHeightFor(noun: string): number {
  // 2026-05-24 — curated spawn pool (climbableSpawns.ts) takes
  // precedence over the substring matcher. Player-spec heights for
  // the 15 new props land first; the legacy substring table catches
  // anything authored as a scene interactable (arch, pillar, etc.).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { curatedClimbHeight } = require('./climbableSpawns');
  const curated = curatedClimbHeight(noun);
  if (curated != null) return curated;
  const n = noun.toLowerCase();
  for (const k of Object.keys(CLIMB_HEIGHT)) {
    if (heightPatternMatches(n, k)) return CLIMB_HEIGHT[k]!;
  }
  return 2; // sensible default for unfamiliar climbables
}

// Tier label for progress narration. The player sees these per
// successful tier so the climb has a sense of altitude.
export function climbTierLabel(tier: number, total: number): string {
  if (tier === total) return 'top';
  if (tier === 1) return 'first hold';
  if (tier === total - 1) return 'last stretch';
  // Middle tiers (only exist on 4+ tier climbs) — a natural "still ascending"
  // phrase. Previously this returned the raw "tier 2/4", which the narration
  // rendered as "You reach the tier 2/4 of the …" (a broken-looking template).
  return 'next hold';
}

// OTA 046 — extract the cleared-state lookup the climb verb has done
// inline since OTA 033. The CLIMB modal needs the same answer to dim
// cleared chips, so the parse logic lives here and gameStore / the
// modal both call it. Marker format is 'climbed:<noun>:t<N>' written
// per cleared tier.
//
// 2026-05-27 OTA-086 — FUZZY MATCH on the marker noun. Pre-OTA-086
// this used `prefix = "climbed:" + noun.toLowerCase() + ":"` and
// matched markers via startsWith — exact equality on the noun
// segment. But the engine writes the marker under climbTarget,
// which can resolve to a SHORT form ("spire") via the parser's
// resolvedNoun fallback when matchAmbientNoun misses, while the
// modal calls this with the FULL chip text ("zharak's teeth
// spire"). Net: marker key "climbed:spire:t4" didn't match the
// modal's prefix "climbed:zharak's teeth spire:" → isClimbCleared
// returned false → chip stayed actionable → engine refused on tap
// because the engine resolves the same short "spire" form. The
// chip and the engine literally disagreed about which key meant
// "this climb is done."
//
// Fuzzy match mirrors OTA-070's substring approach for ambient
// noun dedup. For each `climbed:X:t<N>` marker we check whether
// X is a substring of `noun` OR noun is a substring of X — if
// either holds, the marker is considered to belong to this noun.
// Same idea as the searchedAmbientNouns / flavorExhaustedNouns
// fuzzy check; mismatched-resolution forms no longer leak.
// OTA-608 — head-noun-anchored climb-noun match. The old check was a
// bidirectional `includes` (markerNoun is a substring of noun OR vice versa),
// which let a generic head word match MID-PHRASE in a DIFFERENT prop: a
// "climbed:spire:t4" marker (or an elevatedOn on a "spire") fuzzy-matched
// "grand spire capacitor" because that string contains "spire" — so one
// climb's progress/elevation bled onto another (player: climbs "skip stages",
// and investigating a different prop wrongly demands you "climb down").
//
// English climb nouns are head-final: "grand spire capacitor" IS a capacitor,
// "zharak's teeth spire" IS a spire. So the shorter form is the right match
// only when it's a whole-word SUFFIX (the head noun) of the longer — that
// keeps the legit short↔full case ("spire" ↔ "zharak's teeth spire") while
// rejecting the mid-phrase contamination ("spire" vs "...spire capacitor").
export function sameClimbNoun(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return longer.endsWith(' ' + shorter);
}

export function maxClimbedTier(noun: string, marks: readonly string[]): number {
  const nounLower = noun.toLowerCase();
  let max = 0;
  for (const m of marks) {
    if (!m.startsWith('climbed:')) continue;
    const parts = m.split(':');
    // Expected: ['climbed', '<noun>', 't<N>'] (3 parts); but noun
    // can itself contain colons in pathological cases, so guard.
    if (parts.length < 3) continue;
    const markerNoun = parts.slice(1, parts.length - 1).join(':').toLowerCase();
    if (!sameClimbNoun(markerNoun, nounLower)) continue;
    const seg = parts[parts.length - 1] ?? '';
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

// OTA 23-013 — tall-climb-only additions. On tier ≥ 4 climbs
// (towers, spires, cliffs) somebody once anchored a piton up there
// and left their rope behind. Folded into the same chance roll so
// the overall drop frequency doesn't shift; the rope just edges
// into the weighted pool on tall targets.
const TALL_CLIMB_TOP_LOOT: { name: string; rarity: Rarity; weight: number }[] = [
  { name: "Reclaimer's Rope", rarity: 'Uncommon', weight: 2 },
];

export function rollClimbTopLoot(totalTiers?: number): { name: string; rarity: Rarity } | null {
  if (Math.random() < 0.5) return null;
  const pool =
    typeof totalTiers === 'number' && totalTiers >= 4
      ? [...CLIMB_TOP_LOOT, ...TALL_CLIMB_TOP_LOOT]
      : CLIMB_TOP_LOOT;
  const total = pool.reduce((s, x) => s + x.weight, 0);
  // OTA 036 — guard against an empty/zero-weight pool. Without this,
  // r = Math.random() * 0 = 0 and the loop's r -= weight never satisfies
  // r <= 0, falling through to the implicit `return null`. Safer to be
  // explicit.
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const x of pool) {
    r -= x.weight;
    if (r <= 0) return { name: x.name, rarity: x.rarity };
  }
  return null;
}

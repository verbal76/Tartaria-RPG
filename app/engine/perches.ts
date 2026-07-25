// OTA-974 — Phase B of the real-heights model: PERCHES. Small objects tucked
// partway up taller climbable structures (a nest at tier 2 of the tower, a
// satchel wedged in the mortar at tier 3), so climbing is exploration and not
// just a top-of-climb lottery. Pure module: templates, a deterministic
// per-room seeder (re-entering a scene can NEVER reroll the loot), and a
// tier-gated loot roller. The apex stays the elevated-overlay system's turf —
// perches never seed on the top tier.
//
// Reachability, refusals, and the harvest flow live in gameStore on top of
// the Phase-A skeleton (CurrentScene.nounPlacements + climbHeight.
// placementFor / reachableWhileElevated).

import type { Rarity } from './types';
import { sameClimbNoun, type NounPlacements } from './climbHeight';
import { classifyNoun } from './sceneNounMaterial';

export interface PerchLootEntry {
  /** MUST resolve via crafting.findCatalogItem — the perch validator test
   *  fails the build otherwise (no fake loot; see the OTA-960s loot audit). */
  name: string;
  weight: number;
  qtyMin: number;
  qtyMax: number;
  /** Entry only enters the pool when the perch sits at this tier or higher —
   *  the height-scaled-loot knob: rarer finds live higher up. */
  minTier?: number;
}

export interface PerchTemplate {
  /** The scene noun (lowercase). Also the placement key. */
  noun: string;
  /** Which structure materials this perch can seed on. */
  materials: ReadonlyArray<'stone' | 'metal' | 'wood' | 'unknown'>;
  /** Printed when the player crests the tier the perch sits on. */
  discoverLine: string;
  loot: PerchLootEntry[];
}

export const PERCH_TEMPLATES: PerchTemplate[] = [
  {
    noun: 'weathered bird nest',
    materials: ['stone', 'wood', 'unknown'],
    discoverLine: 'Beside your handhold, a weathered bird nest — twigs, wire, and something that glints.',
    loot: [
      { name: 'Harpy Feather', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Bone Fragment', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Worn Tartarian Coin', weight: 2, qtyMin: 1, qtyMax: 1 },
      { name: 'Aetheric Gem', weight: 1, qtyMin: 1, qtyMax: 1, minTier: 4 },
    ],
  },
  {
    noun: 'wind-torn prayer flags',
    materials: ['stone', 'unknown'],
    discoverLine: 'A line of wind-torn prayer flags snaps just over your head, knotted to a rusted cleat.',
    loot: [
      { name: 'Cloth Scrap', weight: 4, qtyMin: 1, qtyMax: 2 },
      { name: 'Aetheric Cloth', weight: 2, qtyMin: 1, qtyMax: 1, minTier: 3 },
    ],
  },
  {
    noun: 'rusted service box',
    materials: ['metal'],
    discoverLine: 'Set into the plating: a rusted service box, lid half-sprung.',
    loot: [
      { name: 'Bent Nail', weight: 3, qtyMin: 1, qtyMax: 3 },
      { name: 'Scrap Metal', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Automaton Circuit', weight: 2, qtyMin: 1, qtyMax: 1, minTier: 3 },
      { name: 'Energy Fragment', weight: 1, qtyMin: 1, qtyMax: 1, minTier: 4 },
    ],
  },
  {
    noun: 'wax-sealed satchel',
    materials: ['stone', 'metal', 'wood', 'unknown'],
    discoverLine: 'Wedged in a seam at your tier: a wax-sealed satchel someone meant to come back for.',
    loot: [
      { name: 'Worn Tartarian Coin', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Cloth Scrap', weight: 2, qtyMin: 1, qtyMax: 1 },
      { name: 'Aether Dust', weight: 2, qtyMin: 1, qtyMax: 1, minTier: 3 },
      { name: 'Aetheric Shard', weight: 1, qtyMin: 1, qtyMax: 1, minTier: 4 },
    ],
  },
  {
    noun: 'abandoned wasp gall',
    materials: ['wood', 'stone'],
    discoverLine: 'An abandoned wasp gall clings under the lip of the tier, dry as paper.',
    loot: [
      { name: 'Bone Sliver', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Spider Silk', weight: 3, qtyMin: 1, qtyMax: 2 },
    ],
  },
  {
    noun: 'salt-crusted gull roost',
    materials: ['stone', 'unknown'],
    discoverLine: 'A salt-crusted gull roost crowds the ledge — droppings, bones, and stolen shine.',
    loot: [
      { name: 'Bone Fragment', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Harpy Feather', weight: 2, qtyMin: 1, qtyMax: 1 },
      { name: 'Worn Tartarian Coin', weight: 2, qtyMin: 1, qtyMax: 1 },
    ],
  },
  {
    noun: 'snagged climbing cache',
    materials: ['stone', 'metal', 'wood', 'unknown'],
    discoverLine: "A snagged climbing cache hangs off an old piton — some Reclaimer's, once.",
    loot: [
      { name: 'Worn Tartarian Coin', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Smooth Stone', weight: 2, qtyMin: 1, qtyMax: 2 },
      { name: 'Aetheric Shard', weight: 1, qtyMin: 1, qtyMax: 1, minTier: 4 },
    ],
  },
  {
    noun: 'corroded signal lamp',
    materials: ['metal'],
    discoverLine: 'A corroded signal lamp juts from the frame, its Aetheric filament long dark.',
    loot: [
      { name: 'Scrap Metal', weight: 3, qtyMin: 1, qtyMax: 2 },
      { name: 'Energy Fragment', weight: 2, qtyMin: 1, qtyMax: 1, minTier: 3 },
      { name: 'Automaton Circuit', weight: 1, qtyMin: 1, qtyMax: 1, minTier: 4 },
    ],
  },
];

/** Deterministic string hash (djb2-xor). NOT Math.random — the same room must
 *  seed the same perches forever, or scene re-entry becomes a loot reroll. */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Template lookup honoring short forms ("satchel" finds "wax-sealed satchel"). */
export function perchTemplateFor(noun: string): PerchTemplate | null {
  return PERCH_TEMPLATES.find((p) => sameClimbNoun(p.noun, noun)) ?? null;
}

/** Chance (out of 100) that an eligible structure carries a perch. */
export const PERCH_CHANCE = 35;

/** Seed perches for a room. One perch max per structure, structures need 3+
 *  tiers, the perch tier is 1..tiers-1 (never the apex — that's overlay turf).
 *  Fully deterministic in (roomKey, climbables). */
export function seedPerches(
  roomKey: string,
  climbables: ReadonlyArray<{ noun: string; tiers: number }>,
): { placements: NounPlacements; nouns: string[] } {
  const placements: NounPlacements = {};
  const nouns: string[] = [];
  for (const c of climbables) {
    if (c.tiers < 3) continue;
    const h = hashStr(`${roomKey}|${c.noun.toLowerCase()}`);
    if (h % 100 >= PERCH_CHANCE) continue;
    const mat = classifyNoun(c.noun).material;
    const matKey: 'stone' | 'metal' | 'wood' | 'unknown' =
      mat === 'stone' || mat === 'metal' || mat === 'wood' ? mat : 'unknown';
    const fits = PERCH_TEMPLATES.filter((p) => p.materials.includes(matKey));
    if (fits.length === 0) continue;
    const tpl = fits[(h >>> 3) % fits.length]!;
    if (nouns.includes(tpl.noun)) continue; // one of each kind per room
    const tier = 1 + ((h >>> 8) % (c.tiers - 1));
    placements[tpl.noun] = { structure: c.noun, tier };
    nouns.push(tpl.noun);
  }
  return { placements, nouns };
}

/** Weight-pick a loot entry, honoring minTier gates (higher perch = richer
 *  pool). `roll(max)` is the caller's die (1..max) so tests can pin it. */
export function rollPerchLoot(
  tpl: PerchTemplate,
  tier: number,
  roll: (max: number) => number,
): { name: string; qty: number } | null {
  const pool = tpl.loot.filter((l) => (l.minTier ?? 0) <= tier);
  if (pool.length === 0) return null;
  const total = pool.reduce((a, l) => a + l.weight, 0);
  let pick = roll(total);
  for (const l of pool) {
    pick -= l.weight;
    if (pick <= 0) {
      const span = l.qtyMax - l.qtyMin;
      return { name: l.name, qty: l.qtyMin + (span > 0 ? roll(span + 1) - 1 : 0) };
    }
  }
  const last = pool[pool.length - 1]!;
  return { name: last.name, qty: last.qtyMin };
}

// Rarity for reward lines is read from the catalog at grant time
// (crafting.findCatalogItem) — templates never invent a rarity.
export type { Rarity };

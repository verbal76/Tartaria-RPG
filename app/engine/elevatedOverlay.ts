// 2026-05-27 OTA-089 — Elevated overlay scenes. When the
// player climbs to the top of a multi-tier obstacle (spire,
// tower, statue, etc.) there's a chance the engine surfaces
// a mini-area at the apex — a nook, a vantage post, an
// Aether collector, a sealed door — with its own ambient
// nouns and (usually) an encounter. The player resolves
// whatever's up there and then `climb down` from the overlay
// to restore the original scene (no detour back to "the
// pillar" first — the climb mark is written at the descent
// step regardless).
//
// Pure module: no React, no zustand. The gameStore's climb
// handler calls rollElevatedOverlay() after the top-tier
// write, and if it returns non-null, calls buildOverlayScene
// to construct the swap-in scene. Climb-down detection in
// the engine reads CurrentScene.preservedSceneOnDescent +
// elevatedOverlayMeta to know it's in an overlay and
// restore the base scene.
//
// Enemies are picked from the existing app/data/enemies/
// enemies.json roster by name — no new enemy authoring
// needed. The overlay just spawns at the same scale the
// player's current world ladder calls for; HP / damage /
// AC are read from the enemy's catalog entry.

import type { Enemy } from './types';
import type { Hook } from './hooks';
import type { VendorInstance } from './vendors';
import { resolveOverlays } from './contentPack';
import overlayData from '../data/overlays/elevated-overlays.json';

/** OTA-090 — overlay kinds.
 *
 *  'encounter' — hostile spawn, fight or bail (the OTA-089 default).
 *  'trader'    — peaceful vendor hiding on top of the climb.
 *                Tier-gated: only fires when totalTiers ≥ template.
 *                minTiers (4 in practice). Each trader template
 *                has a hand-authored name + funny "why are they
 *                up here" reason + a small fixed offer pool.
 *  'lookout'   — peaceful NPC who plants a one-stage hook with
 *                a rumor / lore beat. Pays out a small reward
 *                or faction nudge on engagement.
 */
export type OverlayKind = 'encounter' | 'trader' | 'lookout';

export interface OverlayTraderTemplate {
  vendorName: string;
  vendorTitle: string;
  vendorDescription: string;
  faction: string | null;
  demeanor: 'honest' | 'sketchy';
  offers: Array<{ itemName: string; priceMin: number; priceMax: number }>;
}

export interface OverlayLookoutTemplate {
  /** Hook kind for the planted thread. Reuses existing
   *  HookKind values from app/engine/hooks.ts so the rumor
   *  plays through the standard hook pipeline. */
  hookKind: Hook['kind'];
  /** The line that fires on entry — the NPC's pitch. */
  pitchLine: string;
  /** Nouns the player can tap to engage the lookout. The
   *  hook intercept picks these up. */
  hookNouns: string[];
}

/** OTA-092 — flat thematic pool. Each entry is an enemy name
 *  from app/data/enemies/enemies.json. rollOverlayEncounter
 *  filters at runtime by the enemy's HP relative to player.
 *  hpMax, so a wide-range pool (Common-tier Bat to Rare-tier
 *  Harpy in the same overlay) can serve every player level
 *  cleanly — the system picks the band of enemies that
 *  matches the player's capacity.
 *
 *  Replaces OTA-091's TieredEnemyPool which used rarity as
 *  the band axis. Player asked: "2x is ok, 3x if you want
 *  to scare them" — so the runtime band is HP-ratio, not
 *  rarity. */
export type EncounterPool = string[];

export interface ElevatedOverlay {
  id: string;
  kind: OverlayKind;
  /** Single-paragraph arrival narration. Printed when the
   *  player enters the overlay (right after the climb-top
   *  "you reach the top" line). */
  arrivalLine: string;
  /** Ambient noun pool for the overlay scene. These become
   *  the SearchModal chips while the player is up there.
   *  Investigates resolve through the standard OTA-071+
   *  table seed using these nouns. */
  ambientNouns: string[];
  /** Minimum totalTiers of the climbed obstacle for this
   *  overlay to fire. Traders are gated to 4+ ('larger
   *  locations' per playtester); encounters + lookouts
   *  default to 0 (any tier). */
  minTiers?: number;
  /** 0..1. Chance the overlay spawns an encounter on entry.
   *  Only applies when kind === 'encounter'. */
  encounterChance?: number;
  /** Flat thematic enemy pool. Must match entries in
   *  app/data/enemies/enemies.json by exact .name. Runtime
   *  filters by HP relative to player.hpMax so a wide-range
   *  pool serves every player level. Only applies when
   *  kind === 'encounter'. */
  encounterPool?: EncounterPool;
  /** Trader template — only applies when kind === 'trader'. */
  trader?: OverlayTraderTemplate;
  /** Lookout template — only applies when kind === 'lookout'. */
  lookout?: OverlayLookoutTemplate;
}

// engine_Dev — overlay templates are now app/data/overlays/elevated-overlays.json
// and author-uploadable; the roll/scene RULES stay below. override → generic → built-in.
function overlays(): ElevatedOverlay[] {
  return resolveOverlays(overlayData.overlays as unknown as ElevatedOverlay[]) as ElevatedOverlay[];
}

// Pool. Roughly tuned so the average overlay has ~50%
// encounter chance, and an open-sky outcome is the rare
// rest beat. Per-template ambientNouns hit the OTA-080
// keyword map where possible (vessel for 'copper bowl',
// vegetation for 'roost feathers', etc.) so the
// investigation table seeds useful entries.


/** Probability of any overlay firing at all on a top-tier
 *  climb. Below this rolls, the player just gets the
 *  existing climb-top loot beat and the cleared chip — no
 *  overlay. ~30% keeps overlays as a flavor moment, not a
 *  guaranteed combat tax per climb. */
const OVERLAY_TRIGGER_CHANCE = 0.30;

/** Returns an overlay template when the trigger roll fires
 *  AND a random pick (filtered by minTiers) lands. Caller
 *  passes totalTiers from the climb so traders are gated to
 *  4+ tier obstacles ('larger locations' per playtester
 *  spec). minTiers defaults to 0 for encounters/lookouts so
 *  the filter is a no-op for them.
 *
 *  OTA-090: accepts totalTiers param. Pre-OTA-090 the pool
 *  was uniform-pick from all entries; now the trader subset
 *  is excluded on short climbs so a 1-tier ledge doesn't
 *  surface an absurd "a man with a wagon and three ledgers
 *  is up here" beat. */
export function rollElevatedOverlay(
  totalTiers: number = 0,
  rand: () => number = Math.random,
): ElevatedOverlay | null {
  if (rand() >= OVERLAY_TRIGGER_CHANCE) return null;
  // 2026-05-27 OTA-102 — minTiers default bumped from 0 to 2.
  // Playtest log showed a 1-tier 'cracked walkway' climb
  // surfacing a "copper bowl is bolted to the apex" collector
  // overlay — flavor implies a tall structure but the noun is
  // a walkway. 1-tier climbs (ledges, walkways, pedestals, low
  // arches) now get the standard climb-top loot beat but no
  // overlay surface. 2+ tier climbs still surface overlays as
  // before. Traders keep their explicit minTiers=4 so the
  // larger-location gate is unchanged.
  const OVERLAY_MIN_TIERS_DEFAULT = 2;
  const eligible = overlays().filter((o) => (o.minTiers ?? OVERLAY_MIN_TIERS_DEFAULT) <= totalTiers);
  if (eligible.length === 0) return null;
  const pick = eligible[Math.floor(rand() * eligible.length)] ?? null;
  return pick;
}

export function overlayById(id: string): ElevatedOverlay | null {
  return overlays().find((o) => o.id === id) ?? null;
}

/** Pick an enemy NAME from the overlay's encounter pool, or
 *  null when the encounter roll didn't fire. Caller looks up
 *  the actual catalog entry via app/data/enemies/enemies.json
 *  and instantiates the Enemy + hp. */
/** OTA-092 — HP-ratio band selection. Picks an encounter
 *  whose HP fits the player's capacity. Bands are defined
 *  relative to player.hpMax so the system scales as the
 *  player grows.
 *
 *  Player asked: "I still want a challenge they need to flee
 *  every now and then but not 5x. 2x is ok, 3x if you want
 *  to scare them." So:
 *
 *    easy band     0.5x – 1.0x player.hpMax  (light)
 *    standard band 1.0x – 2.0x player.hpMax  (normal challenge)
 *    scare band    2.0x – 3.0x player.hpMax  (might need to flee)
 *
 *  Above 3x: never spawn. Below 0.5x: too trivial; skip
 *  unless nothing else qualifies (fallback).
 *
 *  Weights tuned so most rolls land in the "standard"
 *  middle band, with a smaller scare slice for the flee-
 *  worthy spike and an easy slice for the breather.
 *
 *  Enemy HP looked up at runtime from enemies.json so a
 *  pool entry's actual stats drive the placement. Pools
 *  can list a wide HP range (Common → Rare in the same
 *  array) and the filter handles the scaling — the
 *  per-overlay thematic identity stays intact regardless
 *  of player level. */
const BAND_EASY_LOW = 0.5;
const BAND_EASY_HIGH = 1.0;
const BAND_STANDARD_LOW = 1.0;
const BAND_STANDARD_HIGH = 2.0;
const BAND_SCARE_LOW = 2.0;
const BAND_SCARE_HIGH = 3.0;
const WEIGHT_STANDARD = 0.60;
const WEIGHT_EASY = 0.25;
// scare = 1 - 0.60 - 0.25 = 0.15

export function rollOverlayEncounter(
  overlay: ElevatedOverlay,
  playerHpMax: number,
  rand: () => number = Math.random,
): string | null {
  if (overlay.kind !== 'encounter') return null;
  const chance = overlay.encounterChance ?? 0;
  if (rand() >= chance) return null;
  const pool = overlay.encounterPool;
  if (!pool || pool.length === 0) return null;
  const hpMax = Math.max(1, playerHpMax);
  // engine_Dev — resolve enemies through the content-pack override, NOT the raw
  // built-in roster. Lazy require both avoids the circular concern AND uses
  // findEnemyByName (resolveTable('enemies', …)), so an author's custom enemies
  // resolve here exactly as they do everywhere else. The old direct
  // require('../data/enemies/enemies.json') only saw the built-ins, so EVERY
  // custom-roster game's elevated `encounter` overlays scored 0 enemies and
  // spawned nothing despite the arrival line promising a threat.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { findEnemyByName } = require('./encounter') as typeof import('./encounter');
  const scored = pool
    .map((name) => {
      const e = findEnemyByName(name);
      if (!e) return null;
      return { name, hp: e.hp, ratio: e.hp / hpMax };
    })
    .filter((x): x is { name: string; hp: number; ratio: number } => x !== null);
  if (scored.length === 0) return null;
  const easy = scored.filter((x) => x.ratio >= BAND_EASY_LOW && x.ratio < BAND_EASY_HIGH);
  const standard = scored.filter((x) => x.ratio >= BAND_STANDARD_LOW && x.ratio < BAND_STANDARD_HIGH);
  const scare = scored.filter((x) => x.ratio >= BAND_SCARE_LOW && x.ratio <= BAND_SCARE_HIGH);
  // Pick band by weighted roll, falling through to whatever
  // band has entries if the preferred band is empty.
  const bandRoll = rand();
  const ordered: Array<typeof scored> = [];
  if (bandRoll < WEIGHT_STANDARD) {
    ordered.push(standard, easy, scare);
  } else if (bandRoll < WEIGHT_STANDARD + WEIGHT_EASY) {
    ordered.push(easy, standard, scare);
  } else {
    ordered.push(scare, standard, easy);
  }
  for (const band of ordered) {
    if (band.length > 0) {
      return band[Math.floor(rand() * band.length)]!.name;
    }
  }
  // No enemy in any in-range band. Pick the closest-to-1.5x
  // option from the full scored list — degrades gracefully
  // rather than returning null and silently dropping the
  // encounter. Above-3x entries DO get picked here as a last
  // resort, but only when no in-range enemy exists; in
  // practice the pool widths prevent this.
  scored.sort((a, b) => Math.abs(a.ratio - 1.5) - Math.abs(b.ratio - 1.5));
  return scored[0]?.name ?? null;
}

/** Convenience type matching the gameStore's CurrentScene
 *  shape — kept narrow so this module doesn't have to import
 *  the full interface (which lives inside gameStore.ts). The
 *  caller builds the overlay scene by spreading the base
 *  scene and overriding these fields. */
export interface OverlaySceneOverrides {
  ambientNouns: string[];
  displayedAmbientNouns: string[];
  enemies: Enemy[];
  enemyHps: number[];
  enemyAmbushUsed: boolean[];
  activeEnemyIdx: number;
  hooks: never[];
  // OTA-088's roomInvestigationTable seed is handled by the
  // gameStore's existing beginScene-style seed path called
  // explicitly post-swap; this module just sets up the noun
  // pool.
}

export function buildOverlayOverrides(
  overlay: ElevatedOverlay,
  encounterEnemy: Enemy | null,
): OverlaySceneOverrides {
  const enemies = encounterEnemy ? [encounterEnemy] : [];
  return {
    ambientNouns: [...overlay.ambientNouns],
    displayedAmbientNouns: [...overlay.ambientNouns],
    enemies,
    enemyHps: enemies.map((e) => e.hp),
    enemyAmbushUsed: enemies.map(() => false),
    activeEnemyIdx: 0,
    hooks: [] as never[],
  };
}

/** OTA-090 — build a VendorInstance from a trader-overlay
 *  template. Randomizes each offer's price within its min/max
 *  range so the prices feel hand-rolled per visit. Demeanor +
 *  faction pass through so steal mechanics + standing changes
 *  fire normally on engagement. */
export function buildOverlayTrader(
  overlay: ElevatedOverlay,
  rand: () => number = Math.random,
): VendorInstance | null {
  if (overlay.kind !== 'trader' || !overlay.trader) return null;
  const t = overlay.trader;
  const offers = t.offers.map((o) => ({
    itemName: o.itemName,
    price: o.priceMin + Math.floor(rand() * (o.priceMax - o.priceMin + 1)),
  }));
  return {
    id: `overlay_${overlay.id}_${Date.now().toString(36)}`,
    name: t.vendorName,
    title: t.vendorTitle,
    faction: t.faction,
    description: t.vendorDescription,
    offers,
    demeanor: t.demeanor,
  };
}

/** OTA-090 — build a Hook from a lookout-overlay template.
 *  The hook plants on the overlay scene's hooks array so the
 *  player can tap any of the lookout's nouns to engage the
 *  rumor thread. The hook itself drives all the standard
 *  hook-progression mechanics (stages, rewards, dedup). */
export function buildOverlayLookoutHook(overlay: ElevatedOverlay): Hook | null {
  if (overlay.kind !== 'lookout' || !overlay.lookout) return null;
  const l = overlay.lookout;
  return {
    id: `overlay_hook_${overlay.id}_${Date.now().toString(36)}`,
    kind: l.hookKind,
    nouns: [...l.hookNouns],
    plantedLine: l.pitchLine,
    stage: 0,
    resolved: false,
  };
}

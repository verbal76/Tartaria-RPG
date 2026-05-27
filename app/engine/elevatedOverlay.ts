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

export interface ElevatedOverlay {
  id: string;
  /** Single-paragraph arrival narration. Printed when the
   *  player enters the overlay (right after the climb-top
   *  "you reach the top" line). */
  arrivalLine: string;
  /** Ambient noun pool for the overlay scene. These become
   *  the SearchModal chips while the player is up there.
   *  Investigates resolve through the standard OTA-071+
   *  table seed using these nouns. */
  ambientNouns: string[];
  /** 0..1. Chance the overlay spawns an encounter on entry. */
  encounterChance: number;
  /** Enemy name pool (must match entries in app/data/enemies
   *  /enemies.json by exact .name). One pick if the chance
   *  rolls in. */
  encounterPool: string[];
}

// Pool. Roughly tuned so the average overlay has ~50%
// encounter chance, and an open-sky outcome is the rare
// rest beat. Per-template ambientNouns hit the OTA-080
// keyword map where possible (vessel for 'copper bowl',
// vegetation for 'roost feathers', etc.) so the
// investigation table seeds useful entries.
const OVERLAYS: ElevatedOverlay[] = [
  {
    id: 'nook',
    arrivalLine: 'At the top you find a nook carved into the structure — sheltered, lived-in, currently occupied.',
    ambientNouns: ['nook', 'scratched markings', 'dried bones', 'scraps of cloth'],
    encounterChance: 0.65,
    encounterPool: ['Aetheric Bat', 'Aetheric Raven', 'Aetheric Spider'],
  },
  {
    id: 'vantage',
    arrivalLine: 'A wind-scoured ledge. Someone watched the road from here, and not long ago — the charcoal sketches are barely smudged.',
    ambientNouns: ['ledge', 'scope stand', 'charcoal sketches', 'spent flare'],
    encounterChance: 0.30,
    encounterPool: ['Aetheric Shrike', 'Aetheric Harpy'],
  },
  {
    id: 'collector',
    arrivalLine: 'A copper bowl is bolted to the apex, half-filled with Aether residue. The air shimmers, like heat over a road.',
    ambientNouns: ['copper bowl', 'aether residue', 'ozone tang', 'bent rivets'],
    encounterChance: 0.50,
    encounterPool: ['Aetheric Apparition', 'Aetheric Ooze'],
  },
  {
    id: 'sealed_door',
    arrivalLine: 'A door at the top of the climb. The hinges are mounted on this side — as if to keep something IN.',
    ambientNouns: ['sealed door', 'rusted hinges', 'pry marks', 'sigil'],
    encounterChance: 0.20,
    encounterPool: ['Stone Warden', 'Aetheric Gargoyle'],
  },
  {
    id: 'roost',
    arrivalLine: 'A bowl-shaped roost matted with feathers and bone fragments. The smell is still warm.',
    ambientNouns: ['roost', 'feathers', 'bone fragments', 'matted nest'],
    encounterChance: 0.80,
    encounterPool: ['Aetheric Raven', 'Aetheric Harpy', 'Aetheric Shrike'],
  },
  {
    id: 'open_sky',
    arrivalLine: 'Just sky. The view, and nothing else but the wind, and what the wind knows.',
    ambientNouns: ['sky', 'wind', 'view', 'distant spires'],
    encounterChance: 0.05,
    encounterPool: ['Aetheric Apparition'],
  },
];

const OVERLAY_BY_ID: Record<string, ElevatedOverlay> = Object.fromEntries(
  OVERLAYS.map((o) => [o.id, o]),
);

/** Probability of any overlay firing at all on a top-tier
 *  climb. Below this rolls, the player just gets the
 *  existing climb-top loot beat and the cleared chip — no
 *  overlay. ~30% keeps overlays as a flavor moment, not a
 *  guaranteed combat tax per climb. */
const OVERLAY_TRIGGER_CHANCE = 0.30;

/** Returns an overlay template when the trigger roll fires
 *  AND a random pick lands, otherwise null. Caller is
 *  responsible for actually building + swapping the scene. */
export function rollElevatedOverlay(rand: () => number = Math.random): ElevatedOverlay | null {
  if (rand() >= OVERLAY_TRIGGER_CHANCE) return null;
  const pick = OVERLAYS[Math.floor(rand() * OVERLAYS.length)] ?? null;
  return pick;
}

export function overlayById(id: string): ElevatedOverlay | null {
  return OVERLAY_BY_ID[id] ?? null;
}

/** Pick an enemy NAME from the overlay's encounter pool, or
 *  null when the encounter roll didn't fire. Caller looks up
 *  the actual catalog entry via app/data/enemies/enemies.json
 *  and instantiates the Enemy + hp. */
export function rollOverlayEncounter(
  overlay: ElevatedOverlay,
  rand: () => number = Math.random,
): string | null {
  if (rand() >= overlay.encounterChance) return null;
  const pool = overlay.encounterPool;
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)] ?? null;
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

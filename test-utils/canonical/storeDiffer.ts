// P2 — store differ (channel A).
//
// Subscribes to the REAL production store notification path
// (app/state/storeNotify.ts's coalesceLogNotifications middleware, which
// gameStore.ts installs at `create<GameStore>(coalesceLogNotifications(...))`,
// gameStore.ts:7981). useGameStore.subscribe is the middleware's own
// replacement API.subscribe (storeNotify.ts:87-92) — this is the same
// subscribe path production code (TTSController, AudioController) already
// uses, not a new hook into the store.
//
// Hard requirements (Phase 2B, UNK-P2-08):
//   - try/catch around the listener body — never throw into the game action.
//   - never call set()/setState() from the listener.
//   - never mutate the state objects it receives (read-only fields copied
//     into plain records, no writes back into `next`/`prev`).
//   - never consume Math.random (no calls into rng.ts or Math.random here).
//   - notifications are recorded under the CURRENT actionSeq, so intermediate
//     notifications inside one action are grouped together.

import type { GameStore } from '../../app/state/gameStore';

const WATCHED_KEYS: ReadonlyArray<keyof GameStore> = [
  'player',
  'currentScene',
  'mainQuest' as keyof GameStore, // present on GameStore via `player.mainQuest`; kept for symmetry, see extractPlayerFields
  'pendingRolls',
  'worldMemory',
  'chapterCard',
  'pendingFork',
  'currentScreen',
];

export interface StoreDiffEntry {
  seq: number;
  actionSeq: number;
  /** Shallow before/after for each PlayerCharacter field the canonical
   *  telemetry plan names (Phase 2, section F/M): hp, hpMax, stamina, stats,
   *  statProgress, statusEffects, tc, inventory, equipped, dog, golem,
   *  companion, earnedTitles, titleProgress, factionStanding, hoursElapsed,
   *  mainQuest (coresRecovered / guardiansDefeated), currentLocationId,
   *  gridX/gridY. */
  player: { before: Record<string, unknown> | null; after: Record<string, unknown> | null };
  scene: { before: unknown; after: unknown };
  pendingRolls: { before: unknown; after: unknown };
  currentScreen: { before: unknown; after: unknown };
}

const PLAYER_FIELDS: readonly string[] = [
  'hp', 'hpMax', 'stamina', 'staminaMax', 'stats', 'statProgress', 'statusEffects',
  'tc', 'inventory', 'equipped', 'dog', 'golem', 'companion',
  'earnedTitles', 'titleProgress', 'factionStanding', 'hoursElapsed',
  'mainQuest', 'currentLocationId', 'gridX', 'gridY', 'mapX', 'mapY',
  'corruption', 'menace', 'dead', 'deathId',
];

function extractPlayerFields(player: unknown): Record<string, unknown> | null {
  if (!player || typeof player !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const k of PLAYER_FIELDS) out[k] = (player as Record<string, unknown>)[k];
  return out;
}

let entries: StoreDiffEntry[] = [];
let seq = 0;
let currentActionSeq = 0;
let unsubscribe: (() => void) | null = null;

export function setDifferActionSeq(n: number): void {
  currentActionSeq = n;
}

export function attachStoreDiffer(store: { subscribe: (l: (n: GameStore, p: GameStore) => void) => () => void }): void {
  if (unsubscribe) return;
  unsubscribe = store.subscribe((next, prev) => {
    try {
      seq += 1;
      entries.push({
        seq,
        actionSeq: currentActionSeq,
        player: {
          before: extractPlayerFields(prev.player),
          after: extractPlayerFields(next.player),
        },
        scene: { before: prev.currentScene, after: next.currentScene },
        pendingRolls: { before: prev.pendingRolls, after: next.pendingRolls },
        currentScreen: { before: prev.currentScreen, after: next.currentScreen },
      });
    } catch {
      // A telemetry failure must never break the game action that triggered
      // this notification (Phase 2B, P5 proof #10).
    }
  });
}

export function detachStoreDiffer(): void {
  unsubscribe?.();
  unsubscribe = null;
}

export function getStoreDiffLog(): readonly StoreDiffEntry[] {
  return entries;
}

export function resetStoreDiffLog(): void {
  entries = [];
  seq = 0;
  currentActionSeq = 0;
}

// P2 — pure in-memory snapshots (Phase 2 §H).
//
// NEVER calls persist()/hydrate(). A snapshot is a plain deep-clone of the
// parts of getState() the boundary needs, taken synchronously with no I/O
// and no RNG. Deep-clone is JSON round-trip: every field this codebase
// stores on `player`/`currentScene`/`worldMemory`/`mainQuest` is already
// JSON-serializable save data (app/engine/saveSystem.ts writes the same
// shapes to AsyncStorage as JSON), so this is a faithful, side-effect-free
// copy — not a re-derivation.

import type { GameStore } from '../../app/state/gameStore';

export type SnapshotBoundary =
  | 'S0-fresh-baseline'
  | 'S1-tutorial-complete'
  | 'S-leg-start'
  | 'S-guardian-pre'
  | 'S-guardian-post'
  | 'S-core'
  | 'S-fuse'
  | 'S-craft'
  | 'S-reinforce'
  | 'S-equipment-change'
  | 'S-fail'
  | 'S-recover'
  | 'S-nexus-arrival'
  | 'S-pre-ending'
  | 'S-final';

export interface CanonicalSnapshot {
  seq: number;
  boundary: SnapshotBoundary;
  actionSeq: number;
  virtualTimeMs: number;
  guardianCapitalId: string | null;
  guardianOrdinal: number | null;
  player: unknown;
  currentScene: unknown;
  worldMemory: unknown;
  mainQuest: unknown;
  /** What the player could see at this instant — filled by the caller from
   *  buildPlayerView(), so a snapshot can answer "what did the player know". */
  playerViewSummary: unknown;
}

let snapshots: CanonicalSnapshot[] = [];
let seq = 0;

function deepClone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

export function takeSnapshot(
  boundary: SnapshotBoundary,
  state: Pick<GameStore, 'player' | 'currentScene' | 'worldMemory'>,
  ctx: { actionSeq: number; virtualTimeMs: number; guardianCapitalId?: string | null; guardianOrdinal?: number | null; playerViewSummary?: unknown },
): CanonicalSnapshot {
  seq += 1;
  const snap: CanonicalSnapshot = {
    seq,
    boundary,
    actionSeq: ctx.actionSeq,
    virtualTimeMs: ctx.virtualTimeMs,
    guardianCapitalId: ctx.guardianCapitalId ?? null,
    guardianOrdinal: ctx.guardianOrdinal ?? null,
    player: deepClone(state.player),
    currentScene: deepClone(state.currentScene),
    worldMemory: deepClone(state.worldMemory),
    mainQuest: deepClone((state.player as unknown as { mainQuest?: unknown } | null)?.mainQuest ?? null),
    playerViewSummary: deepClone(ctx.playerViewSummary ?? null),
  };
  snapshots.push(snap);
  return snap;
}

export function getSnapshots(): readonly CanonicalSnapshot[] {
  return snapshots;
}

export function resetSnapshots(): void {
  snapshots = [];
  seq = 0;
}

// P2 — log mirror (channel B).
//
// Mirrors app/state/gameStore.ts's `gameLog` array by ENTRY IDENTITY, the
// same pattern test-utils/playerWalker.ts's Walker.syncFeed() already uses
// (the store trims gameLog from the front — MAX_LOG_IN_MEMORY — so an index
// goes stale mid-run). Unlike Walker.feed(), this mirror keeps EVERY channel,
// including 'debug', because the canonical telemetry plan wants the full
// production log, not the player-visible subset.
//
// Reads AFTER the log-coalescing microtask has settled (storeNotify.ts's
// `flushLogNotify()` / the natural microtask queue), per Phase 2B's
// UNK-P2-08 finding that log-only writes are held behind a microtask.
// Callers should `await Promise.resolve()` (or rely on the next real store
// write, which flushes automatically) before calling `sync()` if they need
// the very latest entries.
//
// This module does not append log lines and does not call gameStore actions.

interface LogEntry {
  channel: string;
  text: string;
}

let mirror: Array<{ actionSeq: number; channel: string; text: string }> = [];
let lastEntry: unknown = null;
let currentActionSeq = 0;

export function setLogMirrorActionSeq(n: number): void {
  currentActionSeq = n;
}

/** Pull any new entries from `gameLog` into the mirror. Safe to call often. */
export function syncLogMirror(gameLog: readonly LogEntry[]): void {
  let start = 0;
  if (lastEntry) {
    const i = (gameLog as readonly unknown[]).indexOf(lastEntry);
    if (i >= 0) start = i + 1;
  }
  for (let i = start; i < gameLog.length; i++) {
    const e = gameLog[i]!;
    mirror.push({ actionSeq: currentActionSeq, channel: e.channel, text: e.text });
  }
  if (gameLog.length) lastEntry = gameLog[gameLog.length - 1];
}

export function getLogMirror(): ReadonlyArray<{ actionSeq: number; channel: string; text: string }> {
  return mirror;
}

export function resetLogMirror(): void {
  mirror = [];
  lastEntry = null;
  currentActionSeq = 0;
}

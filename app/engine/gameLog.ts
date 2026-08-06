import type { GameLogEntry, LogChannel } from './types';
import { appendLogToDisk } from './saveSystem';

/** ⚠ THE CHANNELS THE PLAYER NEVER SEES, and the ONE place that list lives.
 *
 *  `cognitive` (MiniLM emotion/intent) and `debug` (parser, combat range
 *  transitions) are diagnostic — kept in the on-disk log so COPY ALL and the
 *  owner's pasted logs still carry them, never rendered in the feed.
 *
 *  Moved out of AdventureFeed by the phases 0-5 playtest harness, which needs
 *  to grade the feed the PLAYER reads. Its first run failed on repetition and
 *  on prose ratio, and both were the harness counting `arbiter: template
 *  (reason=qwen-not-ready)` — a debug line, 21 times, that nobody has ever
 *  seen. A second copy of this list in the harness would have drifted from the
 *  screen's copy the first time either changed, so there is one copy. */
export const HIDDEN_LOG_CHANNELS: ReadonlySet<LogChannel> = new Set(['cognitive', 'debug']);

/** What the player actually reads. */
export function isPlayerVisibleChannel(channel: LogChannel): boolean {
  return !HIDDEN_LOG_CHANNELS.has(channel);
}

let counter = 0;

export function makeEntry(channel: LogChannel, text: string, meta?: Record<string, unknown>): GameLogEntry {
  counter += 1;
  return {
    id: `${Date.now()}_${counter}`,
    ts: Date.now(),
    channel,
    text,
    meta,
  };
}

export function formatEntry(entry: GameLogEntry): string {
  const d = new Date(entry.ts).toISOString();
  return `[${d}] [${entry.channel}] ${entry.text}`;
}

export async function persistEntry(entry: GameLogEntry): Promise<void> {
  await appendLogToDisk(formatEntry(entry));
}

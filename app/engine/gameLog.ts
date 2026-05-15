import type { GameLogEntry, LogChannel } from './types';
import { appendLogToDisk } from './saveSystem';

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

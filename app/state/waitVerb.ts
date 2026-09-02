// ⚠⚠⚠ OTA-1627 — THE HOUR CAN BE WAITED FOR.
//
// Found by the player-shaped walker on three whisper chains (Petra, Dazak,
// Imogen): it walked the course, stood on the camp's tile, and the game said
// "This is Petra's spot — but the camp is cold. Petra works here after dark
// (8 pm to 2 am). Wait for the hour and look again." So it waited the only way
// the game offered — `rest` — and the Arbiter refused it: "Your wind is full,
// your wounds are closed, and the Aether carries no shadow on you. Save the
// hours." And `wait` printed "You hold still. Tartaria holds still longer."
// and moved the clock by nothing. The game told the player to wait for an
// hour and had no verb that passed one.
//
// `wait` now passes time: an hour by default, "wait 3 hours", or "wait until
// dark" / "wait until morning" — and then looks at the ground again where the
// player stands, so a camp whose hour has come wakes without a step off and
// back on. The cold-camp line names the verb it wants.

import type { GameStore } from './gameStore';

export const DARK_HOUR = 20;
export const DAWN_HOUR = 6;

/** 7 → "7 am", 19 → "7 pm", 0 → "12 am" — the clock the cold-camp line speaks. */
export function formatHour(h: number): string {
  const n = ((h % 24) + 24) % 24;
  return `${n % 12 || 12} ${n < 12 ? 'am' : 'pm'}`;
}

/** How long "wait …" asks for, from the typed line and the current hour of day. */
export function waitSpan(raw: string, hourOfDay: number): { hours: number; label: string } {
  const t = raw.toLowerCase();
  const until = (h: number): number => ((h - hourOfDay + 24) % 24) || 24;
  // "wait until 7 am" / "until 8 pm" / "until 19" — the hour the cold-camp line names.
  const clock = t.match(/\b(?:until|till|to|for)\s+(\d{1,2})(?::00)?\s*(am|pm)?\b/);
  if (clock) {
    let h = parseInt(clock[1]!, 10) % 24;
    if (clock[2] === 'pm' && h < 12) h += 12;
    if (clock[2] === 'am' && h === 12) h = 0;
    return { hours: until(h), label: `until ${formatHour(h)}` };
  }
  if (/\b(dark|night|nightfall|dusk|evening|sundown|sunset)\b/.test(t)) return { hours: until(DARK_HOUR), label: 'until dark' };
  if (/\b(dawn|morning|daylight|sunrise|first light|daybreak)\b/.test(t)) return { hours: until(DAWN_HOUR), label: 'until morning' };
  const m = t.match(/\b(\d+)\s*(h|hr|hrs|hour|hours)?\b/);
  if (m) {
    const n = Math.max(1, Math.min(24, parseInt(m[1]!, 10)));
    return { hours: n, label: n === 1 ? 'an hour' : `${n} hours` };
  }
  return { hours: 1, label: 'an hour' };
}

/** The verb, as the store runs it: pass the hours, then look at the ground again. */
export function runWait(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  raw: string,
): void {
  const player = get().player;
  if (!player) return;
  const sc = get().currentScene;
  const inCombat = (sc?.enemies ?? []).some((_, i) => (sc!.enemyHps[i] ?? 0) > 0 && !(sc!.enemyKnockedOut?.[i] ?? false));
  if (inCombat) {
    get().appendLog('arbiter', `The Arbiter does not look away from the fight. "Wait? Nothing here has agreed to that. Deal with what's in front of you first."`);
    return;
  }
  const hour = Math.floor((player.hoursElapsed ?? 0) % 24);
  const { hours, label } = waitSpan(raw, hour);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const GS = require('./gameStore') as typeof import('./gameStore');
  set((s) => (s.player ? { player: GS.advanceTime(s.player, hours) } : s));
  get().appendLog('world', `You wait ${label}. Tartaria waits with you.`);
  const p = get().player!;
  GS.resolveWhispersForTile(get, set, p.mapX ?? 0, p.mapY ?? 0);
}

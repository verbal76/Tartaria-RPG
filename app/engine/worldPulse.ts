// OTA-844 [world that moves offscreen] — the WORLD PULSE. Tartaria used to sit still
// between the player's actions: factions never gained or lost ground on their own, and
// nothing happened that the player didn't cause. This gives the world a slow heartbeat.
// Every so often (in in-game time) one faction's fortunes rise — pressing its rivals
// down and lifting its allies — and word of it reaches the player as a rumour. Over a
// long game the balance of power visibly shifts without the player lifting a finger.
//
// Deterministic by design: the tick index (derived from elapsed in-game time) selects
// which faction moves, so there's no RNG — the pulse is reproducible and testable, and
// two saves that played the same hours see the same tides.

export interface FactionMeta {
  id: string;
  name: string;
  rivals?: string[];
  allies?: string[];
}

export interface WorldTideResult {
  /** The updated momentum map (clamped). */
  tides: Record<string, number>;
  /** A short in-world rumour describing the shift, or '' if nothing moved. */
  rumor: string;
  /** The faction that rose this tick (id), or null. */
  moverId: string | null;
}

export const TIDE_MIN = -5;
export const TIDE_MAX = 5;

const clampTide = (v: number) => Math.max(TIDE_MIN, Math.min(TIDE_MAX, v));

/** Advance the world one pulse. `tickIndex` selects the mover deterministically, so the
 *  same (factions, tickIndex) always yields the same result. Rivals of the mover lose a
 *  point of momentum; allies gain one; the mover gains one. */
export function nextWorldTide(
  factions: readonly FactionMeta[],
  tides: Record<string, number>,
  tickIndex: number,
): WorldTideResult {
  const next: Record<string, number> = { ...tides };
  if (factions.length === 0) return { tides: next, rumor: '', moverId: null };

  const mover = factions[((tickIndex % factions.length) + factions.length) % factions.length]!;
  next[mover.id] = clampTide((next[mover.id] ?? 0) + 1);
  for (const r of mover.rivals ?? []) next[r] = clampTide((next[r] ?? 0) - 1);
  for (const a of mover.allies ?? []) next[a] = clampTide((next[a] ?? 0) + 1);

  const nameOf = (id: string) => factions.find((f) => f.id === id)?.name;
  const risenRival = (mover.rivals ?? []).map(nameOf).filter(Boolean)[0];
  const rumor = risenRival
    ? `Word on the wind: the ${mover.name} press their claim across the waste, and the ${risenRival} give ground.`
    : `Word on the wind: the ${mover.name} grow bolder across the waste.`;

  return { tides: next, rumor, moverId: mover.id };
}

/** Human tide label for a faction's current momentum (for the faction-standings UI). */
export function tideLabel(momentum: number | undefined): { glyph: string; word: string } | null {
  const m = momentum ?? 0;
  if (m >= 3) return { glyph: '▲▲', word: 'ascendant' };
  if (m > 0) return { glyph: '▲', word: 'rising' };
  if (m <= -3) return { glyph: '▼▼', word: 'collapsing' };
  if (m < 0) return { glyph: '▼', word: 'waning' };
  return null;
}

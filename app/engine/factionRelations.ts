// OTA-853 [emergent grudges] — factions get STANDING WITH EACH OTHER, the same
// concept the player already has with factions. A symmetric matrix, −100…+100,
// seeded from the lore (rivals start hostile, allies start friendly, everyone else
// at 0) and then EARNED: every time one faction's patrol guts another's, their
// standing drops a notch, and the grudge is now real data that makes the next
// meeting likelier to be blood. Two neutral factions can rub raw through pure
// friction until they're at war — a grudge from zero, willed by nothing but RNG.
//
// This drives WHO FIGHTS WHOM. A faction's power (the war scoreboard) stays in
// worldMemory.factionTides and is what wins/losses move — this module owns the
// relationships; the store owns the power + the patrols. Pure + deterministic.

import type { FactionMeta } from './worldPulse';

/** relations[a][b] === relations[b][a]; we always store under BOTH keys so a lookup
 *  from either side is O(1). −100 (blood feud) … +100 (sworn). 0 = neutral. */
export type RelationsMatrix = Record<string, Record<string, number>>;

export const REL_MIN = -100;
export const REL_MAX = 100;
/** At or below this, two factions' patrols fight on sight. */
export const HOSTILE_AT = -20;
/** At or above this, they stand together (won't fight; may aid). */
export const FRIENDLY_AT = 20;

const clampRel = (v: number) => Math.max(REL_MIN, Math.min(REL_MAX, v));

export function getRelation(m: RelationsMatrix | undefined, a: string, b: string): number {
  if (!m || a === b) return 0;
  return m[a]?.[b] ?? 0;
}

/** Return a NEW matrix with a↔b nudged by delta (both directions kept in sync). */
export function adjustRelation(m: RelationsMatrix, a: string, b: string, delta: number): RelationsMatrix {
  if (a === b) return m;
  const rowA = { ...(m[a] ?? {}) };
  const rowB = { ...(m[b] ?? {}) };
  const v = clampRel((rowA[b] ?? 0) + delta);
  rowA[b] = v;
  rowB[a] = v;
  return { ...m, [a]: rowA, [b]: rowB };
}

/** Seed the matrix from the lore: rivals start hostile, allies friendly. Only real
 *  faction ids (the JSON also lists descriptive pseudo-ids). Idempotent-ish — call
 *  once when the matrix is empty. */
export function seedRelations(factions: readonly FactionMeta[]): RelationsMatrix {
  const realIds = new Set(factions.map((f) => f.id));
  let m: RelationsMatrix = {};
  for (const f of factions) {
    for (const r of f.rivals ?? []) if (realIds.has(r)) m = adjustRelation(m, f.id, r, -30);
    for (const a of f.allies ?? []) if (realIds.has(a)) m = adjustRelation(m, f.id, a, 30);
  }
  return m;
}

export interface MeetOutcome {
  /** Do the two patrols fight? */
  fight: boolean;
  /** Was this a FRICTION clash between non-hostile factions (which seeds a new grudge)? */
  friction: boolean;
}

/** Decide what happens when two factions' patrols cross paths, from their current
 *  standing. Hostiles fight on sight. Friendlies pass. Everyone in between has a
 *  FRICTION chance to come to blows — and if they do, a grudge is born from zero.
 *  Deterministic via `seed`. */
export function meetOutcome(relation: number, seed: number): MeetOutcome {
  if (relation <= HOSTILE_AT) return { fight: true, friction: false };
  if (relation >= FRIENDLY_AT) return { fight: false, friction: false };
  // Neutral-ish: the closer to hostile, the likelier the friction sparks.
  // frictionChance ranges ~8% (near friendly) … ~35% (near hostile).
  const t = (FRIENDLY_AT - relation) / (FRIENDLY_AT - HOSTILE_AT); // 0..1, higher = closer to hostile
  const chance = 0.08 + 0.27 * Math.max(0, Math.min(1, t));
  const roll = Math.abs(Math.sin(seed * 24.719) ) % 1;
  return roll < chance ? { fight: true, friction: true } : { fight: false, friction: false };
}

/** How much a clash deepens the grudge. A friction clash cuts deeper per-hit (a fresh
 *  wound between former neutrals escalates fast); an existing feud grinds slower. */
export function grudgeDelta(friction: boolean): number {
  return friction ? -12 : -6;
}

/** A compact human label for a relation value, for the World board. */
export function relationLabel(relation: number): { word: string; hostile: boolean } {
  if (relation <= -60) return { word: 'blood feud', hostile: true };
  if (relation <= HOSTILE_AT) return { word: 'at war', hostile: true };
  if (relation < 0) return { word: 'frayed', hostile: false };
  if (relation < FRIENDLY_AT) return { word: 'wary peace', hostile: false };
  if (relation < 60) return { word: 'allied', hostile: false };
  return { word: 'sworn', hostile: false };
}

/** The sharpest live grudges (most-hostile pairs first), for the relations board.
 *  Each unordered pair once. */
export function topGrudges(
  m: RelationsMatrix | undefined,
  factions: readonly FactionMeta[],
  limit = 6,
): { a: string; b: string; relation: number }[] {
  if (!m) return [];
  const seen = new Set<string>();
  const out: { a: string; b: string; relation: number }[] = [];
  for (const fa of factions) {
    for (const fb of factions) {
      if (fa.id >= fb.id) continue;
      const key = `${fa.id}|${fb.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rel = getRelation(m, fa.id, fb.id);
      if (rel !== 0) out.push({ a: fa.id, b: fb.id, relation: rel });
    }
  }
  return out.sort((x, y) => x.relation - y.relation).slice(0, limit);
}

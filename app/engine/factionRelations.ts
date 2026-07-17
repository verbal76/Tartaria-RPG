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
  for (const [a, b, v] of LORE_RELATIONS) {
    if (realIds.has(a) && realIds.has(b)) m = adjustRelation(m, a, b, v);
  }
  return m;
}

// OTA-867 — the LORE-AUTHORED seed. The JSON's rivals/allies arrays were sparse and full of
// descriptive pseudo-ids ("anyone_paying", "mud_monarchs_when_unpaid") that the old seed
// silently dropped — so most factions started with NO relationships and the board only ever
// showed grudges. This table encodes the politics the faction descriptions actually spell
// out, weighted by how the lore frames each bond, so all 9 have real grudges AND alliances.
//   • Suppressors (bury Tartaria): Mud Monarchs + Conspiracy Architects — funded, aligned.
//   • Religious Reclamation: True Tartarians + Servants of Giants + Tartarian Revivalists.
//   • Scholars: Forgotten Order + Stone Builders ("cooperate on engineering").
//   • Eternal Dynasty: supremacist, FRIENDLESS — against every other faction.
//   • Reclaimers Guild: mercenary, near-neutral, only sour on the Suppressors.
export const LORE_RELATIONS: ReadonlyArray<readonly [string, string, number]> = [
  // ── Alliances ──
  ['mud_monarchs', 'conspiracy_architects', 45],       // funded + aligned: the strongest bond
  ['true_tartarians', 'servants_of_giants', 35],       // "loosely affiliated"
  ['servants_of_giants', 'tartarian_revivalists', 30],
  ['true_tartarians', 'tartarian_revivalists', 22],
  ['forgotten_order', 'stone_builders', 30],           // "cooperate on engineering"
  ['forgotten_order', 'true_tartarians', 15],          // "partial" ally
  // ── Mud Monarchs vs the reclaimers (they want it all buried) ──
  ['mud_monarchs', 'forgotten_order', -35],
  ['mud_monarchs', 'true_tartarians', -30],
  ['mud_monarchs', 'eternal_dynasty', -35],
  ['mud_monarchs', 'servants_of_giants', -25],
  ['mud_monarchs', 'stone_builders', -25],
  ['mud_monarchs', 'tartarian_revivalists', -30],
  ['mud_monarchs', 'reclaimers_guild', -15],
  // ── Conspiracy Architects vs the revealers ──
  ['conspiracy_architects', 'forgotten_order', -30],
  ['conspiracy_architects', 'reclaimers_guild', -20],
  ['conspiracy_architects', 'true_tartarians', -25],
  ['conspiracy_architects', 'tartarian_revivalists', -30],
  ['conspiracy_architects', 'servants_of_giants', -20],
  ['conspiracy_architects', 'stone_builders', -20],
  ['conspiracy_architects', 'eternal_dynasty', -15],
  // ── Eternal Dynasty: "only the pure deserve to inherit" — friendless, against all ──
  ['eternal_dynasty', 'forgotten_order', -30],
  ['eternal_dynasty', 'true_tartarians', -30],
  ['eternal_dynasty', 'servants_of_giants', -22],
  ['eternal_dynasty', 'stone_builders', -20],
  ['eternal_dynasty', 'tartarian_revivalists', -22],
  ['eternal_dynasty', 'reclaimers_guild', -15],
  // ── Intra-family cracks the lore names ──
  ['tartarian_revivalists', 'forgotten_order', -25],   // extremists vs moderates
  ['tartarian_revivalists', 'stone_builders', -12],    // "regarded as extremists by most"
];

/** OTA-867 — ENEMY OF MY ENEMY. When `winner` guts `loser`, every faction that ALSO holds
 *  `loser` as an enemy — and isn't already at war with the winner — warms a little toward the
 *  winner. Co-belligerents drift into alliance over time, so the board's alliances EVOLVE
 *  rather than sit at their lore seed. The "not already at war with the winner" guard means a
 *  faction hostile to everyone (the Dynasty) never backs into a friendship through a shared
 *  foe, and seeded rivalries aren't thawed by convenience. Pure + deterministic. */
export const SHARED_ENEMY_WARMTH = 3;
export function warmSharedEnemy(
  m: RelationsMatrix,
  winner: string,
  loser: string,
  factions: readonly FactionMeta[],
): RelationsMatrix {
  let next = m;
  for (const f of factions) {
    if (f.id === winner || f.id === loser) continue;
    if (getRelation(next, f.id, loser) > HOSTILE_AT) continue;   // f is not an enemy of the loser
    if (getRelation(next, f.id, winner) <= HOSTILE_AT) continue; // f is already at war with the winner
    next = adjustRelation(next, winner, f.id, SHARED_ENEMY_WARMTH);
  }
  return next;
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

// Every unordered faction pair with a non-zero relation, once.
function relationPairs(
  m: RelationsMatrix,
  factions: readonly FactionMeta[],
): { a: string; b: string; relation: number }[] {
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
  return out;
}

/** The sharpest live grudges (most-hostile NEGATIVE pairs first), for the relations board. */
export function topGrudges(
  m: RelationsMatrix | undefined,
  factions: readonly FactionMeta[],
  limit = 6,
): { a: string; b: string; relation: number }[] {
  if (!m) return [];
  return relationPairs(m, factions)
    .filter((p) => p.relation < 0)
    .sort((x, y) => x.relation - y.relation)
    .slice(0, limit);
}

/** OTA-867 — the strongest live ALLIANCES (most-friendly POSITIVE pairs first), for the
 *  relations board. Only genuine standing-together (≥ FRIENDLY_AT), so a mild +5 warming
 *  isn't paraded as an alliance yet. */
export function topAlliances(
  m: RelationsMatrix | undefined,
  factions: readonly FactionMeta[],
  limit = 6,
): { a: string; b: string; relation: number }[] {
  if (!m) return [];
  return relationPairs(m, factions)
    .filter((p) => p.relation >= FRIENDLY_AT)
    .sort((x, y) => y.relation - x.relation)
    .slice(0, limit);
}

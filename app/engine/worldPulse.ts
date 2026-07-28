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
  // OTA-849 — the factions JSON lists both REAL faction ids and descriptive
  // pseudo-ids in rivals/allies (e.g. "anyone_paying", "mud_monarchs_when_unpaid").
  // Only move momentum for ids that are actual factions, so the tides map never
  // fills with phantom entries that can't be shown or acted on.
  const realIds = new Set(factions.map((f) => f.id));
  next[mover.id] = clampTide((next[mover.id] ?? 0) + 1);
  for (const r of mover.rivals ?? []) if (realIds.has(r)) next[r] = clampTide((next[r] ?? 0) - 1);
  for (const a of mover.allies ?? []) if (realIds.has(a)) next[a] = clampTide((next[a] ?? 0) + 1);

  const nameOf = (id: string) => factions.find((f) => f.id === id)?.name;
  const risenRival = (mover.rivals ?? []).filter((r) => realIds.has(r)).map(nameOf).filter(Boolean)[0];
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

// ── OTA-849 [tides get teeth] ────────────────────────────────────────────────
// The World Pulse momentum stops being cosmetic here: these pure helpers turn a
// faction's tide into concrete gameplay pressure (vendor prices, raid odds, raid
// size). Kept pure + exported so the store just reads the number and the tests
// can pin the curve.

/** A vendor whose faction is ASCENDANT charges more (confidence, scarcity); a
 *  WANING faction's vendors discount to move goods. 4% per momentum point →
 *  ±20% at the ±5 extremes. Multiplies in beside the corruption markup / CHA
 *  discount at the buy site. */
export function tideVendorPriceMult(momentum: number | undefined): number {
  const m = Math.max(TIDE_MIN, Math.min(TIDE_MAX, momentum ?? 0));
  return 1 + 0.04 * m;
}

/** How large a raiding party a faction fields, escalating with its ascendancy.
 *  A quiet faction sends a pair; an ascendant one (tide → +5) fields up to five.
 *  This is the "escalating raids" curve — raids get deadlier as the raider grows
 *  on the World Pulse. */
export function raidPartySize(momentum: number | undefined): number {
  const m = Math.max(TIDE_MIN, Math.min(TIDE_MAX, momentum ?? 0));
  return Math.max(1, Math.min(5, 2 + Math.ceil(Math.max(0, m) / 2)));
}

export interface RaidPlan {
  /** The faction mounting the raid. */
  raiderId: string;
  raiderName: string;
  /** The player-favored faction whose rival is raiding (why it's happening). */
  provokedAllyId: string;
  provokedAllyName: string;
  /** Party size, already escalated by the raider's tide. */
  partySize: number;
}

/** Choose who raids the player, if anyone. The raider is a RIVAL of a faction the
 *  player is positively standing with (you took a side; their enemies come for
 *  you). Among eligible rivals, the most ASCENDANT one is chosen (escalating —
 *  a faction on the rise is the one with the reach to send a war party). Returns
 *  null when the player has no positive standings or those allies have no real,
 *  hostile rivals. Pure + deterministic given its inputs. */
export function pickRaid(
  factions: readonly FactionMeta[],
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
  tides: Record<string, number>,
  positiveThreshold = 10,
): RaidPlan | null {
  const realIds = new Set(factions.map((f) => f.id));
  const nameOf = (id: string) => factions.find((f) => f.id === id)?.name ?? id;
  const standingOf = (id: string) => standings.find((s) => s.factionId === id)?.standing ?? 0;
  // Factions the player is favored by.
  const allies = factions.filter((f) => standingOf(f.id) >= positiveThreshold);
  // Candidate raiders: real rivals of any favored faction the player is NOT also
  // friendly with (don't send a faction you like to attack you).
  const candidates = new Map<string, { raiderId: string; provokedAllyId: string }>();
  for (const ally of allies) {
    for (const rivalId of ally.rivals ?? []) {
      if (!realIds.has(rivalId)) continue;
      if (standingOf(rivalId) >= positiveThreshold) continue;
      if (!candidates.has(rivalId)) candidates.set(rivalId, { raiderId: rivalId, provokedAllyId: ally.id });
    }
  }
  if (candidates.size === 0) return null;
  // Most ascendant raider wins (escalation). Ties broken by id for determinism.
  const chosen = [...candidates.values()].sort((a, b) => {
    const ta = tides[a.raiderId] ?? 0;
    const tb = tides[b.raiderId] ?? 0;
    if (tb !== ta) return tb - ta;
    return a.raiderId.localeCompare(b.raiderId);
  })[0]!;
  return {
    raiderId: chosen.raiderId,
    raiderName: nameOf(chosen.raiderId),
    provokedAllyId: chosen.provokedAllyId,
    provokedAllyName: nameOf(chosen.provokedAllyId),
    partySize: raidPartySize(tides[chosen.raiderId] ?? 0),
  };
}

/** The faction's strongest RIVAL (by the player's own standing — the rival they're
 *  already most invested in), used to route the "up with rivals" half of a kill's
 *  standing shift. Returns null if the faction has no real rivals. */
export function strongestRivalOf(
  factions: readonly FactionMeta[],
  factionId: string,
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
): string | null {
  const realIds = new Set(factions.map((f) => f.id));
  const meta = factions.find((f) => f.id === factionId);
  const rivals = (meta?.rivals ?? []).filter((r) => realIds.has(r));
  if (rivals.length === 0) return null;
  const standingOf = (id: string) => standings.find((s) => s.factionId === id)?.standing ?? 0;
  return [...rivals].sort((a, b) => {
    const d = standingOf(b) - standingOf(a);
    return d !== 0 ? d : a.localeCompare(b);
  })[0]!;
}

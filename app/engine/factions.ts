import type { Faction, FactionStanding } from './types';
import factionsData from '../data/factions/factions.json';
import { resolveTable } from './contentPack';

/** The BUILT-IN faction list. Prefer `liveFactions()` / `findFaction()` for anything that
 *  must honor an author's uploaded Factions table — this raw export is the default only. */
export const FACTIONS = factionsData as Faction[];

/** The ACTIVE faction list: author override → installed generic default → built-in. Every
 *  faction lookup (standings, rep propagation, UI names) must go through this so a reskin's
 *  uploaded Factions table actually drives the faction systems. */
export function liveFactions(): Faction[] {
  return resolveTable<Faction>('factions', FACTIONS) as Faction[];
}

// arb119 — reputation is a bounded standing, never an unbounded resource. The join
// threshold is 20; ±100 is "fully allied / sworn enemy". Clamping here stops the
// vendor-purchase (+1) / gift (+5) rep farms from running standing to infinity.
export const REP_MAX = 100;
export const REP_MIN = -100;

// Some faction data entries use suffixed names ("_situational",
// "_partial", "_when_unpaid") or virtual references ("anyone_paying",
// "conspiracy_architects") that aren't real faction IDs. Normalize so
// we can match against the canonical id list.
function normalizeRef(ref: string): string {
  return ref.replace(/_situational$|_partial$|_when_unpaid$/i, '');
}

function isKnownFactionId(id: string): boolean {
  return liveFactions().some((f) => f.id === id);
}

export function findFaction(id: string): Faction | null {
  return liveFactions().find((f) => f.id === id) ?? null;
}

/**
 * Apply a reputation change with `withFaction`, propagating ±half to
 * allies and the opposite ±half to rivals. Unknown faction refs are
 * ignored. Returns a new factionStanding array.
 */
export function applyRepChange(
  standing: readonly FactionStanding[],
  withFaction: string,
  delta: number,
): { standing: FactionStanding[]; changed: { factionId: string; delta: number; newStanding: number }[] } {
  const faction = findFaction(withFaction);
  if (!faction) return { standing: standing.map((s) => ({ ...s })), changed: [] };

  const allyIds = new Set(
    (faction.allies ?? [])
      .map(normalizeRef)
      .filter(isKnownFactionId),
  );
  const rivalIds = new Set(
    (faction.rivals ?? [])
      .map(normalizeRef)
      .filter(isKnownFactionId),
  );

  const halfDelta = Math.trunc(delta / 2);
  const changed: { factionId: string; delta: number; newStanding: number }[] = [];
  // arb119 — clamp to [REP_MIN, REP_MAX]; report the REAL delta after clamping so a
  // log never claims a bump that the cap swallowed.
  const apply = (row: FactionStanding, raw: number): FactionStanding => {
    const newStanding = Math.max(REP_MIN, Math.min(REP_MAX, row.standing + raw));
    const realDelta = newStanding - row.standing;
    if (realDelta !== 0) changed.push({ factionId: row.factionId, delta: realDelta, newStanding });
    return { ...row, standing: newStanding };
  };

  const next: FactionStanding[] = standing.map((row) => {
    if (row.factionId === withFaction) return apply(row, delta);
    if (allyIds.has(row.factionId) && halfDelta !== 0) return apply(row, halfDelta);
    if (rivalIds.has(row.factionId) && halfDelta !== 0) return apply(row, -halfDelta);
    return row;
  });

  return { standing: next, changed };
}

export function getStanding(standing: readonly FactionStanding[], factionId: string): number {
  return standing.find((s) => s.factionId === factionId)?.standing ?? 0;
}

// Minimum standing to be admitted into a faction. Most factions in the
// rulebook have softer "demonstrate loyalty" criteria; for the gameplay
// loop we use a flat reputation threshold and let narrative quests
// supplement later.
export const JOIN_THRESHOLD = 20;

export function meetsJoinThreshold(standing: readonly FactionStanding[], factionId: string): boolean {
  return getStanding(standing, factionId) >= JOIN_THRESHOLD;
}

import type { Faction, FactionStanding } from './types';
import factionsData from '../data/factions/factions.json';

export const FACTIONS = factionsData as Faction[];

// Some faction data entries use suffixed names ("_situational",
// "_partial", "_when_unpaid") or virtual references ("anyone_paying",
// "conspiracy_architects") that aren't real faction IDs. Normalize so
// we can match against the canonical id list.
function normalizeRef(ref: string): string {
  return ref.replace(/_situational$|_partial$|_when_unpaid$/i, '');
}

function isKnownFactionId(id: string): boolean {
  return FACTIONS.some((f) => f.id === id);
}

export function findFaction(id: string): Faction | null {
  return FACTIONS.find((f) => f.id === id) ?? null;
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

  const next: FactionStanding[] = standing.map((row) => {
    if (row.factionId === withFaction) {
      const newStanding = row.standing + delta;
      changed.push({ factionId: row.factionId, delta, newStanding });
      return { ...row, standing: newStanding };
    }
    if (allyIds.has(row.factionId) && halfDelta !== 0) {
      const newStanding = row.standing + halfDelta;
      changed.push({ factionId: row.factionId, delta: halfDelta, newStanding });
      return { ...row, standing: newStanding };
    }
    if (rivalIds.has(row.factionId) && halfDelta !== 0) {
      const newStanding = row.standing - halfDelta;
      changed.push({ factionId: row.factionId, delta: -halfDelta, newStanding });
      return { ...row, standing: newStanding };
    }
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

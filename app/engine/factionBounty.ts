// OTA-850 [faction patrols & bounties] — the bounty layer on top of the living
// world (OTA-849). A faction you're favored with will pay you to thin the ranks of
// its rivals — and the contract names WHERE: the rival's own outpost. Accepting
// routes you there, straight into patrol country, so the reward comes with real
// exposure. Pure + testable; the store handles offer / accept / route / turn-in.

import type { FactionMeta } from './worldPulse';

export interface FactionBounty {
  /** The favored faction paying the bounty. */
  giverFactionId: string;
  giverName: string;
  /** The rival faction whose members are the quarry. */
  targetFactionId: string;
  targetName: string;
  /** WHERE to hunt them — the rival's outpost. Accepting routes the player here. */
  targetLocationId: string;
  targetLocationName: string;
  /** How many of the target's members to defeat, and how many so far. */
  count: number;
  progress: number;
  /** Payout on turn-in. */
  rewardTc: number;
  rewardRep: number;
}

/** Bounty size + pay scale with the target's ascendancy — a rising faction is a
 *  harder, better-paid job. Kept pure so the test can pin the curve. */
export function bountyTerms(targetTide: number | undefined): { count: number; rewardTc: number; rewardRep: number } {
  const t = Math.max(0, Math.min(5, targetTide ?? 0));
  const count = 3 + Math.ceil(t / 2); // 3 at neutral → up to 6 for an ascendant target
  return { count, rewardTc: 40 + count * 15, rewardRep: 8 + Math.floor(t / 2) };
}

/**
 * Offer a bounty, if one fits. Mirrors pickRaid's eligibility (a faction you
 * FAVOR whose real, unfriendly rival can be targeted) but flips the framing: the
 * favored faction is the GIVER, its rival the QUARRY, and the quarry's outpost the
 * destination. Among eligible rivals the most ASCENDANT is chosen (the biggest,
 * best-paid contract). Returns null when the player favors no one, or those allies'
 * rivals have no outpost on the map. Pure + deterministic.
 */
export function pickBounty(
  factions: readonly FactionMeta[],
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
  outpostOf: (factionId: string) => string | undefined,
  locationName: (locationId: string) => string,
  tides: Record<string, number>,
  positiveThreshold = 10,
): FactionBounty | null {
  return bountyCandidates(factions, standings, outpostOf, locationName, tides, positiveThreshold)[0] ?? null;
}

/** OTA-859 — a stable identity for a bounty (giver + quarry + place), so the store can
 *  tell whether an offer is already on the player's slate and never stack a duplicate. */
export function bountyKey(b: Pick<FactionBounty, 'giverFactionId' | 'targetFactionId' | 'targetLocationId'>): string {
  return `${b.giverFactionId}>${b.targetFactionId}@${b.targetLocationId}`;
}

/** Collect every eligible bounty candidate (a favored faction's real, unfriendly rival
 *  with a known outpost), most ASCENDANT first. Shared by pickBounty + listBounties. */
function bountyCandidates(
  factions: readonly FactionMeta[],
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
  outpostOf: (factionId: string) => string | undefined,
  locationName: (locationId: string) => string,
  tides: Record<string, number>,
  positiveThreshold: number,
): FactionBounty[] {
  const realIds = new Set(factions.map((f) => f.id));
  const nameOf = (id: string) => factions.find((f) => f.id === id)?.name ?? id;
  const standingOf = (id: string) => standings.find((s) => s.factionId === id)?.standing ?? 0;
  const allies = factions.filter((f) => standingOf(f.id) >= positiveThreshold);
  // Candidate quarries: real rivals of a favored faction that the player is NOT also
  // friendly with AND that have a known outpost to route to. Keyed by giver>target so
  // two different allies who both hate the same rival each post their OWN contract.
  const candidates = new Map<string, { targetId: string; giverId: string; loc: string }>();
  for (const ally of allies) {
    for (const rivalId of ally.rivals ?? []) {
      if (!realIds.has(rivalId)) continue;
      if (standingOf(rivalId) >= positiveThreshold) continue;
      const loc = outpostOf(rivalId);
      if (!loc) continue;
      const k = `${ally.id}>${rivalId}`;
      if (!candidates.has(k)) candidates.set(k, { targetId: rivalId, giverId: ally.id, loc });
    }
  }
  const sorted = [...candidates.values()].sort((a, b) => {
    const d = (tides[b.targetId] ?? 0) - (tides[a.targetId] ?? 0);
    return d !== 0 ? d : (a.giverId + a.targetId).localeCompare(b.giverId + b.targetId);
  });
  return sorted.map((c) => {
    const terms = bountyTerms(tides[c.targetId] ?? 0);
    return {
      giverFactionId: c.giverId,
      giverName: nameOf(c.giverId),
      targetFactionId: c.targetId,
      targetName: nameOf(c.targetId),
      targetLocationId: c.loc,
      targetLocationName: locationName(c.loc),
      count: terms.count,
      progress: 0,
      rewardTc: terms.rewardTc,
      rewardRep: terms.rewardRep,
    };
  });
}

/**
 * OTA-859 — the whole bounty BOARD: every eligible contract at once (most ascendant
 * first), so the player can stack several and grind faction standing instead of being
 * handed a single job. `max` caps how many are surfaced. Pure + deterministic.
 */
export function listBounties(
  factions: readonly FactionMeta[],
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
  outpostOf: (factionId: string) => string | undefined,
  locationName: (locationId: string) => string,
  tides: Record<string, number>,
  max = 4,
  positiveThreshold = 10,
): FactionBounty[] {
  return bountyCandidates(factions, standings, outpostOf, locationName, tides, positiveThreshold).slice(0, Math.max(0, max));
}

/** Would this kill count toward the active bounty? (target-faction member, bounty
 *  not already complete.) */
export function killCountsForBounty(bounty: FactionBounty | undefined, killedFactionId: string | undefined): boolean {
  if (!bounty || !killedFactionId) return false;
  return bounty.targetFactionId === killedFactionId && bounty.progress < bounty.count;
}

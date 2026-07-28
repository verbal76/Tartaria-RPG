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
  /** OTA-862 — in-game hour the contract was accepted. Set on accept; used to expire the
   *  bounty after its deadline of in-game time. Optional so a legacy bounty migrated from
   *  the old single-slot model (no stamp) simply never times out. */
  acceptedAtHour?: number;
  /** OTA-863 — this contract's own deadline in in-game hours. DISTANCE-AWARE: set on
   *  accept to 24 + the tiles between the player and the quarry's outpost, so a far job
   *  isn't impossible to reach in time. Falls back to the 24h base when absent. */
  deadlineHours?: number;
}

/** OTA-862 — the BASE window a bounty gives you, before distance is added. In-game time
 *  only advances when you act, so this is a real "get moving" pressure, not a wall-clock
 *  countdown that drains while the app is closed. */
export const BOUNTY_DEADLINE_HOURS = 24;

/** OTA-863 — a bounty's full deadline: 24h base + one hour per tile you must cross to
 *  reach the quarry's outpost (travel is ~0.25h/tile, but the buffer also covers the
 *  fights the route runs you through, the kills at the far end, and the odd rest). */
export function bountyDeadlineFor(distanceTiles: number): number {
  return BOUNTY_DEADLINE_HOURS + Math.max(0, Math.round(distanceTiles));
}

/** Hours of in-game time left on a bounty (Infinity for a legacy one with no stamp). */
export function bountyHoursLeft(bounty: FactionBounty, nowHour: number): number {
  if (bounty.acceptedAtHour === undefined) return Infinity;
  return (bounty.deadlineHours ?? BOUNTY_DEADLINE_HOURS) - (nowHour - bounty.acceptedAtHour);
}

/** Has the contract's in-game deadline passed? */
export function bountyExpired(bounty: FactionBounty, nowHour: number): boolean {
  return bountyHoursLeft(bounty, nowHour) <= 0;
}

/** OTA-862 — how much HARDER a bounty gets from a faction that dislikes you. Every
 *  faction offers work regardless of standing (no gate), but the less they trust you the
 *  more they demand before they'll pay: a disliked faction makes you prove yourself. The
 *  flip side — because it's a tougher job for a faction you're on the outs with, it pays
 *  MORE standing, so bounties are the road back into any faction's good graces. */
export function giverDifficulty(giverStanding: number | undefined): number {
  const s = giverStanding ?? 0;
  if (s >= 20) return 0;   // favored — the easy, trusting job
  if (s >= 0) return 1;    // neutral/acquainted
  if (s >= -20) return 2;  // disliked
  return 3;                // hostile — prove yourself
}

/** Bounty size + pay scale with the target's ascendancy (a rising faction is a harder,
 *  better-paid job) AND with the GIVER's opinion of you (a faction that dislikes you
 *  demands more kills but pays more standing). Kept pure so the test can pin the curve.
 *  giverStanding defaults to a favored value so the ascendancy-only curve is unchanged. */
export function bountyTerms(
  targetTide: number | undefined,
  giverStanding = 100,
): { count: number; rewardTc: number; rewardRep: number } {
  const t = Math.max(0, Math.min(5, targetTide ?? 0));
  const diff = giverDifficulty(giverStanding);
  const count = 3 + Math.ceil(t / 2) + diff; // 3 at neutral/favored → +tide, +dislike
  return { count, rewardTc: 40 + count * 15, rewardRep: 8 + Math.floor(t / 2) + diff };
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
): FactionBounty | null {
  return bountyCandidates(factions, standings, outpostOf, locationName, tides)[0] ?? null;
}

/** OTA-859 — a stable identity for a bounty (giver + quarry + place), so the store can
 *  tell whether an offer is already on the player's slate and never stack a duplicate. */
export function bountyKey(b: Pick<FactionBounty, 'giverFactionId' | 'targetFactionId' | 'targetLocationId'>): string {
  return `${b.giverFactionId}>${b.targetFactionId}@${b.targetLocationId}`;
}

/** Collect every eligible bounty candidate (a favored faction's real, unfriendly rival
 *  with a known outpost), most ASCENDANT first. Shared by pickBounty + listBounties. */
// OTA-862 — a faction won't hire you to hunt someone you're genuinely allied with. At or
// above this standing with the QUARRY, that contract is withheld (you'd never take it).
const FRIENDLY_QUARRY = 20;

function bountyCandidates(
  factions: readonly FactionMeta[],
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
  outpostOf: (factionId: string) => string | undefined,
  locationName: (locationId: string) => string,
  tides: Record<string, number>,
): FactionBounty[] {
  const realIds = new Set(factions.map((f) => f.id));
  const nameOf = (id: string) => factions.find((f) => f.id === id)?.name ?? id;
  const standingOf = (id: string) => standings.find((s) => s.factionId === id)?.standing ?? 0;
  // OTA-862 — EVERY faction posts bounties on its real rivals; there is NO giver-standing
  // gate. A faction that dislikes you still offers work — just a harder job (bountyTerms
  // scales the count with how little they trust you). The only quarry we withhold is one
  // the player is genuinely allied with (they'd never hunt a friend). Keyed by giver>target
  // so two factions that both hate the same rival each post their OWN contract.
  const candidates = new Map<string, { targetId: string; giverId: string; loc: string }>();
  for (const giver of factions) {
    for (const rivalId of giver.rivals ?? []) {
      if (!realIds.has(rivalId)) continue;
      if (standingOf(rivalId) >= FRIENDLY_QUARRY) continue; // don't hunt your allies
      const loc = outpostOf(rivalId);
      if (!loc) continue;
      const k = `${giver.id}>${rivalId}`;
      if (!candidates.has(k)) candidates.set(k, { targetId: rivalId, giverId: giver.id, loc });
    }
  }
  // Favored givers' jobs surface first (easier, better-liked), then by target ascendancy.
  const sorted = [...candidates.values()].sort((a, b) => {
    const sg = standingOf(b.giverId) - standingOf(a.giverId);
    if (sg !== 0) return sg;
    const d = (tides[b.targetId] ?? 0) - (tides[a.targetId] ?? 0);
    return d !== 0 ? d : (a.giverId + a.targetId).localeCompare(b.giverId + b.targetId);
  });
  return sorted.map((c) => {
    const terms = bountyTerms(tides[c.targetId] ?? 0, standingOf(c.giverId));
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
): FactionBounty[] {
  return bountyCandidates(factions, standings, outpostOf, locationName, tides).slice(0, Math.max(0, max));
}

/** Would this kill count toward the active bounty? (target-faction member, bounty
 *  not already complete.) */
export function killCountsForBounty(bounty: FactionBounty | undefined, killedFactionId: string | undefined): boolean {
  if (!bounty || !killedFactionId) return false;
  return bounty.targetFactionId === killedFactionId && bounty.progress < bounty.count;
}

// OTA-1188 — THE BOARD YOU FROZE IS THE DEAL YOU GET.
//
// Owner: "if you see that faction bounty is allied with the faction that you're trying
// to build rep with and you jump back to the world tab… and accept that bounty then it
// locks it in. so even if they go to war one second later, you still had that locked in
// faction standing outcome."
//
// ⚠ THE PROBLEM THIS SOLVES IS THAT TWO SYSTEMS DISAGREED ABOUT WHO IS ALLIED WITH WHOM.
//   • `worldMemory.factionRelations` — a live −100…+100 matrix, symmetric by
//     construction, seeded from lore and then EARNED as patrols gut each other. It is
//     what the GRUDGES & ALLIANCES panel shows and what decides who fights whom.
//   • `factions.json`'s `allies` / `rivals` arrays — a static hand-written list that is
//     ASYMMETRIC (Forgotten Order counts the Reclaimers a friend; the Reclaimers list
//     nobody) and never changes.
// `applyRepChange` read the STATIC one. So the panel showed a living war while the
// player's standing spilled along treaties that stopped being true. Owner: "which one is
// the truth?" — the matrix is, everywhere else in the game. This makes it the truth here.
//
// ⚠ THE JSON ARRAYS ARE NOT DELETED AND MUST NOT BE. They are the SEED for the matrix
// (see LORE_RELATIONS in factionRelations.ts). They are the old treaties everyone started
// from; they are simply no longer consulted about who is allied *now*.

import { getRelation, FRIENDLY_AT, HOSTILE_AT } from './factionRelations';
import type { RelationsMatrix } from './factionRelations';

/** The politics a contract was accepted under, frozen onto it at accept time.
 *  ⚠ This is the COMPLETE set of live data the payout needs. Everything else a bounty
 *  pays — count, TC, rep, deadline — is already computed and stamped when it is accepted;
 *  `applyRepChange`'s ally/rival lookup was the only thing still being read live at
 *  completion. That is why freezing the VIEW is sufficient and the world need not stop. */
export interface BountyPolitics {
  /** Factions at or above FRIENDLY_AT with the giver when the board was frozen. */
  allies: string[];
  /** Factions at or below HOSTILE_AT with the giver when the board was frozen. */
  rivals: string[];
  /** In-game hour the snapshot was taken, so a stale one can be told from a fresh one. */
  takenAtHour: number;
}

/** Resolve who counts as friend and foe of `factionId` RIGHT NOW, from the live matrix.
 *  ⚠ Symmetric for free: the matrix stores every pair under both keys, so this can never
 *  produce the one-way relationships the JSON had. There is nothing to hand-author. */
export function politicsOf(
  relations: RelationsMatrix | undefined,
  factionId: string,
  allFactionIds: readonly string[],
  nowHour: number,
): BountyPolitics {
  const allies: string[] = [];
  const rivals: string[] = [];
  for (const other of allFactionIds) {
    if (other === factionId) continue;
    const rel = getRelation(relations, factionId, other);
    if (rel >= FRIENDLY_AT) allies.push(other);
    else if (rel <= HOSTILE_AT) rivals.push(other);
  }
  return { allies, rivals, takenAtHour: nowHour };
}

/** ⚠ Whether a contract can be accepted AT ALL from where the player stands.
 *
 *  Two refusals, both from the owner, and they are different rules:
 *   1. `standing_on_target` — the quarry's outpost IS the tile under your feet. This
 *      produced the 0-tile contract that started all of this: a 24-hour window with no
 *      travel in it, against a 6-hour patrol cooldown, needing 3-9 kills. Not winnable.
 *   2. `camping` — you already closed a contract at this outpost and have not closed one
 *      anywhere else since. Owner: "otherwise people are just going to keep standing
 *      there, collecting bounties."
 *
 *  ⚠ Returns a REASON, never a bare false. Every refusal in this game has to be able to
 *  say why — the whole of OTA-1187 was a control that refused in silence. */
export type AcceptRefusal =
  | { ok: true }
  | { ok: false; reason: 'standing_on_target'; locationName: string }
  | { ok: false; reason: 'camping'; outpostName: string }
  | { ok: false; reason: 'board_running' };

export interface AcceptContext {
  /** True when the player's grid cell equals the target outpost's canon cell. */
  atTargetCell: boolean;
  targetLocationName: string;
  /** The outpost whose board is being read, and where the last contract was closed. */
  currentOutpostId?: string;
  currentOutpostName?: string;
  /** Set by the store when a contract completed at this outpost and none has completed
   *  elsewhere since. */
  lastClearedOutpostId?: string;
  /** The GRUDGES & ALLIANCES board is frozen, so a snapshot exists to lock in. */
  boardFrozen: boolean;
}

export function canAcceptBounty(ctx: AcceptContext): AcceptRefusal {
  // ⚠ Order matters and is deliberate: the board-frozen check is LAST. A player who is
  // standing on the target should be told THAT, not sent to freeze a board that will
  // refuse them anyway. Fix the reason they can actually act on.
  if (ctx.atTargetCell) {
    return { ok: false, reason: 'standing_on_target', locationName: ctx.targetLocationName };
  }
  if (
    ctx.lastClearedOutpostId
    && ctx.currentOutpostId
    && ctx.lastClearedOutpostId === ctx.currentOutpostId
  ) {
    return { ok: false, reason: 'camping', outpostName: ctx.currentOutpostName ?? 'this outpost' };
  }
  if (!ctx.boardFrozen) return { ok: false, reason: 'board_running' };
  return { ok: true };
}

/** The player-facing line for a refusal. ⚠ `board_running` deliberately POINTS AT THE
 *  BUTTON — owner: "you should get a pop-up that wording guides you down to that pause
 *  button." A refusal that does not say what to do next is the same defect in a politer
 *  voice. */
export function refusalLine(r: AcceptRefusal): string | null {
  if (r.ok) return null;
  switch (r.reason) {
    case 'standing_on_target':
      return `You're standing in ${r.locationName} — that's the ground the contract names. Take this one from somewhere else; a job you're already on top of gives you no road and no time to work with.`;
    case 'camping':
      return `You already collected on the ${r.outpostName} board. Close a contract somewhere else before they'll deal with you here again — they want the work spread, not a hired hand loitering at the gate.`;
    case 'board_running':
      return `The war is still moving. Scroll down to GRUDGES & ALLIANCES and FREEZE THE BOARD — whoever stands together at that moment is who your standing carries to. Read it, then take the job.`;
  }
}

/** ⚠ THE DEADLINE NEEDS A TERM FOR THE JOB, NOT ONLY THE JOURNEY.
 *
 *  Travel is priced by HOURS_PER_TILE_TRUE (OTA-1185). The WAITING is not priced at all,
 *  and it is the real cost of a short contract: `maybePatrolAmbush` will not fire twice
 *  inside PATROL_MIN_HOURS, so a 6-hour floor sits between you and each engagement no
 *  matter what you do. A 3-kill and a 9-kill contract used to get identical time.
 *
 *  ⚠ This is per REQUIRED KILL, not per patrol, and deliberately conservative: a patrol
 *  is 2-4 bodies, so one engagement can close several. Pricing per kill over-pays a
 *  lucky player and merely pays a fair one — which is the right direction for a clock
 *  that already lapsed a contract the owner was one kill from finishing. */
export const HOURS_PER_REQUIRED_KILL = 6;

export function killWindowHours(count: number): number {
  return Math.max(0, Math.round(count)) * HOURS_PER_REQUIRED_KILL;
}

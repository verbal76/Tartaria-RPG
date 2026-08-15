// OTA-1116 — THE ELITE SWAP. The last of OTA-1113's nine dials to find a
// consumer, and the one the industry survey the owner brought back rates
// highest: "three grunts become one elite" — the CONTENT lever rather than a
// multiplier.
//
// ⚠ WHY THIS IS THE GOOD ONE, IN THIS GAME SPECIFICALLY.
// A multiplier (`pack`, or more HP) makes the same fight LONGER. This project
// has been bitten by that once already — it is combatStress's stall tail, and
// it is why `scaledPackSize` is welded to `scaledSwingCap`. A content swap makes
// the fight DIFFERENT. Four raiders is a targeting and attrition problem: who
// is closest, who is shooting, does the swing cap let me finish this. One
// Reaver-Captain is a puzzle: what is it weak to, do I have that coating, is my
// resist profile wrong for this fight. Those are different verbs, and the
// second set of systems — the bestiary, weakness tags, coatings, resistances —
// is most valuable against ONE durable body and nearly irrelevant against four
// disposable ones. The swap is the encounter shape that makes them pay.
// It is also structurally incapable of the stall tail: one body is one
// attacker, so the swing cap can never bind. It is the ANTI-`pack`, which is
// why a tier that runs both hot is more varied than either alone.
//
// ⚠ AND THE PART THAT MAKES IT HONEST: NO NEW BALANCE CONSTANTS.
// The temptation is to invent an "elite multiplier". We do not need one,
// because `scaleEncounterForContext` already encodes the exact rule this needs:
//   - a PACK is anchored on one solo-equivalent plus 22% per extra body, and
//     gets only 0.6x of the attack/AC bump "because there are several of them";
//   - a SOLO foe gets the full bump.
// So the elite is defined as: the pack's OWN total HP budget, concentrated into
// one body, hitting at the solo rate. Same durability the party would have had,
// same shipped math, no second opinion about what "elite" is worth. If the pack
// numbers are ever retuned, the elite retunes with them for free.
//
// ⚠ WHAT THE AUDIT FOUND, so a future editor does not re-litigate it:
//  - There are NO "kill N of X" objectives in the game. Faction quests are
//    fetch / escort / staged, and a staged kill advances ONE stage per kill —
//    so a collapsed party makes those two combat quests take more encounters,
//    never fewer completions, and never blocks.
//  - The +1 max-HP milestone keys on DISTINCT enemy types, not total kills
//    (arb119, anti-farm). Three identical grunts were only ever worth one type,
//    so collapsing them costs nothing — and a NAMED elite is a new type, which
//    is a second reason to name them rather than ship a silent stat inflation.
//  - Hunts match their target by EXACT NAME. This module must never touch a
//    hunt or boss spawn: a renamed target would silently never complete. The
//    party path is the only caller, and bosses are excluded from it upstream.
//  - Loot IS per-body, and that is the one place the carry has to be explicit.
//    `eliteReplaced` rides on the enemy so the defeat path can pay the party's
//    worth rather than one corpse's. Paying less for a harder fight is the
//    exact fake-difficulty trap the survey warns about.

import type { Enemy, Rarity } from './types';

/** Below this, a "swap" is just subtraction — two bodies becoming one is a
 *  weaker encounter, not a different one. Three is the smallest party where
 *  concentrating the budget actually changes the shape of the fight. */
export const ELITE_MIN_PARTY = 3;

const RARITY_LADDER: readonly Rarity[] = ['Common', 'Uncommon', 'Rare', 'Legendary'];

/** One tier up, capped. The elite is a better body, not an unbounded one. */
export function rarityStepUp(r: Rarity | undefined): Rarity {
  const i = RARITY_LADDER.indexOf(r ?? 'Common');
  if (i < 0) return 'Uncommon';
  return RARITY_LADDER[Math.min(i + 1, RARITY_LADDER.length - 1)]!;
}

// The elite is NAMED. An unannounced stat-inflated grunt reads as a bug; a
// named body reads as an event, gives the bestiary something to record, and
// (per the audit) counts as a new distinct type on the HP-milestone track.
// Keyed off the party noun the caller already passes, so a new party type gets
// a sensible title without touching this table.
const ELITE_NOUN: Record<string, string> = {
  Patrol: 'Patrol Warden',
  Raider: 'Reaver-Captain',
  Intruder: 'Bloodied Hand',
  Guard: 'Guard-Marshal',
  Soldier: 'Line-Breaker',
};

export function eliteNounFor(noun: string): string {
  return ELITE_NOUN[noun] ?? `${noun} Warden`;
}

export interface EliteSwapOptions {
  /** The `elite` dial for this character's tier. 0 disables entirely. */
  eliteMult: number;
  /** Injectable for tests; defaults to Math.random. */
  rand?: () => number;
}

/** Should this party arrive as one body instead? Probability, not a
 *  multiplier — `owed` is 0, so the default run never sees this at all. */
export function shouldSwapToElite(partySize: number, opts: EliteSwapOptions): boolean {
  if (!(opts.eliteMult > 0)) return false;
  if (partySize < ELITE_MIN_PARTY) return false;
  const rand = opts.rand ?? Math.random;
  return rand() < Math.min(1, opts.eliteMult);
}

/**
 * Fold an ALREADY-SCALED party into one body.
 *
 * ⚠ Takes the scaled party, not the raw one, on purpose: its summed HP IS the
 * budget, straight from `scaleEncounterForContext`'s pack branch. The caller
 * then re-scales the returned single body through the SOLO branch, which grants
 * the full attack/AC bump, and restores this HP — so the elite is exactly as
 * durable as the party was and hits like the one foe it now is.
 *
 * Returns null when the party is empty or contains a boss (bosses are never
 * swapped — see the header).
 */
export function foldPartyIntoElite(
  scaledParty: readonly Enemy[],
  opts: { factionName: string; noun: string },
): { elite: Enemy; hpBudget: number } | null {
  if (scaledParty.length < ELITE_MIN_PARTY) return null;
  if (scaledParty.some((e) => e.boss)) return null;

  const hpBudget = scaledParty.reduce((sum, e) => sum + Math.max(1, e.hp), 0);
  // Promote the TOUGHEST body in the party — the elite should read as one of
  // them who is more than the rest, not as an unrelated creature.
  const seed = [...scaledParty].sort((a, b) => b.hp - a.hp)[0]!;
  const title = eliteNounFor(opts.noun);
  const name = `${opts.factionName} ${title}`;

  const elite: Enemy = {
    ...seed,
    name,
    hp: hpBudget,
    rarity: rarityStepUp(seed.rarity),
    // ⚠ The carry. Loot is rolled per corpse, so without this the player is
    // paid one body's worth for a whole party's fight — which is the exact
    // fake-difficulty trap this OTA is supposed to avoid.
    eliteReplaced: scaledParty.length,
    aliases: [
      ...new Set([
        ...(seed.aliases ?? []),
        title.toLowerCase(),
        opts.noun.toLowerCase(),
        'elite', 'captain', 'warden',
      ]),
    ],
  };
  return { elite, hpBudget };
}

/** Extra loot rolls this corpse owes for the bodies it replaced. One body's
 *  worth is already paid by the normal rarity roll, so the carry is n-1. */
export function eliteExtraLootRolls(enemy: Pick<Enemy, 'eliteReplaced'>): number {
  const n = enemy.eliteReplaced ?? 0;
  return n > 1 ? n - 1 : 0;
}

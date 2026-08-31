// missionRoles — OTA-1581. WHO IS STANDING THERE, and what it costs to talk
// them out of it.
//
// ⚠⚠⚠ THE ROSTER EXISTS BECAUSE THE STAGES NAMED PEOPLE THE GAME DID NOT HAVE.
// 114 stages across hunts, mysteries and storylines carry an `npcName`, and
// before OTA-1580 that field was read in exactly ONE place in the codebase —
// questStage.ts, building the hint string `find <name>`. Nobody was ever placed.
// OTA-1580 wrote the people down; this file is how the game looks them up.
//
// ⚠⚠ TWO KINDS OF PERSON, AND THE DIFFERENCE IS LOAD-BEARING.
//
//   A POST — "the Reclaimer broker", "the Dynasty enforcer". 42 of them, each
//   authored in mission-roles.json with a name and two successors. Owner's
//   rules: one person across every stage that names the post; alive only while
//   the mission is live; and if you KILL them, the next mission's holder of that
//   post knows what you did and is harder to talk down.
//
//   AN INDIVIDUAL — "Old Mira", "Brother Ammon", "Jarn the dive-master". 19 of
//   them, already fixtures of the world with proper names of their own.
//
// ⚠ AND ONLY A POST CAN BE KILLED ON THE CARD. A post has a successor by
// construction; an individual does not, and "take and kill" on Old Mira would
// leave a hole in the world that no later mission could fill — the stage after
// hers still expects her to be at her stall. So `canKill` is false for anyone
// without a post, and the card simply does not offer the button. That is the
// honest reading of the owner's rule 7: *"if he's in another mission after that
// and you kill him, somebody else should take his place."* Somebody else can
// only take a PLACE.

import rolesData from '../data/npcs/mission-roles.json';
import type { PersuadeStakes } from './missionEncounter';

interface RoleRow {
  role: string;
  title: string;
  faction: string | null;
  name: string;
  successors: string[];
}

const ROWS: RoleRow[] = (rolesData as { roles: RoleRow[] }).roles ?? [];

const BY_ROLE = new Map<string, RoleRow>();
for (const r of ROWS) BY_ROLE.set(r.role.trim().toLowerCase(), r);

/** Every authored post, in file order. Exported for the gate and the suite. */
export function missionRoles(): readonly RoleRow[] {
  return ROWS;
}

/** The person a stage's `npcName` refers to, as the card must present them. */
export interface MissionPerson {
  /** How the card names them THIS time — the original, or whichever successor
   *  the ledger says is holding the post now. */
  name: string;
  /** The post, addressable on its own: "talk to the reclaimer broker" works as
   *  well as "talk to Sabin". Owner's rule 1. */
  title: string;
  /** The post's key, or null when this is an authored individual. */
  role: string | null;
  faction: string | null;
  /** True when the player killed whoever held this before. */
  isSuccessor: boolean;
  /** How many holders of this post the player has killed. Prices the persuade. */
  predecessorsKilled: number;
  /** ⚠ Only a POST can be killed — see the file note. */
  canKill: boolean;
}

/** The ledger's key for a name. Posts are keyed by post, so every stage naming
 *  the same post shares one count; an individual keys on themselves. */
export function ledgerKeyFor(npcName: string): string {
  const row = BY_ROLE.get((npcName ?? '').trim().toLowerCase());
  return row ? row.role : (npcName ?? '').trim();
}

/**
 * ⚠⚠ THE LEDGER OUTLIVES THE MISSION, DELIBERATELY. The owner's rules 3 and 7
 * pull against each other — the people exist "only while the mission is live",
 * but a successor in a LATER mission has to know what you did in an earlier one.
 * The resolution: the PERSON is per-mission, the ROLE's body count is forever.
 * `roleKills` is therefore keyed by post and never cleared on mission end.
 */
export function personFor(
  npcName: string | null | undefined,
  roleKills: Readonly<Record<string, number>> | undefined,
): MissionPerson | null {
  const raw = (npcName ?? '').trim();
  if (!raw) return null;
  const row = BY_ROLE.get(raw.toLowerCase());
  if (!row) {
    // An authored individual. They are who the stage says they are.
    return {
      name: raw,
      title: raw,
      role: null,
      faction: null,
      isSuccessor: false,
      predecessorsKilled: 0,
      canKill: false,
    };
  }
  const killed = Math.max(0, roleKills?.[row.role] ?? 0);
  // 0 → the original; 1 → the first successor; beyond the authored list the last
  // named successor holds the post. The DC clamp (SUCCESSOR_DC_MAX) tops out at
  // two killings anyway, so a serial killer meets a wall, not an empty roster.
  const name =
    killed <= 0
      ? row.name
      : row.successors[Math.min(killed - 1, row.successors.length - 1)] ?? row.name;
  return {
    name,
    title: row.title,
    role: row.role,
    faction: row.faction,
    isSuccessor: killed > 0,
    predecessorsKilled: killed,
    canKill: true,
  };
}

/** What a stage carries that this module needs to price it. */
export interface StakesShape {
  checkKind?: string | null;
  spawn?: { enemyName: string; count?: number } | null;
  requires?: { item: string; quantity?: number } | null;
  grants?: { item: string; quantity?: number } | null;
}

/**
 * ⚠⚠ THE ASK SETS THE PRICE, NOT THE MISSION'S RANK. Owner's rule 11: the DC is
 * *scaled*. What is being asked for is the only thing that scales honestly —
 * handing over a token they wanted you to carry is not the same conversation as
 * prising loose the thing three sworn men were posted to guard.
 *
 * Order matters and is not arbitrary:
 *   boss     → the chain's last word. Nothing bigger is asked anywhere.
 *   spawn    → bodies are already posted to stop you. Talking past them is the
 *              hard middle: you are asking someone to unmake a standing order.
 *   requires → YOU are the one delivering. The trade is already agreed.
 *   grants   → they hold the thing and you want it handed over.
 */
// ⚠ OTA-1588 — DELIBERATELY LEFT FAMILY-BLIND, and worth writing down because
// every other reader of `checkKind` was made family-aware in that OTA. This one
// cannot reach the thirty spawn-less mystery/storyline `boss` beats:
// `stageHasFight` is false for all of them, so `choicesFor` opens with PROCEED
// and FLEE and never offers PERSUADE — and a stake prices nothing else.
// Threading the family through here would change no button and no number, and
// quietly re-tuning a DC ladder nobody can see is not a repair. So `boss` here
// means what it means to a HUNT, which is the only family that can reach it.
export function stakesForStage(s: StakesShape | null | undefined): PersuadeStakes {
  if (!s) return 'favour';
  if (s.checkKind === 'boss') return 'surrender';
  if (s.spawn) return 'concession';
  if (s.requires) return 'errand';
  if (s.grants) return 'concession';
  return 'favour';
}

/**
 * Is there a fight behind this conversation at all?
 *
 * ⚠⚠ IT IS `spawn` AND NOTHING ELSE, and that is a measurement rather than a
 * preference. `spawn` is the only field that actually puts bodies into the scene
 * for a staged beat. A MYSTERY's `boss` stage is paid by INVESTIGATE and a
 * STORYLINE's by DIPLOMACY — neither spawns anything; they are the "confirm what
 * you have" beat. Fifteen NPC stages carry `checkKind: 'boss'` for exactly that
 * reason, and a FIGHT button on any of them would swing at nobody.
 *
 * ⚠ A stage with nobody to fight still gets a card — the person is the point —
 * it just gets PROCEED instead of PERSUADE/FIGHT.
 */
export function stageHasFight(s: StakesShape | null | undefined): boolean {
  return !!s?.spawn;
}

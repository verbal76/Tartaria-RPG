// progressionHints — OTA-1701. THE WORLD TELLS YOU WHERE THE POWER IS.
//
// Owner, 2026-09-05, after his progression assessment:
//
//   "Do not rebalance progression. Surface the existing progression ecosystem.
//    The Arbiter should recognize when the player is repeatedly failing or
//    fleeing high-tier Hunts/Core Guardians and organically remind them that
//    other activities provide meaningful power. Specifically surface the Great
//    Climbs as sources of exceptional gear and weapons without making them
//    mandatory or revealing the Beacon Rifle recipe outright. NPCs associated
//    with Towers, crafting, weapons, or exploration may reinforce those rumors.
//    Preserve player freedom: these are suggestions and world knowledge, never
//    gates or required objectives."
//
// ⚠⚠ THE GAME ALREADY KNOWS THE ANSWER. Travel and fights raise the character;
// hunts leave materials; the Crucible turns them into an edge; five summits
// hold the Skyreacher set and the beacons; the Core Guardians climb to meet all
// of it. Nothing here changes a number. Every function returns a LINE or null,
// keyed off state the store already keeps — the memorable-events ledger
// (mq_guardian_fled), the deed ledger (a mission flee with the apex's hit
// points), the chart-unlocked climbs, the beacon count, the killer written
// on the death — and the store appends it where it already speaks.
//
// ⚠⚠ NEVER A GATE. No function here refuses anything. The player who says
// "I'm beating this Guardian my way" hears the Arbiter once and then silence
// for a day of game time (the cooldowns below, in GAME HOURS like the bounty
// nudge — the trigger is an event, not the wall clock).
//
// ⚠ Module state, as arbiterNudge.ts holds its cooldown: resets on reload,
// which reads as orientation rather than nagging, and costs no save migration.

import type { PlayerCharacter, WorldMemory, Enemy, NpcRelation } from './types';
import { getEquippedWeapon } from './combatRules';
import { npcRegard } from './npcMemory';
import { VENDORS } from './vendors';
import { playerPowerScore, enemyPowerScore, powerMatchup } from './powerRating';

/** Game hours the Arbiter stays quiet on each subject after speaking. */
export const GUARDIAN_HINT_COOLDOWN_HOURS = 24;
export const APEX_HINT_COOLDOWN_HOURS = 24;
export const STUBBORN_HINT_COOLDOWN_HOURS = 48;
export const RUMOUR_COOLDOWN_HOURS = 72;
/** The "people who died proving they were stubborn" line waits for the late
 *  campaign — a player at the sixth seat has had the whole world to circulate. */
export const STUBBORN_FROM_CORES = 6;
/** A Common or Uncommon blade past the third Core is "yesterday's blade". */
export const STALE_WEAPON_FROM_CORES = 3;

type Topic = 'guardian' | 'apex' | 'stubborn' | 'rumour';
const lastAt: Partial<Record<Topic, number>> = {};
const toldOnce = new Set<string>();

function take(topic: Topic, nowHour: number, cooldownHours: number): boolean {
  if (!Number.isFinite(nowHour)) return true;
  const prev = lastAt[topic];
  if (prev !== undefined && nowHour - prev < cooldownHours) return false;
  lastAt[topic] = nowHour;
  return true;
}

/** Tests only — module state. */
export function _resetProgressionHints(): void {
  for (const k of Object.keys(lastAt) as Topic[]) delete lastAt[k];
  toldOnce.clear();
}

// ── what the store already knows, read once ──────────────────────────────

/** Guardian walls so far: every flee on the memorable-events ledger plus every
 *  death a Guardian handed out (OTA-1701 writes `guardianDeaths` on the death). */
export function guardianWallsSoFar(memory: WorldMemory | null | undefined): number {
  const flees = (memory?.memorableEvents ?? []).filter((e) => e.kind === 'mq_guardian_fled').length;
  return flees + (memory?.guardianDeaths ?? 0);
}

/** Apex walls so far: every mission flee the deed ledger holds with the apex's
 *  hit points on it (stageArrival.noteMissionFlee writes those). */
export function apexWallsSoFar(memory: WorldMemory | null | undefined): number {
  let n = 0;
  for (const list of Object.values(memory?.deeds ?? {})) for (const d of list) if (d.kind === 'fled' && d.hpLeft !== undefined) n += 1;
  return n;
}

/** A chart has put at least one great climb on the map. */
export function knowsATower(memory: WorldMemory | null | undefined): boolean {
  return (memory?.unlockedGreatClimbs ?? []).length > 0;
}

/** A climb the player knows of and has not yet crested. */
export function knowsAnUncrestedTower(memory: WorldMemory | null | undefined): boolean {
  const crested = new Set(memory?.greatClimbsCrested ?? []);
  return (memory?.unlockedGreatClimbs ?? []).some((id) => !crested.has(id));
}

export function weaponIsStale(rarity: string | null | undefined, coresRecovered: number): boolean {
  if (coresRecovered < STALE_WEAPON_FROM_CORES) return false;
  return !rarity || rarity === 'Common' || rarity === 'Uncommon';
}

export interface WallContext {
  /** Walls BEFORE this one — the first time, the rebuke stands alone. */
  priorWalls: number;
  coresRecovered: number;
  weaponRarity: string | null;
  knowsATower: boolean;
  nowHour: number;
}

export function wallContext(memory: WorldMemory | null | undefined, player: PlayerCharacter, priorWalls: number): WallContext {
  return {
    priorWalls,
    coresRecovered: player.mainQuest?.coresRecovered?.length ?? 0,
    weaponRarity: getEquippedWeapon(player, 'main')?.rarity ?? null,
    knowsATower: knowsATower(memory),
    nowHour: player.hoursElapsed ?? 0,
  };
}

// ── the Arbiter ──────────────────────────────────────────────────────────

/** After a Guardian flee (the rebuke and the faction aftermath have spoken).
 *  Silent the first time; from the second wall on, once a game-day. */
export function afterGuardianWall(ctx: WallContext): string | null {
  if (ctx.priorWalls < 1) return null;
  if (!take('guardian', ctx.nowHour, GUARDIAN_HINT_COOLDOWN_HOURS)) return null;
  if (weaponIsStale(ctx.weaponRarity, ctx.coresRecovered)) {
    return 'The Arbiter, once you have your breath: "That Guardian nearly buried you, and not for the first time. Look at what is in your hand. The hunts leave things behind that the Crucible turns into an edge."';
  }
  if (ctx.knowsATower) {
    return 'The Arbiter, once you have your breath: "That Guardian nearly buried you. Perhaps another Core is not what you need right now. You\'ve heard what they bring down from the old Towers, haven\'t you?"';
  }
  return 'The Arbiter, once you have your breath: "That Guardian nearly buried you. Perhaps another Core is not what you need right now. The hunts are still posted, and the people who take them come back changed."';
}

/** After a hunt's apex sends the player off for the second time (the deed
 *  ledger holds the first). Once a game-day. */
export function afterApexWall(ctx: WallContext): string | null {
  if (ctx.priorWalls < 1) return null;
  if (!take('apex', ctx.nowHour, APEX_HINT_COOLDOWN_HOURS)) return null;
  if (weaponIsStale(ctx.weaponRarity, ctx.coresRecovered)) {
    return 'The Arbiter, low: "Twice now that thing has sent you off. What a hunt leaves behind, the Crucible turns into something that bites — and your hand is carrying yesterday\'s blade."';
  }
  if (ctx.knowsATower) {
    return 'The Arbiter, low: "Twice now. It is not cowardice to come back with more. The board pays in more than coin, and the climbers\' summits pay better still."';
  }
  return 'The Arbiter, low: "Twice now. It is not cowardice to come back with more. The board pays in more than coin — take what the other postings leave behind to a Crucible."';
}

/** The first arrival at a climb a chart has put on the map — once per climb a
 *  session, never once it is crested. */
export function towerDiscovered(climbId: string, alreadyCrested: boolean): string | null {
  if (alreadyCrested) return null;
  const key = `tower:${climbId}`;
  if (toldOnce.has(key)) return null;
  toldOnce.add(key);
  return 'The Arbiter looks up the height of it. "The climbers don\'t make those ascents for the view. The things guarding those summits carry relics worth bleeding for."';
}

/** The first beacon prised out of a collector tower. The reward line already
 *  counts "(1 of 5)"; this is the Arbiter wondering aloud — and not naming the
 *  rifle. */
export function beaconInHand(beaconsHeld: number): string | null {
  if (beaconsHeld !== 1) return null;
  return 'The Arbiter turns it over in the light. "Interesting thing you carried down from that Tower. I\'ve heard there are others like it. Five old collectors, if the stories are true. Makes you wonder what someone clever could build from the set."';
}

/** At the Core seat, late in the campaign, with the Guardian about to rise and
 *  the numbers against you. A warning, not a refusal — the Guardian still rises. */
export function stubbornAtTheSeat(player: PlayerCharacter, guardian: Enemy): string | null {
  const cores = player.mainQuest?.coresRecovered?.length ?? 0;
  if (cores < STUBBORN_FROM_CORES) return null;
  if (powerMatchup(playerPowerScore(player), enemyPowerScore(guardian)) !== 'danger') return null;
  if (!take('stubborn', player.hoursElapsed ?? 0, STUBBORN_HINT_COOLDOWN_HOURS)) return null;
  return 'The Arbiter does not step back. "You can keep throwing yourself against the Core Guardians if that\'s what you want. But Tartaria is full of people who died proving they were stubborn. The Towers are still standing. The Hunts are still posted. There\'s power out there you haven\'t claimed."';
}

/** On the way back from a death a Guardian handed out. The caller clears
 *  `lastDeath` after speaking so the line is heard once per death. */
export function afterRevive(memory: WorldMemory | null | undefined): string | null {
  const d = memory?.lastDeath;
  if (!d || !d.guardian) return null;
  return `The Arbiter waits until the Aetherstone has settled. "${d.enemyName} put you in the ground. It will do it again if you go back the same. The Towers are still standing. The Hunts are still posted."`;
}

// ── the world's own knowledge ────────────────────────────────────────────

const SMITH_TITLE = /smith|forge|armou?rer|ironhand|anvil/i;

/** A vendor whose trade is metal — by the title vendors.json gives them. */
export function isSmith(vendorId: string | undefined, vendorName?: string): boolean {
  const row = VENDORS.find((v) => v.id === vendorId);
  return SMITH_TITLE.test(row?.title ?? '') || SMITH_TITLE.test(row?.name ?? vendorName ?? '');
}

export function holdsABeacon(player: PlayerCharacter | null | undefined): boolean {
  return (player?.inventory ?? []).some((i) => i.name === 'Aether Collection Beacon' && (i.quantity ?? 1) > 0);
}

/** A greeting-door beat: a smith recognises the beacon in the pack (once per
 *  smith a session); a familiar counter passes on what the climbers brought
 *  down (once in three game-days, only while a known climb stands uncrested). */
export function vendorTowerRumour(
  memory: WorldMemory | null | undefined,
  player: PlayerCharacter | null | undefined,
  vendor: { id?: string; name: string },
  rel: NpcRelation | null | undefined,
): string | null {
  if (!player) return null;
  if (isSmith(vendor.id, vendor.name) && holdsABeacon(player)) {
    const key = `smith:${vendor.id ?? vendor.name}`;
    if (!toldOnce.has(key)) {
      toldOnce.add(key);
      return `${vendor.name} looks past you at the pack. "Collector-tower work, that. I could not forge its like — whatever the old Tartarians drew down into those things is in no ore I know."`;
    }
  }
  const regard = npcRegard(rel);
  if ((regard === 'familiar' || regard === 'trusted') && knowsAnUncrestedTower(memory)
      && take('rumour', player.hoursElapsed ?? 0, RUMOUR_COOLDOWN_HOURS)) {
    return `${vendor.name} lowers their voice. "Climbers came through last season. The ones who came back down were carrying gear I have never seen the like of — and they went straight back up for more."`;
  }
  return null;
}

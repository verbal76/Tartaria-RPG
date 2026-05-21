// Whisper system — informal NPC-to-NPC tips that drive emergent
// chains. Different from Contracts (which are vendor-signed,
// rep-gated jobs). Whispers are overheard: a patron in the
// outpost Mess says "Yulka sells Aetheric Discs cheap south of
// here, after dark" and that becomes a Whisper. The player can
// follow it or ignore it. Each chain runs through a state machine
// the engine consults per scene-change and per cardinal step.
//
// Pittsburgh inspiration (playtester, 2026-05-21):
//   "go to the bar, see a beer, talk to some guy, he says go to
//    the park at midnight, you go, you meet Bob, Bob says recover
//    my stolen frisbees, you fight a guy, return them, you get
//    paid, you walk home, someone jumps you for the frisbees."
//
// This module hosts the chain definitions + the resolver that
// fires the right scene effects per stage. State lives on
// PlayerCharacter.activeWhispers / completedWhisperIds; the engine
// is otherwise stateless. Adding a new chain = adding an entry to
// CHAINS + an entry to applyChainStage's switch.

import type { WhisperRecord, Enemy, InventoryItem } from './types';
import { rollDie } from './rng';
import { findEnemyByName } from './encounter';

/** Time window check that handles midnight wraparound. */
export function isHourInWindow(hour: number, from: number | undefined, to: number | undefined): boolean {
  if (from == null || to == null) return true;
  if (from <= to) return hour >= from && hour <= to;
  // Wraps midnight: e.g. [20, 4] = 8pm to 4am.
  return hour >= from || hour <= to;
}

/** A chain definition. Authored in code so the engine can run typed
 *  callbacks per stage; future iterations may move to JSON once the
 *  stage-language stabilises. */
export interface ChainDef {
  id: string;
  /** Hub-room id where this whisper plants (e.g. 'reclaimer_mess'). */
  plantLocations: string[];
  /** Per-visit roll. 0.15 = 15%. */
  plantChance: number;
  /** Authored Arbiter / world lines spoken when the whisper plants.
   *  rotatingPick keeps repeats from grating; one is picked. */
  plantLines: string[];
  /** Hours of in-game time before the whisper expires. */
  expiryHours: number;
  /** How the target tile is computed from the player's plant-time
   *  position. Random within a per-chain offset range. */
  targetOffset: { dxRange: [number, number]; dyRange: [number, number] };
  /** Tile-time gate on the rendezvous (when the spawn fires).
   *  When omitted, any time-of-day works. */
  activeHours?: [number, number];
}

export const CHAINS: ChainDef[] = [
  {
    id: 'yulka_discs',
    plantLocations: ['outpost_messhall'],
    plantChance: 0.15,
    plantLines: [
      `A pilgrim at the corner table cups her hands around a steaming mug and looks over at you. "South of here, past the gate. After the moon's up. Mud Dweller name of Yulka camps out there some nights — sells Aetheric Discs cheap. Don't ask where she gets them."`,
      `A Reclaimer one table over leans back: "If you need Aetheric Discs and don't want to pay Irma's mark-up, walk south after dark. Yulka. She's there some nights, gone others. Two tiles, three. You'll see her fire."`,
      `An off-duty Reclaimer presses a thumb into the salt of her plate. "Yulka. South. Night work. Aetheric Discs at half the going rate. If she's there." She doesn't say what to do if she's not.`,
    ],
    expiryHours: 48,
    targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
    activeHours: [20, 4],
  },
];

export function findChain(id: string): ChainDef | undefined {
  return CHAINS.find((c) => c.id === id);
}

/** Compute the rendezvous tile for a freshly-planted whisper. Uses
 *  the chain's offset range against the player's current map
 *  coordinates. Random within the range so two characters who
 *  receive the same whisper find Yulka in different exact tiles. */
export function pickTargetTile(
  chain: ChainDef,
  playerMapX: number,
  playerMapY: number,
): { x: number; y: number } {
  const [dxLo, dxHi] = chain.targetOffset.dxRange;
  const [dyLo, dyHi] = chain.targetOffset.dyRange;
  const dx = dxLo + Math.floor(Math.random() * (dxHi - dxLo + 1));
  const dy = dyLo + Math.floor(Math.random() * (dyHi - dyLo + 1));
  return { x: playerMapX + dx, y: playerMapY + dy };
}

/** Was this tile the meet-up spot for an active whisper, and is
 *  this the right time? Returns the matching whisper or null. */
export function findReadyMeetWhisper(
  whispers: readonly WhisperRecord[] | undefined,
  hoursElapsed: number,
  playerMapX: number,
  playerMapY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    if (w.stage !== 'planted') continue;
    if (w.targetMapX !== playerMapX || w.targetMapY !== playerMapY) continue;
    const hourOfDay = Math.floor(hoursElapsed % 24);
    if (!isHourInWindow(hourOfDay, w.activeFromHour, w.activeToHour)) continue;
    return w;
  }
  return null;
}

/** Fetch sub-encounter — for the Yulka chain, the thief tile
 *  the player must travel to. Returns the whisper whose ctx
 *  carries thiefMapX/Y matching the current tile. */
export function findReadyFetchWhisper(
  whispers: readonly WhisperRecord[] | undefined,
  playerMapX: number,
  playerMapY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    if (w.stage !== 'fetch_in_progress') continue;
    const tx = w.ctx?.thiefMapX as number | undefined;
    const ty = w.ctx?.thiefMapY as number | undefined;
    if (tx === playerMapX && ty === playerMapY) return w;
  }
  return null;
}

/** Return-to-Yulka step. Player has stolen-stock in inventory; if
 *  they're back on Yulka's tile, fire the reward. */
export function findReadyReturnWhisper(
  whispers: readonly WhisperRecord[] | undefined,
  playerMapX: number,
  playerMapY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    if (w.stage !== 'fetch_returned') continue;
    if (w.targetMapX === playerMapX && w.targetMapY === playerMapY) return w;
  }
  return null;
}

/** Reaping pass: drop expired whispers. Called from the scene-tick
 *  resolver each beginScene + stepDirection. Returns the surviving
 *  list and the names of any that expired (so the engine can fire
 *  a "the trail went cold" log line). */
export function reapExpiredWhispers(
  whispers: readonly WhisperRecord[] | undefined,
  hoursElapsed: number,
): { kept: WhisperRecord[]; expired: WhisperRecord[] } {
  if (!whispers) return { kept: [], expired: [] };
  const kept: WhisperRecord[] = [];
  const expired: WhisperRecord[] = [];
  for (const w of whispers) {
    if (hoursElapsed >= w.expiresAtHour) expired.push(w);
    else kept.push(w);
  }
  return { kept, expired };
}

/** Helper used by the spawn step — clones an enemy proto with a
 *  fresh HP and the requested name. Throws if the name doesn't
 *  resolve so chain authors find their typos fast. */
export function spawnChainEnemy(name: string): Enemy {
  const proto = findEnemyByName(name);
  if (!proto) {
    throw new Error(`spawnChainEnemy: no enemy named ${name}`);
  }
  return JSON.parse(JSON.stringify(proto)) as Enemy;
}

/** Build a fresh "Stolen Aetheric Discs" inventory item the player
 *  picks up off the thief. Carries a marker tag so the return
 *  step can find them in the player's pack. */
export function makeStolenDiscs(quantity: number): InventoryItem {
  return {
    id: `whisper_loot_${Date.now()}_${rollDie(9999)}`,
    name: 'Stolen Aetheric Discs',
    kind: 'misc',
    rarity: 'Uncommon',
    quantity,
    tags: ['whisper', 'aether', 'quest'],
  };
}

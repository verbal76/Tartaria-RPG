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

import type { WhisperRecord, WhisperTalkTurn, Enemy, InventoryItem } from './types';
import { canonicalCellOf, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from './worldMap';
import { rollDie } from './rng';
import { findEnemyByName } from './encounter';

/** OTA-1547 — append one conversation turn to one whisper's per-instance
 *  transcript, immutably. Pure so the store can map with it and tests can
 *  exercise it without a store. Unknown id = the array back unchanged (the
 *  record may have resolved between the tap and the write — losing the turn
 *  is correct then, because the transcript's lifetime IS the instance). */
export function withTalkTurn(
  whispers: readonly WhisperRecord[] | undefined,
  id: string,
  who: WhisperTalkTurn['who'],
  text: string,
): WhisperRecord[] {
  return (whispers ?? []).map((w) =>
    w.id === id ? { ...w, talk: [...(w.talk ?? []), { who, text }] } : w,
  );
}

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
  /** Player-facing title for the ContractsScreen Whispers section. */
  title: string;
  /** Hub-room id where this whisper plants (e.g. 'reclaimer_mess'). */
  plantLocations: string[];
  /** Per-visit roll. 0.15 = 15%. */
  plantChance: number;
  /** Authored Arbiter / world lines spoken when the whisper plants.
   *  rotatingPick keeps repeats from grating; one is picked. */
  plantLines: string[];
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
    title: 'Yulka and the Aetheric Discs',
    plantLocations: ['outpost_messhall'],
    plantChance: 0.15,
    plantLines: [
      `A pilgrim at the corner table cups her hands around a steaming mug and looks over at you. "South of here, past the gate. After the moon's up. Mud Dweller name of Yulka camps out there some nights — sells Aetheric Discs cheap. Don't ask where she gets them."`,
      `A Reclaimer one table over leans back: "If you need Aetheric Discs and don't want to pay Irma's mark-up, walk south after dark. Yulka. She's there some nights, gone others. Two tiles, three. You'll see her fire."`,
      `An off-duty Reclaimer presses a thumb into the salt of her plate. "Yulka. South. Night work. Aetheric Discs at half the going rate. If she's there." She doesn't say what to do if she's not.`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
    activeHours: [20, 4],
  },
];

// ⚠⚠⚠ OTA-1542 — A RENDEZVOUS IS A PLACE, NOT A PAIR OF FRAME COORDINATES.
// Owner: *"not only was this broken because yulka wasn't there"*. Whisper
// targets were stored as `targetMapX/targetMapY` — coordinates on a map that
// travelToLocation RECENTERS on every named arrival — and matched against the
// player's CURRENT frame coords. Plant the whisper on the road (persuading
// Nix), cross any named ground, and the stored pair now denotes different
// dirt: Yulka's camp silently moves, or stops existing anywhere the player can
// stand. Same disease OTA-1541 cured in room keys, in a second organ.
//
// ⚠ THE CURE COSTS NO MIGRATION, because every record already names its own
// frame: `targetLocationId` is the location the map was centered on at plant
// time, so `canonCell(targetLocationId) + (targetMap − CENTER)` recovers the
// absolute cell EXACTLY. New plants also write targetGridX/Y outright; these
// two readers prefer them and fall back losslessly for old saves.
export function whisperTargetGrid(w: WhisperRecord): { x: number; y: number } {
  if (typeof w.targetGridX === 'number' && typeof w.targetGridY === 'number') {
    return { x: w.targetGridX, y: w.targetGridY };
  }
  const c = canonicalCellOf(w.targetLocationId);
  return { x: c.x + (w.targetMapX - WORLD_MAP_CENTER_X), y: c.y + (w.targetMapY - WORLD_MAP_CENTER_Y) };
}

/** The thief sub-tile, absolute. Old ctx coords were minted in the plant frame
 *  (targetMapX + offset), so the same fallback conversion is exact for them. */
export function whisperThiefGrid(w: WhisperRecord): { x: number; y: number } | null {
  const gx = w.ctx?.thiefGridX;
  const gy = w.ctx?.thiefGridY;
  if (typeof gx === 'number' && typeof gy === 'number') return { x: gx, y: gy };
  const mx = w.ctx?.thiefMapX;
  const my = w.ctx?.thiefMapY;
  if (typeof mx !== 'number' || typeof my !== 'number') return null;
  const c = canonicalCellOf(w.targetLocationId);
  return { x: c.x + (mx - WORLD_MAP_CENTER_X), y: c.y + (my - WORLD_MAP_CENTER_Y) };
}

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
  // OTA-1542 — ABSOLUTE cell (playerGridCell), never frame coords.
  playerGridX: number,
  playerGridY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    if (w.stage !== 'planted') continue;
    const t = whisperTargetGrid(w);
    if (t.x !== playerGridX || t.y !== playerGridY) continue;
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
  playerGridX: number,
  playerGridY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    // OTA-458 — also re-trigger on 'fetch_active'. Pre-fix, a Silt-Thief kill could
    // be silently clobbered (see resolveEnemyDefeat): the whisper stayed stuck at
    // 'fetch_active' with the thief already gone, an unrecoverable dead end. Now
    // returning to the thief tile while still 'fetch_active' re-spawns the encounter
    // (fireYulkaFetch guards against a double-spawn if one is already live), so a
    // player stranded by the old bug can walk back and finish the chain.
    if (w.stage !== 'fetch_in_progress' && w.stage !== 'fetch_active') continue;
    const t = whisperThiefGrid(w);
    if (t && t.x === playerGridX && t.y === playerGridY) return w;
  }
  return null;
}

/** Return-to-Yulka step. Player has stolen-stock in inventory; if
 *  they're back on Yulka's tile, fire the reward. */
export function findReadyReturnWhisper(
  whispers: readonly WhisperRecord[] | undefined,
  playerGridX: number,
  playerGridY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    if (w.stage !== 'fetch_returned') continue;
    const t = whisperTargetGrid(w);
    if (t.x === playerGridX && t.y === playerGridY) return w;
  }
  return null;
}

/** Reaping pass — DISABLED 2026-05-21 per playtester feedback:
 *  "I don't think the quest expiration is a good idea, keep them
 *  open." Whispers now persist until the player resolves them one
 *  way or another. Kept as a no-op so the resolver call site
 *  doesn't have to special-case nothing. The `expired` array is
 *  always empty; `kept` mirrors the input. If we ever decide to
 *  re-introduce time-pressure on Whispers, re-enable the check
 *  inside this function. */
export function reapExpiredWhispers(
  whispers: readonly WhisperRecord[] | undefined,
  _hoursElapsed: number,
): { kept: WhisperRecord[]; expired: WhisperRecord[] } {
  return { kept: whispers ? [...whispers] : [], expired: [] };
}

/** Per-stage human-readable description for the Whispers panel in
 *  ContractsScreen. Tells the player what they should do next on
 *  this chain. Falls back to the raw stage name if the chain
 *  doesn't define one (which means I forgot to add it; loud-fail
 *  in dev would be nice). */
export function describeWhisperStage(whisper: WhisperRecord): string {
  if (whisper.id === 'yulka_discs') {
    switch (whisper.stage) {
      case 'planted':
        // OTA-1542 — SAY WHO SENT YOU, AND FROM WHERE. Owner: *"I'm still
        // trying to figure out if this was the whisper promised by Nix."* The
        // record never carried its source, and this line always said "south of
        // the outpost" even when the whisper was granted by a wanderer on the
        // road — whose camp is 2-3 tiles south of WHERE YOU MET THEM, not of
        // any outpost. SET COURSE on this card walks to the exact tile either
        // way; the copy now tells the truth about the reference point.
        return whisper.source
          ? `Word from ${whisper.source}: Yulka camps 2-3 tiles south of where you met them, after dark (8 pm to 4 am). SET COURSE below walks you to the spot.`
          : `Travel south of the outpost. Yulka camps somewhere in tiles 2-3 south, after dark (8 pm to 4 am).`;
      case 'met_yulka':
        return `You're at Yulka's fire. Type 'accept yulka' to take the fetch (5 Discs on return), 'buy from yulka' to pay 50 TC for 5 Discs, or 'leave yulka' to walk.`;
      case 'fetch_in_progress':
        return `Travel east of Yulka's tile. The thief is 2-3 tiles over.`;
      case 'fetch_active':
        // OTA-458 — include the location hint. If a player was stranded here by the
        // old disc-clobber bug (thief gone, stage stuck), returning to the thief
        // tile east of Yulka re-spawns the encounter so they can finish.
        return `Defeat the Silt Thief and recover the Aetheric Discs — east of Yulka's tile (2-3 over). If the thief isn't there, step back onto that tile to draw them out again.`;
      case 'fetch_returned':
        return `Return to Yulka's tile with the recovered Discs. She owes you 5.`;
      case 'ambush_armed':
        return `Walk home with the Discs. Someone may notice.`;
      default:
        return `Stage: ${whisper.stage}`;
    }
  }
  return `Stage: ${whisper.stage}`;
}

/** Friendly summary line for the chain title bar (one-liner). */
export function describeWhisperTitle(whisper: WhisperRecord): string {
  const chain = findChain(whisper.id);
  return chain?.title ?? whisper.id;
}

/** OTA-465 — the map TILE the player should head to for this whisper's CURRENT
 *  stage, so the Contracts screen can offer a "set course" (the player kept
 *  losing the objective). Returns null when there's no concrete tile to route to
 *  (e.g. the player is already at the meet, or the stage is "walk home anywhere").
 *  Yulka's chain is stage-aware (Yulka's fire vs the thief's tile vs the return);
 *  any other chain with a target tile routes there. */
export function whisperRouteTarget(
  whisper: WhisperRecord,
): { gridX: number; gridY: number; label: string } | null {
  // OTA-1542 — ABSOLUTE cells out, so a course set today still points at the
  // dirt the whisper meant, however many recenters happened in between. The
  // return shape changed on purpose: every consumer breaks at compile time
  // instead of silently routing in the wrong frame.
  const thief = whisperThiefGrid(whisper);
  const target = whisperTargetGrid(whisper);
  const hasTarget = typeof whisper.targetMapX === 'number' && typeof whisper.targetMapY === 'number'
    || typeof whisper.targetGridX === 'number';
  if (whisper.id === 'yulka_discs') {
    switch (whisper.stage) {
      case 'fetch_in_progress':
      case 'fetch_active':
        return thief ? { gridX: thief.x, gridY: thief.y, label: 'the Silt Thief' } : null;
      case 'fetch_returned':
        return hasTarget ? { gridX: target.x, gridY: target.y, label: "Yulka (return the Discs)" } : null;
      case 'planted':
      case 'met_yulka':
        return hasTarget ? { gridX: target.x, gridY: target.y, label: "Yulka's fire" } : null;
      default:
        return null; // ambush_armed / done — no fixed tile.
    }
  }
  // Generic chains: route to the thief-style sub-tile if one is set, else the
  // whisper's target tile.
  if (thief) return { gridX: thief.x, gridY: thief.y, label: describeWhisperTitle(whisper) };
  if (hasTarget) return { gridX: target.x, gridY: target.y, label: describeWhisperTitle(whisper) };
  return null;
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

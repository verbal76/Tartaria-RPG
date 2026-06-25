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
import type { HookEffect } from './hooks';
import { rollDie } from './rng';
import { findEnemyByName } from './encounter';
import { resolveWhispers } from './contentPack';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import builtinWhisperData from '../data/whispers/builtin-whispers.json';

/** Time window check that handles midnight wraparound. */
export function isHourInWindow(hour: number, from: number | undefined, to: number | undefined): boolean {
  if (from == null || to == null) return true;
  if (from <= to) return hour >= from && hour <= to;
  // Wraps midnight: e.g. [20, 4] = 8pm to 4am.
  return hour >= from || hour <= to;
}

/** engine_Dev — one LEG of a multi-stage whisper mission. The engine walks the
 *  player through the legs in order; each resolves when they reach its tile (and,
 *  if `enemyName` is set, defeat that foe). Lightweight + whisper-specific — NOT
 *  the full main-quest step system. */
export interface WhisperStage {
  /** Narration when this leg resolves (on arrival, or on the foe's defeat). */
  line: string;
  /** Where this leg's tile is — a random offset from the player's position when
   *  the PREVIOUS leg completed (or from the plant spot for leg 0). Omit to
   *  resolve on the same tile as the previous leg (e.g. fight, then pick up). */
  targetOffset?: { dxRange: [number, number]; dyRange: [number, number] };
  /** Optional foe to spawn when the player arrives (must be in your enemies
   *  table). The leg does NOT advance until it's defeated. */
  enemyName?: string;
  /** Effects fired when this leg COMPLETES — same verbs as hooks (grant_item,
   *  grant_tc, heal, damage, unlock_location, rep_change, spawn_enemy_tag, …). */
  effects?: HookEffect[];
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
  /** engine_Dev — GENERIC payoff. An authored chain that sets meetLine/meetEffects
   *  resolves in one hop: when the player reaches the target tile in the active
   *  window, meetLine narrates, meetEffects fire (the same verbs hooks use:
   *  grant_item, grant_tc, spawn_enemy_tag, rep_change, heal, damage, …), and the
   *  whisper completes. The built-in yulka chain leaves these unset and keeps its
   *  bespoke multi-stage fetch/fight/return logic. */
  meetLine?: string;
  meetEffects?: HookEffect[];
  /** engine_Dev — MULTI-STAGE mission. When present (and non-empty), the whisper
   *  runs leg-by-leg instead of the one-hop meet: plant → reach stage 0's tile →
   *  (optional foe; resolve) → reach stage 1's tile → … → last stage completes the
   *  whisper. A chain uses EITHER stages (multi-stage) OR meetLine/meetEffects
   *  (one-hop) — stages win when both are set. */
  stages?: WhisperStage[];
  /** Bespoke-chain only — the quest item this chain mints + returns (e.g. the
   *  yulka chain's recovered stock). Read by makeStolenDiscs so the name isn't
   *  hardcoded. Generic one-hop chains don't use it. */
  fetchItemName?: string;
}

// engine_Dev — the built-in whisper chains moved to app/data/whispers/
// builtin-whispers.json so the engine carries no hardcoded setting strings and
// designers can edit them. An uploaded 'whispers' table or the generic-default
// pack takes precedence. (The yulka chain's bespoke multi-stage QUEST logic stays
// scripted in gameStore, keyed on its id; only the overheard-tip DATA is here.)
export const CHAINS: ChainDef[] =
  (builtinWhisperData as unknown as { chains: ChainDef[] }).chains;

/** The live whisper chains — uploaded override if present, else built-in. */
export function getWhispers(): ChainDef[] {
  return resolveWhispers(CHAINS) as ChainDef[];
}
/** True when an authored chain has a one-hop generic payoff (vs the built-in
 *  yulka chain's bespoke multi-stage logic). */
export function isGenericWhisper(chain: ChainDef | undefined): boolean {
  return !!chain && (!!chain.meetLine || (chain.meetEffects != null && chain.meetEffects.length > 0));
}

export function findChain(id: string): ChainDef | undefined {
  return getWhispers().find((c) => c.id === id);
}

// ----- multi-stage mission runner (data-driven) ----------------------------

/** True when a chain is a multi-stage mission (has at least one stage). */
export function isMultiStageWhisper(chain: ChainDef | undefined): boolean {
  return !!chain?.stages && chain.stages.length > 0;
}

/** The current leg index stored on the record (0 when unset). */
export function whisperStageIndex(whisper: WhisperRecord): number {
  const i = Number(whisper.ctx?.stageIndex ?? 0);
  return Number.isFinite(i) && i >= 0 ? i : 0;
}

/** The current leg for a multi-stage whisper, or undefined when done / one-hop. */
export function currentWhisperStage(chain: ChainDef | undefined, whisper: WhisperRecord): WhisperStage | undefined {
  if (!isMultiStageWhisper(chain)) return undefined;
  return chain!.stages![whisperStageIndex(whisper)];
}

/** Compute a leg's destination tile from a base position + the leg's offset
 *  (random within range). When the leg has no offset it resolves on the base tile. */
export function stageTargetTile(
  stage: WhisperStage | undefined,
  baseX: number,
  baseY: number,
): { x: number; y: number } {
  const off = stage?.targetOffset;
  if (!off) return { x: baseX, y: baseY };
  const dx = off.dxRange[0] + rollDie(off.dxRange[1] - off.dxRange[0] + 1) - 1;
  const dy = off.dyRange[0] + rollDie(off.dyRange[1] - off.dyRange[0] + 1) - 1;
  return { x: baseX + dx, y: baseY + dy };
}

/** A multi-stage whisper whose CURRENT leg's tile the player is standing on and
 *  which is not waiting on a foe — i.e. ready to resolve this leg by arrival. */
export function findReadyStageWhisper(
  whispers: readonly WhisperRecord[] | undefined,
  hoursElapsed: number,
  playerMapX: number,
  playerMapY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    if (!isMultiStageWhisper(findChain(w.id))) continue;
    if (w.ctx?.awaitEnemy) continue; // a fight leg is blocking; not a tile arrival
    if (w.targetMapX !== playerMapX || w.targetMapY !== playerMapY) continue;
    const hourOfDay = Math.floor(hoursElapsed % 24);
    if (!isHourInWindow(hourOfDay, w.activeFromHour, w.activeToHour)) continue;
    return w;
  }
  return null;
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
    // OTA-458 — also re-trigger on 'fetch_active'. Pre-fix, a Silt-Thief kill could
    // be silently clobbered (see resolveEnemyDefeat): the whisper stayed stuck at
    // 'fetch_active' with the thief already gone, an unrecoverable dead end. Now
    // returning to the thief tile while still 'fetch_active' re-spawns the encounter
    // (fireYulkaFetch guards against a double-spawn if one is already live), so a
    // player stranded by the old bug can walk back and finish the chain.
    if (w.stage !== 'fetch_in_progress' && w.stage !== 'fetch_active') continue;
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
        return `Travel south of the outpost. Yulka camps somewhere in tiles 2-3 south, after dark (8 pm to 4 am).`;
      case 'met_yulka':
        return `You're at Yulka's fire. Type 'accept yulka' to take the fetch (5 Discs on return), 'buy from yulka' to pay 50 TC for 5 Discs, or 'leave yulka' to walk.`;
      case 'fetch_in_progress':
        return `Travel east of Yulka's tile. The thief is 2-3 tiles over.`;
      case 'fetch_active':
        // OTA-458 — include the location hint. If a player was stranded here by the
        // old disc-clobber bug (thief gone, stage stuck), returning to the thief
        // tile east of Yulka re-spawns the encounter so they can finish.
        return `Defeat the Silt Thief and recover the Discs — east of Yulka's tile (2-3 over). If the thief isn't there, step back onto that tile to draw them out again.`;
      case 'fetch_returned':
        return `Return to Yulka's tile with the recovered Discs. She owes you 5.`;
      case 'ambush_armed':
        return `Walk home with the Discs. Someone may notice.`;
      default:
        return `Stage: ${whisper.stage}`;
    }
  }
  // engine_Dev — multi-stage mission: show the current leg's progress.
  const chain = findChain(whisper.id);
  if (isMultiStageWhisper(chain)) {
    const idx = whisperStageIndex(whisper);
    const total = chain!.stages!.length;
    const awaiting = whisper.ctx?.awaitEnemy;
    if (awaiting) return `Leg ${idx + 1} of ${total}: defeat the ${awaiting}.`;
    const line = chain!.stages![idx]?.line;
    return `Leg ${idx + 1} of ${total}${line ? `: ${line}` : ' — head to the marked tile.'}`;
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
): { mapX: number; mapY: number; label: string } | null {
  const thiefX = whisper.ctx?.thiefMapX as number | undefined;
  const thiefY = whisper.ctx?.thiefMapY as number | undefined;
  const hasThief = typeof thiefX === 'number' && typeof thiefY === 'number';
  const hasTarget = typeof whisper.targetMapX === 'number' && typeof whisper.targetMapY === 'number';
  if (whisper.id === 'yulka_discs') {
    switch (whisper.stage) {
      case 'fetch_in_progress':
      case 'fetch_active':
        return hasThief ? { mapX: thiefX!, mapY: thiefY!, label: 'the Silt Thief' } : null;
      case 'fetch_returned':
        return hasTarget ? { mapX: whisper.targetMapX, mapY: whisper.targetMapY, label: "Yulka (return the Discs)" } : null;
      case 'planted':
      case 'met_yulka':
        return hasTarget ? { mapX: whisper.targetMapX, mapY: whisper.targetMapY, label: "Yulka's fire" } : null;
      default:
        return null; // ambush_armed / done — no fixed tile.
    }
  }
  // Generic chains: route to the thief-style sub-tile if one is set, else the
  // whisper's target tile.
  if (hasThief) return { mapX: thiefX!, mapY: thiefY!, label: describeWhisperTitle(whisper) };
  if (hasTarget) return { mapX: whisper.targetMapX, mapY: whisper.targetMapY, label: describeWhisperTitle(whisper) };
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
export function makeStolenDiscs(quantity: number, name = 'Recovered Goods'): InventoryItem {
  return {
    id: `whisper_loot_${Date.now()}_${rollDie(9999)}`,
    name,
    kind: 'misc',
    rarity: 'Uncommon',
    quantity,
    tags: ['whisper', 'quest'],
  };
}

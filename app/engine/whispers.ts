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
// OTA-1548 — the chain table and its content model moved to their own file:
// twenty-one authored chains would drown the machinery here. Re-exported so
// every existing importer keeps working through this module.
import { CHAINS, type ChainDef, type ChainContent, type ChainReward } from './whisperChains';

export { CHAINS };
export type { ChainDef, ChainContent, ChainReward };

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

// OTA-1548 — DIRECTION AND DISTANCE COME FROM THE OFFSET, NOT FROM PROSE.
// The audit that opened this OTA caught Yulka's own copy saying "south" while
// her stored offset walked NORTH; generating every panel line from the offset
// makes that class impossible to author again. (north = y−1, south = y+1,
// east = x+1, west = x−1 — the same mapping stepDirection walks.)
export function offsetDirWord(off: { dxRange: [number, number]; dyRange: [number, number] }): string {
  const dx = (off.dxRange[0] + off.dxRange[1]) / 2;
  const dy = (off.dyRange[0] + off.dyRange[1]) / 2;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
  return dy >= 0 ? 'south' : 'north';
}

/** '2-3' (or '3' for a fixed distance) along the offset's dominant axis. */
export function offsetSpanText(off: { dxRange: [number, number]; dyRange: [number, number] }): string {
  const dx = (off.dxRange[0] + off.dxRange[1]) / 2;
  const dy = (off.dyRange[0] + off.dyRange[1]) / 2;
  const r = Math.abs(dx) >= Math.abs(dy) ? off.dxRange : off.dyRange;
  const lo = Math.min(Math.abs(r[0]), Math.abs(r[1]));
  const hi = Math.max(Math.abs(r[0]), Math.abs(r[1]));
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

function hourWord(h: number): string {
  if (h === 0 || h === 24) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/** ', after dark (8 pm to 4 am)' / ', in daylight (6 am to 6 pm)' / ''. */
export function activeHoursText(hours?: [number, number]): string {
  if (!hours) return '';
  const [from, to] = hours;
  const mood = from >= 17 || to <= 6 ? 'after dark' : 'in daylight';
  return `, ${mood} (${hourWord(from)} to ${hourWord(to)})`;
}

/** she→her/She owes; he→him/He owes; they→them/They owe. */
/** ⚠ OTA-1613 added `subj` and `poss` — the hand-back beat writes sentences
 *  about the giver ("… before he sees you", "… in his hands"), and a table that
 *  only carried the object form would have forced those two lines to build
 *  their own pronouns, which is how a "they" chain comes to be called "it". */
export function pronounForms(
  p: ChainContent['pronoun'],
): { obj: string; subj: string; subjCap: string; poss: string; owes: string } {
  if (p === 'she') return { obj: 'her', subj: 'she', subjCap: 'She', poss: 'her', owes: 'owes' };
  if (p === 'he') return { obj: 'him', subj: 'he', subjCap: 'He', poss: 'his', owes: 'owes' };
  return { obj: 'them', subj: 'they', subjCap: 'They', poss: 'their', owes: 'owe' };
}

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

// ⚠⚠ OTA-1595 — THE HINT AND THE COMPASS COUNT THE SAME TILES. Owner, typed
// into the game while hunting Hollis: *"The text in The whisperer says this is
// one block away but the actual number on the world exploration screen says
// three blocks away. they don't give the same answer."* He was right that they
// couldn't: the panel re-printed the AUTHORED offset range measured from the
// plant origin ("tiles 2-3 south of the outpost") while the course walks to the
// CONCRETE tile the record stores — two origins, two numbers, one player caught
// between them. This phrase is the one writer: the record's own tile against
// the player's live cell, the exact Manhattan walk the course will take.
export function whisperDistancePhrase(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const total = Math.abs(dx) + Math.abs(dy);
  if (total === 0) return 'on the tile you are standing on';
  const parts: string[] = [];
  if (dy !== 0) parts.push(`${Math.abs(dy)} ${dy > 0 ? 'south' : 'north'}`);
  if (dx !== 0) parts.push(`${Math.abs(dx)} ${dx > 0 ? 'east' : 'west'}`);
  return `${total} tile${total === 1 ? '' : 's'} from where you stand (${parts.join(', ')})`;
}

/** OTA-1595 — does this record actually carry a concrete meet tile? (Mirrors
 *  whisperRouteTarget's own guard, so hint and route agree on that too.) */
function hasConcreteTarget(w: WhisperRecord): boolean {
  return (typeof w.targetMapX === 'number' && typeof w.targetMapY === 'number')
    || typeof w.targetGridX === 'number';
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

/** ⚠⚠ OTA-1595 — THE COLD CAMP SPEAKS. The meet check above it misses in two
 *  ways that used to look identical: wrong tile, and RIGHT tile at the wrong
 *  hour. The owner walked Hollis's course, stood on the ground, and got
 *  nothing — *"so I'm supposed to be at hollis's camp but I'm at an active dig
 *  site"* — because the 5am-5pm window had closed and nothing said so. This
 *  finds the planted whisper whose tile matches but whose hours do not, so
 *  the caller can say who works when instead of nothing. */
export function findMeetWhisperOffHours(
  whispers: readonly WhisperRecord[] | undefined,
  hoursElapsed: number,
  playerGridX: number,
  playerGridY: number,
): WhisperRecord | null {
  if (!whispers) return null;
  for (const w of whispers) {
    if (w.stage !== 'planted') continue;
    const t = whisperTargetGrid(w);
    if (t.x !== playerGridX || t.y !== playerGridY) continue;
    const hourOfDay = Math.floor(hoursElapsed % 24);
    if (!isHourInWindow(hourOfDay, w.activeFromHour, w.activeToHour)) return w;
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
export function describeWhisperStage(
  whisper: WhisperRecord,
  // ⚠ OTA-1595 — the player's live ABSOLUTE cell (playerGridCell). When given,
  // every stage with a concrete tile states the TRUE remaining walk from it —
  // the same cells the course steps — instead of re-printing the authored
  // offset range from the plant origin. Omitted (old callers, fixtures), the
  // lines render exactly as before.
  playerGrid?: { x: number; y: number },
): string {
  // OTA-1548 — generated from the chain's own offsets, hours, nouns and
  // prices, for all twenty-one chains at once. Yulka's lines render exactly
  // as OTA-1542 authored them; the direction word can no longer disagree
  // with the dirt (her data was the one out of step, and it was fixed).
  const chain = findChain(whisper.id);
  if (chain) {
    const c = chain.content;
    const dir = offsetDirWord(chain.targetOffset);
    const span = offsetSpanText(chain.targetOffset);
    const hoursTxt = activeHoursText(chain.activeHours);
    const fdir = offsetDirWord(c.fetchOffset);
    const fspan = offsetSpanText(c.fetchOffset);
    const p = pronounForms(c.pronoun);
    const meetAt = playerGrid && hasConcreteTarget(whisper)
      ? whisperDistancePhrase(playerGrid, whisperTargetGrid(whisper))
      : null;
    const thief = playerGrid ? whisperThiefGrid(whisper) : null;
    const thiefAt = thief ? whisperDistancePhrase(playerGrid!, thief) : null;
    switch (whisper.stage) {
      case 'planted':
        // OTA-1542 — SAY WHO SENT YOU, AND FROM WHERE. A wanderer-granted
        // whisper is offset from WHERE YOU MET THEM, not from any outpost.
        if (meetAt) {
          return `${c.npcName} camps ${meetAt}${hoursTxt}. SET COURSE walks you to the spot.`;
        }
        return whisper.source
          ? `Word from ${whisper.source}: ${c.npcName} camps ${span} tiles ${dir} of where you met them${hoursTxt}. SET COURSE below walks you to the spot.`
          : `Travel ${dir} of the outpost. ${c.npcName} camps somewhere in tiles ${span} ${dir}${hoursTxt}.`;
      case 'met_yulka':
        // OTA-1548 — the historically-named "met the giver" stage (see
        // gameStore's resolver): every chain uses it, only the name is Yulka's.
        return `You're with ${c.npcName}. Answer from the SPEAK TO ${c.npcName.toUpperCase()} bar — take the job${c.buy ? `, buy for ${c.buy.costTc} TC` : ''}, or walk away.`;
      case 'fetch_in_progress':
        if (thiefAt) {
          return `${c.markNoun.charAt(0).toUpperCase()}${c.markNoun.slice(1)} is ${thiefAt}. SET COURSE walks you there.`;
        }
        return `Travel ${fdir} of ${c.npcName}'s tile. ${c.markNoun.charAt(0).toUpperCase()}${c.markNoun.slice(1)} is ${fspan} tiles over.`;
      case 'fetch_active':
        // OTA-458 — include the location hint so a player stranded mid-fetch
        // can walk back onto the tile and re-draw the encounter.
        if (thiefAt) {
          return `Defeat the ${c.fetchEnemy} and recover ${c.goodsLong} — ${thiefAt}. If ${c.markNoun} isn't there, step back onto that tile to draw them out again.`;
        }
        return `Defeat the ${c.fetchEnemy} and recover ${c.goodsLong} — ${fdir} of ${c.npcName}'s tile (${fspan} over). If ${c.markNoun} isn't there, step back onto that tile to draw them out again.`;
      case 'fetch_returned':
        if (meetAt) {
          return `Return to ${c.npcName}'s tile — ${meetAt} — with the recovered ${c.goodsShort}. ${p.subjCap} ${p.owes} you ${c.reward.item ? c.reward.item.qty : `${c.reward.tc} TC`}.`;
        }
        return `Return to ${c.npcName}'s tile with the recovered ${c.goodsShort}. ${p.subjCap} ${p.owes} you ${c.reward.item ? c.reward.item.qty : `${c.reward.tc} TC`}.`;
      case 'ambush_armed':
        return `Walk home with the ${c.goodsShort}. Someone may notice.`;
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
  // OTA-1548 — stage-aware for EVERY chain, labels from the chain's own
  // content. Yulka's labels render exactly as they always did.
  const chain = findChain(whisper.id);
  if (chain) {
    const c = chain.content;
    switch (whisper.stage) {
      case 'fetch_in_progress':
      case 'fetch_active':
        return thief ? { gridX: thief.x, gridY: thief.y, label: c.fetchRouteLabel } : null;
      case 'fetch_returned':
        return hasTarget ? { gridX: target.x, gridY: target.y, label: c.returnRouteLabel } : null;
      case 'planted':
      case 'met_yulka':
        return hasTarget ? { gridX: target.x, gridY: target.y, label: c.meetRouteLabel } : null;
      default:
        return null; // ambush_armed / done — no fixed tile.
    }
  }
  // Unknown chain id (a save from a future build): route to whatever tile the
  // record itself names.
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

/** OTA-1548 — build a chain's stolen-goods item, fresh off the mark. The
 *  name is the return step's lookup key, so it comes from the chain content
 *  and nowhere else. */
export function makeStolenGoods(chain: ChainDef): InventoryItem {
  return {
    id: `whisper_loot_${Date.now()}_${rollDie(9999)}`,
    name: chain.content.stolen.name,
    kind: 'misc',
    rarity: 'Uncommon',
    quantity: chain.content.stolen.qty,
    tags: chain.content.stolen.tags,
  };
}

/** Build a fresh "Stolen Aetheric Discs" inventory item. Kept for the suites
 *  that exercise the Yulka chain directly; new code goes through
 *  makeStolenGoods so the name and the chain can never disagree. */
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

/** OTA-1548 — build a chain's reward (or buy-grant) item. */
export function makeChainRewardItem(r: ChainReward): InventoryItem {
  return {
    id: `whisper_reward_${Date.now()}_${rollDie(9999)}`,
    name: r.name,
    kind: 'misc',
    rarity: r.rarity,
    quantity: r.qty,
    tags: r.tags,
  };
}

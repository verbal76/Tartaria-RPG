// ⚠⚠⚠ OTA-1596 — THE MARK CATCHES UP AT THE DOOR, AND THE SPAWN STANDS UP AT IT.
//
// FROM THE OWNER'S 22:12 SESSION (bundle mthspfn82jjo, device on 1594), the
// hunt he has now re-tested across six OTAs:
//
//   missions: hunt:hunt_servants_doubter stage 1/5 [boss→attack]
//             @great_tartary_plains HERE
//             needs=Servants' Mark of Sanction✗MISSING spawn=Tartarian Raider×3
//   ▸ Silence the Doubter: this is the place — finish it (you still need
//     Servants' Mark of Sanction).
//   [player] ... nothing spawned here to combat
//
// TWO WEDGES, INTERLOCKED. His record sits past stage 0 without stage 0's
// grant — the exact save-state P19's self-heal (grantStageItems) was built
// for. But that heal fires only inside the ATTACK-verb matcher, and a spawn
// stage with nothing yet spawned offers NO attack affordance: no combat chips
// render, and no line tells you to swing at empty air. The heal sat forty
// lines from the player with no road between them. All NINETEEN hunt spawn
// stages are requires-gated the same way — one skipped grant and any of them
// is this tile.
//
// THE FIX MEETS THE PLAYER WHERE THE PLAYER ACTUALLY IS — at arrival:
//
//   1. `healStageDebtsAtArrival` (early in beginScene, before the arrival
//      receipt prints): any tracked contract standing on its stage's ground
//      with the requirement missing gets the earlier stages' grants handed
//      over, so the "this is the place" line prints clean instead of naming a
//      debt the player cannot pay.
//   2. `armSpawnStagesAtArrival` (after the scene commits, so the write is not
//      rebuilt away): a hunt stage that carries a spawn ARMS it the moment the
//      player stands on the ground with the requirement met — through
//      advanceHunt, the same one-writer the verb path uses, so the freeze-for-
//      kill and escort-clear machinery are untouched. This is the owner's own
//      stated model, from OTA-1586: "I set it active and it autoroutes to it,
//      then arrived on the tile. yeah that's me starting it."
//
// ⚠ The two storyline spawn stages (story_truetart_descent_karoksa #3,
// story_order_drowned_library #4) share the requires-gating but their paying
// verbs are typable without a target, so they get the HEAL here and keep the
// verb door for the spawn. Arming them too is a decision for the day one is
// measured stuck.
//
// Lives outside gameStore.ts on the OTA-1583 principle: the cheapest way past
// a shrink-only line ratchet is to put code where it belongs.
//
// ⚠⚠⚠ OTA-1597 — THE TILE IS THE TRIGGER. The owner re-tested on 1596 and the
// Doubter STILL never spawned, because both halves above ran only inside
// beginScene — and his save never produced a beginScene: the slot LOADED him
// already standing on great_tartary_plains; a cardinal step back onto a tile
// whose id currentLocationId ALREADY names is `arrival = null` (stepDirection
// only fires travelTo on a NEW named tile); and continueTravel's in-place
// arrival (arb103) clears the course without any scene rebuild. Three roads
// onto the ground, none of them a "scene arrival".
//
// The owner's spec, verbatim: "all of these missions are token based … you
// need to know that I stepped on that tile. that is it. it is coordinate
// based." So:
//
//   1. The match is the CANON GRID CELL, not currentLocationId — the exact
//      (x,y) the autoroute drives to and the atlas pin marks. A player
//      nominally "at" a location but standing tiles off it is NOT on the
//      ground; a player whose id is stale but whose boots are on the cell IS.
//   2. `checkStandingGround` (heal, then arm) runs from the per-action
//      catch-all beside maybeSeedQuarry, from continueTravel's arrival
//      clears, and from the slot-load seam — every way you can come to be
//      standing on the tile, not just the one that rebuilds a scene. All of
//      it is idempotent: the heal is pack-guarded, the arm is guarded by the
//      live hostiles it just spawned.

import type { GameStore } from './gameStore';

type Get = () => GameStore;
type Set = (fn: (s: GameStore) => Partial<GameStore>) => void;
type GrantStageItems = (
  get: Get,
  set: Set,
  title: string,
  stages: ReadonlyArray<{ grants?: { item: string; quantity?: number } }>,
  from: number,
  to: number,
) => number;

interface StandingStage {
  family: 'hunt' | 'mystery' | 'storyline';
  recId: string;
  title: string;
  stages: ReadonlyArray<{ grants?: { item: string; quantity?: number }; checkKind?: string | null }>;
  stageIndex: number;
  stage: { requires?: { item: string; quantity?: number }; spawn?: { enemyName: string; count?: number }; checkKind?: string | null };
}

/** Every tracked contract whose CURRENT stage stands on the player's ground.
 *  ⚠ OTA-1597 — "ground" means the stage's CANON GRID CELL under the player's
 *  boots. currentLocationId is a label that goes stale in the open (it names
 *  the origin for a whole walk-around); the cell is where the player IS. */
function standingStages(get: Get): StandingStage[] {
  const player = get().player;
  if (!player?.currentLocationId) return [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { playerGridCell } = require('./playerGrid') as typeof import('./playerGrid');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { canonicalCellOf } = require('../engine/worldMap') as typeof import('../engine/worldMap');
  const cell = playerGridCell(player);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../engine/questStage') as typeof import('../engine/questStage');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CM = require('../engine/contractMarkers') as typeof import('../engine/contractMarkers');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { findHuntById } = require('../engine/hunts') as typeof import('../engine/hunts');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { findMysteryById } = require('../engine/mysteries') as typeof import('../engine/mysteries');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { findStorylineById } = require('../engine/factionStorylines') as typeof import('../engine/factionStorylines');

  const out: StandingStage[] = [];
  const consider = (
    family: StandingStage['family'],
    recs: ReadonlyArray<{ id: string; stage: number; tracked?: boolean }> | undefined,
    find: (id: string) => { title: string; stages?: readonly unknown[] } | null | undefined,
    anchorOf: (def: never) => string,
  ) => {
    for (const rec of recs ?? []) {
      if (rec.tracked === false) continue;
      const def = find(rec.id);
      const st = def?.stages?.[rec.stage] as StandingStage['stage'] | undefined;
      if (!def || !st) continue;
      const ground = QS.stageLocationId(st as never, anchorOf(def as never), CM.resolvePosterLocation);
      const gc = canonicalCellOf(ground);
      if (cell.x !== gc.x || cell.y !== gc.y) continue;
      out.push({
        family, recId: rec.id, title: def.title,
        stages: (def.stages ?? []) as StandingStage['stages'],
        stageIndex: rec.stage, stage: st,
      });
    }
  };
  consider('hunt', player.activeHunts, findHuntById as never, ((d: never) => CM.huntAnchorId(d)) as never);
  consider('mystery', player.activeMysteries, findMysteryById as never, ((d: never) => CM.contractAnchorId(d)) as never);
  consider('storyline', player.activeStorylines, findStorylineById as never, ((d: never) => CM.contractAnchorId(d)) as never);
  return out;
}

/** Half 1 — the debt is settled BEFORE the arrival receipt prints. */
export function healStageDebtsAtArrival(get: Get, set: Set, grantStageItems: GrantStageItems): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../engine/questStage') as typeof import('../engine/questStage');
  for (const s of standingStages(get)) {
    const inv = get().player?.inventory ?? [];
    if (QS.stageRequirementMet(s.stage as never, inv)) continue;
    const landed = grantStageItems(get, set, s.title, s.stages, 0, s.stageIndex);
    if (landed > 0 && QS.stageRequirementMet(s.stage as never, get().player?.inventory ?? [])) {
      get().appendLog(
        'arbiter',
        `The Arbiter checks your pack against ${s.title}'s earlier steps and hands over what they owed you. You're squared for this ground.`,
      );
    }
    // Still short after the heal → the arrival line's "(you still need X)"
    // clause stands, and it is the honest answer.
  }
}

/** Half 2 — a hunt spawn stage arms when the player stands on it, paid up. */
export function armSpawnStagesAtArrival(get: Get, _set: Set): void {
  const player = get().player;
  // ⚠ Never inside a roof — these grounds are open country, and a pack spawned
  // into an outpost room would be OTA-1583's machinery pointed at furniture.
  // OTA-1597 — the building-interior and no-scene cases join the guard: this
  // now runs per ACTION, and advanceHunt narrates every call, so a spawn that
  // could not land (nowhere to put enemies) would re-narrate forever.
  if (!player || player.hubRoomId || get().activeBuildingId || !get().currentScene) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../engine/questStage') as typeof import('../engine/questStage');
  for (const s of standingStages(get)) {
    if (s.family !== 'hunt') continue;
    // ⚠⚠⚠ OTA-1601 — THE APEX FIRES AT ARRIVAL TOO. Owner, on the crest leg:
    // "I autoroutes to the last stage of the mission again and nothing
    // happened, I had to yell fight me again ... it should fire as soon as I
    // step on the tile and I should be dropped right into the fight." All 18
    // final boss stages carry no authored spawn, so the spawn-only arm walked
    // right past them — the one fight in every hunt that only the typed verb
    // could start. The FINAL boss is the exact set advanceHunt freezes for the
    // kill (mid-hunt boss beats all carry spawns and already arm); firing it
    // here mirrors that freeze rule, so a stage this arms never routes away
    // mid-spawn. Same one-writer, same curtain: narration, scaled apex,
    // stinger, freeze.
    let lastBossIdx = -1;
    for (let i = 0; i < s.stages.length; i++) {
      if (s.stages[i]?.checkKind === 'boss') lastBossIdx = i;
    }
    const firesHere = !!s.stage.spawn
      || (s.stage.checkKind === 'boss' && s.stageIndex === lastBossIdx);
    if (!firesHere) continue;
    if (!QS.stageRequirementMet(s.stage as never, get().player?.inventory ?? [])) continue;
    // ⚠ A live hostile already on the tile keeps the door: stacking the pack
    // onto an ambient fight is a pile-on nothing authored. The verb path (and
    // the next arrival) still arm it once the ground is clear.
    const scene = get().currentScene;
    const liveHostiles = (scene?.enemies ?? []).some((_, i) => (scene?.enemyHps?.[i] ?? 0) > 0);
    if (liveHostiles) continue;
    // One writer: the same advance the attack verb and the card run — the
    // narration, the spawn, the freeze-for-kill, the escort clear all come
    // from machinery this file does not duplicate.
    get().advanceHunt(s.recId);
    return; // one armed fight per arrival — two packs at once helps nobody.
  }
}

/** ⚠⚠ OTA-1597 — THE ONE DOOR for every way of standing on the tile: heal the
 *  record's debts, then arm the fight. Called from the per-action catch-all
 *  (typed cardinals, chips, any verb while standing there), from
 *  continueTravel's cell-based arrival clears (the CONTINUE button bypasses
 *  submitPlayerAction), and from the slot-load seam (a save that opens with
 *  boots already on the ground). beginScene keeps its own two calls for the
 *  routed-arrival copy ordering. Every path is idempotent, so overlap between
 *  these doors costs nothing — but a route in cannot silently miss. */
export function checkStandingGround(get: Get, set: Set, grantStageItems: GrantStageItems): void {
  healStageDebtsAtArrival(get, set, grantStageItems);
  armSpawnStagesAtArrival(get, set);
}

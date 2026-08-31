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
  stages: ReadonlyArray<{ grants?: { item: string; quantity?: number } }>;
  stageIndex: number;
  stage: { requires?: { item: string; quantity?: number }; spawn?: { enemyName: string; count?: number } };
}

/** Every tracked contract whose CURRENT stage stands on the player's ground. */
function standingStages(get: Get): StandingStage[] {
  const player = get().player;
  if (!player?.currentLocationId) return [];
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
      if (player.currentLocationId !== ground) continue;
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
  if (!player || player.hubRoomId) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../engine/questStage') as typeof import('../engine/questStage');
  for (const s of standingStages(get)) {
    if (s.family !== 'hunt' || !s.stage.spawn) continue;
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

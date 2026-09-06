/**
 * OTA-1400 — SLICE 9 OF THE gameStore SPLIT: contracts, in all four families.
 *
 * Twenty-five actions, 2,164 lines. Faction quests, hunts, mysteries and
 * storylines — accept, advance, turn in — plus the admin around them: activate,
 * abandon, complete from the UI, reserve an item against a requirement, and the
 * notices that tell the player any of it happened.
 *
 * ⚠⚠ SLICE 8 MEASURED AND SPLIT. SLICE 9 MEASURED AND DID NOT — same method,
 * opposite answer, and that is the whole argument for measuring rather than
 * assuming.
 *
 * The four families LOOK like four jobs. They are one:
 *
 *     faction ∩ hunt      = 17 shared module symbols
 *     hunt    ∩ storyline = 18
 *     mystery ∩ storyline = 18
 *
 * out of roughly twenty each. Four files here would have meant four deps objects
 * naming almost the same twenty functions — four copies of one coupling, which
 * says less than one honest copy of it. Slice 8's three files were justified by
 * the mirror-image result (inventory ∩ crafting was EMPTY); the test is the
 * same, the answer differs because the code differs.
 *
 * ⚠⚠ AND THE ONE THING THAT DID SPLIT OFF IS THE ONE NOBODY WOULD HAVE GUESSED.
 * The mission BOARD — read it, freeze it, take or decline an offer, accept a
 * bounty — shares ZERO module symbols with all four families and zero with the
 * contract admin. It reads as part of the quest system and is not: it is where
 * offers are POSTED, not where contracts are run. It went to `boardSlice.ts`,
 * 209 lines and two deps.
 *
 * ⚠ ONE MUTABLE `let` TRAVELLED — `lastAcceptChaTrainAtHours`, the in-game-hour
 * cooldown that stops accept→abandon→re-accept from being a free charisma grind.
 * Its only reads and writes are inside `trainAcceptCharismaGated`, which only
 * these actions call, so it had no choice: leaving it behind would have been
 * assigning to an imported binding, which does not compile.
 *
 * ⚠⚠ AND ONE HELPER THAT LOOKED EXCLUSIVE WAS INJECTED INSTEAD, WHICH IS THE
 * SAME RULE READ THE OTHER WAY. `nextAcceptBurstIndex` is called by exactly one
 * thing — `acceptIsCompact`, which did move — so the scan flagged it as
 * exclusive. It is not: it READS `_burstCount` and `_burstLastAt`, module state
 * owned by `bumpQuestsAccepted`, which stays. Moving it would have stranded
 * that state or stolen it. Exclusive CALLERS do not make a helper exclusive;
 * exclusive STATE does.
 *
 * ⚠ Six more private helpers came with the actions for the ordinary reason —
 * `creditTurnIn`, `turnInCounterparty`, `plantNextContractHint`,
 * `isBrokerVendorId`, `acceptIsCompact` and `parkedTag` are referenced nowhere
 * else in the store.
 *
 * ⚠ WHAT DID NOT CHANGE: twenty-five bodies, verbatim.
 */
import { withArticle, theLower, pluralizeNoun } from '../../engine/grammar';
import type { PlayerCharacter, Quest, InventoryItem } from '../../engine/types';
import { recordNpcDealing } from '../../engine/npcMemory';
import { isQuestLockedItem } from '../../engine/questItems';
import { generateQuest } from '../../engine/questGenerator';
import { pick } from '../../engine/rng';
import { getItemPreview } from '../../components/itemPreview';
import { mergeOrPushItem, grantItem } from '../../engine/inventory';
import { lookupCraftedItem, type Recipe } from '../../engine/crafting';
import { VENDORS } from '../../engine/vendors';
import { trainStat } from '../../engine/statTraining';
import { findQuestFactionHint } from '../../engine/factionHint';
import { isHubLocation, hubRoomFor, hubSkinFactionFor, hubOwnerFaction } from '../../engine/hub';
import { rapportQuestId, chaPriceDiscount } from '../../engine/factionRapport';
import { effectiveStats } from '../../engine/equipment';
import { stampDurability } from '../../engine/durability';
import { FACTIONS, applyRepChange, getStanding } from '../../engine/factions';
// ⚠ OTA-1402 — ONE phrasing of the wrong-counterparty refusal. Four sites had
// four, and they had already drifted: two said "Wrong agent", one "wrong
// faction", one "waves you off". See app/engine/contractRefusal.ts.
import {
  WRONG_COUNTERPARTY_TITLE,
  factionDisplayName,
  wrongCounterpartyBody,
  wrongCounterpartyLine,
} from '../../engine/contractRefusal';
import { findFactionQuestById, availableFactionQuests, factionOfFactionQuest } from '../../engine/factionQuests';
import { HUNTS, findHuntById, availableHunts, fuzzyFindHunt, scaleHuntBoss, scaleHuntEscort, firstActionableHuntStage, huntBlockReason, emptyBoardTally, emptyBoardLine } from '../../engine/hunts';
import { firstActionableStage as QS_firstActionableStage } from '../../engine/questStage';
import { MYSTERIES, findMysteryById, availableMysteries, fuzzyFindMystery } from '../../engine/mysteries';
import { findStorylineById, availableStorylines, fuzzyFindStoryline } from '../../engine/factionStorylines';

/**
 * ⚠ `import type * as` is fully erased at compile time, so this is NOT a runtime
 * cycle. It lets every dep below be typed `typeof Store.fn`, which means their
 * signatures cannot drift from the real functions: change one in gameStore and
 * this file stops compiling rather than silently accepting the wrong shape.
 */
import { fuzzyFindFactionQuest } from '../../engine/factionQuests';
// ⚠ OTA-1583 — pure data module, safe to import for value: an ambush hands the
// player the SAME `surprised` effect a lost initiative does.
import { applyEffect } from '../../engine/statusEffects';
// ⚠ OTA-1583 — the escort clear moved here from gameStore; it asks the same
// "where does this chain actually continue" question the accept doors ask.
import { nextActionableStage } from '../../engine/questStage';
import type * as Store from '../gameStore';
// ⚠ OTA-1404 — type-only, same as the Store import above and for the same
//   reason: it is erased at compile time, so it cannot form a runtime cycle.
import type * as Combat from '../combatResolution';

type GameStore = Store.GameStore;
type CurrentScene = Store.CurrentScene;
/** ⚠ gameStore declares this union privately; re-stated here rather than
 *  exported, because widening a store internal to satisfy a move is a change
 *  to the store's public surface hiding inside a relocation. */
type ContractKind = 'hunt' | 'mystery' | 'storyline' | 'faction_quest';
type SetState = (
  partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
) => void;


export interface QuestSlice {
  generateNewQuest: () => Quest;
  acceptFactionQuest: (titleOrId: string) => void;
  setFactionQuestActive: (id: string, active?: boolean) => void;
  routeMission: (id: string) => void;
  turnInFactionQuest: (titleOrId: string, remote?: boolean) => void;
  acceptHunt: (titleOrId: string) => void;
  /** ⚠⚠ OTA-1581 — `peaceful` means NOBODY IS PUT IN FRONT OF YOU. Two callers,
   *  both from the mission conversation card: a persuade that landed (owner's
   *  rule 4 — *"a good enough charisma roll should eliminate the fight and you
   *  complete that stage"*), and TAKE in the aftermath, where the bodies are
   *  already down and re-running the spawn would stand them back up. The stage
   *  advances exactly as it would have; only the spawn and the freeze-for-kill
   *  are skipped. Absent/false is the old behaviour, unchanged. */
  advanceHunt: (huntId: string, opts?: { peaceful?: boolean }) => void;
  /** OTA-1600 — the stinger popup state + its one dismiss.
   *  ⚠ OTA-1622 — carries the close's freight too (`next`, `granted`) when a
   *  fight stood up on a stage that also closed. */
  pendingMissionStinger: MissionCloseCard | null;
  dismissMissionStinger: () => void;
  /** OTA-1602 — the beat card. ⚠⚠⚠ OTA-1622 — EVERY close raises it now, not
   *  only the same-tile, no-fight, not-last ones: see `raiseMissionClose`. */
  pendingMissionBeat: MissionCloseCard | null;
  dismissMissionBeat: () => void;
  /** OTA-1622 — a close that lands while a card is already up WAITS here
   *  instead of overwriting it; CONTINUE brings the next one forward. */
  missionCloseQueue: MissionCloseCard[];
  /** OTA-1610 — a successful flee holds the ground trigger on the fled cell
   *  until the boots actually leave it (any cell change clears it). */
  missionFleeHoldCell: { x: number; y: number } | null;
  turnInHunt: (titleOrId: string, remote?: boolean) => void;
  acceptMystery: (titleOrId: string) => void;
  advanceMystery: (mysteryId: string) => void;
  turnInMystery: (titleOrId: string, remote?: boolean) => void;
  acceptStoryline: (titleOrId: string) => void;
  advanceStoryline: (storylineId: string) => void;
  turnInStoryline: (titleOrId: string, remote?: boolean) => void;
  setContractActive: (
    kind: 'hunt' | 'mystery' | 'storyline' | 'faction_quest' | 'whisper' | 'lead' | 'broker',
    id: string,
    active?: boolean,
  ) => void;
  completeContractFromUI: (
    kind: 'hunt' | 'mystery' | 'storyline' | 'faction_quest',
    id: string,
  ) => void;
  completeContractFromUIInner: (
    kind: 'hunt' | 'mystery' | 'storyline' | 'faction_quest',
    id: string,
  ) => void;
  abandonContract: (kind: 'hunt' | 'mystery' | 'storyline' | 'faction_quest' | 'whisper' | 'broker', id: string) => void;
  requestContractsTab: (tab: 'contracts' | 'collectables') => void;
  clearPendingContractsTab: () => void;
  toggleReserveForQuest: (itemId: string) => void;
  clearMissionCompleteNotice: () => void;
  clearContractsNotice: () => void;
  sendContractByRunner: (kind: 'faction_quest' | 'mystery' | 'storyline', id: string) => void;
  announceMissionComplete: (kind: string, title: string, body: string) => void;
  raiseMissionCompleteNotice: (kind: string, title: string, body: string) => void;
}

export interface QuestSliceDeps {
  FRESH_ENEMY_ARRAYS: typeof Store.FRESH_ENEMY_ARRAYS;
  _chainRouting: typeof Store._chainRouting;
  acceptCellStamp: typeof Store.acceptCellStamp;
  advanceMissionRoute: typeof Store.advanceMissionRoute;
  advanceTime: typeof Store.advanceTime;
  anyTrackedContract: typeof Store.anyTrackedContract;
  // ⚠ OTA-1404 — these two now live in the combat leaf rather than the store.
  //   The dep threading is unchanged; only the address they are TYPED against moved.
  applyEscortDamage: typeof Combat.applyEscortDamage;
  applyTrainAndLog: typeof Store.applyTrainAndLog;
  bumpQuestsAccepted: typeof Store.bumpQuestsAccepted;
  desiredMissionLeg: typeof Store.desiredMissionLeg;
  failEscortQuests: typeof Combat.failEscortQuests;
  /** ⚠ OTA-1583 — the ONE enemy volley every combat round already runs. An
   *  ambush's first blood routes through it rather than inventing a second way
   *  for enemies to hit the player. Threaded like the two above to keep this
   *  file free of a runtime cycle. */
  runEnemyGroupCounters: typeof Combat.runEnemyGroupCounters;
  freshInstanceId: typeof Store.freshInstanceId;
  grantStageItems: typeof Store.grantStageItems;
  logRepChanges: typeof Store.logRepChanges;
  maybeTeachRecipeReward: typeof Store.maybeTeachRecipeReward;
  mergeRewardLines: typeof Store.mergeRewardLines;
  nextAcceptBurstIndex: typeof Store.nextAcceptBurstIndex;
  recordMemorableEvent: typeof Store.recordMemorableEvent;
  safeLocName: typeof Store.safeLocName;
  sameStackUnit: typeof Store.sameStackUnit;
  scalePowerOf: typeof Store.scalePowerOf;
  sightPerson: typeof Store.sightPerson;
  statNowClause: typeof Store.statNowClause;
  vendorNpcId: typeof Store.vendorNpcId;
}

/**
 * ⚠⚠⚠ OTA-1583 — THE ESCORT CLEAR, MOVED OUT OF THE COMBAT PATH.
 *
 * It lived inside `resolveEnemyDefeat` in gameStore: ninety lines of
 * CONTRACT-STAGE logic — which record is on a spawn stage, is this the last of
 * the pack, does the conversation card own the aftermath, which family's array
 * to bump, what to read out on the way past an epilogue — sitting in the middle
 * of a combat function. It belongs here, beside the code that stood the pack up.
 *
 * ⚠ THE MOVE WAS FORCED BY A RATCHET, AND THAT IS THE RATCHET WORKING. gameStore
 * is under a shrink-only line ceiling (OTA-1400's slice programme) and this OTA
 * pushed it seven lines over. The cheapest way past a ceiling is always to put
 * code where it belongs rather than to raise the ceiling.
 *
 * Behaviour is unchanged. Called once, from resolveEnemyDefeat.
 */
export function resolveStageEscortClear(
  get: () => GameStore,
  set: SetState,
  player: PlayerCharacter,
  enemy: { name: string; stageKey?: string },
  activeIdx: number,
): void {
  // ⚠⚠⚠ OTA-1578 — CLEARING THE ESCORT IS WHAT RESOLVES A FALSE SUMMIT. OTA-1576
  // gave the stage its own spawn, but the stage still advanced the moment the
  // pack APPEARED (`freezeForKill` only covered the final boss), so a player
  // could walk away from three raiders and be on the next beat anyway. The
  // owner's ruling: "have someone there waiting to fight to resolve that stage
  // to move to the next." So the beat now costs what it says it costs — the
  // stage holds until the last of them is down.
  //
  // ⚠⚠⚠ OTA-1583 — AND IT COVERS ALL THREE FAMILIES NOW. `spawn` moved up to
  // the shared StageBinding so a storyline whose prose says an Aetheric Ooze
  // "bars the only stair" can actually put it on the stair — but a spawn with
  // no clear is a WEDGE, not a feature: the chapter holds for a kill nothing
  // is watching for. This block was hunt-only, so extending the spawn without
  // extending the clear would have bricked that storyline on the stage it was
  // meant to fix. One list, three families, one clear.
  {
    type EscortHit = {
      family: 'hunt' | 'mystery' | 'storyline';
      rec: { id: string; stage: number };
      def: { id: string; title: string; stages: ReadonlyArray<{ narration: string; arbiter: string | null; checkKind: string | null; npcName?: string; spawn?: { enemyName: string } }> };
    };
    const escortRec: EscortHit | undefined = [
      ...(player.activeHunts ?? []).map((rec) => ({ family: 'hunt' as const, rec, def: findHuntById(rec.id) })),
      ...(player.activeMysteries ?? []).map((rec) => ({ family: 'mystery' as const, rec, def: findMysteryById(rec.id) })),
      ...(player.activeStorylines ?? []).map((rec) => ({ family: 'storyline' as const, rec, def: findStorylineById(rec.id) })),
    ].find(({ family, rec, def }) =>
      // ⚠⚠⚠ OTA-1703 — THE STAGE COUNTS ITS OWN BODIES. The name alone let a
      // corruption apparition that happened to be an Aetheric Raven close the
      // harpy hunt's four-raven stage on the Cradle of Dusk before the four
      // ravens existed (the arrival arm waits while a live hostile is on the
      // tile; the wanderer died; "The last of them is down"). A body counts
      // for a stage only when it carries that stage's key — spawnStageEscort
      // stamps every body it stands up. Bodies saved mid-fight before this OTA
      // carry none and no longer close the stage; the arrival door stands the
      // stage's own pack up once they fall.
      def?.stages[rec.stage]?.spawn?.enemyName === enemy.name
        && enemy.stageKey === `${family}:${rec.id}:${rec.stage}`) as EscortHit | undefined;
    if (escortRec?.def) {
      // Is this the LAST of them? The scene is read live because the corpse
      // count is what decides, not the spawn count — a fight can be joined by
      // a wandering third party, and one of those must not resolve the stage.
      // ⚠⚠ EXCLUDE THE ONE BEING RESOLVED. This runs DURING the defeat, and the
      // dying body's HP is not necessarily written back to 0 yet — reading the
      // scene naively counts the corpse as still standing, so the last kill
      // never satisfies the check and the stage can never close. That would
      // have made both false-summit hunts unfinishable, which is a worse bug
      // than the one this OTA set out to fix. Keyed on INDEX, because three
      // raiders share a name and identity here is positional.
      // ⚠ OTA-1612 — "STILL UP" MEANS CONSCIOUS, the same correction OTA-1089
      // made to the combat loop. Now that a knockout credits objectives, a pack
      // subdued rather than killed reaches here with live HP on every sleeping
      // body — and without this clause the escort stage could never close for a
      // player who wins by mercy, which is exactly the win 1612 legitimizes.
      const live = get().currentScene;
      const stillUp = (live?.enemies ?? []).some(
        (e, i) => i !== activeIdx && e.name === enemy.name && e.stageKey === enemy.stageKey && (live!.enemyHps[i] ?? 0) > 0
          && !(live!.enemyKnockedOut?.[i] ?? false),
      );
      if (!stillUp) {
        // ⚠⚠⚠ OTA-1581 — IF THE CARD SENT YOU INTO THIS FIGHT, THE CARD FINISHES
        // IT. Owner's rule 8, verbatim: *"if it does go to a fight, it drops back
        // into the exploration screen until that part is over. then it goes back
        // to the pop-up to resolve the rest of it."* The rest of it is TAKE or
        // TAKE AND KILL — his rule 7 — and both of those close the stage
        // themselves, peacefully, from the card.
        //
        // ⚠ So this branch must NOT advance here. Advancing would hand the player
        // the next beat while a body they were told they could rob is still on the
        // ground with the card's aftermath never shown — the beat promised in the
        // buttons, silently skipped. It is the same disease as the burial bugs,
        // only committed by the engine instead of the feed.
        const encKey = `${escortRec.family}:${escortRec.rec.id}:${escortRec.rec.stage}`;
        const owning = get().player?.missionEncounters?.[encKey];
        if (owning?.phase === 'fighting') {
          set((st) => (st.player
            ? {
                player: {
                  ...st.player,
                  missionEncounters: {
                    ...(st.player.missionEncounters ?? {}),
                    [encKey]: { ...owning, phase: 'aftermath' as const },
                  },
                },
              }
            : st));
          get().appendLog('reward', `✦ The last of them is down. There is business left with ${escortRec.def.stages[escortRec.rec.stage]?.npcName ?? 'them'}.`);
          void get().persist();
        } else {
          // ⚠ NOT a `return` — the rest of resolveEnemyDefeat (the hunt-boss
          // kill, loot, the standing writes) still has to run for this corpse.
          // Only the STAGE ADVANCE is what the card takes over.
          // ⚠⚠⚠ OTA-1583 — NOT A BARE `+ 1`. A pure-narration beat behind a
          // spawn stage — `story_order_drowned_library` has exactly that, the
          // Ooze on 4 and an epilogue on 5 — parked the record ON a stage no
          // verb can pay, because the auto-consume loops live inside `advance*`
          // and never see the kill path. The mystery/storyline walker caught it
          // within the hour. Same question the accept doors ask, asked from
          // here, and each skipped beat still gets read out.
          const nextStage = nextActionableStage(escortRec.def.stages, escortRec.rec.stage + 1);
          for (let i = escortRec.rec.stage + 1; i < nextStage; i += 1) {
            const skipped = escortRec.def.stages[i];
            if (!skipped) continue;
            get().appendLog('world', skipped.narration);
            if (skipped.arbiter) get().appendLog('arbiter', skipped.arbiter);
          }
          // ⚠ The record lives on a different array per family; the advance is
          // otherwise identical, so the list is chosen and the rest is shared.
          const bump = <T extends { id: string; stage: number }>(list: T[] | undefined): T[] =>
            (list ?? []).map((r) => (r.id === escortRec.rec.id ? { ...r, stage: nextStage } : r));
          set((st) => (st.player
            ? {
                player: {
                  ...st.player,
                  ...(escortRec.family === 'hunt' ? { activeHunts: bump(st.player.activeHunts) } : {}),
                  ...(escortRec.family === 'mystery' ? { activeMysteries: bump(st.player.activeMysteries) } : {}),
                  ...(escortRec.family === 'storyline' ? { activeStorylines: bump(st.player.activeStorylines) } : {}),
                },
              }
            : st));
          const nextDef = escortRec.def.stages[nextStage];
          get().appendLog('reward', `✦ The last of them is down. "${escortRec.def.title}" moves on.`);
          // OTA-1622 — the direction the block below composes rides onto the
          // close card raised after it.
          let clearNext: string | null = null;
          // ⚠⚠ OTA-1687 — THE NEXT BEAT'S PROSE WAITS FOR THE NEXT BEAT WHEN THE
          // GROUND MOVES. This printed `nextDef.narration` (and its Arbiter line)
          // at every clear and carried it on the close card, so the contrary
          // walker read "Mira reads the locket without crying" on the Mud Flood
          // Nexus, 46 tiles from her holding, and "the Dragon uncoils from" the
          // steeple while standing on the Mud Seas — then read both again on the
          // ground, where advanceHunt and the conversation card say them properly.
          // The one case that keeps the prose here: a next stage on THIS ground,
          // which no arrival will ever narrate (OTA-1622's same-tile close).
          let movedGround = false;
          if (nextDef) {
            // ⚠⚠ OTA-1601 — THE DIRECTION AND THE ROUTE MOVED HERE from the
            // spawn call. advanceHunt used to announce and route the next
            // stage BEFORE the fight it had just stood up — and once fight-
            // grounds went adjacent, the one-tile route completed instantly
            // and dragged the player off the ground mid-spawn. A frozen stage
            // advances HERE, when the last body drops — so this is where the
            // player is told where the trail goes, and the road is set.
            {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const QS = require('../../engine/questStage') as typeof import('../../engine/questStage');
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const CM = require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers');
              const anchor = escortRec.family === 'hunt'
                ? CM.huntAnchorId(escortRec.def as never)
                : CM.contractAnchorId(escortRec.def as never);
              const clearedDef = escortRec.def.stages[escortRec.rec.stage];
              const hereId = QS.stageLocationId(clearedDef as never, anchor, CM.resolvePosterLocation);
              const nextId = QS.stageLocationId(nextDef as never, anchor, CM.resolvePosterLocation);
              movedGround = nextId !== hereId;
              if (!movedGround) get().appendLog('world', nextDef.narration);
              if (!movedGround && nextDef.arbiter) get().appendLog('arbiter', nextDef.arbiter);
              const dir = QS.nextStageDirection(nextDef as never, (nextDef as { locationName?: string }).locationName ?? null, movedGround, escortRec.family);
              if (dir) get().appendLog('system', dir);
              clearNext = dir ?? null;
              const liveNow = get().player;
              if (movedGround && liveNow && liveNow.currentLocationId !== nextId
                  && liveNow.travelTarget?.locationId !== nextId) {
                get().setTravelCourse(nextId);
                if (get().player?.travelTarget?.locationId === nextId) {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const { getLocationById } = require('../../engine/encounter') as typeof import('../../engine/encounter');
                  get().appendLog('world', `Auto-routing to the next stage of ${escortRec.def.title}: ${getLocationById(nextId)?.name ?? nextId}.`);
                }
              }
            }
          } else if (escortRec.family === 'storyline') {
            // ⚠⚠⚠ OTA-1583 — A CHAIN THAT ENDS ON A KILL STILL HAS TO SAY IT IS
            // OVER. `story_order_drowned_library` now closes on the Ooze, and the
            // "complete in the field" notice lives in `advanceStoryline` — which
            // this path deliberately does not call. The walker caught it: the
            // record reached `stages.length` and the player was told nothing.
            // A chapter that ends in silence is the same defect as a beat that
            // happens in silence, which is the whole subject of this run of OTAs.
            get().appendLog(
              'reward',
              `✦ Storyline complete in the field — ${escortRec.def.title}. Return to a posting agent to turn it in.`,
            );
          } else if (escortRec.family === 'mystery') {
            // ⚠ OTA-1622 — a mystery ending on a kill said NOTHING here (only
            // the storyline branch above had a line). Same defect, same fix.
            get().appendLog(
              'reward',
              `✦ "${escortRec.def.title}" is done in the field. Return to a posting agent to turn it in.`,
            );
          }
          // ⚠⚠⚠ OTA-1622 — THE CLEAR IS A CLOSE, so it is a card: over the field
          // it just cleared, with the next beat's prose and command word.
          raiseMissionClose(get, set, {
            title: escortRec.def.title,
            // OTA-1687 — the card carries the next beat's prose only when the
            // beat is on this ground (see the note above).
            line: `The last of them is down.${nextDef && !movedGround ? `\n\n${nextDef.narration}` : ''}`,
            next: nextDef
              ? clearNext
              : escortRec.family === 'storyline'
                ? `✦ Storyline complete in the field — ${escortRec.def.title}. Return to a posting agent to turn it in.`
                : `✦ "${escortRec.def.title}" is done in the field. Return to a posting agent to turn it in.`,
            granted: [],
          });
          void get().persist();
        }
      }
    }
  }
}

/** ⚠⚠⚠ OTA-1622 — THE CARD EVERY CLOSE RAISES. */
export interface MissionCloseCard {
  title: string;
  /** The closing prose (or the stinger line when a fight stood up). */
  line: string;
  /** "▸ Next: … · <ask> · bring …" — or the turn-in line on a final close. */
  next: string | null;
  /** What the close put in the pack — the thing the owner never knew he had. */
  granted: string[];
}

/**
 * ⚠⚠⚠ OTA-1622 — EVERY STAGE CLOSE POPS UP IN YOUR FACE. Owner's rule, verbatim:
 * *"every time you should finish a segment of a mission or a quest or whatever
 * it is. it shouldn't be quiet. it shouldn't be able to be buried in the log
 * feed. it should pop up on your face. you should know that you did the thing
 * so you can just move on. I spent so much time on that scaled never even
 * knowing that I had it even if it would have spawned a fight and we
 * interrupted the fight with the pop-up out of disfleed and left and moved on
 * with the mission."*
 *
 * THE MEASUREMENT. His 01:43:31 log: the scale stage of the Bog Dragon hunt
 * closed — narration, "✦ … — mission item.", "▸ Next: …" — three lines that a
 * Gutter Rat ambush on the same action pushed up the feed before he looked. He
 * went on typing the closed stage's verb for twenty minutes. OTA-1602's beat
 * card existed and did not fire: it was gated three ways (same tile only, no
 * fight stood up, not the last stage). A close that MOVED the ground was
 * feed-only ("the travel leg is the separator" — it was not; the ambush was).
 * The escort clear, the apex kill, every final stage and the whole faction
 * family were feed-only too. The player-shaped walker's very first hunt
 * reported "closed with NO card" on all five stages.
 *
 * ⚠⚠ ONE WRITER. Every path that moves a record forward calls this; nothing
 * else sets `pendingMissionBeat`/`pendingMissionStinger` (ota1622 pins the
 * count). A `fight` card goes up as the stinger (FIGHT button, over the field);
 * everything else is a CONTINUE card. A second close while one is up WAITS in
 * `missionCloseQueue` — a card that overwrites a card is a buried card. The
 * feed keeps every line it printed before; the card is in addition, and the
 * raise is logged so a device log can prove it went up.
 */
export function raiseMissionClose(
  get: () => GameStore,
  // ⚠ The function form only — gameStore's helpers and defeatCredit carry a
  // narrower setter than the slice's SetState, and this writer needs no more.
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  card: MissionCloseCard & { fight?: boolean },
): void {
  const { fight, ...rest } = card;
  get().appendLog('debug', `mission card: "${card.title}" · ${fight ? 'fight' : 'close'}${card.next ? ` · ${card.next}` : ''}${card.granted.length ? ` · got ${card.granted.join(', ')}` : ''}`);
  if (fight) {
    set(() => ({ pendingMissionStinger: rest }));
    return;
  }
  if (get().pendingMissionBeat) {
    set((s) => ({ missionCloseQueue: [...(s.missionCloseQueue ?? []), rest] }));
    return;
  }
  set(() => ({ pendingMissionBeat: rest }));
}

/** The grants in `stages[from, to)` that are actually in the pack now — what
 *  the close card lists. Pack-checked, like `grantStageItems`, so a receipt
 *  never names a thing that did not arrive. */
export function grantedNames(
  get: () => GameStore,
  stages: ReadonlyArray<{ grants?: { item: string; quantity?: number } }>,
  from: number,
  to: number,
): string[] {
  const inv = get().player?.inventory ?? [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../../engine/questStage') as typeof import('../../engine/questStage');
  const out: string[] = [];
  for (let i = Math.max(0, from); i < Math.min(to, stages.length); i++) {
    const g = stages[i]?.grants;
    if (!g) continue;
    if (QS.countInPack(inv, g.item) >= (g.quantity ?? 1)) out.push(g.item);
  }
  return out;
}

/**
 * ⚠⚠⚠ OTA-1583 — WHAT THE STAGE SAID WOULD BE THERE, PUT THERE. One writer, all
 * three families.
 *
 * THE MEASUREMENT that forced this. Fourteen hunts carry a mid-chain `boss`
 * stage — the "favor" beat of the standard_7 template — and every one of them
 * names a specific lesser creature in its own prose: a Mud Wraith feeding on a
 * dead boy, a Rust Lurker come to finish an injured apprentice, an Aetheric
 * Raven flock picking a Harpy's cache. Not one of them carried a `spawn`, and a
 * `boss` stage without one spawns `HuntDef.targetEnemyName` — the hunt's
 * LEGENDARY apex — at stage 3 of 7. Then, because only the LAST boss freezes for
 * the kill, the stage advanced on the spawn and the player could simply walk
 * away from it.
 *
 * That is OTA-1576's bug, unfixed. 1576 found it on the two `false_summit`
 * stages, gave those two a `spawn`, and stopped. The same sentence was true of
 * fourteen more.
 *
 * ⚠⚠ AND `spawn` WAS ONLY EVER READ INSIDE THE HUNT BOSS BRANCH, so a storyline
 * could not have one at all: `story_order_drowned_library` says an Aetheric Ooze
 * "bars the only stair" and that you "cut through" it, and nothing was ever on
 * the stair. This helper is called from all three advance paths.
 *
 * ⚠⚠⚠ THE AMBUSH IS THE OWNER'S RULING, verbatim: *"identify an appropriate
 * someone derived from the existing catalogue based on the lore and narration of
 * the mission and make them spawn in and draw first blood — sounds like an
 * ambush to me."* First blood is literal here:
 *
 *   • the pack opens at CLOSE range, not mid — they were already on you;
 *   • the player takes `surprised`, the same effect a lost initiative applies
 *     (−2, disadvantage, consumed once) rather than a new bespoke penalty;
 *   • the enemy group takes ONE volley before the player acts, through
 *     `runEnemyGroupCounters` — the same single volley every combat round runs.
 *
 * Reusing the volley matters: OTA-1017 already made "the enemies went first"
 * a real state, and a second, private way for enemies to hit the player is how
 * two screens come to disagree about how a round works.
 *
 * @returns true when bodies were actually placed.
 */
function spawnStageEscort(
  get: () => GameStore,
  set: SetState,
  deps: QuestSliceDeps,
  player: PlayerCharacter,
  spawn: { enemyName: string; count?: number; ambush?: boolean } | null | undefined,
  /** ⚠ OTA-1703 — the encounter key every body is stamped with (Enemy.stageKey). */
  stageKey: string,
): boolean {
  if (!spawn) return false;
  // ⚠ OTA-1598 belt — never write bodies into a hub room or a building
  // interior. Every caller should already have refused at the door
  // (advanceHunt's truce guard); a caller that forgets fails toward an empty
  // room, never a fight inside the truce. A frozen spawn stage self-heals: the
  // record did not advance, so the verb re-fires the spawn once outside.
  if (get().player?.hubRoomId || get().activeBuildingId) return false;
  const escort = scaleHuntEscort(player, spawn.enemyName, deps.scalePowerOf(player), spawn.count ?? 1);
  if (!escort || escort.length === 0) return false;
  const ambush = spawn.ambush === true;
  const many = escort.length > 1;
  const who = escort[0]!.name;
  set((s) =>
    s.currentScene
      ? {
          currentScene: {
            ...s.currentScene,
            ...deps.FRESH_ENEMY_ARRAYS,
            // ⚠⚠ OTA-1703 — stamped with the stage that owes them, so the clear
            // can tell the stage's ravens from a wandering raven.
            enemies: escort.map((e) => ({ ...e, stageKey })),
            enemyHps: escort.map((e) => e.hp),
            activeEnemyIdx: 0,
            range: ambush ? 'close' : 'mid',
          },
        }
      : s,
  );
  get().appendLog(
    'combat',
    // ⚠ OTA-1686 — "3 Mud Harpys" on the contrary walker's feed: a bare +s
    // where grammar.pluralizeNoun has known the -y and sibilant endings since
    // OTA-817. One pluraliser, like the party announcer.
    ambush
      ? (many
        ? `${escort.length} ${pluralizeNoun(who)} are on you before you have the room to turn.`
        : `${who} is on you before you have the room to turn.`)
      : (many
        ? `${escort.length} ${pluralizeNoun(who)} rise from the positions they were left in.`
        : `${who} rises from the position it was left in.`),
  );
  if (!ambush) return true;
  // ⚠ The penalty lands BEFORE the volley, so the ambusher's opening swing is
  // the one the player is least ready for — which is the whole of "first blood".
  set((s) =>
    s.player
      ? {
          player: {
            ...s.player,
            statusEffects: applyEffect(s.player.statusEffects ?? [], {
              kind: 'surprised',
              remainingRounds: 1,
              label: 'ambushed',
            }),
          },
        }
      : s,
  );
  const live = get().player;
  if (live && (get().currentScene?.enemies.length ?? 0) > 0) {
    deps.runEnemyGroupCounters(get, set, live);
  }
  return true;
}

export const createQuestSlice = (
  set: SetState,
  get: () => GameStore,
  deps: QuestSliceDeps,
): QuestSlice => {
  // ⚠ OTA-1402 — feed rate-limit for the refusal. Ten taps down a contract list
  // is one mistake, not ten; `appendLog`'s dedup only catches EXACT repeats, and
  // the faction name varies per contract, so twenty near-identical lines walked
  // straight through it in the owner's log.
  let lastRefusalLine = '';
  let lastRefusalAt = 0;
  const REFUSAL_FEED_QUIET_MS = 20_000;

  /**
   * ⚠⚠ OTA-1402 — THE REFUSAL, SAID ONCE, IN A PLACE THE PLAYER IS LOOKING.
   *
   * Four sites used to write their own feed line and stop. That produced the
   * owner's 2026-08-20 report — ten taps, twenty feed lines behind a modal, and
   * "all did nothing" — plus a wrong diagnosis (he read it as faction STANDING;
   * it never was). This writes the short line to the feed AND raises the notice
   * carrying the full explanation, which the Contracts screen now renders as a
   * card rather than a strip that scrolls out of view.
   *
   * ⚠ The feed line is RATE-LIMITED and the popup is not. A player working down
   * a list of ten hits this ten times; the feed does not need to say it ten
   * times, but the popup must always reflect the tap that just happened — a
   * suppressed popup is how "the button does nothing" comes back.
   */
  function refuseWrongCounterparty(
    sourceLabel: string,
    contractFactionId: string | null | undefined,
    title?: string | null,
    courier?: { kind: 'faction_quest' | 'mystery' | 'storyline'; id: string },
  ): void {
    const input = { sourceLabel, contractFactionId, title, courierable: !!courier };
    const line = wrongCounterpartyLine(input);
    const now = Date.now();
    if (line !== lastRefusalLine || now - lastRefusalAt > REFUSAL_FEED_QUIET_MS) {
      get().appendLog('arbiter', line);
      lastRefusalLine = line;
      lastRefusalAt = now;
    }
    set({
      contractsNotice: {
        text: line,
        ts: now,
        title: WRONG_COUNTERPARTY_TITLE,
        body: wrongCounterpartyBody(input),
        // ⚠⚠ OTA-1403 — THE WAY OUT, ON THE CARD. The owner's whole report was
        // ten taps into what looked like nothing; telling him why is half a fix,
        // and the other half is letting him do the thing he was trying to do
        // without leaving the screen. Only set when a runner can genuinely carry
        // this one — a button that then refuses is the same failure in a hat.
        ...(courier ? { action: { label: 'SEND BY RUNNER (−25%)', ...courier } } : {}),
      },
    });
  }

  // ⚠⚠ THE PRIVATE HELPERS LIVE INSIDE THE FACTORY, NOT AT MODULE SCOPE, and the
  // reason is worth writing down. They reference injected deps; at module scope
  // they would have no `deps` in scope, and the alternatives were both worse —
  // adding a parameter to each (a signature EDIT inside a move, which is how a
  // reviewer loses the thread) or stashing `deps` in a module-level `let` the
  // factory assigns (silently wrong the second time the factory is called). The
  // factory runs exactly once, in `create<GameStore>(...)`, so a closure costs
  // nothing and the bodies below are byte-for-byte what they were in gameStore.
  /** The first accept of a burst gets the full treatment; everything after it
   *  collapses to one line. Detail is never lost -- poster text, stage narration
   *  and the full danger numbers all live in Contracts, which is where a player
   *  reviewing thirteen commitments is actually going to look. */
  function acceptIsCompact(): boolean {
    return deps.nextAcceptBurstIndex() > 1;
  }
  /** OTA-1050 — credit a finished contract to the person who took it back.
   *
   *  Called from the five announceMissionComplete sites rather than from inside
   *  announceMissionComplete itself, because only the caller knows whether the
   *  turn-in was face to face. A "send word" courier turn-in (OTA-456, faction
   *  quests only) can happen while the player happens to be standing at some
   *  unrelated stall, and crediting that stall would be a lie the greeting layer
   *  then repeats for the rest of the save. */
  function creditTurnIn(
    get: () => GameStore,
    set: (fn: (s: GameStore) => Partial<GameStore>) => void,
    remote: boolean,
  ): void {
    if (remote) return;
    const v = get().currentScene?.vendor;
    if (!v) return; // mission board / faction hall — nobody to credit
    set((s) => ({
      worldMemory: recordNpcDealing(s.worldMemory, deps.vendorNpcId(v), { contractsTurnedIn: 1 }),
    }));
  }
  // OTA-789 — a Hidden Market stall is a neutral-ground BROKER: its Contracts
  // board posts EVERY faction's open work (see VendorContractsModal), not just its
  // own rostered faction. So a contract accepted there usually belongs to a
  // DIFFERENT faction than the vendor. The accept handlers use this to search
  // every faction's pool for a broker vendor (a normal vendor / mission board
  // searches only its single faction).
  function isBrokerVendorId(id: string | null | undefined): boolean {
    return typeof id === 'string' && id.startsWith('hidden_market_');
  }
  /** " (parked)" when a contract lands inactive. Replaces a full dedicated line
   *  ("X added to your slate (paused -- you're already on another contract).
   *  Activate it in Contracts when you're ready.") that repeated verbatim on
   *  every single accept. OTA-992 added that notice deliberately so parked
   *  grants say so -- this keeps the information and drops twelve repetitions
   *  of the sentence explaining it. */
  function parkedTag(tracked: boolean): string {
    return tracked ? '' : ' (parked)';
  }
  function plantNextContractHint(
    get: () => GameStore,
    factionId: string | null,
    kind: ContractKind,
  ): void {
    const player = get().player;
    if (!player) return;
    let nextTitle: string | undefined;
    if (factionId) {
      const rep = getStanding(player.factionStanding, factionId);
      if (kind === 'hunt') {
        const pool = availableHunts(
          factionId,
          rep,
          (player.activeHunts ?? []).map((h) => h.id),
          player.completedHuntIds ?? [],
          player.hpMax, // OTA-1450 — never tease work the board will not post
        );
        nextTitle = pool[0]?.title;
      } else if (kind === 'mystery') {
        const pool = availableMysteries(
          factionId,
          rep,
          (player.activeMysteries ?? []).map((m) => m.id),
          player.completedMysteryIds ?? [],
        );
        nextTitle = pool[0]?.title;
      } else if (kind === 'storyline') {
        const pool = availableStorylines(
          factionId,
          rep,
          (player.activeStorylines ?? []).map((s) => s.id),
          player.completedStorylineIds ?? [],
        );
        nextTitle = pool[0]?.title;
      } else {
        const pool = availableFactionQuests(
          factionId,
          rep,
          player.activeFactionQuestIds ?? [],
          player.completedFactionQuestIds ?? [],
        );
        nextTitle = pool[0]?.title;
      }
    }
    if (nextTitle) {
      const kindLabel = kind === 'hunt' ? 'hunt'
        : kind === 'mystery' ? 'mystery'
        : kind === 'storyline' ? 'chapter'
        : 'contract';
      get().appendLog(
        'arbiter',
        `Before you go, the agent slides a second leaf across the table. "Something heavier when you're ready — the ${kindLabel} '${nextTitle}'."`,
      );
    } else {
      get().appendLog(
        'arbiter',
        `Word will travel that you finished this clean. The next thread will find you.`,
      );
    }
  }
  // OTA-612 — exploit close: contract/hunt accept trains CHA, but accept→abandon→
  // re-accept happens with ZERO in-game time passing, so it was a free CHA grind.
  // Gate the accept-CHA train behind a short IN-GAME-HOUR cooldown: an instant
  // re-accept (same hoursElapsed) won't train; legit accepts spaced out over the
  // journey still do. Also tames chip-tapping six contracts → +CHA on each.
  const ACCEPT_CHA_COOLDOWN_HOURS = 3;
  let lastAcceptChaTrainAtHours = -1000;
  /** Train CHA for accepting a contract/hunt, once per cooldown window. Returns
   *  the leveled-to value if it leveled (for the caller's reward line), else null. */
  function trainAcceptCharismaGated(
    get: () => GameStore,
    set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  ): number | null {
    const p = get().player;
    if (!p) return null;
    const nowH = p.hoursElapsed ?? 0;
    if (nowH - lastAcceptChaTrainAtHours < ACCEPT_CHA_COOLDOWN_HOURS) return null;
    lastAcceptChaTrainAtHours = nowH;
    const tr = trainStat(p, 'charisma', true);
    set((s) => (s.player ? { player: tr.player } : s));
    return tr.leveled ? tr.leveled.to : null;
  }
  /** ⚠⚠ OTA-1187 (PUNCHLIST P8) — WHO CAN TAKE A CONTRACT HERE.
   *
   *  `turnInFactionQuest` has accepted a same-faction VENDOR, the OUTPOST MISSION BOARD
   *  (OTA-451) or the faction's own HALL (OTA-617) since those OTAs shipped. The other three
   *  handlers required `scene.vendor` and nothing else — so **a player could stand at the
   *  board that posted a hunt, holding the trophy, and be told to go find a vendor.** The
   *  board is the poster; it should take back what it put up.
   *
   *  ⚠ ONE resolver rather than a fourth hand-rolled copy. The three handlers had three
   *  different refusal wordings for the same rule already, which is exactly how they drifted
   *  apart in the first place.
   *
   *  Returns `null` when there is genuinely nobody here to hand anything to. */
  function turnInCounterparty(
    get: () => GameStore,
    player: PlayerCharacter,
    scene: CurrentScene | null | undefined,
  ): { faction: string | null; name: string; vendorPresent: boolean } | null {
    const v = scene?.vendor;
    if (v) {
      // ⚠⚠ OTA-1201 (PUNCHLIST P9) — AT AN OWNED SITE, THE PEOPLE ANSWER FOR THE HOST.
      // Owner's ruling: *"keep the grab like it is … make handin specific."* The hub anchors
      // used to take work for whatever faction THEY carried — Irma re-pointed to the
      // player's, Tarek a Reclaimer everywhere, Jorah Forgotten Order everywhere — so
      // hand-ins never cared whose ground you stood on. Now the counterparty a hub anchor
      // answers for is the SITE OWNER (OTA-1186's `hubOwnerFaction`, the map that already
      // drives the room skins): host work is taken face to face at 100%, and anything else
      // goes through the paid fallbacks (Halem 80% at this very gate, market 90%,
      // courier 75%).
      //
      // ⚠ Scoped exactly: only inside a hub room, only at one of the NINE owned sites, and
      // never for the broker — Halem's whole job is taking any faction's work, and a host
      // stamp on him would DELETE the fallback this rule depends on. Random vendors, the
      // outskirts hub, capitals and stalls keep today's behaviour, and the GRAB side (which
      // work a vendor OFFERS, driven by `vendor.faction`) is deliberately untouched.
      // ⚠ ANCHOR-PRECISE, not location-wide: the stamp applies only when the vendor in the
      // scene IS the current room's anchor (matched by the room's own `anchorNpc`). The
      // first spelling stamped ANY vendor standing in a hub — which is the anchor in real
      // play, but the rule is about the anchors, and guarding by location made the seam
      // claim more than the ruling says. (It also broke four suites that inject matching-
      // faction agents into hub scenes — an artificial state, and still the correct hint.)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const CB = require('../../engine/contractBroker') as typeof import('../../engine/contractBroker');
      const room = isHubLocation(player.currentLocationId) && player.hubRoomId
        ? hubRoomFor(player.hubRoomId, hubSkinFactionFor(player.currentLocationId, player.factionId))
        : null;
      const isRoomAnchor = !!room && room.anchorNpc === v.name;
      const host = isRoomAnchor && !CB.isContractBroker(scene?.vendor)
        ? hubOwnerFaction(player.currentLocationId)
        : null;
      return { faction: host ?? (v.faction ?? null), name: v.name, vendorPresent: true };
    }
    const board = scene?.missionBoard;
    if (board) return { faction: board.faction ?? null, name: 'The mission board', vendorPresent: false };
    // OTA-617 — building-level: inside a faction's own hub, that faction's hall takes its
    // own work with no specific agent in the room.
    if (isHubLocation(player.currentLocationId)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { startingLocationForFaction } = require('../../engine/character') as typeof import('../../engine/character');
      const home = FACTIONS.find((f) => {
        try { return startingLocationForFaction(f.id) === player.currentLocationId; } catch { return false; }
      });
      if (home) {
        // ⚠⚠ OTA-1402 — NAME WHERE THE PLAYER ACTUALLY IS. This branch has always
        // been gated on `isHubLocation(currentLocationId)` — the LOCATION — while
        // the comment above it says "inside a faction's own hub". Those are not
        // the same test, and the vendor branch twenty lines up gets it right
        // (`isHubLocation(...) && player.hubRoomId`). So a player who has walked
        // OUT of the outpost onto the open tile is still answered by the hall.
        //
        // Owner, 2026-08-20: *"I wasn't in an outpost. I was in the wide open
        // area outside of one."* — and the refusal he got said "the Conspiracy
        // Architects hall won't take it", naming a building he was not standing
        // in. That is why the message read as nonsense on top of being invisible.
        //
        // ⚠ THE GAMEPLAY RULE IS LEFT ALONE HERE, DELIBERATELY. Requiring
        // `hubRoomId` would also stop the hand-in that WORKED for him from open
        // ground (The Stranded Watcher, +55 TC), and quietly taking away
        // something a player just used is not a fix to make on my own reading of
        // an old comment. What is fixed is the LIE: the label now says whether
        // he is inside the hall or on the faction's ground outside it.
        const inside = !!player.hubRoomId;
        return {
          faction: home.id,
          name: inside ? `the ${home.name} hall` : `${home.name}'s people here`,
          vendorPresent: false,
        };
      }
    }
    return null;
  }

  return ({
  generateNewQuest() {
    const memory = get().worldMemory;
    const quest = generateQuest(memory);
    const player = get().player;
    if (player) {
      set({ player: { ...player, activeQuests: [...player.activeQuests, quest] } });
    }
    void get().persist();
    return quest;
  },

  acceptFactionQuest(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    // OTA-451 — a contract can be picked up from a same-faction VENDOR or from
    // the OUTPOST MISSION BOARD. Resolve the quest faction + a display source
    // name from whichever is present.
    // ⚠⚠⚠ OTA-1475 — THE MARKET'S POST HAS NO FACTION OF ITS OWN, SO THE
    // CONTRACT SUPPLIES ONE. `missionBoard.faction === null` is the Hidden
    // Market square, where every faction posts under the truce; taking a
    // Reclaimers posting off it is Reclaimers work, paying and costing
    // Reclaimers standing. That is exactly what the owner asked for — "all of
    // the factions should be able to post there without interaction from each
    // other" — and it needs no new accept path, only the faction resolved from
    // the paper instead of from the wall.
    //
    // ⚠ Resolved by `factionOfFactionQuest`, which uses the SAME fuzzy matcher
    // the accept below uses. A title that found a row on the board therefore
    // cannot fail to find it here a moment later — two matchers would be two
    // definitions of "which contract is this".
    const boardIsNeutral = !!scene?.missionBoard && scene.missionBoard.faction === null;
    const acceptFaction = scene?.vendor?.faction
      ?? scene?.missionBoard?.faction
      ?? (boardIsNeutral ? factionOfFactionQuest(titleOrId) : null)
      ?? null;
    const acceptSourceName = scene?.vendor?.name
      ?? (scene?.missionBoard ? (boardIsNeutral ? 'the Market post' : 'the mission board') : null);
    if (!acceptFaction || !acceptSourceName) {
      // Resolve the named contract to its faction so we can tell the
      // player WHICH vendor archetype to seek, not just "a faction
      // agent." Falls back to the generic line if the input doesn't
      // fuzzy-match any cataloged hunt / mystery / storyline / quest.
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter looks past you. "${hint.contractTitle} is ${withArticle(hint.kind)} of the ${hint.factionLabel}. Find ${sample} — or any other ${hint.factionLabel} agent — to pick it up."`,
        );
      } else if (hint) {
        get().appendLog(
          'arbiter',
          `The Arbiter shrugs. "${hint.contractTitle} is ${withArticle(hint.kind)} of the ${hint.factionLabel}. Find ${withArticle(hint.factionLabel)} agent."`,
        );
      } else {
        get().appendLog(
          'arbiter',
          `The Arbiter shrugs. "Contracts come from wandering faction vendors — keep walking until one shows up at your scene."`,
        );
      }
      return;
    }
    // Direct id match first, then fuzzy title within the faction pool. A broker
    // (Hidden Market stall) searches EVERY faction's pool, since its board posts
    // all factions' work — the contract's faction may not be the vendor's own.
    const direct = findFactionQuestById(titleOrId);
    const searchFactions = isBrokerVendorId(scene?.vendor?.id)
      ? FACTIONS.map((f) => f.id)
      : [acceptFaction];
    let matchedQuest: typeof direct | null = null;
    let factionId: string = acceptFaction;
    const offered: string[] = [];
    for (const fid of searchFactions) {
      const pool = availableFactionQuests(
        fid,
        getStanding(player.factionStanding, fid),
        player.activeFactionQuestIds ?? [],
        player.completedFactionQuestIds ?? [],
      );
      for (const q of pool) offered.push(`"${q.title}"`);
      const found = direct && pool.includes(direct) ? direct : fuzzyFindFactionQuest(titleOrId, pool);
      if (found) { matchedQuest = found; factionId = fid; break; }
    }
    if (!matchedQuest) {
      const titles = offered.join(', ');
      get().appendLog(
        'arbiter',
        titles
          ? `${acceptSourceName} — currently on offer: ${titles}.`
          : `${acceptSourceName} has nothing on offer for you right now.`,
      );
      return;
    }
    const quest = matchedQuest;
    const wasFirstQuest = (player.activeFactionQuestIds?.length ?? 0) === 0
      && (player.completedFactionQuestIds?.length ?? 0) === 0;
    // SINGLE-ACTIVE — a new contract joins ACTIVE only if you aren't already
    // running one; otherwise it's parked, so batch-accepting from the board
    // doesn't make everything live at once. You activate it when you're ready.
    const hasActiveOther = deps.anyTrackedContract(player); // OTA-972 — #118: cross-kind
    const newTracked = !hasActiveOther;
    // OTA-962 — ESCORT contract: accepting spawns the shared-pool party (engine_Dev
    // model). It rides on the quest record; collateral damage + failure live in
    // deps.applyEscortDamage / deps.failEscortQuests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const escortMod = require('../../engine/escort') as typeof import('../../engine/escort');
    const escortSpec = escortMod.escortSpecForQuest(quest);
    const escort = escortSpec
      ? escortMod.spawnEscortPool(escortSpec.count, player.hpMax ?? 20, escortSpec.label)
      : null;
    // OTA-1057 — the escort leader goes on the ledger the moment you take them
    // on. `escort_` keys them by name, so the same person walked twice is one
    // relationship, and whether you got them home is recorded against it below.
    if (escort?.leaderName) {
      deps.sightPerson(get, set, {
        id: `escort_${escort.leaderName}`,
        name: escort.leaderName,
        role: 'under your protection',
        factionId: quest.factionId,
      });
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeFactionQuestIds: [...(s.player.activeFactionQuestIds ?? []), quest.id],
              activeFactionQuests: [
                ...(s.player.activeFactionQuests ?? []),
                { id: quest.id, stage: 0, postedByFaction: factionId, acceptedAt: Date.now(), tracked: newTracked, ...(escort ? { escort } : {}), ...deps.acceptCellStamp(get) },
              ],
            },
          }
        : s,
    );
    if (escort) {
      const fallsV = escort.count === 1 ? 'falls' : 'fall';
      const standsV = escort.count === 1 ? 'stands' : 'stand';
      get().appendLog(
        'world',
        newTracked
          ? `Your ${escort.label} ${fallsV} in beside you (${escort.hp} HP). Keep them alive — if the party is cut down, the escort fails.`
          : `Your ${escort.label} (${escort.hp} HP) ${standsV} by for ${quest.title}. They'll fall in when you ACTIVATE this contract.`,
      );
    }
    // OTA-1055 — the sixth accept path. The other five credit contractsTaken;
    // this one — the most face-to-face of them — never did, so a faction agent
    // could show "1 contract finished" having no record of handing it over, and
    // never reached the 'known' rung that OTA-1050 added contractsTaken to.
    if (scene?.vendor) {
      set((st) => ({
        worldMemory: recordNpcDealing(st.worldMemory, deps.vendorNpcId(scene.vendor!), { contractsTaken: 1 }),
      }));
    }
    const factionCompact = acceptIsCompact(); // OTA-1048 — before the bump.
    deps.bumpQuestsAccepted(get, set);
    // First-quest milestone — Arbiter can reference "the first
    // contract you took" later. Fires only on the first accept of
    // the run; type union added in this batch.
    if (wasFirstQuest) {
      deps.recordMemorableEvent(get, set, {
        kind: 'first_quest',
        text: `took your first contract — ${quest.title}`,
        factionId,
      });
    }
    get().appendLog(
      'reward',
      `New faction contract — ${quest.title}${parkedTag(newTracked)}. ${quest.objective} (${factionDisplayName(factionId)})`,
    );
    // Play the first stage immediately so the player has narrative
    // momentum, mirroring how hunts / mysteries / storylines open.
    // Per-quest stage0.arbiter SUPPRESSED on accept — when the player
    // chip-taps six contracts in a row the per-quest Arbiter lines
    // pile up as offhand reactions to descriptions the player has
    // already moved past. deps.bumpQuestsAccepted handles the meta-level
    // commentary (first-quest line, burst-start, "stacking", "slow
    // down") instead.
    const stage0 = quest.stages?.[0];
    // OTA-1048 — mid-burst the opening beat is dropped with the rest of the
    // detail; it is replayed in Contracts when the contract is activated.
    if (stage0 && !factionCompact) {
      get().appendLog('world', stage0.narration);
    }
    // OTA 059 — accepting a contract is a social close — you
    // convinced the agent you were worth handing the work to.
    // Trains CHA on every accept.
    {
      const chaLeveled = trainAcceptCharismaGated(get, set);
      if (chaLeveled != null) {
        get().appendLog(
          'reward',
          `✦ They handed you the contract. +1 CHA (${deps.statNowClause(get().player, 'charisma', chaLeveled)}).`,
        );
      }
      // OTA-057 — accepting a contract is an active CHA push; the
      // matching WIS train fires on the completion path, not on accept.
    }
    void get().persist();
  },

  setFactionQuestActive(id, active) {
    const player = get().player;
    if (!player) return;
    const list = player.activeFactionQuests ?? [];
    const rec = list.find((q) => q.id === id);
    if (!rec) return;
    const nextActive = active != null ? active : rec.tracked === false;
    // SINGLE-ACTIVE — "the mission you're on." Activating one PAUSES every other
    // contract (it stays on the slate; ABANDON is the only thing that drops one).
    const othersPaused = nextActive
      ? list.filter((q) => q.id !== id && q.tracked !== false).length
      : 0;
    set((s) => (s.player ? {
      player: {
        ...s.player,
        // ⚠ OTA-1320 — activating any contract also clears a routed tower.
        // routedClimbId was write-only and never cleared, so after routing a
        // tower and then a contract, the field still named the tower as "the
        // mission you're on" — stale state waiting to lie to its first reader.
        routedClimbId: nextActive ? null : s.player.routedClimbId,
        activeFactionQuests: (s.player.activeFactionQuests ?? []).map((q) =>
          q.id === id ? { ...q, tracked: nextActive } : (nextActive ? { ...q, tracked: false } : q)),
        // OTA-992 — cross-kind: "the mission you're on" means across ALL routed
        // kinds, not just this list. See setContractActive's mirror sweep.
        activeHunts: nextActive ? (s.player.activeHunts ?? []).map((h) => ({ ...h, tracked: false })) : (s.player.activeHunts ?? []),
        activeMysteries: nextActive ? (s.player.activeMysteries ?? []).map((m) => ({ ...m, tracked: false })) : (s.player.activeMysteries ?? []),
        activeStorylines: nextActive ? (s.player.activeStorylines ?? []).map((st) => ({ ...st, tracked: false })) : (s.player.activeStorylines ?? []),
      },
    } : s));
    const def = findFactionQuestById(id);
    const title = def?.title ?? id;
    const pausedNote = othersPaused > 0 ? ` (${othersPaused} other contract${othersPaused > 1 ? 's' : ''} paused.)` : '';
    // OTA-962 — an escort's party PARKS when its contract is deactivated (off the
    // HUD, no combat damage) and falls back in on re-activate.
    const party = rec.escort && rec.escort.hp > 0 ? rec.escort : null;
    const partyFalls = party && party.count === 1 ? 'falls' : 'fall';
    const partyWaits = party && party.count === 1 ? 'waits' : 'wait';
    if (nextActive) {
      get().appendLog('world', (party
        ? `Now on ${title}. Your ${party.label} ${partyFalls} in beside you.`
        : `Now on ${title}. It's the contract you're running.`) + pausedNote);
    } else {
      get().appendLog('world', party
        ? `Stood down from ${title}. Your ${party.label} ${partyFalls} back to safety and ${partyWaits}; they'll rejoin when you re-activate it.`
        : `Paused ${title}. It won't advance until you re-activate it.`);
    }
    // Switching the active contract (or pausing the routed one) drops a route
    // chain that no longer matches the mission you're on.
    if (get().player?.routedMission && get().player?.routedMission?.id !== id) {
      set((s) => (s.player ? { player: { ...s.player, routedMission: null } } : s));
    }
    if (!nextActive && get().player?.routedMission?.id === id) {
      set((s) => (s.player ? { player: { ...s.player, routedMission: null } } : s));
    }
    void get().persist();
  },

  routeMission(id) {
    const player = get().player;
    if (!player) return;
    const rec = (player.activeFactionQuests ?? []).find((q) => q.id === id);
    if (!rec) { get().appendLog('arbiter', "That contract isn't on your slate."); return; }
    // Routing to a contract IS choosing to run it — make it the single active one.
    if (rec.tracked === false || (player.activeFactionQuests ?? []).some((q) => q.id !== id && q.tracked !== false)) {
      get().setFactionQuestActive(id, true);
    }
    const def = findFactionQuestById(id);
    if (!def) return;
    const live = get().player ?? player;
    const want = deps.desiredMissionLeg(live, def, rec);
    if (live.currentLocationId === want.loc) {
      // Already at this leg's target — seed the chain so it continues after the
      // deed / turn-in, then let deps.advanceMissionRoute settle it.
      set((s) => (s.player ? { player: { ...s.player, routedMission: { id, phase: want.phase } } } : s));
      get().appendLog('world', want.phase === 'to_turnin'
        ? `You're already at ${deps.safeLocName(want.loc)} — hand ${def.title} in here.`
        : `You're already at the objective for ${def.title}.`);
      deps.advanceMissionRoute(get, set);
      void get().persist();
      return;
    }
    set((s) => (s.player ? { player: { ...s.player, routedMission: { id, phase: want.phase } } } : s));
    deps._chainRouting = true;
    try { get().setTravelCourse(want.loc); } finally { deps._chainRouting = false; }
    get().appendLog('world', want.phase === 'to_turnin'
      ? `✦ Course set — ${def.title}. Heading to turn in at ${deps.safeLocName(want.loc)}.`
      : `✦ Course set — ${def.title}. Heading to the objective: ${deps.safeLocName(want.loc)}.`);
    void get().persist();
  },

  turnInFactionQuest(titleOrId, remote = false) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    // OTA-451 — turn in to a same-faction VENDOR or the OUTPOST MISSION BOARD.
    // OTA-456 — or REMOTELY by courier ("send word <quest>") from anywhere, for a
    // 15% TC cut (full rep). Travel to claim in full stays the optimal play.
    // OTA-1185 — the trading post brokers ANY faction's contract for a cut (PUNCHLIST P2).
    // ⚠ Resolved here, before `turnFaction`, because this handler decides who it is
    // dealing with BEFORE it knows which contract is meant — and the broker's whole point
    // is that he does not need to match. Without this the outskirts gate (a hub with no
    // owning faction, so no hall fallback) would refuse him at the early return below.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CB = require('../../engine/contractBroker') as typeof import('../../engine/contractBroker');
    const atBroker = CB.isContractBroker(scene?.vendor);
    // ⚠ OTA-1475 — same rule on the way back in. A contract taken off the
    // Market post is turned in there too; whose colour it flies is decided by
    // the contract, not by the board it came off.
    const turnBoardNeutral = !!scene?.missionBoard && scene.missionBoard.faction === null;
    let turnFaction = scene?.vendor?.faction
      ?? scene?.missionBoard?.faction
      ?? (turnBoardNeutral ? factionOfFactionQuest(titleOrId) : null)
      ?? null;
    let turnSourceName = scene?.vendor?.name
      ?? (scene?.missionBoard ? (turnBoardNeutral ? 'The Market post' : 'The mission board') : null);
    // OTA-617 — BUILDING-LEVEL in-person turn-in. If you're inside a faction's
    // home outpost (no specific board/vendor needed in this exact room), that
    // faction's hall takes its own contracts at FULL pay. Keeps the three
    // turn-in paths (this, completeContractFromUI, autoSubmit) in agreement and
    // is what makes "auto-complete on entering the building" actually pay out.
    if (!turnFaction && isHubLocation(player.currentLocationId)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { startingLocationForFaction } = require('../../engine/character');
      const homeFaction = FACTIONS.find((f) => {
        try { return startingLocationForFaction(f.id) === player.currentLocationId; } catch { return false; }
      });
      if (homeFaction) {
        turnFaction = homeFaction.id;
        turnSourceName = `the ${homeFaction.name} hall`;
      }
    }
    // ⚠ OTA-1403 — and the SAME omission one gate earlier. On a tile with no
    // vendor, no board and no owning faction there is nobody to hand to — which is
    // true face to face and irrelevant to a runner. A remote hand-in skips
    // straight to the contract lookup, exactly as the other three families do.
    if (!remote && ((!turnFaction && !atBroker) || !turnSourceName)) {
      // If the player named a specific contract, fuzzy-match it and tell
      // them the exact faction + sample vendor names. Otherwise fall
      // back to listing the factions they owe across all active quests.
      const namedHint = findQuestFactionHint(titleOrId);
      if (namedHint && namedHint.vendorNames.length > 0) {
        const sample = namedHint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter waves. "${namedHint.contractTitle} closes out with the ${namedHint.factionLabel}. Find ${sample} — or any other ${namedHint.factionLabel} agent — and hand it over in person. The trip pays a long-haul bonus."`,
        );
        return;
      }
      const active = (player.activeFactionQuestIds ?? [])
        .map((id) => findFactionQuestById(id))
        .filter((q): q is NonNullable<ReturnType<typeof findFactionQuestById>> => !!q);
      if (active.length > 0) {
        // List the unique factions the player owes a turn-in to AND a
        // sample vendor name from each so they know what to look for.
        const factionEntries = Array.from(
          new Map(
            active.map((q) => {
              const f = FACTIONS.find((x) => x.id === q.factionId);
              return [q.factionId, f?.name ?? factionDisplayName(q.factionId)];
            }),
          ).entries(),
        );
        const lines = factionEntries.map(([fid, fname]) => {
          const sample = VENDORS.filter((v) => v.faction === fid).slice(0, 2).map((v) => v.name).join(' / ');
          return sample ? `${fname} (e.g. ${sample})` : fname;
        });
        const list =
          lines.length === 1
            ? `${withArticle(lines[0])} vendor`
            : `a vendor from one of: ${lines.join('; ')}`;
        get().appendLog(
          'arbiter',
          `The Arbiter waves. "Find ${list} and turn that contract in face to face — the trek pays a long-haul bonus. Set a course to the ◆ pin in Contracts."`,
        );
      } else {
        get().appendLog(
          'arbiter',
          `The Arbiter waves. "You have no active contracts. Find a faction vendor first."`,
        );
      }
      return;
    }
    // OTA-456 — the agent name shown in the flow. Remote turn-ins have no vendor
    // present, so a "runner" stands in.
    const sourceLabel = turnSourceName ?? 'A runner';
    // OTA-1002 — the STAGED records are the truth; the legacy id mirror alone
    // refused READY contracts whenever a path wrote only the records.
    const active = Array.from(new Set([
      ...(player.activeFactionQuestIds ?? []),
      ...(player.activeFactionQuests ?? []).map((q) => q.id),
    ]));
    // Direct id, then fuzzy title across active list.
    const direct = findFactionQuestById(titleOrId);
    const candidate = direct ?? fuzzyFindFactionQuest(
      titleOrId,
      active.map((id) => findFactionQuestById(id)).filter((q): q is NonNullable<typeof q> => !!q),
    );
    if (!candidate || !active.includes(candidate.id)) {
      get().appendLog(
        'arbiter',
        `${sourceLabel} doesn't list that one on your active slate.`,
      );
      return;
    }
    // OTA-1185 — brokered when the trading post is standing in for a faction that is not
    // its own. Computed here rather than reused from `atBroker` so a contract the broker
    // could have taken anyway (unaligned, or his own) is NOT charged a cut.
    const questViaBroker = atBroker && candidate.factionId !== turnFaction;
    // ⚠⚠ OTA-1403 — `!remote` — THE GUARD THIS FAMILY LOST, AND THE ONE THE OTHER
    // THREE KEPT. Hunts check `!remote`, mysteries `!mystViaCourier`, storylines
    // `!storyViaCourier`. Faction deeds took the `remote` parameter, documented it
    // ("REMOTELY by courier from anywhere, for a cut"), threaded it into
    // `creditTurnIn`, implemented its fetch exception at the line below — and then
    // refused on faction mismatch BEFORE any of that could run. Three of four is
    // exactly the shape that hides: the feature works everywhere you test it.
    //
    // Proven, not assumed: `turnInFactionQuest(id, /* remote */ true)` against a
    // mismatched counterparty left the contract on the slate and printed the
    // refusal. Owner: "you can remotely hand in from anywhere outside" — and for
    // three of the four families you always could.
    if (!remote && !questViaBroker && candidate.factionId !== turnFaction) {
      refuseWrongCounterparty(
        sourceLabel, candidate.factionId, candidate.title,
        // ⚠ A fetch deed cannot be couriered (you cannot mail the goods), so the
        // offer is withheld rather than made and then refused twelve lines later.
        candidate.fetch ? undefined : { kind: 'faction_quest', id: candidate.id },
      );
      return;
    }
    // Stage gate — quests with authored stages require the player to
    // reach the final stage before turn-in. Quests without stages
    // (legacy single-objective) are turn-in-able immediately, matching
    // the pre-refactor behavior.
    const activeRecord = (player.activeFactionQuests ?? []).find((q) => q.id === candidate.id);
    if (candidate.stages && candidate.stages.length > 0) {
      const currentStage = activeRecord?.stage ?? 0;
      if (currentStage < candidate.stages.length) {
        get().appendLog(
          'arbiter',
          `${sourceLabel}: "${candidate.title}" isn't done — you're on step ${currentStage + 1} of ${candidate.stages.length}. Come back when the work's behind you.`,
        );
        return;
      }
    }
    // ⚠⚠⚠ STEP 3c / OTA-1710 — AND THE PURSE, WHICH NOTHING ON THIS PATH WAS
    // COUNTING.
    //
    // OTA-1594 gated "Run the haul" (*"Reach 100 TC, then complete the
    // quest"*) on the STAGE-ADVANCE path, and only there. So the rule it really
    // enforced was "you held 100 TC at the moment of one particular action" —
    // and spending your money is the ordinary thing to do with it between
    // finishing the work and finding an agent to hand it to.
    //
    // ⚠ MEASURED by the step-3c probe, on a plain player path with no cheat in
    // it: earn 500 TC, close both stages by travelling, spend down to 3, hand it
    // in — complete, +100 TC paid. The number the objective names had stopped
    // being checked at exactly the moment it mattered.
    //
    // The gate lives in `factionQuestReady` now, so the READY pill, the route's
    // objective→turn-in swap, the auto-submit-on-arrival sweep and this refusal
    // all read one answer. This branch is what the PLAYER meets, so it says the
    // number — the habit the rest of this family already keeps ("needs 3× Scrap
    // Metal — you've brought 0").
    if (candidate.tcThreshold && (player.tc ?? 0) < candidate.tcThreshold) {
      get().appendLog(
        'arbiter',
        `${sourceLabel} taps the slip. "${candidate.title} pays out at ${candidate.tcThreshold} TC in hand — you carry ${player.tc ?? 0}."`,
      );
      return;
    }
    // OTA-456 — a FETCH quest is a PHYSICAL delivery: it can't be couriered
    // remotely (you can't mail the goods). Refuse a remote turn-in for a fetch
    // contract; it has to change hands in person. (Non-fetch contracts may still
    // be couriered for a reduced cut — handled by their own turn-in paths.)
    if (remote && candidate.fetch) {
      const fLabel = factionDisplayName(candidate.factionId);
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "${candidate.title} is a delivery — the ${candidate.fetch.itemName} has to change hands in person. Carry it to ${fLabel} yourself."`,
      );
      return;
    }
    // ⚠⚠ OTA-1185 — THE BROKER DOES TAKE DELIVERIES, and the first version of this did
    // not. Getting that wrong would have opened a NEW unfinishable state while closing
    // P2, so the reasoning is recorded here rather than left to be re-derived.
    //
    //   The first pass refused a fetch quest at the broker, on the strength of OTA-456
    //   ("a FETCH quest is a PHYSICAL delivery … you can't mail the goods"), and argued it
    //   cost no reachability because faction quests come from the player's OWN mission
    //   board. ⚠ THAT SECOND CLAIM IS FALSE, and this suite's own premise check caught it:
    //   faction quests are ALSO offered by vendors (`acceptFaction`, from the scene
    //   vendor), and a Hidden Market stall searches EVERY faction's pool. A player can
    //   therefore be holding an unreachable faction's fetch quest — exactly the contract
    //   this OTA exists to un-strand — and the refusal would have stranded it.
    //
    //   ⚠ OTA-456's rule is not violated by allowing it. Its words are about goods
    //   travelling by word of mouth with nobody present. Here the player stands at the
    //   counter and the items leave their hands: the fetch gate immediately below still
    //   verifies the player HOLDS them and still consumes them. The goods change hands in
    //   person. Only the final destination is delegated, which is what a broker is.
    //
    // OTA-450 — fetch gate. The generic per-faction starter quests require the
    // player to actually HOLD the items; verify, then consume them on turn-in so
    // it's a real "gather N, bring them back" loop (not a free narrative close).
    if (candidate.fetch) {
      const { itemName, quantity } = candidate.fetch;
      const have = player.inventory
        .filter((i) => i.name.toLowerCase() === itemName.toLowerCase())
        .reduce((n, i) => n + (i.quantity ?? 1), 0);
      if (have < quantity) {
        get().appendLog(
          'arbiter',
          `${sourceLabel} checks the slate: "${candidate.title}" needs ${quantity}× ${itemName} — you've brought ${have}. Come back when you've got the rest.`,
        );
        return;
      }
      let toRemove = quantity;
      const consumed = player.inventory
        .map((i) => {
          if (toRemove <= 0 || i.name.toLowerCase() !== itemName.toLowerCase()) return i;
          const take = Math.min(toRemove, i.quantity ?? 1);
          toRemove -= take;
          return { ...i, quantity: (i.quantity ?? 1) - take };
        })
        .filter((i) => (i.quantity ?? 1) > 0);
      set((s) => (s.player ? { player: { ...s.player, inventory: consumed } } : s));
    }
    // B2 — full pay in person + a long-haul TC bonus scaled to how far you carried it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const journeyTc = (require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers')).contractJourneyBonusTc(player.currentLocationId, candidate.reward.tc, activeRecord?.acceptedAtCell);
    // OTA-964 — ESCORT pay model (owner: "go with the scaled party for most
    // escorts, but make the higher tier escorts all or nothing"). Scaled
    // escorts pay the TC fee times the fraction of the party still standing
    // (floored at 10% — you did walk them there); all_or_nothing drop-offs
    // skip the scaling entirely. Rep pays in full either way — the faction
    // credits the delivery itself.
    let escortPayMult = 1;
    if (activeRecord?.escort && candidate.escort?.mode !== 'all_or_nothing') {
      const e = activeRecord.escort;
      if (e.hpMax > 0) escortPayMult = Math.max(0.1, Math.min(1, e.hp / e.hpMax));
    }
    // OTA-1185 — the broker takes his cut and forfeits the long-haul bonus; the escort
    // multiplier still applies on top, because that one prices how many of the party you
    // actually walked home and has nothing to do with who paid you.
    const baseAndJourneyTc = CB.contractPayoutTc(candidate.reward.tc, journeyTc, questViaBroker ? CB.brokerShareFor(scene?.vendor) : null);
    const payTc = Math.max(1, Math.round(baseAndJourneyTc * escortPayMult));
    // ⚠ The announce line must not claim a long-haul bonus the broker did not pay.
    const shownJourneyTc = questViaBroker ? 0 : journeyTc;
    if (questViaBroker) {
      get().appendLog('arbiter', CB.brokerAcceptLine(sourceLabel, factionDisplayName(candidate.factionId), CB.brokerShareFor(scene?.vendor) ?? undefined));
    }
    const payRep = candidate.reward.rep;
    const repResult = applyRepChange(player.factionStanding, candidate.factionId, payRep);
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + payTc,
              factionStanding: repResult.standing,
              activeFactionQuestIds: (s.player.activeFactionQuestIds ?? []).filter((id) => id !== candidate.id),
              activeFactionQuests: (s.player.activeFactionQuests ?? []).filter((q) => q.id !== candidate.id),
              completedFactionQuestIds: [...(s.player.completedFactionQuestIds ?? []), candidate.id],
            },
          }
        : s,
    );
    const fLabel = factionDisplayName(candidate.factionId);
    get().announceMissionComplete(
      'Contract',
      candidate.title,
      `✦ Faction contract complete — ${candidate.title}. +${payTc} TC${shownJourneyTc > 0 ? ` (incl. +${shownJourneyTc} long-haul)` : ''}${questViaBroker ? ` (broker's cut taken)` : ''}${payRep > 0 ? `, +${payRep} rep with ${fLabel}` : ''}.`,
    );
    // OTA-1050 — the agent who took it back remembers that you finished it.
    creditTurnIn(get, set, remote);
    // OTA-805 — RAPPORT unlocked. Turning in a faction's rapport quest opens
    // Charisma-scaled dealing with its vendors (the discount is derived from this
    // completion — see factionRapport.hasFactionRapport). Announce it, and show the
    // rate the player's current CHA earns so the payoff is concrete.
    if (candidate.id === rapportQuestId(candidate.factionId)) {
      const pct = Math.round(chaPriceDiscount(effectiveStats(get().player ?? player).charisma) * 100);
      get().appendLog(
        'reward',
        `✦ You've earned dealing with the ${fLabel}. From now their vendors cut you the partner's rate — currently ${pct}% off buys and +${pct}% on sell-backs (it grows with your Charisma).`,
      );
    }
    // OTA-966 — escorts pay in coin and care, not schematics: the recipe roll
    // belongs to salvage-and-spoils contracts. Escort turn-ins instead press
    // HEALTH supplies into your hands (below), so their loot is only TC +
    // healing — the owner's rule for these missions.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eModPay = require('../../engine/escort') as typeof import('../../engine/escort');
    if (!eModPay.escortSpecForQuest(candidate)) {
      deps.maybeTeachRecipeReward(get, set, 'MISSION_RECIPE_CHANCE', 'Recipe among the spoils');
    }
    deps.logRepChanges(get, repResult.changed);
    // OTA-962 — delivered the escort party alive (a dead pool fails + drops the
    // quest before it can ever reach turn-in), so name them in the win.
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const eMod = require('../../engine/escort') as typeof import('../../engine/escort');
      const dSpec = eMod.escortSpecForQuest(candidate);
      if (dSpec) {
        get().appendLog('reward', escortPayMult < 1
          ? `You delivered your ${dSpec.label} — battered, but breathing. The fee reflects the shape you brought them in (${Math.round(escortPayMult * 100)}% pay).`
          : `You delivered your ${dSpec.label} safely. They peel off with a nod.`);
        // OTA-1057 — and the person who walked at the front remembers it. This
        // is the payoff of naming the leader: take a second contract with the
        // same party and you are not a stranger to them. Recorded only on
        // DELIVERY -- a wiped party fails the quest long before turn-in, and
        // there is nobody left to remember anything.
        const leader = (get().player?.activeFactionQuests ?? [])
          .find((q) => q.id === candidate.id)?.escort?.leaderName;
        if (leader) {
          set((st) => ({
            worldMemory: recordNpcDealing(st.worldMemory, deps.vendorNpcId({ id: `escort_${leader}`, name: leader }), { contractsTurnedIn: 1 }),
          }));
        }
        // OTA-966 — the delivered party presses HEALTH supplies on you with the
        // fee (2 kits on an all-or-nothing drop-off, 1 otherwise). This is the
        // whole of an escort's item loot: TC + healing, nothing else.
        const medLook = lookupCraftedItem('First Aid Kit');
        const medQty = candidate.escort?.mode === 'all_or_nothing' ? 2 : 1;
        set((s2) => (s2.player ? {
          player: {
            ...s2.player,
            inventory: mergeOrPushItem(s2.player.inventory, stampDurability({
              id: `escmed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: 'First Aid Kit', kind: medLook.kind, rarity: medLook.rarity,
              quantity: medQty, tags: [...medLook.tags, 'loot'],
            })),
          },
        } : s2));
        get().appendLog('reward', `✦ ${medQty > 1 ? `${medQty}× ` : ''}First Aid Kit — pressed into your hands with the fee.`);
      }
    }
    plantNextContractHint(get, candidate.factionId, 'faction_quest');
    void get().persist();
  },

  acceptHunt(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    // OTA 185 — faction-neutral hunts (factionId === null in the
    // catalog) skip the vendor-in-scene requirement. The playtest
    // case: Irma offered the Bog Dragon hunt in the Armory, player
    // walked away, tried 'accept drakova' on the road — fell into
    // this branch and got redirected back to the vendor. But the
    // hunt is faction-neutral; any wandering agent could have
    // posted it; the player already heard the offer. Let them take
    // it. Faction-aligned hunts still gate at the vendor.
    if (!scene?.vendor) {
      const direct = findHuntById(titleOrId);
      const neutralMatch = direct && direct.factionId === null
        ? direct
        : fuzzyFindHunt(titleOrId, HUNTS.filter((h) => h.factionId === null));
      const alreadyActive = neutralMatch
        && (player.activeHunts ?? []).some((h) => h.id === neutralMatch.id);
      const alreadyDone = neutralMatch
        && (player.completedHuntIds ?? []).includes(neutralMatch.id);
      if (neutralMatch && !alreadyActive && !alreadyDone) {
        const neutralTracked = !deps.anyTrackedContract(player); // OTA-972 — #118
        get().appendLog('debug', `accept: neutral ${neutralMatch.id} tracked=${neutralTracked}`);
      // OTA-1049 — a contract handed over face to face is business with THAT
      // agent, so it goes on their ledger. Guarded on a live vendor because
      // board/remote accepts have no one standing across from you.
      if (scene?.vendor) {
        set((st) => ({
          worldMemory: recordNpcDealing(st.worldMemory, deps.vendorNpcId(scene.vendor!), { contractsTaken: 1 }),
        }));
      }
        set((s) => (s.player ? {
          player: {
            ...s.player,
            activeHunts: [
              ...(s.player.activeHunts ?? []),
              { id: neutralMatch.id, stage: firstActionableHuntStage(neutralMatch), postedByFaction: null, acceptedAt: Date.now(), tracked: neutralTracked, ...deps.acceptCellStamp(get) },
            ],
          },
        } : s));
        // ⚠⚠ P19 — the opening beat HANDS YOU SOMETHING, and accept skips past it.
        // `firstActionableHuntStage` starts the record after every leading null stage, so
        // the inciting_hook's `grants` was never awarded by anything and the next stage
        // refused forever. Award the skipped prefix here, once, guarded on the pack.
        deps.grantStageItems(get, set, neutralMatch.title, neutralMatch.stages, 0, firstActionableHuntStage(neutralMatch));
        const neutralCompact = acceptIsCompact(); // OTA-1048 — before the bump.
        deps.bumpQuestsAccepted(get, set);
        if (neutralCompact) {
          get().appendLog('reward', `✦ Contract accepted — ${neutralMatch.title}${parkedTag(neutralTracked)}.`);
        } else {
          get().appendLog(
            'arbiter',
            `The Arbiter nods. "You take ${theLower(neutralMatch.title)} on. Open the Contracts board to see the stages."`,
          );
          if (!neutralTracked) {
            get().appendLog('world', `${neutralMatch.title} added to your slate (paused — you're already on another contract). Activate it in Contracts when you're ready.`);
          }
        }
        void get().persist();
        return;
      }
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "${hint.contractTitle} is a hunt of the ${hint.factionLabel}. Find ${sample} — or any other ${hint.factionLabel} agent — to take it on."`,
        );
      } else {
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "Hunts come from wandering faction vendors. Keep walking until one turns up at your scene."`,
        );
      }
      return;
    }
    // A broker (Hidden Market stall) searches EVERY faction's pool; a normal
    // vendor searches only its own. availableHunts folds in faction-neutral
    // bounties for each searched faction.
    const searchFactions: (string | null)[] = isBrokerVendorId(scene.vendor.id)
      ? FACTIONS.map((f) => f.id)
      : [scene.vendor.faction];
    const direct = findHuntById(titleOrId);
    let matchedHunt: typeof direct | null = null;
    let factionId: string | null = scene.vendor.faction;
    const offered = new Set<string>();
    for (const fid of searchFactions) {
      const playerRep = fid ? getStanding(player.factionStanding, fid) : 0;
      const pool = availableHunts(
        fid,
        playerRep,
        (player.activeHunts ?? []).map((h) => h.id),
        player.completedHuntIds ?? [],
        player.hpMax, // OTA-1450 — the same reach rule the offer used
      );
      for (const h of pool) offered.add(`"${h.title}"`);
      const found = direct && pool.includes(direct) ? direct : fuzzyFindHunt(titleOrId, pool);
      if (found) { matchedHunt = found; factionId = fid; break; }
    }
    if (!matchedHunt) {
      // ⚠⚠⚠ OTA-1466 — SAY WHY. The owner tapped a posting twelve times in nine
      // seconds and got this same shrug each time, then typed: *"there was no
      // pop-up telling me why. I'm imagining it's because either I've hit my cap
      // of missions that I can have or I don't have enough standing but it
      // doesn't say which."*
      //
      // He had to guess, and both guesses were wrong. There is NO mission cap —
      // an extra contract is PARKED, never refused — and standing is one of four
      // reasons a posting can be withheld. `availableHunts` knows exactly which
      // one at the moment it drops the row, and then throws the answer away.
      //
      // ⚠ A named hunt beats a summary of the board: if the player asked for
      // something specific that exists and is blocked, report why THAT one is.
      const asked = findHuntById(titleOrId) ?? fuzzyFindHunt(titleOrId, HUNTS);
      let why: string | null = null;
      if (asked) {
        for (const fid of searchFactions) {
          const rep = fid ? getStanding(player.factionStanding, fid) : 0;
          const b = huntBlockReason(
            asked, fid, rep,
            (player.activeHunts ?? []).map((h) => h.id),
            player.completedHuntIds ?? [],
            player.hpMax,
          );
          // A broker searches every faction. If ANY of them could post it, it is
          // not blocked at all; otherwise prefer a substantive reason over
          // "somebody else's business", which tells the player nothing they can
          // act on.
          if (b === null) { why = null; break; }
          if (why === null || b.kind !== 'faction') why = b.text;
        }
      }
      const titles = [...offered].join(', ');
      // ⚠⚠⚠ OTA-1474 — AND THE EMPTY BOARD SAYS WHY IT IS EMPTY. OTA-1466
      // answered the two branches above and left this one a shrug: "No bounties
      // for you right now." His log has twelve taps against it in nine seconds.
      // The reasons were never missing — `huntBlockReason` can explain every
      // hunt in the catalogue — the empty case simply threw them all away.
      const emptyWhy = titles
        ? null
        : emptyBoardLine(
            scene.vendor.name,
            emptyBoardTally(
              searchFactions,
              (fid) => (fid ? getStanding(player.factionStanding, fid) : 0),
              (player.activeHunts ?? []).map((h) => h.id),
              player.completedHuntIds ?? [],
              player.hpMax,
            ),
          );
      get().appendLog(
        'arbiter',
        asked && why
          ? `${scene.vendor.name} taps the posting. "${asked.title} — ${why}."`
          : titles
            ? `${scene.vendor.name} thumbs through papers. "Not that one. Currently posted: ${titles}."`
            : emptyWhy!,
        // ⚠⚠ OTA-1474 — AND IT IS NEVER DEDUPED INTO SILENCE. OTA-947 already
        // settled this rule — "a refusal must ALWAYS answer" — after eight
        // identical salvage attempts drew one reply and seven suppressions. This
        // site never got the flag, and his log is the same shape: twelve taps,
        // ONE line, eleven `dedup: suppressed arbiter repeat`. From tap two
        // onward the game answered him with nothing at all, which is exactly why
        // he kept tapping.
        { skipDedup: true },
      );
      return;
    }
    const hunt = matchedHunt;
    // OTA-972 — #118: same single-active rule as faction quests — accepting while
    // ANY contract (any kind) is live PARKS the new one instead of
    // auto-activating it.
    const huntTracked = !deps.anyTrackedContract(player);
    get().appendLog('debug', `accept: hunt ${hunt.id} tracked=${huntTracked}`);
      // OTA-1049 — a contract handed over face to face is business with THAT
      // agent, so it goes on their ledger. Guarded on a live vendor because
      // board/remote accepts have no one standing across from you.
      if (scene?.vendor) {
        set((st) => ({
          worldMemory: recordNpcDealing(st.worldMemory, deps.vendorNpcId(scene.vendor!), { contractsTaken: 1 }),
        }));
      }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeHunts: [
                ...(s.player.activeHunts ?? []),
                { id: hunt.id, stage: firstActionableHuntStage(hunt), postedByFaction: factionId, acceptedAt: Date.now(), tracked: huntTracked, ...deps.acceptCellStamp(get) },
              ],
            },
          }
        : s,
    );
    // ⚠⚠ P19 — same skipped-prefix grant as the neutral accept door above. The faction
    // door had the identical hole; two doors, one silence.
    deps.grantStageItems(get, set, hunt.title, hunt.stages, 0, firstActionableHuntStage(hunt));
    // OTA-1048 — read the burst index BEFORE the bump, so this accept is
    // judged on its own position in the burst rather than the next one's.
    const huntCompact = acceptIsCompact();
    deps.bumpQuestsAccepted(get, set);
    // Per-hunt stage0.arbiter suppressed on accept (see acceptFactionQuest
    // for rationale). Burst-aware meta line comes from deps.bumpQuestsAccepted.
    const stage0 = hunt.stages[0];
    if (stage0) {
      if (huntCompact) {
        // OTA-1048 — one line. Destination is folded in; poster text, stage
        // narration and the danger detail are all in Contracts.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { biomeLabel: bl } = require('../../engine/hunts');
        const where = hunt.targetLocationName ?? bl(hunt.biomeTag);
        get().appendLog('reward', `✦ Hunt accepted — ${hunt.title}${parkedTag(huntTracked)} → ${where}.`);
      } else {
        get().appendLog('reward', `✦ Hunt accepted — ${hunt.title}${parkedTag(huntTracked)}. ${hunt.posterText}`);
        // ⚠⚠ OTA-1582 — THE OPENING BEAT'S WORDS BELONG TO THE MEETING, NOT THE
        // RECEIPT. Stage 0 is no longer skipped, so `advance*` prints this exact
        // narration when the player answers the conversation card standing in
        // front of the person. Printing it here as well would say the same
        // paragraph twice, a few taps apart. Nothing is lost: the accept line
        // still carries the poster text, and the narration always arrives — at
        // the beat it describes.

        // 2026-05-26 OTA-053 — playtester ask: "I get handed a poster.
        // It doesn't give me an idea of where I'm supposed to go."
        // Emit an explicit Arbiter line naming the target location so
        // the player isn't reduced to scanning posterText for a proper
        // noun. Uses targetLocationName when authored, falls back to
        // biomeLabel() for legacy hunts.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { biomeLabel: huntBiomeLabel } = require('../../engine/hunts');
        const locLabel = hunt.targetLocationName ?? huntBiomeLabel(hunt.biomeTag);
        get().appendLog(
          'arbiter',
          `The Arbiter taps the poster. "Travel to ${locLabel} to begin. The ${hunt.targetEnemyName} won't come to you."`,
        );
      }
      // 2026-05-26 OTA-055 — difficulty warning. If the player is
      // both under-HP and under-weapon, the Arbiter calls it out
      // before they walk into the boss. Doesn't block accept — the
      // player can still take the contract and try — but they
      // can't say nobody warned them. OTA-1048 — full-detail accepts only;
      // mid-burst the numbers are on the Contracts card.
      if (!huntCompact && hunt.recommendedHp && hunt.recommendedWeaponRarity) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { weaponRarityMeets: huntWeaponRarityMeets } = require('../../engine/hunts');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getItemPreview: huntGetItemPreview } = require('../../components/itemPreview');
        const livePlayerHunt = get().player;
        const hpOk = !!livePlayerHunt && livePlayerHunt.hp >= hunt.recommendedHp;
        const mainName = livePlayerHunt?.equipped?.main;
        const mainRarity = mainName ? (huntGetItemPreview(mainName).rarity ?? undefined) : undefined;
        const weaponOk = huntWeaponRarityMeets(mainRarity, hunt.recommendedWeaponRarity);
        if (!hpOk && !weaponOk) {
          get().appendLog(
            'arbiter',
            `The Arbiter looks at you straight. "This one will kill you as you are right now. Train up, gear up, or come back with friends. Recommended: ${hunt.recommendedHp} HP and ${withArticle(hunt.recommendedWeaponRarity)} weapon. You sit at ${livePlayerHunt?.hp ?? '?'} HP."`,
          );
        } else if (!hpOk || !weaponOk) {
          get().appendLog(
            'arbiter',
            `The Arbiter taps the table. "Going to be tight. Recommended ${hunt.recommendedHp} HP and ${withArticle(hunt.recommendedWeaponRarity)} weapon. ${!hpOk ? "Your HP is short of that — " : ''}${!weaponOk ? "Your weapon's a tier below — " : ''}take a beat before you commit."`,
          );
        }
      }
    }
    // ⚠⚠⚠ OTA-1582 — THE OPENING STAGE IS A MEETING, AND IT IS NO LONGER SKIPPED.
    // All 50 staged missions open with a named person at a hub handing the player
    // a token; all 50 of those stages were stepped over, so the token appeared in
    // the pack with nobody attached to it. Three accept doors had three different
    // answers to "where does a record start" — two of them a literal `1` — which
    // is how the hunt door came to compute `firstActionableHuntStage` at insert
    // and then clobber it with 1 four lines later. One answer now, and it lives
    // in questStage.firstActionableStage: skip pure narration, never skip a
    // person.
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeHunts: (s.player.activeHunts ?? []).map((h) =>
                h.id === hunt.id ? { ...h, stage: QS_firstActionableStage(hunt.stages) } : h,
              ),
            },
          }
        : s,
    );
    // OTA 059 — same shape as faction-quest accept: trains CHA.
    {
      const chaLeveled = trainAcceptCharismaGated(get, set);
      if (chaLeveled != null) {
        get().appendLog(
          'reward',
          `✦ The hunt is yours to take. +1 CHA (${deps.statNowClause(get().player, 'charisma', chaLeveled)}).`,
        );
      }
      // OTA-057 — accepting a hunt is an active CHA push; the matching
      // WIS train fires on completion, not on accept.
    }
    void get().persist();
  },

  pendingMissionStinger: null,
  dismissMissionStinger() {
    // ⚠ OTA-1622 — the tap is logged, so a device log can prove the card was
    // seen (MissionEncounterCard never logged its taps; that gap cost a day).
    get().appendLog('debug', 'ui: tap "mission card · FIGHT"');
    set(() => ({ pendingMissionStinger: null }));
  },
  pendingMissionBeat: null,
  missionCloseQueue: [],
  dismissMissionBeat() {
    get().appendLog('debug', 'ui: tap "mission card · CONTINUE"');
    set((s) => {
      const [head, ...rest] = s.missionCloseQueue ?? [];
      return { pendingMissionBeat: head ?? null, missionCloseQueue: rest };
    });
  },
  missionFleeHoldCell: null,
  advanceHunt(huntId, opts) {
    const peaceful = opts?.peaceful === true;
    const state = get();
    const player = state.player;
    if (!player) return;
    const active = player.activeHunts ?? [];
    const record = active.find((h) => h.id === huntId);
    const hunt = findHuntById(huntId);
    if (!record || !hunt) return;
    const stageDef = hunt.stages[record.stage];
    if (!stageDef) return;
    // ⚠⚠⚠ OTA-1598 — THE FIGHT WAITS OUTSIDE THE GATE. From the owner, standing
    // in Reclaimers' Outpost with "force the issue" on the slate: "we have a
    // rule against being attacked in an outpost ... is that killing the
    // mission?" It nearly did the opposite: a boss stage advanced indoors
    // spawns the scaled apex INTO the outpost room. Eleven hunt fight-stages
    // stand on hub tiles (the sweep is pinned in ota1598), and arrival at a hub
    // tile auto-enters the interior — so the roof is the DEFAULT place the verb
    // lands. The truce holds both ways: a stage that draws blades (boss /
    // attack_provoke / an authored spawn) refuses under a roof and points at
    // the door. Stepping out keeps the boots on the same canon cell (OTA-1597),
    // so the same verb pays honestly right outside. A peaceful advance passes —
    // there is no fight in it, which is what the persuade bought.
    const drawsBlades = stageDef.checkKind === 'boss' || stageDef.checkKind === 'attack_provoke' || !!stageDef.spawn;
    if (!peaceful && drawsBlades && (player.hubRoomId || get().activeBuildingId)) {
      get().appendLog('arbiter', `The Arbiter puts a hand out. "Not under this roof — the outpost holds its truce. Step out the gate (LEAVE OUTPOST) and force it there."`);
      return;
    }
    // ⚠ OTA-1601 — computed HERE (the same expression as `freezeForKill` below)
    // because the direction/route block needs the answer BEFORE the spawn runs
    // — and, since OTA-1605, because the one-fight guard needs it BEFORE the
    // narration prints.
    let lastBossIdxEarly = -1;
    for (let i = 0; i < hunt.stages.length; i++) {
      if (hunt.stages[i]?.checkKind === 'boss') lastBossIdxEarly = i;
    }
    const willFreezeForKill = !peaceful && (
      (stageDef.checkKind === 'boss' && record.stage === lastBossIdxEarly)
      || !!stageDef.spawn
    );
    // ⚠⚠⚠ OTA-1605 — ONE FIGHT ON THE FIELD. From the owner's crest log: 'fight
    // me' on the apex ground ran advanceHunt through TWO doors in one action
    // (the attack matcher and the per-action ground check), and the full
    // curtain — narration, 'closes the distance', stinger — printed twice
    // 283ms apart, with the second summon handing the boss a fresh HP bar.
    // The arm has always guarded on live hostiles; the verb door never needed
    // to until OTA-1601 opened the second door. A stage that freezes for a
    // kill is a no-op while ANY live hostile holds the field: if it's the
    // boss, the fight is already on; if it's an ambient pack, the clear-field
    // re-arm (combatResolution → checkStandingGround) raises the curtain the
    // moment the last body drops. Silent by design — you're already fighting.
    if (willFreezeForKill) {
      const sc = get().currentScene;
      // ⚠ OTA-1686 — a knocked-out body is not a live hostile (OTA-1612's rule,
      // applied here and at the arrival arm): the walker left a wanderer out
      // cold on the steeple and the apex was held shut by a sleeper.
      if ((sc?.enemies ?? []).some((_, i) => (sc?.enemyHps?.[i] ?? 0) > 0 && !(sc?.enemyKnockedOut?.[i] ?? false))) return;
    }
    // ⚠⚠ OTA-1688 — THE GROUND REMEMBERS THE LAST FLEE. A `fled` deed for this
    // stage on this ground (deeds.stageFled) says how many of the brood were
    // left standing, or how much of the apex was left: the escort comes back
    // at that count, rising from where it was left rather than ambushing, and
    // the apex comes back with its wound. The name-token, read once, is not
    // read as new a second time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const QSg = require('../../engine/questStage') as typeof import('../../engine/questStage');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CMg = require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { stageFled } = require('../../engine/deeds') as typeof import('../../engine/deeds');
    const groundNow = QSg.stageLocationId(stageDef, CMg.huntAnchorId(hunt), CMg.resolvePosterLocation);
    const fledHere = peaceful ? null : stageFled(get().worldMemory, groundNow, hunt.id, record.stage);
    // The authored curtain is for the first time. A return to a fight you ran
    // from gets its own line — the name-token narration ("it stalls, for one
    // long breath") must not read word for word a second time, and the brood
    // does not "drop off the reeds" onto someone it has already met.
    let returnLine: string | null = null;
    if (fledHere && fledHere.hpLeft !== undefined) {
      returnLine = `${hunt.targetEnemyName} rises from where you left it. It has not forgotten you.`;
    } else if (fledHere && fledHere.n !== undefined && stageDef.spawn) {
      returnLine = `You come back onto ground you ran from. ${pluralizeNoun(stageDef.spawn.enemyName)} rise from the positions they were left in.`;
    }
    if (returnLine) {
      get().appendLog('world', returnLine);
      if (fledHere?.hpLeft !== undefined) get().appendLog('arbiter', `The Arbiter, low: "It has seen your opening once. Whatever caught it the first time will not catch it twice."`);
    } else {
      get().appendLog('world', stageDef.narration);
      if (stageDef.arbiter) get().appendLog('arbiter', stageDef.arbiter);
    }
    // ⚠⚠⚠ OTA-1622 — remembered from the direction block below for the close
    // card: the "▸ Next" line and what the close handed over. (OTA-1602 kept
    // these only for a same-tile close; the owner's rule is EVERY close.)
    let closeNext: string | null = null;
    let grantedNow: string[] = [];
    // ⚠⚠ P19 — THE STAGE ACTUALLY HANDS YOU THE THING NOW. Owner: *"if it's calling for
    // you to investigate an area, find a certain object and take that object to the next
    // area, well then it has to give you the damn object."* The narration has always
    // described the find; nothing ever put it in the pack, so the next stage talked about
    // a logbook the player had never seen and the inventory's mission section was empty.
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const QS = require('../../engine/questStage') as typeof import('../../engine/questStage');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const CM = require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers');
      deps.grantStageItems(get, set, hunt.title, hunt.stages, record.stage, record.stage + 1);
      grantedNow = grantedNames(get, hunt.stages, record.stage, record.stage + 1);
      // ⚠ AND IT SAYS WHERE THE NEXT ONE IS. *"each stage has to direct you to the next
      // stage. otherwise you have no idea where you're going."* Speaks only when there is
      // something to say — new ground, a person to find, or a thing to bring.
      const nextDef = hunt.stages[record.stage + 1];
      // ⚠⚠⚠ OTA-1601 — A STAGE THAT FREEZES FOR A KILL DOES NOT ANNOUNCE OR
      // ROUTE THE NEXT ONE. This block used to run unconditionally, BEFORE the
      // spawn below — harmless while chain routes were long (it only set a
      // course), and a live defect the moment fight-grounds went adjacent: a
      // one-tile setTravelCourse completes INSTANTLY, so the route dragged the
      // player one tile off the ground mid-call and the ambush spawned at the
      // NEXT stage's location (the gamut walker caught the golem's iron
      // weavers standing up inside Thametan's Tower while the trace still said
      // @builders_scaffold). The direction and the route belong to the moment
      // the stage ADVANCES — for a frozen stage that is resolveStageEscortClear,
      // when the last body drops.
      if (nextDef && !willFreezeForKill) {
        const hereId = QS.stageLocationId(stageDef, CM.huntAnchorId(hunt), CM.resolvePosterLocation);
        const nextId = QS.stageLocationId(nextDef, CM.huntAnchorId(hunt), CM.resolvePosterLocation);
        const movedGround = nextId !== hereId;
        // ⚠ OTA-1621 — the family rides along so the line carries the command
        // word for the next beat, not only its ground and its item.
        const dir = QS.nextStageDirection(nextDef, nextDef.locationName ?? null, movedGround, 'hunt');
        if (dir) get().appendLog('system', dir);
        closeNext = dir ?? null;
        // ⚠⚠ P19 — AND IT ACTUALLY SETS THE COURSE. Owner: *"it didn't auto route me to
        // the next stage."* He was not exaggerating — `advanceMissionRoute` reads
        // `activeFactionQuests` and NOTHING ELSE, so hunts have never had a route chain
        // of any kind. A stage that moves the player now points the road at the new
        // ground the moment the old stage closes, exactly as the faction-quest chain
        // does on a leg transition.
        // ⚠ Only when the ground actually MOVED and the player isn't already walking
        // there — re-issuing a course you're already on resets the tile countdown, and
        // hijacking a course the player set for themselves is the "yank them back"
        // failure the chain guard exists to prevent.
        const liveNow = get().player;
        if (movedGround && liveNow && liveNow.currentLocationId !== nextId
            && liveNow.travelTarget?.locationId !== nextId) {
          deps._chainRouting = true;
          try { get().setTravelCourse(nextId); } finally { deps._chainRouting = false; }
          // ⚠⚠ ONLY CLAIM IT IF IT HAPPENED. `setTravelCourse` has six refusals of its own
          // (unplaceable destination, already standing on the target's cell, no scene…) and
          // every one of them returns without setting a course. Announcing the auto-route
          // unconditionally is the "lit button that doesn't fire" failure in log form — the
          // player reads "Auto-routing to X" and no road appears. Check the state, then speak.
          if (get().player?.travelTarget?.locationId === nextId) {
            get().appendLog('world', `Auto-routing to the next stage of ${hunt.title}: ${deps.safeLocName(nextId)}.`);
          }
        }
      }
    }
    // Boss stage spawns the scaled enemy. OTA-796 — the FINAL boss stage FREEZES
    // the hunt here (no stage increment): the boss must actually be KILLED to
    // complete it (resolveEnemyDefeat does the final advance). Previously every
    // boss stage — including the last — incremented on SPAWN, so the moment the
    // apex enemy appeared the stage hit stages.length and the turn-in gate
    // (`stage < stages.length`) passed; the player could flee/despawn the boss
    // and collect the full bounty without the fight (exploit sweep). Mid-hunt
    // boss stages (there are hunts with a boss beat before the apex) still
    // increment on spawn.
    // ⚠⚠ OTA-1578 — AND AN ESCORT STAGE FREEZES TOO. It used to advance on the
    // SPAWN, so three raiders could be left standing and the hunt moved on
    // regardless. A stage that puts bodies in front of you is resolved by
    // dealing with them — the clear is handled where the last one dies.
    // ⚠ OTA-1581 — a PEACEFUL advance freezes for nothing: there is no fight to
    // wait on, which is the entire thing the persuade bought.
    // ⚠ OTA-1601 — one computation, made above the direction/route block; two
    // copies of this expression is how the route gate and the freeze drift.
    const freezeForKill = willFreezeForKill;
    // ⚠⚠⚠ OTA-1576 — THE STAGE GETS TO SAY WHAT IS ACTUALLY THERE. Every boss
    // stage used to spawn the hunt's ONE global `targetEnemyName`, which is
    // right for an `apex` and exactly backwards for a `false_summit` — a stage
    // type whose whole job is to say the target was NOT here. Both of the
    // game's two spawned the very boss their sentence says has left: "Embers
    // still warm. REAVER GONE. Three of his sworn followers rise …" and "You
    // wade in expecting the Queen. THE QUEEN IS [gone]". The owner hit the
    // first, was told to find three Tartarian raiders, found none, and typed
    // the problem into the game in plain English.
    //
    // ⚠⚠⚠ OTA-1581 — AND THE SPAWN LEAVES THE BOSS BRANCH, because it was a
    // LATENT SOFTLOCK sitting directly in the mission-card's path. OTA-1578 put
    // `|| !!stageDef.spawn` into `freezeForKill` — correctly: a stage that puts
    // bodies in front of you is resolved by dealing with them. But the spawn
    // itself stayed nested under `checkKind === 'boss'`. Both authored spawns
    // happen to be boss stages, so nothing was broken TODAY; the moment a
    // `diplomacy` stage authored one — which is exactly what the conversation
    // card's "I get jumped by three raiders" beat is — the hunt would freeze
    // waiting for a kill that nothing had spawned. Unwinnable, silently.
    //
    // The boss SCALING stays boss-only. Only the escort moved out.
    const override = peaceful
      ? null
      : (stageDef.spawn && fledHere && fledHere.n !== undefined && fledHere.n > 0
        ? { ...stageDef.spawn, count: Math.min(stageDef.spawn.count ?? 1, fledHere.n), ambush: false }
        : stageDef.spawn);
    let stoodUp = spawnStageEscort(get, set, deps, player, override, `hunt:${record.id}:${record.stage}`);
    if (stoodUp && override && stageDef.spawn && override !== stageDef.spawn) {
      // (a flee with none standing — every body out cold — comes back to the
      // authored count: the sleepers woke; nothing is owed for a knockout.)
      const gone = (stageDef.spawn.count ?? 1) - (override.count ?? 1);
      if (gone > 0) get().appendLog('world', `${gone === 1 ? 'The one you put down' : `The ${gone} you put down`} stay${gone === 1 ? 's' : ''} down. The rest remember you.`);
    }
    if (stageDef.checkKind === 'boss') {
      // ⚠ OTA-1167 — pass the REAL power measure, so the boss sees stats, weapon and AC
      // rather than max HP alone. `scalePowerOf` carries the guarded gear read.
      // ⚠ OTA-1600 — AND `peaceful` finally reaches the boss scale. OTA-1581's
      // contract says a peaceful advance puts NOBODY in front of you; the spawn
      // and the freeze honoured it, but this line read only `override`, so a
      // persuade landed on a boss stage stood the boss up anyway (and would now
      // have shouted a stinger over a fight the persuade had just bought off).
      const boss0 = peaceful || override ? null : scaleHuntBoss(player, hunt, deps.scalePowerOf(player));
      // OTA-1688 — the wound holds; the name does not stall it twice.
      const wounded = boss0 && fledHere && fledHere.hpLeft !== undefined && fledHere.hpLeft < boss0.hp;
      const boss = boss0 && wounded ? { ...boss0, hp: Math.max(1, fledHere!.hpLeft!) } : boss0;
      if (boss && wounded) get().appendLog('world', `The wound you gave it is still open — ${boss.hp} of ${boss0!.hp}.`);
      if (boss) {
        set((s) =>
          s.currentScene
            ? {
                currentScene: {
                  ...s.currentScene,
                  ...deps.FRESH_ENEMY_ARRAYS,
                  enemies: [boss],
                  enemyHps: [boss.hp],
                  activeEnemyIdx: 0,
                  range: 'mid',
                },
              }
            : s,
        );
        get().appendLog('combat', `${boss.name} closes the distance. The hunt comes to its end.`);
        stoodUp = true;
      }
    }
    // ⚠⚠⚠ OTA-1600 — THE STINGER. Owner: "should the big boss of the mission
    // have a line of dialogue on a pop up to pull your attention back into the
    // mission ... not a talk card, just a popup to focus your attention? a text
    // cutscene?" Yes — his own log made the case: the raider pack and the
    // Reaver's arrival were single lines scrolling past in combat noise, and he
    // typed "still didn't progress" while standing in the middle of the
    // mission's own fight. The moment a fight-stage actually STANDS BODIES UP
    // (an escort landed, or the boss committed — never on a prose-only close,
    // which would shout over an empty field), the authored `stinger` line goes
    // up as a modal with the mission title, and into the log so the record
    // keeps it. One writer, so the verb path, the card door, and the arrival
    // arm all get the same curtain.
    // ⚠⚠ OTA-1622 — the FIGHT card carries the close's freight too: if this
    // stage also CLOSED (a mid-chain boss that does not freeze), the next
    // beat's word rides on it; a frozen stage shows what the close handed
    // over and holds the next until the last body drops.
    if (stoodUp) {
      // OTA-1688 — a return to a fled fight keeps its own line; the authored
      // stinger ("Three harpies drop screaming") is the first time's.
      if (stageDef.stinger && !returnLine) get().appendLog('combat', stageDef.stinger);
      raiseMissionClose(get, set, {
        title: hunt.title,
        line: returnLine ?? stageDef.stinger ?? stageDef.narration,
        next: freezeForKill ? null : closeNext,
        granted: grantedNow,
        fight: true,
      });
    }
    if (!freezeForKill) {
      // ⚠ OTA-1219 — auto-consume pure-narration (checkKind: null) stages, the
      // OTA-871 loop mysteries and storylines always had and hunts never got.
      // No hunt authors a mid-chain null today, but the day one does, a stage
      // no verb can match must not wedge the chain (that is exactly how every
      // freshly-accepted hunt got stuck at stage 0 until this OTA).
      let nextStage = record.stage + 1;
      while (nextStage < hunt.stages.length && hunt.stages[nextStage]!.checkKind === null) {
        const epi = hunt.stages[nextStage]!;
        get().appendLog('world', epi.narration);
        if (epi.arbiter) get().appendLog('arbiter', epi.arbiter);
        nextStage++;
      }
      set((s) =>
        s.player
          ? {
              player: {
                ...s.player,
                activeHunts: (s.player.activeHunts ?? []).map((h) =>
                  h.id === huntId ? { ...h, stage: nextStage } : h,
                ),
              },
            }
          : s,
      );
      // ⚠⚠⚠ OTA-1602 — THE BEAT CARD. Owner: "multistage missions like the
      // market heists either need a cutscene pop-up like the fight
      // announcements or a conversation card pop up in between stages to
      // separate and progress the mission."
      // ⚠⚠⚠ OTA-1622 — ON EVERY CLOSE, not only in place, and on the last one
      // too ("completion celebrates itself" was a feed line under the loot).
      // A stood-up stage already raised its FIGHT card above.
      if (!stoodUp) {
        raiseMissionClose(get, set, {
          title: hunt.title,
          line: stageDef.narration,
          next: nextStage >= hunt.stages.length
            ? `✦ Return to a posting agent to turn in "${hunt.title}".`
            : closeNext,
          granted: grantedNow,
        });
      }
    }
    void get().persist();
  },

  turnInHunt(titleOrId, remote = false) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    // OTA-810 — a HUNT is a FACE-TO-FACE turn-in (user's call). The trophy is the
    // proof, and proof has to be shown in person to a paying agent — the OTA-456
    // remote "send word" courier option is removed for hunts. (Mysteries / storylines
    // / faction deeds keep their remote cut; a bounty specifically is paid at the
    // table.) This also closes the B2 exploit of closing hunts 100% from a safe hub.
    if (remote) {
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "A trophy's no good sent by runner — a bounty is paid face to face. Carry it to an agent and put it on the table yourself."`,
      );
      return;
    }
    // OTA-1187 (PUNCHLIST P8) — the posting BOARD and the faction's own HALL take it back
    // too, exactly as they always have for faction quests. A trophy handed over at the
    // board that posted the bounty is still a face-to-face hand-in.
    const huntParty = turnInCounterparty(get, player, scene);
    if (!huntParty) {
      get().appendLog(
        'arbiter',
        `The Arbiter folds their arms. "A bounty's settled in person — find a vendor, a posting board, or the faction's own hall and show them the trophy."`,
      );
      return;
    }
    const sourceLabel = huntParty.name;
    const active = player.activeHunts ?? [];
    const direct = findHuntById(titleOrId);
    const candidate = direct ?? fuzzyFindHunt(
      titleOrId,
      active.map((r) => findHuntById(r.id)).filter((h): h is NonNullable<typeof h> => !!h),
    );
    if (!candidate) {
      get().appendLog('arbiter', `${sourceLabel} squints. "That hunt is not on your slate."`);
      return;
    }
    const record = active.find((h) => h.id === candidate.id);
    if (!record) {
      get().appendLog('arbiter', `${sourceLabel} squints. "That hunt is not on your slate."`);
      return;
    }
    if (record.stage < candidate.stages.length) {
      get().appendLog(
        'arbiter',
        `${sourceLabel} reads your face. "The trophy is the proof. You don't have it yet."`,
      );
      return;
    }
    // OTA-1185 — the trading post brokers another faction's bounty for a cut (PUNCHLIST
    // P2). ⚠ The trophy still changes hands IN PERSON, at an outpost the player walked to
    // — OTA-810's rule ("a bounty is paid face to face, not sent by runner") is intact.
    // What is gone is the requirement that the RIGHT faction's agent happen to be
    // standing there when you arrive.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CB = require('../../engine/contractBroker') as typeof import('../../engine/contractBroker');
    const huntViaBroker = CB.isContractBroker(scene?.vendor)
      && !!candidate.factionId && candidate.factionId !== huntParty.faction;
    if (!remote && !CB.vendorCanTakeContract({ id: scene?.vendor?.id, faction: huntParty.faction }, candidate.factionId)) {
      // ⚠ NO RUNNER OFFER HERE, and that is the rule rather than an oversight:
      // a bounty is settled by showing the trophy in person (OTA-810), and this
      // handler refuses `remote` outright a hundred lines up. Offering a button
      // that would then refuse is the silent-refusal failure wearing a hat.
      refuseWrongCounterparty(sourceLabel, candidate.factionId, candidate.title);
      return;
    }
    // Pay out: TC + optional item + optional rep + always the trophy.
    const trophy: InventoryItem = stampDurability({
      id: `trophy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: candidate.trophyName,
      kind: 'relic',
      rarity: 'Rare',
      quantity: 1,
      tags: ['trophy', 'hunt'],
      description: `Trophy from the hunt for the ${candidate.targetEnemyName}.`,
    });
    const huntRewardLookup = candidate.rewardItem ? lookupCraftedItem(candidate.rewardItem) : null;
    // 2026-05-25 — route through grantItem so the inventory cap is
    // honored. Previously raw spread silently bypassed the cap on
    // hunt rewards (HANDOFF "silent swallow"). grantItem returns
    // {inventory, accepted, dropped} per item; we log a refusal
    // line when something didn't fit.
    let huntNext = grantItem(player.inventory, trophy);
    if (candidate.rewardItem && huntRewardLookup) {
      const reward = stampDurability({
        id: `huntreward_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: candidate.rewardItem,
        kind: huntRewardLookup.kind,
        rarity: huntRewardLookup.rarity,
        quantity: 1,
        tags: huntRewardLookup.tags,
      });
      const rewardGrant = grantItem(huntNext.inventory, reward);
      if (rewardGrant.accepted <= 0) {
        get().appendLog(
          'world',
          `Pack too full — ${candidate.rewardItem} couldn't be carried. Make room and come back to claim it.`,
        );
      }
      huntNext = { ...rewardGrant, inventory: rewardGrant.inventory };
    }
    const newInventory = huntNext.inventory;
    const repResult = candidate.factionId && candidate.rewardRep
      ? applyRepChange(player.factionStanding, candidate.factionId, candidate.rewardRep)
      : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };
    // OTA-810 — face-to-face only, so always full pay. B2 — plus a long-haul bonus
    // scaled to how far you carried the trophy.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const journeyTc = (require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers')).contractJourneyBonusTc(player.currentLocationId, candidate.rewardTc, record?.acceptedAtCell);
    // OTA-1185 — 80% and no long-haul bonus when the trading post carried it.
    const payTc = CB.contractPayoutTc(candidate.rewardTc, journeyTc, huntViaBroker ? CB.brokerShareFor(scene?.vendor) : null);
    if (huntViaBroker) {
      get().appendLog('arbiter', CB.brokerAcceptLine(sourceLabel, factionDisplayName(candidate.factionId), CB.brokerShareFor(scene?.vendor) ?? undefined));
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + payTc,
              inventory: newInventory,
              factionStanding: repResult.standing,
              activeHunts: (s.player.activeHunts ?? []).filter((h) => h.id !== candidate.id),
              completedHuntIds: [...(s.player.completedHuntIds ?? []), candidate.id],
            },
          }
        : s,
    );
    get().announceMissionComplete(
      'Hunt',
      candidate.title,
      `✦ Hunt complete — ${candidate.title}. +${payTc} TC${!huntViaBroker && journeyTc > 0 ? ` (incl. +${journeyTc} long-haul)` : ''}${huntViaBroker ? ` (broker's cut taken)` : ''}${candidate.rewardRep ? `, +${candidate.rewardRep} rep` : ''}. Trophy recovered.`,
    );
    // OTA-1050 — the agent who took it back remembers that you finished it.
    creditTurnIn(get, set, false);
    deps.maybeTeachRecipeReward(get, set, 'MISSION_RECIPE_CHANCE', 'Recipe among the spoils'); // OTA-706
    deps.applyTrainAndLog(get, set, 'wisdom', '✦ A finished hunt seasons you. +1 WIS (now {to}).');
    if (repResult.changed.length > 0) deps.logRepChanges(get, repResult.changed);
    deps.recordMemorableEvent(get, set, {
      kind: 'rare_kill',
      text: `Completed the hunt for the ${candidate.targetEnemyName}.`,
      enemyName: candidate.targetEnemyName,
    });
    plantNextContractHint(get, candidate.factionId ?? null, 'hunt');
    void get().persist();
  },

  acceptMystery(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    // OTA 185 — faction-neutral mysteries accept without a vendor in
    // scene. Same rationale as acceptHunt: if the player heard the
    // offer in a hub and walked off, the second 'accept' tap from
    // anywhere should land the contract.
    if (!scene?.vendor) {
      const directMatch = findMysteryById(titleOrId);
      const neutralMatch = directMatch && directMatch.factionId === null
        ? directMatch
        : fuzzyFindMystery(titleOrId, MYSTERIES.filter((m) => m.factionId === null));
      const alreadyActive = neutralMatch
        && (player.activeMysteries ?? []).some((m) => m.id === neutralMatch.id);
      const alreadyDone = neutralMatch
        && (player.completedMysteryIds ?? []).includes(neutralMatch.id);
      if (neutralMatch && !alreadyActive && !alreadyDone) {
        const neutralTracked = !deps.anyTrackedContract(player); // OTA-972 — #118
        get().appendLog('debug', `accept: neutral ${neutralMatch.id} tracked=${neutralTracked}`);
      // OTA-1049 — a contract handed over face to face is business with THAT
      // agent, so it goes on their ledger. Guarded on a live vendor because
      // board/remote accepts have no one standing across from you.
      if (scene?.vendor) {
        set((st) => ({
          worldMemory: recordNpcDealing(st.worldMemory, deps.vendorNpcId(scene.vendor!), { contractsTaken: 1 }),
        }));
      }
        set((s) => (s.player ? {
          player: {
            ...s.player,
            activeMysteries: [
              ...(s.player.activeMysteries ?? []),
              // ⚠ OTA-1220 — start past the leading pure-narration stage. The VENDOR
              // branch has always bumped to stage 1 after playing stage-0's text;
              // this branch never did, and the OTA-1213 matcher can't match a null
              // checkKind — so every faction-NEUTRAL mystery accepted without a
              // vendor in scene was wedged at stage 0 forever. Same class as the
              // hunt wedge (OTA-1219); the walker caught this one too.
              { id: neutralMatch.id, stage: firstActionableHuntStage(neutralMatch), postedByFaction: null, acceptedAt: Date.now(), tracked: neutralTracked, ...deps.acceptCellStamp(get) },
            ],
          },
        } : s));
        // ⚠⚠ P19 — the opening beat HANDS YOU SOMETHING, and accept skips past it.
        // `firstActionableHuntStage` starts the record after every leading null stage, so
        // the inciting_hook's `grants` was never awarded by anything and the next stage
        // refused forever. Award the skipped prefix here, once, guarded on the pack.
        deps.grantStageItems(get, set, neutralMatch.title, neutralMatch.stages, 0, firstActionableHuntStage(neutralMatch));
        const neutralCompact = acceptIsCompact(); // OTA-1048 — before the bump.
        deps.bumpQuestsAccepted(get, set);
        if (neutralCompact) {
          get().appendLog('reward', `✦ Contract accepted — ${neutralMatch.title}${parkedTag(neutralTracked)}.`);
        } else {
          get().appendLog(
            'arbiter',
            `The Arbiter nods. "You take ${theLower(neutralMatch.title)} on. Open the Contracts board to see the stages."`,
          );
          if (!neutralTracked) {
            get().appendLog('world', `${neutralMatch.title} added to your slate (paused — you're already on another contract). Activate it in Contracts when you're ready.`);
          }
        }
        void get().persist();
        return;
      }
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "${hint.contractTitle} is a mystery the ${hint.factionLabel} pay for. Find ${sample} — or any other ${hint.factionLabel} agent — to take it on."`,
        );
      } else {
        get().appendLog('arbiter', `The Arbiter shakes their head. "Mystery work needs a buyer. Find a vendor."`);
      }
      return;
    }
    // A broker (Hidden Market stall) searches EVERY faction's pool; a normal
    // vendor searches only its own. availableMysteries folds in faction-neutral
    // work for each searched faction.
    const searchFactions: (string | null)[] = isBrokerVendorId(scene.vendor.id)
      ? FACTIONS.map((f) => f.id)
      : [scene.vendor.faction];
    const direct = findMysteryById(titleOrId);
    let matchedMystery: typeof direct | null = null;
    let factionId: string | null = scene.vendor.faction;
    const offered = new Set<string>();
    for (const fid of searchFactions) {
      const playerRep = fid ? getStanding(player.factionStanding, fid) : 0;
      const pool = availableMysteries(
        fid,
        playerRep,
        (player.activeMysteries ?? []).map((m2) => m2.id),
        player.completedMysteryIds ?? [],
      );
      for (const m2 of pool) offered.add(`"${m2.title}"`);
      const found = direct && pool.includes(direct) ? direct : fuzzyFindMystery(titleOrId, pool);
      if (found) { matchedMystery = found; factionId = fid; break; }
    }
    if (!matchedMystery) {
      const titles = [...offered].join(', ');
      get().appendLog(
        'arbiter',
        titles
          ? `${scene.vendor.name} unrolls a list. "Not that one. Currently posted: ${titles}."`
          : `${scene.vendor.name} shakes their head. "No mystery work for you right now."`,
      );
      return;
    }
    const m = matchedMystery;
    const mysteryTracked = !deps.anyTrackedContract(player); // OTA-972 — #118
    get().appendLog('debug', `accept: mystery ${m.id} tracked=${mysteryTracked}`);
      // OTA-1049 — a contract handed over face to face is business with THAT
      // agent, so it goes on their ledger. Guarded on a live vendor because
      // board/remote accepts have no one standing across from you.
      if (scene?.vendor) {
        set((st) => ({
          worldMemory: recordNpcDealing(st.worldMemory, deps.vendorNpcId(scene.vendor!), { contractsTaken: 1 }),
        }));
      }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeMysteries: [
                ...(s.player.activeMysteries ?? []),
                { id: m.id, stage: 0, postedByFaction: factionId, acceptedAt: Date.now(), tracked: mysteryTracked, ...deps.acceptCellStamp(get) },
              ],
            },
          }
        : s,
    );
    const mysteryCompact = acceptIsCompact(); // OTA-1048 — before the bump.
    deps.bumpQuestsAccepted(get, set);
    // Per-mystery stage0.arbiter suppressed (burst-aware line above).
    const stage0 = m.stages[0];
    if (stage0) {
      if (mysteryCompact) {
        get().appendLog('reward', `✦ Mystery accepted — ${m.title}${parkedTag(mysteryTracked)}.`);
      } else {
        get().appendLog('reward', `✦ Mystery accepted — ${m.title}${parkedTag(mysteryTracked)}. ${m.posterText}`);
        // ⚠⚠ OTA-1582 — THE OPENING BEAT'S WORDS BELONG TO THE MEETING, NOT THE
        // RECEIPT. Stage 0 is no longer skipped, so `advance*` prints this exact
        // narration when the player answers the conversation card standing in
        // front of the person. Printing it here as well would say the same
        // paragraph twice, a few taps apart. Nothing is lost: the accept line
        // still carries the poster text, and the narration always arrives — at
        // the beat it describes.

      }
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeMysteries: (s.player.activeMysteries ?? []).map((mm) =>
                mm.id === m.id ? { ...mm, stage: QS_firstActionableStage(m.stages) } : mm,
              ),
            },
          }
        : s,
    );
    // OTA 059 — same shape as faction-quest accept: trains CHA.
    {
      const chaLeveled = trainAcceptCharismaGated(get, set);
      if (chaLeveled != null) {
        get().appendLog(
          'reward',
          `✦ They confide the mystery to you. +1 CHA (${deps.statNowClause(get().player, 'charisma', chaLeveled)}).`,
        );
      }
      // OTA-057 — accepting a mystery is an active CHA push; the WIS
      // train fires on resolution, not on accept.
    }
    void get().persist();
  },

  advanceMystery(mysteryId) {
    const state = get();
    const player = state.player;
    if (!player) return;
    const active = player.activeMysteries ?? [];
    const record = active.find((m) => m.id === mysteryId);
    const mystery = findMysteryById(mysteryId);
    if (!record || !mystery) return;
    const stageDef = mystery.stages[record.stage];
    if (!stageDef) return;
    get().appendLog('world', stageDef.narration);
    if (stageDef.arbiter) get().appendLog('arbiter', stageDef.arbiter);
    // ⚠⚠ P19 — the same three things the hunts got: hand over what the stage promised,
    // say where the next one is, and actually set the course.
    // OTA-1602 — and the same beat card. OTA-1622 — on EVERY close (see advanceHunt).
    let closeNextM: string | null = null;
    let grantedM: string[] = [];
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const QS = require('../../engine/questStage') as typeof import('../../engine/questStage');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const CM = require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers');
      deps.grantStageItems(get, set, mystery.title, mystery.stages, record.stage, record.stage + 1);
      grantedM = grantedNames(get, mystery.stages, record.stage, record.stage + 1);
      const nextDef = mystery.stages[record.stage + 1];
      if (nextDef) {
        const anchor = CM.contractAnchorId(mystery);
        const hereId = QS.stageLocationId(stageDef, anchor, CM.resolvePosterLocation);
        const nextId = QS.stageLocationId(nextDef, anchor, CM.resolvePosterLocation);
        const moved = nextId !== hereId;
        const dir = QS.nextStageDirection(nextDef, nextDef.locationName ?? null, moved, 'mystery');
        if (dir) get().appendLog('system', dir);
        closeNextM = dir ?? null;
        const liveNow = get().player;
        if (moved && liveNow && liveNow.currentLocationId !== nextId
            && liveNow.travelTarget?.locationId !== nextId) {
          deps._chainRouting = true;
          try { get().setTravelCourse(nextId); } finally { deps._chainRouting = false; }
          // ⚠ Only claim it if it happened — setTravelCourse has six silent refusals.
          if (get().player?.travelTarget?.locationId === nextId) {
            get().appendLog('world', `Auto-routing to the next stage of ${mystery.title}: ${deps.safeLocName(nextId)}.`);
          }
        }
      }
    }
    // ⚠⚠⚠ OTA-1583 — MYSTERIES AND STORYLINES CAN PUT SOMETHING IN FRONT OF YOU
    // TOO. `spawn` was read in exactly one place — the hunt boss branch — so a
    // storyline whose prose says an Aetheric Ooze "bars the only stair" had
    // nothing on the stair. Same writer as the hunts now, so the freeze-for-kill
    // and the conversation card's FIGHT branch behave identically in all three
    // families.
    const spawnedM = spawnStageEscort(get, set, deps, player, stageDef.spawn, `mystery:${record.id}:${record.stage}`);
    if (spawnedM) {
      // ⚠ OTA-1622 — a mystery that stands bodies up gets the FIGHT card too;
      // it had no stinger and its stand-up was two feed lines.
      raiseMissionClose(get, set, {
        title: mystery.title, line: (stageDef as { stinger?: string }).stinger ?? stageDef.narration,
        next: null, granted: grantedM, fight: true,
      });
      void get().persist();
      return;
    }
    // Final stage is the "synthesis" — the player has the trophy in hand
    // (narratively); advance the stage past the end so turn-in unlocks.
    let nextStage = record.stage + 1;
    // OTA-871 — auto-consume pure-narration (checkKind: null) stages. They have no player-
    // action gate, so a trailing null epilogue (a denouement authored after the boss stage)
    // would otherwise leave the quest one stage short of turn-in forever. Display each such
    // stage's narration, then advance past it — so epilogues read AND the quest completes.
    while (nextStage < mystery.stages.length && mystery.stages[nextStage]!.checkKind === null) {
      const epi = mystery.stages[nextStage]!;
      get().appendLog('world', epi.narration);
      if (epi.arbiter) get().appendLog('arbiter', epi.arbiter);
      // ⚠ P19 — a consumed null stage still hands over what it promised. Without this the
      // auto-consume loop reads the prose and silently drops the item, which is the same
      // silence that made a stage-0 grant vanish on the hunts.
      deps.grantStageItems(get, set, mystery.title, mystery.stages, nextStage, nextStage + 1);
      nextStage++;
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeMysteries: (s.player.activeMysteries ?? []).map((m) =>
                m.id === mysteryId ? { ...m, stage: nextStage } : m,
              ),
            },
          }
        : s,
    );
    // ⚠⚠ OTA-1602 — the beat card (see advanceHunt). OTA-1622 — every close,
    // the last one included: the "recovered" line rides the card as its next.
    const doneM = nextStage >= mystery.stages.length;
    const recoveredM = `✦ ${mystery.trophyName} recovered. Return to a posting agent to turn in "${mystery.title}".`;
    if (doneM) get().appendLog('reward', recoveredM);
    raiseMissionClose(get, set, {
      title: mystery.title, line: stageDef.narration,
      next: doneM ? recoveredM : closeNextM, granted: grantedM,
    });
    void get().persist();
  },

  turnInMystery(titleOrId, remote = false) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    // ⚠ OTA-1188 (PUNCHLIST P3) — a mystery is a REPORT, so a runner can carry it. The
    // counterparty check below is skipped for a courier hand-in; everything else (the
    // stage gate, the artifact-is-the-proof check) still applies.
    const mystViaCourier = remote;
    // B2 — the artifact is the proof and it changes hands IN PERSON now (no courier).
    // OTA-1187 (PUNCHLIST P8) — board and hall count, same as for faction quests.
    const mystParty = turnInCounterparty(get, player, scene);
    if (!mystViaCourier && !mystParty) {
      get().appendLog('arbiter', `The Arbiter folds their arms. "Need a buyer, in the flesh. Carry the proof to a vendor, a posting board, or the faction's hall — set a course to the ◆ pin in Contracts."`);
      return;
    }
    const sourceLabel = mystViaCourier ? 'A runner' : mystParty!.name;
    const active = player.activeMysteries ?? [];
    const direct = findMysteryById(titleOrId);
    const candidate = direct ?? fuzzyFindMystery(
      titleOrId,
      active.map((r) => findMysteryById(r.id)).filter((m): m is NonNullable<typeof m> => !!m),
    );
    if (!candidate) {
      get().appendLog('arbiter', `${sourceLabel} squints. "That mystery is not on your slate."`);
      return;
    }
    const record = active.find((m) => m.id === candidate.id);
    if (!record) {
      get().appendLog('arbiter', `${sourceLabel} squints. "That mystery is not on your slate."`);
      return;
    }
    if (record.stage < candidate.stages.length) {
      get().appendLog(
        'arbiter',
        `${sourceLabel} reads your face. "The artifact is the proof. You don't have it yet."`,
      );
      return;
    }
    // OTA-1185 — the trading post brokers another faction's work for a cut (PUNCHLIST P2).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CB = require('../../engine/contractBroker') as typeof import('../../engine/contractBroker');
    const mysteryViaBroker = !mystViaCourier && CB.isContractBroker(scene?.vendor)
      && !!candidate.factionId && candidate.factionId !== mystParty?.faction;
    if (!mystViaCourier && !CB.vendorCanTakeContract({ id: scene?.vendor?.id, faction: mystParty!.faction }, candidate.factionId)) {
      refuseWrongCounterparty(
        sourceLabel, candidate.factionId, candidate.title,
        { kind: 'mystery', id: candidate.id },
      );
      return;
    }
    const trophy: InventoryItem = stampDurability({
      id: `mystery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: candidate.trophyName,
      kind: 'relic',
      rarity: 'Rare',
      quantity: 1,
      tags: ['trophy', 'mystery'],
      description: `Recovered from the mystery: ${candidate.title}.`,
    });
    const mysteryRewardLookup = candidate.rewardItem ? lookupCraftedItem(candidate.rewardItem) : null;
    // 2026-05-25 — grantItem honors cap (same fix as hunt path).
    let mysteryNext = grantItem(player.inventory, trophy);
    if (candidate.rewardItem && mysteryRewardLookup) {
      const reward = stampDurability({
        id: `mysteryreward_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: candidate.rewardItem,
        kind: mysteryRewardLookup.kind,
        rarity: mysteryRewardLookup.rarity,
        quantity: 1,
        tags: mysteryRewardLookup.tags,
      });
      const rewardGrant = grantItem(mysteryNext.inventory, reward);
      if (rewardGrant.accepted <= 0) {
        get().appendLog(
          'world',
          `Pack too full — ${candidate.rewardItem} couldn't be carried. Make room and come back to claim it.`,
        );
      }
      mysteryNext = { ...rewardGrant, inventory: rewardGrant.inventory };
    }
    const newInventory = mysteryNext.inventory;
    const repResult = candidate.factionId && candidate.rewardRep
      ? applyRepChange(player.factionStanding, candidate.factionId, candidate.rewardRep)
      : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };
    // B2 — full pay + a LONG-HAUL bonus scaled to how far you carried it.
    // OTA-1185 — unless the trading post brokered it, which pays 80% and no bonus.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const journeyTc = (require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers')).contractJourneyBonusTc(player.currentLocationId, candidate.rewardTc, record?.acceptedAtCell);
    // ⚠ OTA-1188 — a courier hand-in pays the runner's rate and NO long-haul bonus.
    const payTc = mystViaCourier
      ? CB.courierPayoutTc(candidate.rewardTc)
      : CB.contractPayoutTc(candidate.rewardTc, journeyTc, mysteryViaBroker ? CB.brokerShareFor(scene?.vendor) : null);
    if (mystViaCourier) {
      get().appendLog('arbiter', CB.courierSentLine(candidate.title, payTc));
      set((st) => (st.player ? { player: deps.advanceTime(st.player, CB.COURIER_DELAY_HOURS) } : st));
    }
    if (mysteryViaBroker) {
      get().appendLog('arbiter', CB.brokerAcceptLine(sourceLabel, factionDisplayName(candidate.factionId), CB.brokerShareFor(scene?.vendor) ?? undefined));
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + payTc,
              inventory: newInventory,
              factionStanding: repResult.standing,
              activeMysteries: (s.player.activeMysteries ?? []).filter((m) => m.id !== candidate.id),
              completedMysteryIds: [...(s.player.completedMysteryIds ?? []), candidate.id],
            },
          }
        : s,
    );
    get().announceMissionComplete(
      'Mystery',
      candidate.title,
      `✦ Mystery complete — ${candidate.title}. +${payTc} TC${!mysteryViaBroker && !mystViaCourier && journeyTc > 0 ? ` (incl. +${journeyTc} long-haul)` : ''}${mysteryViaBroker ? ` (broker's cut taken)` : ''}${candidate.rewardRep ? `, +${candidate.rewardRep} rep` : ''}.`,
    );
    // OTA-1050 — the agent who took it back remembers that you finished it.
    creditTurnIn(get, set, mystViaCourier);
    deps.applyTrainAndLog(get, set, 'wisdom', '✦ A mystery resolved sharpens you. +1 WIS (now {to}).');
    if (repResult.changed.length > 0) deps.logRepChanges(get, repResult.changed);
    plantNextContractHint(get, candidate.factionId ?? null, 'mystery');
    void get().persist();
  },

  acceptStoryline(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    // A broker (Hidden Market stall) proceeds even if its own rostered faction
    // has no storylines — it posts every faction's board. A normal vendor still
    // needs a faction of its own.
    if (!scene?.vendor || (!scene.vendor.faction && !isBrokerVendorId(scene.vendor.id))) {
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "${hint.contractTitle} is a storyline of the ${hint.factionLabel}. Find ${sample} — or any other ${hint.factionLabel} agent — to take it on."`,
        );
      } else {
        get().appendLog('arbiter', `The Arbiter shakes their head. "Storylines come from faction agents. Find one."`);
      }
      return;
    }
    // A broker searches EVERY faction's storyline pool; a normal vendor only its
    // own.
    const searchFactions: string[] = isBrokerVendorId(scene.vendor.id)
      ? FACTIONS.map((f) => f.id)
      : (scene.vendor.faction ? [scene.vendor.faction] : []);
    const direct = findStorylineById(titleOrId);
    let matchedStoryline: typeof direct | null = null;
    let factionId: string | null = scene.vendor.faction;
    const offered = new Set<string>();
    for (const fid of searchFactions) {
      const playerRep = getStanding(player.factionStanding, fid);
      const pool = availableStorylines(
        fid,
        playerRep,
        (player.activeStorylines ?? []).map((s2) => s2.id),
        player.completedStorylineIds ?? [],
      );
      for (const s2 of pool) offered.add(`"${s2.title}"`);
      const found = direct && pool.includes(direct) ? direct : fuzzyFindStoryline(titleOrId, pool);
      if (found) { matchedStoryline = found; factionId = fid; break; }
    }
    if (!matchedStoryline) {
      const titles = [...offered].join(', ');
      get().appendLog(
        'arbiter',
        titles
          ? `${scene.vendor.name} unrolls a thicker scroll. "Not that one. Currently posted storyline: ${titles}."`
          : `${scene.vendor.name} shakes their head. "No long-form work for you right now."`,
      );
      return;
    }
    const s = matchedStoryline;
    const storyTracked = !deps.anyTrackedContract(player); // OTA-972 — #118
    get().appendLog('debug', `accept: storyline ${s.id} tracked=${storyTracked}`);
      // OTA-1049 — a contract handed over face to face is business with THAT
      // agent, so it goes on their ledger. Guarded on a live vendor because
      // board/remote accepts have no one standing across from you.
      if (scene?.vendor) {
        set((st) => ({
          worldMemory: recordNpcDealing(st.worldMemory, deps.vendorNpcId(scene.vendor!), { contractsTaken: 1 }),
        }));
      }
    set((st) =>
      st.player
        ? {
            player: {
              ...st.player,
              activeStorylines: [
                ...(st.player.activeStorylines ?? []),
                { id: s.id, stage: 0, postedByFaction: factionId, acceptedAt: Date.now(), tracked: storyTracked, ...deps.acceptCellStamp(get) },
              ],
            },
          }
        : st,
    );
    const storyCompact = acceptIsCompact(); // OTA-1048 — before the bump.
    deps.bumpQuestsAccepted(get, set);
    // Per-storyline stage0.arbiter suppressed (burst-aware line above).
    const stage0 = s.stages[0];
    if (stage0) {
      if (storyCompact) {
        get().appendLog('reward', `✦ Storyline accepted — ${s.title}${parkedTag(storyTracked)}.`);
      } else {
        get().appendLog('reward', `✦ Storyline accepted — ${s.title}${parkedTag(storyTracked)}. ${s.posterText}`);
        // ⚠⚠ OTA-1582 — THE OPENING BEAT'S WORDS BELONG TO THE MEETING, NOT THE
        // RECEIPT. Stage 0 is no longer skipped, so `advance*` prints this exact
        // narration when the player answers the conversation card standing in
        // front of the person. Printing it here as well would say the same
        // paragraph twice, a few taps apart. Nothing is lost: the accept line
        // still carries the poster text, and the narration always arrives — at
        // the beat it describes.

      }
    }
    set((st) =>
      st.player
        ? {
            player: {
              ...st.player,
              activeStorylines: (st.player.activeStorylines ?? []).map((rec) =>
                rec.id === s.id ? { ...rec, stage: QS_firstActionableStage(s.stages) } : rec,
              ),
            },
          }
        : st,
    );
    // OTA 059 — same shape as faction-quest accept: trains CHA.
    {
      const chaLeveled = trainAcceptCharismaGated(get, set);
      if (chaLeveled != null) {
        get().appendLog(
          'reward',
          `✦ The storyline opens to you. +1 CHA (${deps.statNowClause(get().player, 'charisma', chaLeveled)}).`,
        );
      }
      // OTA-057 — accepting a storyline is an active CHA push; WIS
      // fires on chapter completion, not on accept.
    }
    void get().persist();
  },

  advanceStoryline(storylineId) {
    const state = get();
    const player = state.player;
    if (!player) return;
    const active = player.activeStorylines ?? [];
    const record = active.find((s) => s.id === storylineId);
    const def = findStorylineById(storylineId);
    if (!record || !def) return;
    const stageDef = def.stages[record.stage];
    if (!stageDef) return;
    get().appendLog('world', stageDef.narration);
    if (stageDef.arbiter) get().appendLog('arbiter', stageDef.arbiter);
    // ⚠⚠ P19 — hand over what the stage promised, say where the next one is, set the course.
    // OTA-1602 — and the same beat card. OTA-1622 — on EVERY close (see advanceHunt).
    let closeNextS: string | null = null;
    let grantedS: string[] = [];
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const QS = require('../../engine/questStage') as typeof import('../../engine/questStage');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const CM = require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers');
      deps.grantStageItems(get, set, def.title, def.stages, record.stage, record.stage + 1);
      grantedS = grantedNames(get, def.stages, record.stage, record.stage + 1);
      const nextDef = def.stages[record.stage + 1];
      if (nextDef) {
        const anchor = CM.contractAnchorId(def);
        const hereId = QS.stageLocationId(stageDef, anchor, CM.resolvePosterLocation);
        const nextId = QS.stageLocationId(nextDef, anchor, CM.resolvePosterLocation);
        const moved = nextId !== hereId;
        const dir = QS.nextStageDirection(nextDef, nextDef.locationName ?? null, moved, 'storyline');
        if (dir) get().appendLog('system', dir);
        closeNextS = dir ?? null;
        const liveNow = get().player;
        if (moved && liveNow && liveNow.currentLocationId !== nextId
            && liveNow.travelTarget?.locationId !== nextId) {
          deps._chainRouting = true;
          try { get().setTravelCourse(nextId); } finally { deps._chainRouting = false; }
          // ⚠ Only claim it if it happened — setTravelCourse has six silent refusals.
          if (get().player?.travelTarget?.locationId === nextId) {
            get().appendLog('world', `Auto-routing to the next chapter of ${def.title}: ${deps.safeLocName(nextId)}.`);
          }
        }
      }
    }
    // ⚠⚠⚠ OTA-1583 — see the mystery path above and spawnStageEscort's note. A
    // storyline stage that authors a `spawn` now stands it up, and the chapter
    // holds until it is cleared.
    if (spawnStageEscort(get, set, deps, player, stageDef.spawn, `storyline:${record.id}:${record.stage}`)) {
      // ⚠ OTA-1622 — the FIGHT card for a storyline stand-up (the Ooze on the
      // stair had none).
      raiseMissionClose(get, set, {
        title: def.title, line: (stageDef as { stinger?: string }).stinger ?? stageDef.narration,
        next: null, granted: grantedS, fight: true,
      });
      void get().persist();
      return;
    }
    let nextStage = record.stage + 1;
    // OTA-871 — auto-consume trailing pure-narration (checkKind: null) epilogue stages so a
    // storyline authored with a denouement after its final action doesn't hang one stage
    // short of turn-in. Show each epilogue's narration, then advance past it.
    while (nextStage < def.stages.length && def.stages[nextStage]!.checkKind === null) {
      const epi = def.stages[nextStage]!;
      get().appendLog('world', epi.narration);
      if (epi.arbiter) get().appendLog('arbiter', epi.arbiter);
      // ⚠ P19 — a consumed null stage still hands over what it promised.
      deps.grantStageItems(get, set, def.title, def.stages, nextStage, nextStage + 1);
      nextStage++;
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeStorylines: (s.player.activeStorylines ?? []).map((rec) =>
                rec.id === storylineId ? { ...rec, stage: nextStage } : rec,
              ),
            },
          }
        : s,
    );
    // ⚠⚠ OTA-1602 — the beat card (see advanceHunt). OTA-1622 — every close,
    // the last one included.
    const doneS = nextStage >= def.stages.length;
    const completeS = `✦ Storyline complete in the field — ${def.title}. Return to a posting agent to turn it in.`;
    if (doneS) get().appendLog('reward', completeS);
    raiseMissionClose(get, set, {
      title: def.title, line: stageDef.narration,
      next: doneS ? completeS : closeNextS, granted: grantedS,
    });
    void get().persist();
  },

  turnInStoryline(titleOrId, remote = false) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    // ⚠ OTA-1188 (PUNCHLIST P3) — a storyline closes with a report, so a runner can carry it.
    const storyViaCourier = remote;
    // B2 — a storyline arc is closed FACE TO FACE now (no courier).
    // OTA-1187 (PUNCHLIST P8) — board and hall count, same as for faction quests.
    const storyParty = turnInCounterparty(get, player, scene);
    if (!storyViaCourier && !storyParty) {
      get().appendLog('arbiter', `The Arbiter folds their arms. "Find the agent in person — a vendor, the posting board, or the faction's hall. Open Contracts, set a course to the ◆ pin, and close it there. The trip pays."`);
      return;
    }
    const sourceLabel = storyViaCourier ? 'A runner' : storyParty!.name;
    const active = player.activeStorylines ?? [];
    const direct = findStorylineById(titleOrId);
    const candidate = direct ?? fuzzyFindStoryline(
      titleOrId,
      active.map((r) => findStorylineById(r.id)).filter((s): s is NonNullable<typeof s> => !!s),
    );
    if (!candidate) {
      get().appendLog('arbiter', `${sourceLabel} squints. "Not on your slate."`);
      return;
    }
    const record = active.find((s) => s.id === candidate.id);
    if (!record) {
      get().appendLog('arbiter', `${sourceLabel} squints. "Not on your slate."`);
      return;
    }
    if (record.stage < candidate.stages.length) {
      get().appendLog(
        'arbiter',
        `${sourceLabel} reads your face. "Storyline isn't finished. Come back."`,
      );
      return;
    }
    // OTA 011 — match hunt/mystery null-faction guard pattern. If a
    // storyline ever ships with factionId=null (none currently do,
    // but schema allows it) the old bare !== check would reject
    // every vendor; the && short-circuits that.
    // OTA-1185 — the trading post brokers another faction's work for a cut (PUNCHLIST P2).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CB = require('../../engine/contractBroker') as typeof import('../../engine/contractBroker');
    const storyViaBroker = !storyViaCourier && CB.isContractBroker(scene?.vendor)
      && !!candidate.factionId && candidate.factionId !== storyParty?.faction;
    if (!storyViaCourier && !CB.vendorCanTakeContract({ id: scene?.vendor?.id, faction: storyParty!.faction }, candidate.factionId)) {
      get().appendLog(
        'arbiter',
        `${sourceLabel} shakes their head. "Wrong faction. ${factionDisplayName(candidate.factionId)} posted that one — them, or the trading post at any outpost gate."`,
      );
      return;
    }
    const storyRewardLookup = candidate.rewardItem ? lookupCraftedItem(candidate.rewardItem) : null;
    const newInventory = candidate.rewardItem && storyRewardLookup
      ? [...player.inventory, stampDurability({
          id: `story_reward_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: candidate.rewardItem,
          kind: storyRewardLookup.kind,
          rarity: storyRewardLookup.rarity,
          quantity: 1,
          tags: storyRewardLookup.tags,
        })]
      : [...player.inventory];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const journeyTc = (require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers')).contractJourneyBonusTc(player.currentLocationId, candidate.rewardTc, record?.acceptedAtCell);
    // OTA-1185 — 80% and no long-haul bonus when the trading post carried it.
    // ⚠ OTA-1188 — courier rate, no long-haul bonus.
    const payTc = storyViaCourier
      ? CB.courierPayoutTc(candidate.rewardTc)
      : CB.contractPayoutTc(candidate.rewardTc, journeyTc, storyViaBroker ? CB.brokerShareFor(scene?.vendor) : null);
    if (storyViaCourier) {
      get().appendLog('arbiter', CB.courierSentLine(candidate.title, payTc));
      set((st) => (st.player ? { player: deps.advanceTime(st.player, CB.COURIER_DELAY_HOURS) } : st));
    }
    if (storyViaBroker) {
      get().appendLog('arbiter', CB.brokerAcceptLine(sourceLabel, factionDisplayName(candidate.factionId), CB.brokerShareFor(scene?.vendor) ?? undefined));
    }
    const repResult = applyRepChange(player.factionStanding, candidate.factionId, candidate.rewardRep);
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + payTc,
              inventory: newInventory,
              factionStanding: repResult.standing,
              activeStorylines: (s.player.activeStorylines ?? []).filter((rec) => rec.id !== candidate.id),
              completedStorylineIds: [...(s.player.completedStorylineIds ?? []), candidate.id],
            },
          }
        : s,
    );
    get().announceMissionComplete(
      'Storyline',
      candidate.title,
      `✦ Storyline complete — ${candidate.title}. +${payTc} TC${!storyViaBroker && !storyViaCourier && journeyTc > 0 ? ` (incl. +${journeyTc} long-haul)` : ''}${storyViaBroker ? ` (broker's cut taken)` : ''}, +${candidate.rewardRep} rep with ${factionDisplayName(candidate.factionId)}.`,
    );
    // ⚠ OTA-1203 (PUNCHLIST P16, route C) — four storylines ALSO hand over the faction's
    // Procedure Text, alongside (never instead of) the authored reward. The text is an
    // OBJECT; the read path teaches and INT-gates, so an arc finished early banks the
    // technique rather than wasting it.
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AT = require('../../engine/aetherTechniques') as typeof import('../../engine/aetherTechniques');
      const textTechId = AT.STORYLINE_TEXT_REWARDS[candidate.id];
      const textTech = AT.findTechnique(textTechId ?? null);
      if (textTech) {
        const textName = AT.techniqueTextName(textTech);
        const cat = lookupCraftedItem(textName);
        set((s) => (s.player ? {
          player: {
            ...s.player,
            inventory: mergeOrPushItem(s.player.inventory, stampDurability({
              id: deps.freshInstanceId('text'),
              name: textName,
              kind: cat.kind,
              rarity: cat.rarity,
              quantity: 1,
              tags: cat.tags,
            })),
          },
        } : s));
        get().appendLog('reward', `✦ ${textName} — the written procedure itself, handed over with the rest. Read it when your head is ready for it.`);
      }
    }
    // OTA-1050 — the agent who took it back remembers that you finished it.
    creditTurnIn(get, set, storyViaCourier);
    deps.maybeTeachRecipeReward(get, set, 'MISSION_RECIPE_CHANCE', 'Recipe among the spoils'); // OTA-706
    deps.applyTrainAndLog(get, set, 'wisdom', '✦ A storyline carried through teaches you. +1 WIS (now {to}).');
    deps.applyTrainAndLog(get, set, 'charisma', '✦ Word of the chapter spreads. +1 CHA (now {to}).');
    if (repResult.changed.length > 0) deps.logRepChanges(get, repResult.changed);
    plantNextContractHint(get, candidate.factionId, 'storyline');
    void get().persist();
  },

  setContractActive(kind, id, active) {
    // Faction quests keep their own single-active routing semantics.
    if (kind === 'faction_quest') { get().setFactionQuestActive(id, active); return; }
    const player = get().player;
    if (!player) return;
    const resolve = (cur: boolean) => (active != null ? active : !cur);
    let title = id;
    let nextActive = true;
    let changed = false;
    if (kind === 'hunt') {
      const rec = (player.activeHunts ?? []).find((h) => h.id === id);
      if (!rec) return;
      nextActive = resolve(rec.tracked !== false);
      title = findHuntById(id)?.title ?? id;
      set((s) => (s.player ? { player: { ...s.player, activeHunts: (s.player.activeHunts ?? []).map((h) => h.id === id ? { ...h, tracked: nextActive } : h) } } : s));
      changed = true;
    } else if (kind === 'mystery') {
      const rec = (player.activeMysteries ?? []).find((m) => m.id === id);
      if (!rec) return;
      nextActive = resolve(rec.tracked !== false);
      title = findMysteryById(id)?.title ?? id;
      set((s) => (s.player ? { player: { ...s.player, activeMysteries: (s.player.activeMysteries ?? []).map((m) => m.id === id ? { ...m, tracked: nextActive } : m) } } : s));
      changed = true;
    } else if (kind === 'storyline') {
      const rec = (player.activeStorylines ?? []).find((st) => st.id === id);
      if (!rec) return;
      nextActive = resolve(rec.tracked !== false);
      title = findStorylineById(id)?.title ?? id;
      set((s) => (s.player ? { player: { ...s.player, activeStorylines: (s.player.activeStorylines ?? []).map((st) => st.id === id ? { ...st, tracked: nextActive } : st) } } : s));
      changed = true;
    } else if (kind === 'whisper') {
      const rec = (player.activeWhispers ?? []).find((w) => w.id === id);
      if (!rec) return;
      nextActive = resolve(rec.tracked !== false);
      title = 'the whisper';
      set((s) => (s.player ? { player: { ...s.player, activeWhispers: (s.player.activeWhispers ?? []).map((w) => w.id === id ? { ...w, tracked: nextActive } : w) } } : s));
      changed = true;
    } else if (kind === 'lead') {
      const rec = (player.activeQuests ?? []).find((q) => q.id === id);
      if (!rec) return;
      nextActive = resolve(rec.tracked !== false);
      title = `${rec.objective.verb} ${rec.objective.target}`;
      set((s) => (s.player ? { player: { ...s.player, activeQuests: (s.player.activeQuests ?? []).map((q) => q.id === id ? { ...q, tracked: nextActive } : q) } } : s));
      changed = true;
    } else if (kind === 'broker') {
      const m = player.brokerMission;
      if (!m || m.done) return;
      // Broker stores the INVERSE flag (`paused`); active === !paused.
      nextActive = active != null ? active : m.paused === true;
      title = 'the parley';
      set((s) => (s.player && s.player.brokerMission ? { player: { ...s.player, brokerMission: { ...s.player.brokerMission, paused: !nextActive } } } : s));
      changed = true;
    }
    if (!changed) return;
    // OTA-992 — SINGLE-ACTIVE, enforced at ACTIVATION. The accept-side parking was
    // trivially undone by two taps of SET ACTIVE, leaving several contracts
    // live at once forever after (every later accept then parked "because
    // you're busy" against contracts the player couldn't see were both live).
    // Activating a routed contract stands every other routed contract down,
    // across kinds. Whispers, leads and the parley are ambient-tier: they are
    // breadcrumbs, not routes, and deliberately do not participate.
    if (changed && nextActive && (kind === 'hunt' || kind === 'mystery' || kind === 'storyline')) {
      set((s2) => (s2.player ? {
        player: {
          ...s2.player,
          activeHunts: (s2.player.activeHunts ?? []).map((h) => (kind === 'hunt' && h.id === id ? h : { ...h, tracked: false })),
          activeMysteries: (s2.player.activeMysteries ?? []).map((m) => (kind === 'mystery' && m.id === id ? m : { ...m, tracked: false })),
          activeStorylines: (s2.player.activeStorylines ?? []).map((st) => (kind === 'storyline' && st.id === id ? st : { ...st, tracked: false })),
          activeFactionQuests: (s2.player.activeFactionQuests ?? []).map((q) => ({ ...q, tracked: false })),
          // ⚠ OTA-1361 — the tower belongs in this sweep. setFactionQuestActive has
          // cleared `routedClimbId` since OTA-1320, but THIS sweep never did, so
          // activating a hunt/mystery/storyline left the routed tower still flagged
          // as the mission you're on. Invisible while nothing read the flag; the
          // moment the climb cards grew an ACTIVE toggle it would show two live
          // missions at once.
          routedClimbId: null,
        },
      } : s2));
    }
    // Staged contracts + leads truly FREEZE when paused (auto-advance / auto-complete
    // gated); whispers + the parley just drop off the standing reminders.
    const reminderOnly = kind === 'whisper' || kind === 'broker';
    get().appendLog('world', nextActive
      ? `Re-activated ${title}. It's back in play.`
      : reminderOnly
        ? `Deactivated ${title}. It stays on your slate but drops off your reminders until you re-activate it.`
        : `Deactivated ${title}. It stays on your slate but won't advance until you re-activate it.`);
    void get().persist();
  },

  completeContractFromUI(kind, id) {
    const logBefore = get().gameLog;
    const lastIdBefore = logBefore[logBefore.length - 1]?.id ?? null;
    const noticeBefore = get().missionCompleteNotice;
    // ⚠⚠ OTA-1402 — remember the notice we started with, so a RICH refusal raised
    // inside the call is not clobbered by the scraped one below. The scrape was
    // built when every refusal was a bare feed line; `refuseWrongCounterparty`
    // now raises a notice with a `body` (the card the player actually reads),
    // and overwriting it with the one-line feed text would silently downgrade
    // the popup back into the strip this OTA exists to replace.
    const contractsNoticeBefore = get().contractsNotice;
    get().completeContractFromUIInner(kind, id);
    const raisedRich = get().contractsNotice !== contractsNoticeBefore && !!get().contractsNotice?.body;
    if (get().missionCompleteNotice !== noticeBefore) {
      // Completed — the popup tells the story; drop any stale refusal.
      if (get().contractsNotice) set({ contractsNotice: null });
      return;
    }
    if (raisedRich) return;   // the refusal already said it properly
    const logAfter = get().gameLog;
    let refusal: string | null = null;
    for (let i = logAfter.length - 1; i >= 0; i--) {
      const e = logAfter[i];
      if (!e || e.id === lastIdBefore) break;
      if (e.channel === 'arbiter') { refusal = e.text; break; }
    }
    if (!refusal) {
      // No fresh line and no popup: the arbiter dedup ate a repeat refusal.
      // Surface the newest arbiter line — on a repeat tap that IS the refusal.
      //
      // ⚠ OTA-1402 — this fallback is now the LAST resort rather than the usual
      // path for a repeat. The wrong-counterparty refusal raises its own notice
      // every time (only its FEED line is rate-limited), precisely so a second
      // tap is never answered with whatever happened to be on the feed.
      for (let i = logAfter.length - 1; i >= 0; i--) {
        const e = logAfter[i];
        if (e?.channel === 'arbiter') { refusal = e.text; break; }
      }
    }
    if (refusal) set({ contractsNotice: { text: refusal, ts: Date.now() } });
  },

  completeContractFromUIInner(kind, id) {
    const player = get().player;
    if (!player) return;
    if (kind === 'hunt') {
      const def = findHuntById(id);
      const rec = (player.activeHunts ?? []).find((h) => h.id === id);
      if (!def || !rec) {
        get().appendLog('arbiter', `The Arbiter shakes their head. "That hunt isn't on your slate."`);
        return;
      }
      if (rec.stage < def.stages.length) {
        get().appendLog('arbiter', `The Arbiter eyes the contract. "Not done. The trophy is the proof — you don't have it yet."`);
        return;
      }
      // OTA-810 — a HUNT is a FACE-TO-FACE turn-in (user's call). The Contracts-UI
      // COMPLETE used to pay FULL from any tile — the B2 exploit (whole bounties
      // closed from a safe hub). Now it requires a paying agent present, and the
      // RIGHT faction's agent, exactly like the typed turn-in.
      const scene = get().currentScene;
      // OTA-1187 (PUNCHLIST P8) — board and hall count here too, so the COMPLETE button
      // and the typed turn-in cannot disagree about who may take a bounty back.
      const huntUiParty = turnInCounterparty(get, player, scene);
      if (!huntUiParty) {
        get().appendLog('arbiter', `The Arbiter folds their arms. "A bounty's settled in person — stand in front of a vendor, a posting board, or the faction's own hall and show them the trophy."`);
        return;
      }
      // OTA-1185 — the trading post brokers it for a cut (PUNCHLIST P2). Same rule as the
      // typed turn-in above, resolved by the same function so the button and the command
      // cannot disagree about who may take a contract.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const CB = require('../../engine/contractBroker') as typeof import('../../engine/contractBroker');
      const huntUiViaBroker = CB.isContractBroker(scene?.vendor)
        && !!def.factionId && def.factionId !== huntUiParty.faction;
      if (!CB.vendorCanTakeContract({ id: scene?.vendor?.id, faction: huntUiParty.faction }, def.factionId)) {
        refuseWrongCounterparty(huntUiParty.name, def.factionId, def.title);
        return;
      }
      const trophy: InventoryItem = stampDurability({
        id: `trophy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: def.trophyName,
        kind: 'relic',
        rarity: 'Rare',
        quantity: 1,
        tags: ['trophy', 'hunt'],
        description: `Trophy from the hunt for the ${def.targetEnemyName}.`,
      });
      const grantResult = grantItem(player.inventory, trophy);
      const huntUiRewardLookup = def.rewardItem ? lookupCraftedItem(def.rewardItem) : null;
      const newInventory = def.rewardItem && huntUiRewardLookup
        ? grantItem(grantResult.inventory, stampDurability({
            id: `huntreward_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: def.rewardItem,
            kind: huntUiRewardLookup.kind,
            rarity: huntUiRewardLookup.rarity,
            quantity: 1,
            tags: huntUiRewardLookup.tags,
          })).inventory
        : grantResult.inventory;
      const repResult = def.factionId && def.rewardRep
        ? applyRepChange(player.factionStanding, def.factionId, def.rewardRep)
        : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };
      // B2 — long-haul bonus, same as the typed turn-in.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const huntJourneyTc = (require('../../engine/contractMarkers') as typeof import('../../engine/contractMarkers')).contractJourneyBonusTc(player.currentLocationId, def.rewardTc, rec?.acceptedAtCell);
      // OTA-1185 — 80% and NO long-haul bonus when the trading post carried it.
      const huntPayTc = CB.contractPayoutTc(def.rewardTc, huntJourneyTc, huntUiViaBroker ? CB.brokerShareFor(scene?.vendor) : null);
      // ⚠ And the announce line below must not claim a bonus that was not paid — the
      // OTA-1156 defect (a diagnostic stating an outcome nobody checked) in reward copy.
      const huntShownJourneyTc = huntUiViaBroker ? 0 : huntJourneyTc;
      if (huntUiViaBroker) {
        get().appendLog('arbiter', CB.brokerAcceptLine(huntUiParty.name, factionDisplayName(def.factionId), CB.brokerShareFor(scene?.vendor) ?? undefined));
      }
      set((s) => (s.player ? {
        player: {
          ...s.player,
          tc: s.player.tc + huntPayTc,
          inventory: newInventory,
          factionStanding: repResult.standing,
          activeHunts: (s.player.activeHunts ?? []).filter((h) => h.id !== def.id),
          completedHuntIds: [...(s.player.completedHuntIds ?? []), def.id],
        },
      } : s));
      get().announceMissionComplete(
        'Hunt',
        def.title,
        `✦ Hunt complete — ${def.title}. From your pack: the ${def.trophyName}. +${huntPayTc} TC${huntShownJourneyTc > 0 ? ` (incl. +${huntShownJourneyTc} long-haul)` : ''}${huntUiViaBroker ? ` (broker's cut taken)` : ''}${def.rewardRep ? `, +${def.rewardRep} rep` : ''}${def.rewardItem ? ` + ${def.rewardItem}` : ''}.`,
      );
      // OTA-1050 — the agent who took it back remembers that you finished it.
      creditTurnIn(get, set, false);
      deps.maybeTeachRecipeReward(get, set, 'MISSION_RECIPE_CHANCE', 'Recipe among the spoils'); // OTA-706
      deps.applyTrainAndLog(get, set, 'wisdom', '✦ A finished hunt seasons you. +1 WIS (now {to}).');
      if (repResult.changed.length > 0) deps.logRepChanges(get, repResult.changed);
      plantNextContractHint(get, def.factionId ?? null, 'hunt');
      void get().persist();
      return;
    }
    if (kind === 'mystery') {
      // B2 — the Contracts-UI COMPLETE used to pay from ANY tile (the remote hole).
      // Delegate to the typed turn-in, which now enforces a FACE-TO-FACE hand-in
      // (vendor present + right faction) + the long-haul bonus — one source of truth.
      get().turnInMystery(id);
      return;
    }
    if (kind === 'storyline') {
      // B2 — delegate to the face-to-face typed turn-in (closes the any-tile hole,
      // adds the long-haul bonus).
      get().turnInStoryline(id);
      return;
    }
    if (kind === 'faction_quest') {
      // B2 — delegate to the face-to-face typed turn-in. It enforces in-person
      // (a same-faction vendor/board in scene OR inside the faction's home hall),
      // the fetch gate, full pay + the long-haul bonus. Closes the OTA-617
      // half-pay-from-anywhere path (now: in person or not at all).
      get().turnInFactionQuest(id);
      return;
    }
  },

  abandonContract(kind, id) {
    const player = get().player;
    if (!player) return;
    // ⚠⚠ OTA-1687 — THE CONVERSATIONS GO WITH THE POSTER. The contrary walker
    // abandoned the Bog Dragon at stage 3 and took it again: the record
    // restarted at stage 0, but every card it had already answered kept its
    // `resolved` phase (keyed `family:id:stage`), and the card component hides
    // a resolved card — so the reeve, and then Old Mira, showed no card at all
    // and only the typed verb paid. A dropped contract drops its encounter
    // records too; the next accept starts every conversation fresh.
    const forgetEncounters = (family: 'hunt' | 'mystery' | 'storyline') => {
      const prefix = `${family}:${id}:`;
      set((s) => {
        if (!s.player?.missionEncounters) return s;
        const kept = Object.fromEntries(Object.entries(s.player.missionEncounters).filter(([k]) => !k.startsWith(prefix)));
        return { player: { ...s.player, missionEncounters: kept } };
      });
    };
    if (kind === 'hunt') {
      const def = findHuntById(id);
      const rec = (player.activeHunts ?? []).find((h) => h.id === id);
      // OTA-1002 — a record whose def was RETIRED must still be droppable (the
      // ABANDON button was a silent no-op on an orphan — a permanent slate entry).
      if (!rec) return;
      set((s) => (s.player ? {
        player: {
          ...s.player,
          activeHunts: (s.player.activeHunts ?? []).filter((h) => h.id !== id),
        },
      } : s));
      forgetEncounters('hunt');
      get().appendLog('world', `You set ${def ? theLower(def.title) : 'the hunt'} aside. The poster goes back in the pack, edge-creased.`);
    } else if (kind === 'mystery') {
      const def = findMysteryById(id);
      const rec = (player.activeMysteries ?? []).find((m) => m.id === id);
      if (!rec) return;
      set((s) => (s.player ? {
        player: {
          ...s.player,
          activeMysteries: (s.player.activeMysteries ?? []).filter((m) => m.id !== id),
        },
      } : s));
      forgetEncounters('mystery');
      get().appendLog('world', `You let ${def ? theLower(def.title) : 'the mystery'} go. Some questions Tartaria keeps.`);
    } else if (kind === 'storyline') {
      const def = findStorylineById(id);
      const rec = (player.activeStorylines ?? []).find((s) => s.id === id);
      if (!rec) return;
      set((s) => (s.player ? {
        player: {
          ...s.player,
          activeStorylines: (s.player.activeStorylines ?? []).filter((q) => q.id !== id),
        },
      } : s));
      forgetEncounters('storyline');
      get().appendLog('world', `You step away from ${def ? theLower(def.title) : 'the'} chapter. The Arbiter doesn't argue.`);
    } else if (kind === 'whisper') {
      const rec = (player.activeWhispers ?? []).find((w) => w.id === id);
      if (!rec) return;
      set((s) => (s.player ? {
        player: {
          ...s.player,
          activeWhispers: (s.player.activeWhispers ?? []).filter((w) => w.id !== id),
          // Mark it resolved so it isn't re-planted on this character.
          completedWhisperIds: Array.from(new Set([...(s.player.completedWhisperIds ?? []), id])),
        },
      } : s));
      get().appendLog('world', `You let the rumour go. Some talk is just talk.`);
    } else if (kind === 'broker') {
      if (!player.brokerMission || player.brokerMission.done) return;
      set((s) => (s.player ? {
        player: { ...s.player, brokerMission: undefined },
      } : s));
      get().appendLog('world', `You walk away from the parley. The two leaders can wait on the flats — or not.`);
    } else {
      const def = findFactionQuestById(id);
      const rec = (player.activeFactionQuests ?? []).find((q) => q.id === id);
      if (!rec) return;
      set((s) => (s.player ? {
        player: {
          ...s.player,
          activeFactionQuests: (s.player.activeFactionQuests ?? []).filter((q) => q.id !== id),
          activeFactionQuestIds: (s.player.activeFactionQuestIds ?? []).filter((qid) => qid !== id),
          // Drop the route chain if it was pointed at this contract.
          routedMission: s.player.routedMission?.id === id ? null : s.player.routedMission,
        },
      } : s));
      get().appendLog('world', `You hand ${def ? theLower(def.title) : 'the'} contract back to the wind. The Arbiter shrugs.`);
    }
    void get().persist();
  },

  requestContractsTab(tab) {
    set({ pendingContractsTab: tab });
  },

  clearPendingContractsTab() {
    set({ pendingContractsTab: null });
  },

  toggleReserveForQuest(itemId) {
    const player = get().player;
    if (!player) return;
    const item = player.inventory.find((i) => i.id === itemId);
    if (!item) return;
    // A hand-authored objective item (quest / contract / broker / whisper tag) is
    // already hard-locked and lives in the Quest Items section on its own — there's
    // nothing to earmark, and its modal is view-only anyway.
    if (isQuestLockedItem(item)) return;
    // Mutually exclusive with the fusion reserve: an item can't be both fodder for
    // the Crucible and saved for a turn-in. If it's reserved for fusion, that has to
    // be released first (the UI hides this button in that case).
    if (item.reservedForFusion && !item.reservedForQuest) return;
    const reserving = !item.reservedForQuest;
    const qty = item.quantity ?? 1;
    // A single-unit stack just flips the flag in place.
    if (qty <= 1) {
      set((s) => s.player
        ? {
            player: {
              ...s.player,
              inventory: s.player.inventory.map((i) =>
                i.id === itemId ? { ...i, reservedForQuest: reserving } : i,
              ),
            },
          }
        : s);
      return;
    }
    // A multi-unit stack peels exactly ONE unit across the reserved/free boundary so
    // the player can save one (or a few) and keep the rest free — save 2 rations for
    // the quest, eat the other 3. Tapping again moves another unit; the opposite-
    // state stack re-absorbs it on un-save. Mirrors toggleReserveForFusion's split.
    const sameUnit = deps.sameStackUnit;
    set((s) => {
      if (!s.player) return s;
      let inv = s.player.inventory
        .map((i) => (i.id === itemId ? { ...i, quantity: (i.quantity ?? 1) - 1 } : i))
        .filter((i) => (i.quantity ?? 1) > 0);
      const destIdx = inv.findIndex(
        (i) => i.id !== itemId && sameUnit(i, item) && (i.reservedForQuest === true) === reserving,
      );
      if (destIdx >= 0) {
        inv = inv.map((i, idx) => (idx === destIdx ? { ...i, quantity: (i.quantity ?? 1) + 1 } : i));
      } else {
        inv = [...inv, {
          ...item,
          id: `${item.name.replace(/\s+/g, '_')}_${reserving ? 'q' : 'free'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          quantity: 1,
          reservedForQuest: reserving,
        }];
      }
      return { player: { ...s.player, inventory: inv } };
    });
  },

  clearMissionCompleteNotice() { set({ missionCompleteNotice: null }); },

  clearContractsNotice() { set({ contractsNotice: null }); },

  /**
   * ⚠⚠ OTA-1403 — SEND IT BY RUNNER, from the card that just refused you.
   *
   * The Contracts COMPLETE button is face-to-face by design (B2 closed the
   * pay-from-any-tile hole), and the courier has only ever been reachable by
   * TYPING "send word <contract>". So a player tapping buttons could not get at
   * a feature the game has had since OTA-456 — which is most of why ten taps
   * read as ten dead ends.
   *
   * ⚠ It delegates to the same typed handler rather than reimplementing the
   * payout. One source of truth for the cut, the rep, the clock and the fetch
   * refusal; a second copy is how the button and the command start disagreeing.
   */
  sendContractByRunner(kind, id) {
    set({ contractsNotice: null });
    if (kind === 'faction_quest') get().turnInFactionQuest(id, true);
    else if (kind === 'mystery') get().turnInMystery(id, true);
    else get().turnInStoryline(id, true);
  },

  announceMissionComplete(kind, title, body) {
    // The feed line is unchanged — the log stays a complete record, and anything
    // that greps it (chronicle, bug reports) keeps working.
    get().appendLog('reward', body);
    get().raiseMissionCompleteNotice(kind, title, body);
  },

  raiseMissionCompleteNotice(kind, title, body) {
    const prev = get().missionCompleteNotice;
    // OTA-1035 — also merge into a VICTORY card that's already up. A boss kill
    // that finishes a hunt used to raise two popups that fought over the screen;
    // one battle should read as one result.
    const mergeInto = prev && (prev.title === title || !!prev.heading);
    set({
      missionCompleteNotice: mergeInto
        ? { ...prev!, rewards: deps.mergeRewardLines(prev!.rewards, [body]) }
        : { kind, title, rewards: deps.mergeRewardLines([], [body]) },
    });
  },
  });
};

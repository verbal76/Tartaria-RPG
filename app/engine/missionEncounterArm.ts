// missionEncounterArm — OTA-1581. IS THERE SOMEBODY STANDING HERE RIGHT NOW?
//
// ⚠⚠⚠ THIS IS THE WHOLE ARCHITECTURE IN ONE FUNCTION. The owner's design, in
// his words: *"if each of these missions has a stage where I have to meet a guy
// to get a note, but I'm going to get jumped by 3 raiders — then it should have
// a conversation card like Yulka. as soon as I get on that tile and that mission
// is active, it pops up … each individual instance of a thing that you're
// specifically there to do should have a pop-up. that way you can't miss what
// you're there for."*
//
// ⚠⚠ AND IT IS A SELECTOR, NOT A HOOK INTO MOVEMENT. Every previous attempt to
// make a mission beat unmissable bolted another writer onto the step/arrive path
// and then had to fight the other writers for the feed — that is the whole
// burial disease OTA-1530 and OTA-1547 cured twice. A pure "what is armed right
// now, given the save" answer cannot be buried, cannot race a log write, and
// cannot fire twice. The card subscribes; nothing pushes.
//
// ⚠ ONE CARD AT A TIME. Hunts, then mysteries, then storylines — the same order
// the Contracts screen lists them, so the card the player gets is the card the
// slate would have put first. Two people cannot be standing on one tile
// demanding two different conversations.

import type { PlayerCharacter } from './types';
import { findHuntById } from './hunts';
import { findMysteryById } from './mysteries';
import { findStorylineById } from './factionStorylines';
import { huntAnchorId, contractAnchorId, resolvePosterLocation } from './contractMarkers';
import { stageLocationId, stageRequirementMet, payingIntent, type MissionFamily } from './questStage';
import { standingAtLocation } from './standingAt';
import { personFor, stakesForStage, stageHasFight, type MissionPerson } from './missionRoles';
import type { PersuadeStakes } from './missionEncounter';

/** ⚠ OTA-1588 — the same three families questStage names, and deliberately the
 *  same strings, so one can be passed straight to `payingIntent`. */
export type EncounterFamily = MissionFamily;

export interface ArmedEncounter {
  /** Stable across app restarts and re-entries — `family:missionId:stageIndex`.
   *  ⚠ The STAGE INDEX is in the key on purpose: a mission with two stages that
   *  both name the same post is two separate conversations, and a persuade spent
   *  on the first must not be spent on the second. */
  key: string;
  family: EncounterFamily;
  missionId: string;
  missionTitle: string;
  stageIndex: number;
  /** The stage's own prose — the card carries it, so it cannot be scrolled past
   *  in the feed. */
  narration: string;
  arbiter: string | null;
  person: MissionPerson;
  stakes: PersuadeStakes;
  hasFight: boolean;
  /** ⚠ FALSE WHEN THE PACK IS SHORT. A persuade success completes the stage, so
   *  offering it while the stage's `requires` is unmet would talk your way past a
   *  delivery you never made. The card says what is missing instead. */
  canPersuade: boolean;
  /** What the stage is still waiting for, when `canPersuade` is false for that
   *  reason. Null when nothing is owed. */
  owed: string | null;
  /** ⚠ THE BUTTON SAYS THE THING'S NAME. `requires`/`grants`/`checkKind` are
   *  carried out so the card can label PROCEED with what actually happens —
   *  "HAND OVER THE LOGBOOK", not "CONTINUE". A generic button is how a beat
   *  gets missed even when it has a button. */
  needs: string | null;
  gives: string | null;
  /** ⚠⚠ OTA-1588 — THE VERB THAT PAYS THIS STAGE, NOT THE RAW LABEL. This carried
   *  `checkKind` straight through, so a MYSTERY's `boss` reached the button as
   *  'boss' — and `boss` is paid by INVESTIGATE there and by DIPLOMACY in a
   *  storyline. Resolved through questStage.payingIntent, once, like every other
   *  reader. */
  verb: string | null;
  locationId: string;
}

type Rec = { id: string; stage: number; tracked?: boolean };

function build(
  family: EncounterFamily,
  rec: Rec,
  def: { id: string; title: string; stages?: unknown[] } | null,
  anchorId: string | undefined,
  player: PlayerCharacter,
): ArmedEncounter | null {
  if (!def || !anchorId) return null;
  const stage = (def.stages ?? [])[rec.stage] as
    | {
        npcName?: string;
        narration?: string | null;
        arbiter?: string | null;
        locationName?: string;
        checkKind?: string | null;
        spawn?: { enemyName: string; count?: number };
        requires?: { item: string; quantity?: number };
        grants?: { item: string; quantity?: number };
      }
    | undefined;
  if (!stage?.npcName) return null;
  const where = stageLocationId(stage, anchorId, resolvePosterLocation);
  // ⚠ OTA-1637 — the card arms on the CELL, like every other arrival door.
  if (!standingAtLocation(player, where)) return null;
  const person = personFor(stage.npcName, player.roleKills);
  if (!person) return null;
  const met = stageRequirementMet(stage, player.inventory);
  const req = stage.requires;
  return {
    key: `${family}:${rec.id}:${rec.stage}`,
    family,
    missionId: def.id,
    missionTitle: def.title,
    stageIndex: rec.stage,
    narration: (stage.narration ?? '').trim(),
    arbiter: (stage.arbiter ?? '').trim() || null,
    person,
    stakes: stakesForStage(stage),
    hasFight: stageHasFight(stage),
    canPersuade: met,
    owed: met || !req ? null : `${(req.quantity ?? 1) > 1 ? `${req.quantity}× ` : ''}${req.item}`,
    needs: req?.item ?? null,
    gives: stage.grants?.item ?? null,
    verb: payingIntent(family, stage),
    locationId: where,
  };
}

/**
 * The one encounter the card should be showing, or null.
 *
 * ⚠ A PAUSED CONTRACT IS SILENT. `tracked === false` is the player saying "not
 * this one right now"; a card that opens itself anyway would be the loudest
 * possible way to ignore that.
 */
export function armedEncounter(player: PlayerCharacter | null | undefined): ArmedEncounter | null {
  if (!player?.currentLocationId) return null;

  for (const rec of player.activeHunts ?? []) {
    if (rec.tracked === false) continue;
    const def = findHuntById(rec.id);
    const hit = build('hunt', rec, def, def ? huntAnchorId(def) : undefined, player);
    if (hit) return hit;
  }
  for (const rec of player.activeMysteries ?? []) {
    if (rec.tracked === false) continue;
    const def = findMysteryById(rec.id);
    const hit = build('mystery', rec, def, def ? contractAnchorId(def) : undefined, player);
    if (hit) return hit;
  }
  for (const rec of player.activeStorylines ?? []) {
    if (rec.tracked === false) continue;
    const def = findStorylineById(rec.id);
    const hit = build('storyline', rec, def, def ? contractAnchorId(def) : undefined, player);
    if (hit) return hit;
  }
  return null;
}

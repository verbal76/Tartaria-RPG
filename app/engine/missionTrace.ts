// ⚠⚠⚠ OTA-1586 — WHAT THE SLATE HELD, IN EVERY PART OF EVERY LOG.
//
// The owner sent a complete 4,000-line 4.32.11 log with "mission is still
// broken", and the honest answer was: I cannot tell you which mission, because
// the log never says. It records every tap, every die, every parse, every
// kilobyte of the save — and NOT ONE LINE about what contracts are on the slate
// or which stage each one is owed. Eight parts, and the only mission evidence
// was three `ui: tap "missions"` entries and a bare travel course.
//
// His instruction: *"figure out a way to track the missions in every part, and
// find out how it actually starts. did you see where I set it active and
// autoroutes to it, then arrived on the tile. yeah that's me starting it."*
//
// ⚠⚠ SO THE TRACE ANSWERS EXACTLY THAT SEQUENCE — set active, route, arrive —
// and it answers it in one grep. For every live contract:
//
//   • which family and id, so it can be looked up in the data
//   • the stage it is owed, and how many there are
//   • the VERB that stage wants, which is what the player must actually do
//   • the GROUND that stage happens on, resolved the same way the engine
//     resolves it, and whether the player is standing on it
//   • what it needs in the pack, whether the pack has it, and what it gives
//   • who is standing there, if anybody
//   • whether it is tracked or paused — a paused contract explains a dead tile
//     better than any other single fact
//
// Reading a log, "arrived at the tile and nothing happened" becomes a
// three-second comparison instead of a guess: the trace at arrival says where
// the stage thinks it is.
//
// ⚠ IT IS A READER, NOT A WRITER. Every value here comes from the same functions
// the engine uses to decide — `stageLocationId` with `resolvePosterLocation`,
// `stageRequirementMet` against the real pack. A diagnostic that computes its
// own answer tells you about the diagnostic.

import type { PlayerCharacter, Quest, WhisperRecord } from './types';
import { findHuntById } from './hunts';
import { findMysteryById } from './mysteries';
import { findStorylineById } from './factionStorylines';
import { findFactionQuestById, type FactionQuestDef } from './factionQuests';
import { huntAnchorId, contractAnchorId, resolvePosterLocation } from './contractMarkers';
// ⚠ OTA-1618 — the four families the status card was missing. Each import is the
// SAME function that family's Contracts section called, so the card and the tab
// cannot answer the same question two ways.
import { missionTurnInReady } from './missionReady';
import { missionObjectiveLocationId } from './missionRouting';
import { startingLocationForFaction } from './character';
import { bountyKey, bountyHoursLeft, type FactionBounty } from './factionBounty';
import { describeWhisperStage, describeWhisperTitle, whisperRouteTarget } from './whispers';
import { playerGridCell } from '../state/playerGrid';
// ⚠ OTA-1637 — "here" is the CELL, the same test the arrival doors run.
import { standingAtLocation, offGroundText } from './standingAt';
import {
  stageLocationId, stageRequirementMet, stageVerbAsk, stageObjectiveAsk, payingIntent, type MissionFamily,
} from './questStage';

type Rec = { id: string; stage: number; tracked?: boolean };

interface StageLike {
  checkKind?: string | null;
  locationName?: string;
  npcName?: string;
  requires?: { item: string; quantity?: number };
  grants?: { item: string; quantity?: number };
  spawn?: { enemyName: string; count?: number; ambush?: boolean };
}

function line(
  family: MissionFamily,
  rec: Rec,
  def: { id: string; title: string; stages?: StageLike[] } | null,
  anchor: string | undefined,
  player: PlayerCharacter,
): string {
  if (!def) return `${family}:${rec.id} stage ${rec.stage} — DEF MISSING (id not in the catalogue)`;
  const stages = def.stages ?? [];
  const total = stages.length;
  const st = stages[rec.stage];
  const paused = rec.tracked === false ? ' PAUSED' : '';
  if (!st) {
    // Past the last stage is the normal "ready to turn in" state, and it is worth
    // saying out loud: a player standing on a dead tile with a finished chain is
    // a different problem from one standing on the wrong tile.
    return `${family}:${rec.id} stage ${rec.stage}/${total} — ALL STAGES DONE, ready to turn in${paused}`;
  }
  const where = stageLocationId(st, anchor ?? '', resolvePosterLocation);
  // ⚠ OTA-1637 — HERE is the cell. On the named place but off its cell the
  // trace says so, because that is exactly the state the owner reported as
  // "every tile says I'm standing on it".
  const here = standingAtLocation(player, where)
    ? ' HERE'
    : where === player.currentLocationId ? ` OFF-CELL(${offGroundText(player, where)})` : '';
  // ⚠⚠ OTA-1588 — BOTH HALVES, because they differ and a log reader needs to see
  // which. `[boss→investigate]` says at a glance that the beat is LABELLED as the
  // chain's last confrontation and PAID by searching — the exact mismatch that
  // made OTA-1586's arrival line lie on 30 stages. Where the two agree the arrow
  // is dropped, so the common case stays short.
  const kind = st.checkKind ?? 'auto';
  const pays = payingIntent(family, st);
  const verb = pays && pays !== kind ? `${kind}→${pays}` : kind;
  const bits = [`${family}:${rec.id} stage ${rec.stage}/${total} [${verb}]`, `@${where || '?'}${here}`];
  if (st.npcName) bits.push(`npc="${st.npcName}"`);
  if (st.requires) {
    const held = stageRequirementMet(st, player.inventory);
    bits.push(`needs=${st.requires.item}${held ? '✓' : '✗MISSING'}`);
  }
  if (st.grants) bits.push(`gives=${st.grants.item}`);
  if (st.spawn) bits.push(`spawn=${st.spawn.enemyName}×${st.spawn.count ?? 1}${st.spawn.ambush ? ' AMBUSH' : ''}`);
  if (paused) bits.push('PAUSED');
  return bits.join(' ');
}

// ⚠⚠ OTA-1594 — THE FOURTH FAMILY JOINS THE TRACE. In the owner's 16:45 session
// the trace faithfully printed his two PAUSED hunts while the one contract he
// was ACTUALLY RUNNING — "Pinch from the Monarchs", the faction quest that then
// completed without a single steal — never appeared in any line of the log. A
// slate trace that omits a family is the OTA-1586 defect it was built to end,
// one door over. Faction stages are tally beats (narration + advanceOn), not
// grounded checkKind stages, so the line answers the questions THIS family
// raises: which action pays the current stage, and what the purse gate wants.
function factionLine(rec: Rec, def: FactionQuestDef | null, player: PlayerCharacter): string {
  if (!def) return `faction:${rec.id} stage ${rec.stage} — DEF MISSING (id not in the catalogue)`;
  const paused = rec.tracked === false ? ' PAUSED' : '';
  const stages = def.stages ?? [];
  if (stages.length === 0) {
    // Fetch and legacy single-objective contracts have no stage machine to trace;
    // what matters in a log is that they are on the slate at all.
    const shape = def.fetch ? `fetch=${def.fetch.itemName}×${def.fetch.quantity}` : 'single objective';
    return `faction:${rec.id} [${shape}]${paused}`;
  }
  if (rec.stage >= stages.length) {
    return `faction:${rec.id} stage ${rec.stage}/${stages.length} — ALL STAGES DONE, ready to turn in${paused}`;
  }
  const gate = stages[rec.stage]?.advanceOn ?? 'any';
  const bits = [`faction:${rec.id} stage ${rec.stage}/${stages.length} [advanceOn=${gate}]`];
  // The purse gate holds the FINAL advance, so it is live exactly when the
  // player sits on the last stage — that is when a reader needs the number.
  if (def.tcThreshold && rec.stage === stages.length - 1) {
    const tc = player.tc ?? 0;
    bits.push(`tc=${tc}/${def.tcThreshold}${tc >= def.tcThreshold ? '✓' : '✗SHORT'}`);
  }
  if (paused) bits.push('PAUSED');
  return bits.join(' ');
}

/**
 * One line per live contract, plus the player's own position for comparison.
 * Empty slate returns a single line saying so — "no missions" is an answer, and
 * an absent line is not.
 */
export function missionTraceLines(player: PlayerCharacter | null | undefined): string[] {
  if (!player) return [];
  const out: string[] = [];
  for (const rec of player.activeHunts ?? []) {
    const def = findHuntById(rec.id);
    out.push(line('hunt', rec, def, def ? huntAnchorId(def) : undefined, player));
  }
  for (const rec of player.activeMysteries ?? []) {
    const def = findMysteryById(rec.id);
    out.push(line('mystery', rec, def, def ? contractAnchorId(def) : undefined, player));
  }
  for (const rec of player.activeStorylines ?? []) {
    const def = findStorylineById(rec.id);
    out.push(line('storyline', rec, def, def ? contractAnchorId(def) : undefined, player));
  }
  for (const rec of player.activeFactionQuests ?? []) {
    out.push(factionLine(rec, findFactionQuestById(rec.id), player));
  }
  // ⚠ The ROUTE is part of the sequence he described — "set it active and
  // autoroutes to it". Without it, a trace showing the right stage and a player
  // walking somewhere else is still unexplained.
  const routed = player.routedMission;
  const travel = player.travelTarget?.locationId;
  const tail: string[] = [`at=${player.currentLocationId ?? '?'}`];
  if (routed) tail.push(`routed=${routed.id}(${routed.phase})`);
  if (travel) tail.push(`travelTo=${travel}`);
  if (out.length === 0) return [`missions: none active · ${tail.join(' ')}`];
  return [...out.map((l) => `missions: ${l}`), `missions: · ${tail.join(' ')}`];
}

/**
 * ⚠⚠⚠ OTA-1586 — AND THE PLAYER GETS TOLD, TOO. The trace above is for reading
 * logs. This is the half the OWNER walks into.
 *
 * He described the sequence himself: *"I set it active and it autoroutes to it,
 * then arrived on the tile. yeah that's me starting it."* Measured against the
 * data, that sequence ends in silence for a large part of the catalogue.
 * OTA-1581's conversation card arms on the 114 stages that NAME A PERSON. The
 * rest — investigate, stealth, cast, escape beats with nobody in them — announce
 * NOTHING on arrival. Nimari is the case from his own log: four live stages
 * anchor there, and two of them (`mystery_ashen_codex` #1 and #2) want
 * INVESTIGATE with no npcName, so he walked twenty hours to the tile the game
 * routed him to and the game said nothing about why he had come.
 *
 * ⚠⚠ THE CARD IS THE INTERACTION; THIS IS THE RECEIPT. It fires for EVERY live
 * stage standing on this ground, person or no person, so "I arrived and nothing
 * happened" cannot be true again — at worst the player is told what to do and
 * does it. A stage that also raises a card gets both, deliberately: the line
 * survives in the feed after the card is answered, which is what the whole
 * OTA-1530/1547 burial lesson says a player needs.
 */
/** ⚠⚠⚠ OTA-1624 — THE REFUSAL SPEAKS FOR EVERY FAMILY. The matchers gate every
 *  non-fight stage verb on `!inCombat` (the OTA-1217 rule: you cannot study a
 *  room while it is trying to kill you). P19 gave the HUNT branch a voice for
 *  that gate — "not with something on you" — and the mystery and storyline
 *  branches stayed silent: the player performs the right action on the right
 *  ground with something mid-swing at them, and nothing at all is said.
 *  Measured in the owner's 09-02 log audit. One reader now names the first
 *  tracked contract, any family, whose CURRENT stage is paid by `intent` and
 *  would be refused for the fight. Hunts keep their two exclusions: the boss
 *  (a fight is the point) and escape (fleeing IS combat). */
export function stalledInCombat(
  player: PlayerCharacter | null | undefined,
  intent: string,
): { family: MissionFamily; title: string } | null {
  if (!player) return null;
  // ⚠⚠⚠ OTA-1686 — MEASURED BY THE CONTRARY WALKER, twice in one road: with the
  // harpy stage (attack_provoke) pending, EVERY road fight — two Mud Striders
  // at Dynasty Border Post, twenty tiles from the Mud Seas — printed "That is
  // the right move for The Bog Dragon of Old Drakova — but not with something
  // on you. Put this down first." on the player's own swing; and on the Mud
  // Seas the same line printed while the player was cutting down the very
  // harpies the stage had stood up. Two holes, one reader: (1) a stage whose
  // beat IS a fight — attack_provoke, or any authored spawn — cannot be
  // stalled by fighting, exactly as the apex could not; (2) the line means
  // "the right move HERE", so it speaks only on the stage's own cell, the
  // same test the verb matcher and the arrival line run. Off the ground the
  // verb would not have paid anyway, and the fight is just a fight.
  const consider = (
    family: MissionFamily,
    recs: Rec[] | undefined,
    find: (id: string) => { title: string; stages?: StageLike[] } | null,
    anchorOf: (def: never) => string | undefined,
  ): { family: MissionFamily; title: string } | null => {
    for (const rec of recs ?? []) {
      if (rec.tracked === false) continue;
      const def = find(rec.id);
      const next = def?.stages?.[rec.stage];
      if (!def || !next || next.checkKind === null) continue;
      // A hunt's apex IS the fight; fleeing IS combat — neither is a stall.
      if (family === 'hunt' && next.checkKind === 'boss') continue;
      if (family === 'hunt' && next.checkKind === 'escape') continue;
      // OTA-1686 — so is a provoke, and so is any stage that stands bodies up.
      if (family === 'hunt' && next.checkKind === 'attack_provoke') continue;
      if (next.spawn) continue;
      if (payingIntent(family, next) !== intent) continue;
      const ground = stageLocationId(next, anchorOf(def as never) ?? '', resolvePosterLocation);
      if (!standingAtLocation(player, ground)) continue;
      return { family, title: def.title };
    }
    return null;
  };
  return consider('hunt', player.activeHunts, findHuntById, ((d: never) => huntAnchorId(d)) as never)
    ?? consider('mystery', player.activeMysteries, findMysteryById, ((d: never) => contractAnchorId(d)) as never)
    ?? consider('storyline', player.activeStorylines, findStorylineById, ((d: never) => contractAnchorId(d)) as never);
}

/**
 * ⚠⚠ OTA-1687 — THE STAGE UNDER THE BOOTS. The first tracked contract, any
 * family, whose CURRENT stage stands on the player's cell — with the intent
 * that pays it and the ask the arrival line prints. The contrary walker typed
 * "negotiate" and "attack" on the Cradle of Dusk (a search stage) and the
 * game said nothing about the hunt: every matcher speaks only when the VERB
 * matches and the ground does not. This is the other half — the ground
 * matches and the verb does not — so the store can say what the ground wants.
 */
export function stageUnderfoot(
  player: PlayerCharacter | null | undefined,
): { family: MissionFamily; title: string; intent: string | null; ask: string | null } | null {
  if (!player?.currentLocationId) return null;
  const consider = (
    family: MissionFamily,
    recs: Rec[] | undefined,
    find: (id: string) => { title: string; stages?: StageLike[] } | null,
    anchorOf: (def: never) => string | undefined,
  ) => {
    for (const rec of recs ?? []) {
      if (rec.tracked === false) continue;
      const def = find(rec.id);
      const st = def?.stages?.[rec.stage];
      if (!def || !st || st.checkKind === null) continue;
      const ground = stageLocationId(st, anchorOf(def as never) ?? '', resolvePosterLocation);
      if (!standingAtLocation(player, ground)) continue;
      return { family, title: def.title, intent: payingIntent(family, st), ask: stageVerbAsk(family, st) };
    }
    return null;
  };
  return consider('hunt', player.activeHunts, findHuntById, ((d: never) => huntAnchorId(d)) as never)
    ?? consider('mystery', player.activeMysteries, findMysteryById, ((d: never) => contractAnchorId(d)) as never)
    ?? consider('storyline', player.activeStorylines, findStorylineById, ((d: never) => contractAnchorId(d)) as never);
}

export function missionArrivalLines(player: PlayerCharacter | null | undefined): string[] {
  if (!player?.currentLocationId) return [];
  const out: string[] = [];
  // ⚠⚠⚠ OTA-1588 — THE ASK COMES FROM THE ENGINE'S OWN ANSWER NOW, NOT FROM A
  // TABLE THIS FILE KEPT. The table this file kept mapped `boss → "finish it"`
  // for every family, and a MYSTERY's boss is paid by INVESTIGATE while a
  // STORYLINE's is paid by DIPLOMACY. Thirty stages carry that label and all
  // thirty are the last actionable beat of their chain, so every mystery and
  // every storyline in the game ended by telling the player to finish a fight
  // that does not exist. See questStage.payingIntent.
  const consider = (
    family: MissionFamily,
    rec: Rec,
    def: { title: string; stages?: StageLike[] } | null,
    anchor: string | undefined,
  ): void => {
    if (!def || rec.tracked === false) return;
    const st = (def.stages ?? [])[rec.stage];
    if (!st) {
      // ⚠⚠ OTA-1589 — A FINISHED CONTRACT SPEAKS AT THE PAY WINDOW. Past the last
      // stage the old early-return went silent everywhere — including at the very
      // hub the READY pin now routes to, so a player could follow the new button
      // the whole way and still arrive to nothing. Any hub pays, so any hub says
      // so. (Lazy require: this file is a reader and stays light.)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isHubLocation } = require('./hub') as typeof import('./hub');
      if (rec.stage >= (def.stages ?? []).length && isHubLocation(player.currentLocationId)) {
        out.push(`▸ ${def.title}: the work is done — find the counter and hand it in.`);
      }
      return;
    }
    const ground = stageLocationId(st, anchor ?? '', resolvePosterLocation);
    if (!standingAtLocation(player, ground)) {
      // ⚠⚠ OTA-1637 — THIS LINE MEANS THE CELL NOW, like the doors it announces.
      // On the named place but off its cell it says how far instead of HERE, so
      // the feed never promises a verb the ground will not pay.
      const off = player.currentLocationId === ground ? offGroundText(player, ground) : '';
      if (off) out.push(`▸ ${def.title}: the ground is ${off} of here — step onto it.`);
      return;
    }
    const who = st.npcName ? ` — find ${st.npcName}` : '';
    const ask = stageVerbAsk(family, st);
    // ⚠ A verbless beat advances on its own, so promising an action would be the
    // lie this line exists to end. It still says the player is in the right
    // place, which is the part that was missing.
    const doThis = ask ? ` — ${ask}` : '';
    const owed = st.requires && !stageRequirementMet(st, player.inventory)
      ? ` (you still need ${st.requires.item})`
      : '';
    // ⚠ OTA-1598 — a fight-stage standing on a hub tile says WHERE the fight is
    // allowed to happen. Arrival at a hub auto-enters the interior, so without
    // this clause the slate says "force the issue" while the player is standing
    // in the one place the truce forbids it (the owner asked, verbatim, whether
    // that was killing the mission). Hunts draw blades on boss / attack_provoke
    // / spawn stages; any family's authored spawn counts too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isHubLocation } = require('./hub') as typeof import('./hub');
    const bladesHere = family === 'hunt'
      ? (st.checkKind === 'boss' || st.checkKind === 'attack_provoke' || !!st.spawn)
      : !!st.spawn;
    const truce = bladesHere && isHubLocation(player.currentLocationId)
      ? ' Outside the walls — the outpost holds its truce.'
      : '';
    out.push(`▸ ${def.title}: this is the place${who}${doThis}${owed}.${truce}`);
  };
  for (const rec of player.activeHunts ?? []) {
    const def = findHuntById(rec.id);
    consider('hunt', rec, def, def ? huntAnchorId(def) : undefined);
  }
  for (const rec of player.activeMysteries ?? []) {
    const def = findMysteryById(rec.id);
    consider('mystery', rec, def, def ? contractAnchorId(def) : undefined);
  }
  for (const rec of player.activeStorylines ?? []) {
    const def = findStorylineById(rec.id);
    consider('storyline', rec, def, def ? contractAnchorId(def) : undefined);
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
 * ⚠⚠⚠ OTA-1615 — THE SAME READER, POINTED AT THE PLAYER.
 *
 * Owner: *"the hint was investigate to advance in the missions and it's getting
 * annoying jumping back into the missions tab every time. I want to check to
 * see what I have to do next. is there a way to call the mission that I'm in
 * into a pop-up to see its status while I'm on the exploration screen? happy to
 * just scroll through the mission and where I'm at."*
 *
 * Everything he goes to the Contracts tab for is already computed above — the
 * stage he is owed and how many there are, the VERB that stage wants, the
 * ground it happens on and whether he is standing on it, what it needs in the
 * pack and whether he has it, tracked or paused. It has been written into every
 * log since OTA-1586, for me. This is the same reader, shaped for him.
 *
 * ⚠⚠ IT COMPUTES NOTHING OF ITS OWN. Every value comes from the functions the
 * engine decides with (`stageLocationId` with `resolvePosterLocation`,
 * `stageRequirementMet` against the real pack, `stageVerbAsk` for the ask), for
 * the reason the file header already gives: a status card that works out its
 * own answer tells the player about the card.
 * ────────────────────────────────────────────────────────────────────────── */

export interface MissionStatusStep {
  no: number;
  /** What that beat asks for, in the player's words. */
  ask: string;
  state: 'done' | 'current' | 'ahead';
}

/* ⚠⚠⚠ OTA-1618 — THE SLATE IS THE WHOLE SLATE.
 *
 * Owner: *"at this point i like the missions button better than having it take
 * me to the tab. can we just take the tab and put it on that button so when I
 * hit the button it scrolls everything it's just right there and can we have it
 * so that the active mission is always on top?"* — and: *"that would completely
 * remove the contract tab and just make it the missions button instead so it
 * would have everything on there. cuz that's immediate you hit the button it
 * pops up. you hit your thing you close it. you're done."*
 *
 * ⚠⚠ THREE FAMILIES WAS NOT "EVERYTHING". OTA-1615 shipped the card reading
 * hunts, mysteries and storylines — and the four families it left behind are
 * exactly the ones the trace itself had to be taught (OTA-1594: the one contract
 * he was ACTUALLY RUNNING never appeared in any line). A slate that omits a
 * family sends him back to the tab for the one contract that is live, which is
 * the trip this whole card exists to end. Faction contracts, bounties, whispers
 * and leads join it here.
 *
 * ⚠ AND THE ACTIONS COME WITH IT. A cheat sheet you have to LEAVE in order to
 * act on is a reference card (OTA-1617's own lesson, one door further out). Each
 * row carries the SAME store actions the Contracts screen calls, named by the
 * reader so the component cannot invent a second answer about what a family
 * allows: a whisper has no hand-in, a lead is discarded rather than abandoned, a
 * bounty is neither paused nor dropped.
 */

/** Where a row's SET COURSE sends you, in the frame that family routes in.
 *  ⚠ Three frames, because the engine has three: hunts/bounties/leads course to
 *  a LOCATION, whispers to an absolute GRID CELL (OTA-1542), faction contracts
 *  through `routeMission` so the objective→turn-in chain is kept. A component
 *  that flattened these into one would route a whisper to a location id that
 *  does not exist. */
export type MissionStatusRoute =
  | { kind: 'location'; id: string; name: string }
  | { kind: 'cell'; x: number; y: number; label: string }
  | { kind: 'mission'; id: string; name: string };

/** The kind string `setContractActive` wants for this row, or null when the
 *  family has no pause (a bounty runs on a deadline; parking it means nothing). */
export type MissionPauseKind =
  'hunt' | 'mystery' | 'storyline' | 'faction_quest' | 'whisper' | 'lead';
/** The kind `abandonContract` wants, or null when the family drops another way. */
export type MissionAbandonKind =
  'hunt' | 'mystery' | 'storyline' | 'faction_quest' | 'whisper';
/** The kind `completeContractFromUI` wants — set only while the work is DONE. */
export type MissionTurnInKind = 'hunt' | 'mystery' | 'storyline' | 'faction_quest';

export interface MissionStatusCard {
  family: string;
  /** The word the row wears, so seven families read as seven kinds of work. */
  kindLabel: string;
  id: string;
  title: string;
  /** 1-based for reading; `stageTotal` is the count of authored beats. */
  stageNo: number;
  stageTotal: number;
  tracked: boolean;
  /** Past the last beat — the work is done and wants a counter. */
  ready: boolean;
  /** The next action, plain: "investigate the ground". Empty when the beat
   *  advances on its own and promising an action would be a lie. */
  ask: string;
  /** Where that beat happens, by NAME, and whether the boots are on it.
   *  ⚠ OTA-1617 — `whereId` rides along so the card can SET COURSE without
   *  looking the place up a second way; a second lookup is how a button comes to
   *  route somewhere the line above it does not name. */
  where: string;
  whereId: string;
  here: boolean;
  /** ⚠ OTA-1637 — on the named place but OFF its cell: "2 tiles east". '' when
   *  `here`, and '' when the place itself is elsewhere (then `route` speaks). */
  offGround?: string;
  npcName: string | null;
  needs: { item: string; held: boolean } | null;
  steps: MissionStatusStep[];
  /** ⚠ OTA-1618 — the one line this family says that no other family says: a
   *  bounty's tally and clock, a whisper's next step, a lead's complication.
   *  Null on the stage families, whose `ask` and `steps` already carry it. */
  note: string | null;
  /** ⚠ OTA-1618 — where SET COURSE goes, in that family's own frame. */
  route: MissionStatusRoute | null;
  pauseKind: MissionPauseKind | null;
  abandonKind: MissionAbandonKind | null;
  /** Leads are DISCARDED (`discardLead`), never abandoned — a different action. */
  discardable: boolean;
  turnInKind: MissionTurnInKind | null;
}

let _nameById: Map<string, string> | null = null;
function locationNameById(id: string | null | undefined): string {
  if (!id) return '';
  if (!_nameById) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../data/locations/locations.json') as unknown as
      | { locations: Array<{ id: string; name: string }> }
      | Array<{ id: string; name: string }>;
    const list = Array.isArray(raw) ? raw : raw.locations;
    _nameById = new Map(list.map((l) => [l.id, l.name]));
  }
  return _nameById.get(id) ?? id;
}

const KIND_LABEL: Record<string, string> = {
  hunt: 'HUNT',
  mystery: 'MYSTERY',
  storyline: 'STORYLINE',
  faction: 'FACTION CONTRACT',
  bounty: 'BOUNTY',
  whisper: 'WHISPER',
  lead: 'LEAD',
};

/** A location route, named — or null when the id resolves to nothing to walk to. */
function toLocation(id: string | null | undefined): MissionStatusRoute | null {
  if (!id) return null;
  return { kind: 'location', id, name: locationNameById(id) };
}

function statusCard(
  family: MissionFamily,
  rec: Rec,
  def: { id: string; title: string; stages?: StageLike[] } | null,
  anchor: string | undefined,
  player: PlayerCharacter,
): MissionStatusCard | null {
  if (!def) return null;
  const stages = def.stages ?? [];
  const st = stages[rec.stage];
  const steps: MissionStatusStep[] = stages.map((s, i) => ({
    no: i + 1,
    ask: stageObjectiveAsk(family, s as never) || 'it moves on its own',
    state: i < rec.stage ? 'done' : i === rec.stage ? 'current' : 'ahead',
  }));
  const where = st ? stageLocationId(st, anchor ?? '', resolvePosterLocation) : '';
  return {
    family,
    id: def.id,
    title: def.title,
    stageNo: Math.min(rec.stage + 1, Math.max(stages.length, 1)),
    stageTotal: stages.length,
    tracked: rec.tracked !== false,
    ready: rec.stage >= stages.length,
    // ⚠ OTA-1617 — the ask NAMES ITS OBJECT now ("go quietly — come away with
    // the Temporal Distortion Watch"), because "go quietly" alone told the owner
    // how the dice roll and never what he was there for.
    ask: st ? (stageObjectiveAsk(family, st as never) || '') : '',
    where: locationNameById(where),
    whereId: where || '',
    here: !!where && standingAtLocation(player, where),
    offGround: where && where === player.currentLocationId ? offGroundText(player, where) : '',
    npcName: st?.npcName ?? null,
    needs: st?.requires
      ? { item: st.requires.item, held: stageRequirementMet(st, player.inventory) }
      : null,
    steps,
    // ⚠ OTA-1618 — this family's whole story is already in `ask` and `steps`;
    // a note here would be the second opinion the header forbids.
    note: null,
    kindLabel: KIND_LABEL[family] ?? family.toUpperCase(),
    route: where && !standingAtLocation(player, where) ? toLocation(where) : null,
    pauseKind: family,
    abandonKind: family,
    discardable: false,
    // The ONE definition of "ready to hand in" (OTA-1152/missionReady), so a row
    // can never offer a hand-in the store refuses.
    turnInKind: missionTurnInReady({ kind: family, stage: rec.stage, stageCount: stages.length })
      ? family
      : null,
  };
}

/* ── OTA-1618 — the four families the card was missing ──────────────────────
 * Each one answers the SAME questions in the SAME shape, using the engine
 * functions its own screen section used: `missionTurnInReady` for readiness,
 * `missionObjectiveLocationId` + `startingLocationForFaction` for a contract's
 * ground, `whisperRouteTarget`/`describeWhisperStage` for a whisper's, the
 * bounty record's own target for a bounty's. Nothing here computes a place or a
 * readiness of its own. */

function factionCard(rec: Rec, player: PlayerCharacter): MissionStatusCard | null {
  const def = findFactionQuestById(rec.id);
  if (!def) return null;
  const stages = def.stages ?? [];
  const countItem = (name: string) =>
    (player.inventory ?? [])
      .filter((it) => it.name.toLowerCase() === name.toLowerCase())
      .reduce((n, it) => n + (it.quantity ?? 1), 0);
  const ready = missionTurnInReady({ kind: 'faction_quest', def, stage: rec.stage, countItem });
  // ⚠ The same swap the Contracts card makes (OTA-1152): en route the ground is
  // the OBJECTIVE, done it is the faction's own hall, which is the pay window.
  const home = startingLocationForFaction(def.factionId);
  const where = ready ? home : (missionObjectiveLocationId(def) ?? home);
  const here = !!where && where === player.currentLocationId;
  const st = stages[rec.stage];
  return {
    family: 'faction',
    kindLabel: KIND_LABEL.faction!,
    id: def.id,
    title: def.title,
    stageNo: Math.min(rec.stage + 1, Math.max(stages.length, 1)),
    stageTotal: stages.length,
    tracked: rec.tracked !== false,
    ready,
    // ⚠ A faction stage is a TALLY beat (narration + advanceOn), not a grounded
    // check — so the ask is the stage's own narration, never a verb phrase
    // invented for it. Fetch and legacy contracts state their objective instead.
    ask: st?.narration ?? (def.fetch ? `bring back ${def.fetch.quantity} × ${def.fetch.itemName}` : def.objective ?? ''),
    where: locationNameById(where),
    whereId: where ?? '',
    here,
    npcName: null,
    // ⚠ A gather contract's whole question is "how many more?", so the line
    // carries the tally as well as the name — one line, both halves, and the
    // colour of it already says whether the pack is short.
    needs: def.fetch
      ? {
          item: `${def.fetch.quantity} × ${def.fetch.itemName} (${countItem(def.fetch.itemName)} in the pack)`,
          held: countItem(def.fetch.itemName) >= def.fetch.quantity,
        }
      : null,
    steps: stages.map((s, i) => ({
      no: i + 1,
      ask: s.narration ?? 'it moves on its own',
      state: i < rec.stage ? 'done' : i === rec.stage ? 'current' : 'ahead',
    })),
    // ⚠ The purse gate, and only while it is live — it holds the FINAL advance,
    // so a player two stages out does not need to read about it (OTA-1594).
    note: def.tcThreshold && rec.stage === stages.length - 1
      ? `Purse: ${player.tc ?? 0} of ${def.tcThreshold} TC.`
      : null,
    // ⚠ `routeMission`, not a bare course: this family's route CHAINS to the
    // turn-in once the work lands, and coursing to the id by hand drops that.
    route: !here && where ? { kind: 'mission', id: def.id, name: locationNameById(where) } : null,
    pauseKind: 'faction_quest',
    abandonKind: 'faction_quest',
    discardable: false,
    turnInKind: ready ? 'faction_quest' : null,
  };
}

function bountyCard(b: FactionBounty, player: PlayerCharacter): MissionStatusCard {
  const left = bountyHoursLeft(b, player.hoursElapsed ?? 0);
  const clock = Number.isFinite(left)
    ? (left <= 0 ? '⏳ LAPSED' : `⏳ ${Math.ceil(left)}h left`)
    : 'no deadline';
  const here = b.targetLocationId === player.currentLocationId;
  return {
    family: 'bounty',
    kindLabel: KIND_LABEL.bounty!,
    id: bountyKey(b),
    title: `${b.giverName} bounty`,
    stageNo: Math.min(b.progress + 1, b.count),
    stageTotal: b.count,
    tracked: true,
    ready: b.progress >= b.count,
    ask: `put down ${b.count} of the ${b.targetName}`,
    where: b.targetLocationName,
    whereId: b.targetLocationId,
    here,
    npcName: null,
    needs: null,
    steps: [],
    note: `${b.progress}/${b.count} put down · pays ${b.rewardTc} TC + ${b.giverName} standing · ${clock}`,
    route: here ? null : toLocation(b.targetLocationId),
    // ⚠ A bounty runs on a DEADLINE and is turned in at the giver's counter.
    // Parking one would stop nothing and dropping one is not a thing the store
    // does, so the row offers neither rather than offering a button that lies.
    pauseKind: null,
    abandonKind: null,
    discardable: false,
    turnInKind: null,
  };
}

function whisperCard(w: WhisperRecord, player: PlayerCharacter): MissionStatusCard {
  const grid = playerGridCell(player);
  const target = whisperRouteTarget(w);
  const here = !!target && grid.x === target.gridX && grid.y === target.gridY;
  return {
    family: 'whisper',
    kindLabel: KIND_LABEL.whisper!,
    id: w.id,
    title: describeWhisperTitle(w),
    stageNo: 1,
    stageTotal: 1,
    tracked: w.tracked !== false,
    ready: false,
    // ⚠ The whisper's own stage line, from the same describer the tab prints —
    // and given the player's live cell, so it states the TRUE remaining walk
    // (OTA-1595) rather than the authored offset from where it was planted.
    ask: describeWhisperStage(w, grid),
    where: target?.label ?? '',
    whereId: '',
    here,
    npcName: null,
    needs: null,
    steps: [],
    note: 'Rumour — no contract, no faction rep.',
    route: target && !here
      ? { kind: 'cell', x: target.gridX, y: target.gridY, label: target.label }
      : null,
    pauseKind: 'whisper',
    abandonKind: 'whisper',
    discardable: false,
    turnInKind: null,
  };
}

function leadCard(q: Quest, player: PlayerCharacter): MissionStatusCard {
  const where = q.location?.id ?? '';
  return {
    family: 'lead',
    kindLabel: KIND_LABEL.lead!,
    id: q.id,
    title: `${q.objective.verb.charAt(0).toUpperCase()}${q.objective.verb.slice(1)} ${q.objective.target}`,
    stageNo: 1,
    stageTotal: 1,
    tracked: q.tracked !== false,
    ready: false,
    ask: `${q.objective.verb} ${q.objective.target}`,
    where: q.location?.name ?? '',
    whereId: where,
    here: !!where && standingAtLocation(player, where),
    offGround: where && where === player.currentLocationId ? offGroundText(player, where) : '',
    npcName: null,
    needs: null,
    steps: [],
    // ⚠ The complication is the only thing a lead knows that its title doesn't,
    // and it is the half that decides whether the walk is worth it.
    note: q.complication?.text ?? null,
    route: where && !standingAtLocation(player, where) ? toLocation(where) : null,
    pauseKind: 'lead',
    // A lead pays on the kill with no turn-in, so it is DISCARDED, not abandoned.
    abandonKind: null,
    discardable: true,
    turnInKind: null,
  };
}

/** ⚠⚠ OTA-1618 — EVERY LIVE COMMITMENT, ACTIVE ONE FIRST.
 *
 *  Owner: *"can we have it so that the active mission is always on top?"* Only
 *  ONE stage-run may be tracked at a time (OTA-972), so "the active one" is a
 *  single, well-defined row — and it now outranks everything, including a paused
 *  contract the player happens to be standing on. Underneath that, the ground
 *  you are on breaks the tie, then the order the families are read in.
 *
 *  A paused contract still appears, because a paused contract explains a dead
 *  tile better than any other single fact (the trace's own lesson). */
export function missionStatusCards(player: PlayerCharacter | null | undefined): MissionStatusCard[] {
  if (!player) return [];
  const out: MissionStatusCard[] = [];
  for (const rec of player.activeHunts ?? []) {
    const def = findHuntById(rec.id);
    const c = statusCard('hunt', rec, def, def ? huntAnchorId(def) : undefined, player);
    if (c) out.push(c);
  }
  for (const rec of player.activeMysteries ?? []) {
    const def = findMysteryById(rec.id);
    const c = statusCard('mystery', rec, def, def ? contractAnchorId(def) : undefined, player);
    if (c) out.push(c);
  }
  for (const rec of player.activeStorylines ?? []) {
    const def = findStorylineById(rec.id);
    const c = statusCard('storyline', rec, def, def ? contractAnchorId(def) : undefined, player);
    if (c) out.push(c);
  }
  for (const rec of player.activeFactionQuests ?? []) {
    const c = factionCard(rec, player);
    if (c) out.push(c);
  }
  // OTA-862 — the migrated list, falling back to the legacy single slot, exactly
  // as the Contracts screen reads it.
  const bounties = (player.activeBounties && player.activeBounties.length > 0)
    ? player.activeBounties
    : player.activeBounty ? [player.activeBounty] : [];
  for (const b of bounties) out.push(bountyCard(b, player));
  for (const w of player.activeWhispers ?? []) out.push(whisperCard(w, player));
  for (const q of player.activeQuests ?? []) {
    if (q.state === 'open' || q.state === 'in_progress') out.push(leadCard(q, player));
  }
  // ⚠ TRACKED OUTRANKS EVERYTHING (his ask), then the ground under the boots.
  const rank = (c: MissionStatusCard) => (c.tracked ? 0 : 2) + (c.here ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

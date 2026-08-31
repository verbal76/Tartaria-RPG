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

import type { PlayerCharacter } from './types';
import { findHuntById } from './hunts';
import { findMysteryById } from './mysteries';
import { findStorylineById } from './factionStorylines';
import { findFactionQuestById, type FactionQuestDef } from './factionQuests';
import { huntAnchorId, contractAnchorId, resolvePosterLocation } from './contractMarkers';
import {
  stageLocationId, stageRequirementMet, stageVerbAsk, payingIntent, type MissionFamily,
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
  const here = where === player.currentLocationId ? ' HERE' : '';
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
    if (stageLocationId(st, anchor ?? '', resolvePosterLocation) !== player.currentLocationId) return;
    const who = st.npcName ? ` — find ${st.npcName}` : '';
    const ask = stageVerbAsk(family, st);
    // ⚠ A verbless beat advances on its own, so promising an action would be the
    // lie this line exists to end. It still says the player is in the right
    // place, which is the part that was missing.
    const doThis = ask ? ` — ${ask}` : '';
    const owed = st.requires && !stageRequirementMet(st, player.inventory)
      ? ` (you still need ${st.requires.item})`
      : '';
    out.push(`▸ ${def.title}: this is the place${who}${doThis}${owed}.`);
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

// ⚠⚠⚠ THE CONTRARY WALKER — step 1 of the Narrative Agency plan (2026-09-05).
//
// The player-shaped walker (playerWalker.ts) plays every mission the way the
// game asks: accept at the gate, follow the course, type the arrival line's
// own words, answer the card with its button. It proves the OBEDIENT path.
// The owner's next question is the one every real player asks the game
// without meaning to: what happens when I do it wrong, early, or halfway?
//
// This walker took ONE hunt first — the Bog Dragon of Old Drakova, seven
// stages, two people, three fights (OTA-1686). OTA-1699 reads the roadmap from
// the hunt definition instead (huntRoadmap / huntNouns below), so every hunt in
// the catalog walks the same four roads:
//
//   obedient     the baseline: playMission, nothing deviates.
//   premature    reads the poster ("cathedral steeple roost … Mud Seas"),
//                skips the reeve, goes to the steeple and to Old Mira first.
//   contrary     walks away from the reeve's card, tries to hand the bounty
//                in with no trophy, types the wrong verb on the right ground,
//                abandons the hunt with its items in the pack and takes it up
//                again.
//   interrupted  starts the harpy ambush, kills one and runs; starts the
//                apex, wounds the Dragon and runs; comes back to both.
//
// Every deviation is a PROBE with an authored expected outcome, and each is
// graded three ways, in the owner's words:
//
//   handled?         the game did something sensible — no wedge, no silent
//                    nothing, and the mission still finishes afterwards.
//   acknowledged?    a line or a card named what the player just did.
//   prior knowledge? the thing the player did earlier changed a later line
//                    or a later state (the Dragon stalls on the name once,
//                    not twice; a harpy killed stays dead; the reeve knows
//                    you walked off).
//
// The grades are MEASURED from the feed, never assumed, and the report is the
// deliverable: every "no" is a line on the punch list step 2 builds against.
// The walker itself stays on the player's surfaces the way its parent does —
// the only fiat here is the parent's (HP, standing, dice on 18).

import { useGameStore } from '../app/state/gameStore';
import type { GameStore } from '../app/state/gameStore';
import { findHuntById } from '../app/engine/hunts';
import { findMysteryById } from '../app/engine/mysteries';
import { findStorylineById } from '../app/engine/factionStorylines';
import type { MissionFamily } from '../app/engine/questStage';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter } from '../app/engine/missionEncounter';
import { FLEE_OPEN_LINES, FLEE_INDOOR_LINES } from '../app/engine/voicePools';
import { Walker, resetForMission, playMission, type WalkReport, type MissionLike } from './playerWalker';

const store = useGameStore;
const get = (): GameStore => store.getState();
const tick = () => new Promise((r) => setTimeout(r, 40));
async function settle(pred: () => boolean, deadlineMs = 4000): Promise<boolean> {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) await new Promise((r) => setTimeout(r, 12));
  return pred();
}

export type { MissionLike, WalkReport } from './playerWalker';

export type ContraryPath = 'obedient' | 'premature' | 'contrary' | 'interrupted';
export type Yes = 'yes' | 'no' | 'partial' | 'n/a';

export interface Probe {
  path: ContraryPath;
  step: string;
  /** What the thumb did, in the player's terms. */
  did: string;
  /** The authored expectation — what a game that remembers would do. */
  expected: string;
  /** What the feed and the cards actually said (non-debug, since the probe began). */
  saw: string[];
  handled: Yes;
  acknowledged: Yes;
  priorKnowledge: Yes;
  /** One line on why the grades landed where they did. */
  verdict: string;
}

export interface ContraryReport {
  path: ContraryPath;
  /** OTA-1699 — the mission this road was walked on (the field keeps its first
   *  name), and its noun set (regex source) for the formatter. */
  hunt?: string;
  /** STEP 3b — which catalog it came from. */
  family?: MissionFamily;
  nouns?: string;
  /** OTA-1699 — probes this hunt has no ground for (no brood, no later ask), named so a skip is not read as a pass. */
  skipped?: string[];
  probes: Probe[];
  /** The obedient finish that follows the deviations — its breaks are the
   *  "handled?" evidence for the whole path. */
  finish: WalkReport | null;
  taps: number;
  /** The world's own memory lines seen on the road (vendors' "You again", the
   *  room's "bodies you left") — reported beside the hunt's grades. */
  worldMemory: string[];
  /** The whole feed, when PLAYER_WALKER_FEED=1. */
  feed?: string[];
}

export const BOG_DRAGON_ID = 'hunt_bog_dragon';

// ⚠⚠ STEP 3b — EVERY FAMILY WALKS THE FOUR ROADS. The walker read one family's
// definition (findHuntById, `hunt:` keys, completedHuntIds, turnInHunt); the
// mysteries and storylines share the stage grammar (npc / requires / grants /
// spawn / checkKind) and the mission-encounter cards, so the roads generalise
// by reading the raw definition through the family. What differs is the APEX:
// a hunt's last stage stands up `<target> (hunted)`; a mystery's "boss" is a
// synthesis paid by the artifact in hand and stands nothing up; a storyline's
// is usually a person, and two storylines stand up a single body on a spawn
// stage. So the wound-and-run probe targets the LAST STAGE THAT STANDS UP A
// BODY, and is skipped — and says so — when the mission has none.
export type ContraryFamily = MissionFamily;
type RawDef = { id: string; title: string; stages: readonly unknown[]; targetEnemyName?: string; trophyName?: string };
function defOf(family: MissionFamily, id: string): RawDef | null {
  const d = family === 'hunt' ? findHuntById(id) : family === 'mystery' ? findMysteryById(id) : findStorylineById(id);
  return (d as unknown as RawDef | undefined) ?? null;
}
const COMPLETED_KEY: Record<MissionFamily, 'completedHuntIds' | 'completedMysteryIds' | 'completedStorylineIds'> = {
  hunt: 'completedHuntIds', mystery: 'completedMysteryIds', storyline: 'completedStorylineIds',
};
const FAMILY_WORDS: Record<MissionFamily, string[]> = {
  hunt: ['the bounty', 'the trophy', 'this hunt', 'the hunt'],
  mystery: ['the mystery', 'this mystery', 'the trophy', 'the artifact'],
  storyline: ['the chapter', 'this chapter', 'the storyline', 'the story'],
};
/** The turn-in refusal each family speaks with the work unfinished (questSlice). */
const TURN_IN_REFUSED = /trophy|artifact is the proof|isn't finished|not on your slate|don't have it yet/i;

/** Words a line uses when it knows you have been here, or done this, before.
 *  ⚠ Measured tight: "before" matched "stands before you", "ran" matched
 *  "runes", "left" matched "You've left Drakova" on the first pass, and a bare
 *  "already" matched the Arbiter's combat quip "It already has." on the eighth. */
const RETURN_WORDS = /\b(again|you already|already (been|here|seen|done|met|stood|read|tried)|last time|second time|once more|returned|come back|came back|back for more|changed your mind|walked off|walked away|you left|you ran|you fled|here before)\b/i;
/** Lines the walker's own movement writes — never an acknowledgement of anything. */
const TRAVEL_LINE = /^(You walk|You've left|You set course|You arrive|You step out|\[[A-Z]|ui: )/;

/** Every feed entry split to its lines, travel and scene paragraphs dropped. */
function linesOf(saw: string[]): string[] {
  const out: string[] = [];
  for (const e of saw) for (const l of e.split('\n')) {
    const t = l.trim();
    if (t && !TRAVEL_LINE.test(t)) out.push(t);
  }
  return out;
}

/** The parent's fresh slate, plus one allowance of this walker's own: the
 *  four roads run on ONE character, and Halem refuses a hunt the ledger says
 *  is finished ("already finished"). The finished entry is struck so the
 *  posting can be taken again — recorded on every report. */
function resetForRoad(w: ContraryWalker): void {
  resetForMission();
  const p = get().player!;
  const key = COMPLETED_KEY[w.family];
  const done = (p[key] ?? []) as string[];
  if (done.includes(w.def.id)) {
    w.allowances.add(`the finished ${w.family} struck from the completed ledger so the posting can be taken again`);
    store.setState({ player: { ...p, [key]: done.filter((id) => id !== w.def.id) } as never });
  }
  w.allowances.add('HP 600 / STR 20 / DEX 20 / standing 100 with every faction');
}

function grounds(family: MissionFamily, def: MissionLike): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../app/engine/questStage') as typeof import('../app/engine/questStage');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CM = require('../app/engine/contractMarkers') as typeof import('../app/engine/contractMarkers');
  const raw = defOf(family, def.id)!;
  // The same anchor the store's own ground readers use per family
  // (stageArrival.noteMissionGroundsUnderfoot: huntAnchorId for hunts,
  // contractAnchorId for the other two).
  const anchor = family === 'hunt' ? CM.huntAnchorId(raw as never) : CM.contractAnchorId(raw as never);
  return def.stages.map((st) => QS.stageLocationId(st as never, anchor, CM.resolvePosterLocation));
}

export class ContraryWalker extends Walker {
  readonly path: ContraryPath;
  readonly probes: Probe[] = [];
  readonly ground: string[];
  /** OTA-1699 — the roadmap read from the definition, and the hunt's nouns. */
  readonly map: HuntRoadmap;
  nouns: RegExp;
  readonly skipped: string[] = [];
  private readonly learned: string[] = [];

  constructor(path: ContraryPath, def: MissionLike, family: MissionFamily = 'hunt') {
    super(family, def);
    this.path = path;
    this.ground = grounds(family, def);
    this.map = roadmap(family, def);
    this.nouns = missionNouns(family, def);
  }

  /** A name the road taught us (the card's roster name for the reeve) joins the nouns. */
  learnNoun(name: string | undefined | null): void {
    const t = (name ?? '').trim();
    if (t.length < 3 || this.learned.includes(t)) return;
    this.learned.push(t);
    this.nouns = missionNouns(this.family, this.def, this.learned);
  }

  // ── the probe ────────────────────────────────────────────────────────────
  /** Run one deviation, capture what the player saw, and let the caller grade
   *  it from the capture. The capture includes every card dismissed during
   *  the probe, prefixed the way the parent prints them. */
  async probe(
    step: string,
    did: string,
    expected: string,
    run: () => Promise<void>,
    grade: (saw: string[]) => { handled: Yes; acknowledged: Yes; priorKnowledge: Yes; verdict: string },
  ): Promise<Probe> {
    const mark = this.feedMark();
    const cardsBefore = this.cardsSeen.length;
    await run();
    const saw = [...this.feedSince(mark), ...this.cardsSeen.slice(cardsBefore)];
    const g = grade(saw);
    const p: Probe = { path: this.path, step, did, expected, saw, ...g };
    this.probes.push(p);
    return p;
  }

  aboutTheHunt(saw: string[]): string[] {
    return linesOf(saw).filter((l) => this.nouns.test(l) && !l.startsWith('(walker)'));
  }
  /** A line about the hunt that also knows it has happened before. */
  remembers(saw: string[]): string[] {
    return linesOf(saw).filter((l) => this.nouns.test(l) && RETURN_WORDS.test(l) && !l.startsWith('(walker)'));
  }
  /** Any line that knows you have been here before — vendors' "You again",
   *  the room's "The bodies you left are still here" — the world's memory,
   *  whether or not it is about the hunt. Reported, never graded. */
  worldRemembers(saw: string[]): string[] {
    return linesOf(saw).filter((l) => RETURN_WORDS.test(l) && !l.startsWith('(walker)'));
  }

  report(path: ContraryPath, finish: WalkReport | null): ContraryReport {
    return {
      path, hunt: this.def.id, family: this.family, nouns: this.nouns.source, skipped: [...this.skipped], probes: this.probes, finish, taps: this.taps,
      worldMemory: this.worldRemembers(this.feed()),
      ...(process.env.PLAYER_WALKER_FEED === '1' ? { feed: [...this.feed()] } : {}),
    };
  }

  /** Stages whose conversation card was found SHUT (phase resolved from an
   *  earlier pass of this same character) and had to be paid by the typed door. */
  readonly shutCards: number[] = [];

  /** ⚠ MEASURED on the contrary road: after ABANDON + ACCEPT the record is at
   *  stage 0 again but every card the player already answered keeps its
   *  `resolved` phase, and the card component hides a resolved card. The
   *  player sees the arrival line and types it; the parent walker reads the
   *  armed card, finds it offers nothing, and breaks. This override does what
   *  the player does — falls through to the typed door — and records the shut
   *  card so the report can say it. */
  override async playStage(): Promise<boolean> {
    const s = this.stage();
    const armed = armedEncounter(get().player);
    const st = armed ? get().player!.missionEncounters?.[armed.key] : undefined;
    if (armed && armed.key === `${this.family}:${this.def.id}:${s}` && st?.phase === 'resolved') {
      this.shutCards.push(s);
      return this.playStageTyped();
    }
    // The card may only arm once the boots are on the ground — check again after the walk.
    const pin = this.pin();
    if (pin && !this.onCell(pin.anchorId)) {
      const arriveMark = this.feedMark();
      if (!(await this.walkTo(pin.anchorId, `stage ${s}`))) return false;
      const armedNow = armedEncounter(get().player);
      const stNow = armedNow ? get().player!.missionEncounters?.[armedNow.key] : undefined;
      if (armedNow && armedNow.key === `${this.family}:${this.def.id}:${s}` && stNow?.phase === 'resolved') {
        this.shutCards.push(s);
        return this.playStageTyped(arriveMark);
      }
    }
    return super.playStage();
  }

  /** The typed door only: the arrival line's own words, else the direction line. */
  async playStageTyped(arriveMark?: number): Promise<boolean> {
    const s = this.stage();
    const note = { stage: s, ground: this.pin()?.anchorId ?? '', arrivalLine: null as string | null, typed: null as string | null, via: 'typed' as const, closeCard: null as string | null, closeFeed: [] as string[] };
    this.stages.push(note);
    const cardsBefore = this.cardsSeen.length;
    const line = this.arrivalLine(arriveMark ?? this.prevCloseMark);
    const dir = this.directionLine(this.prevCloseMark);
    const ask = line ? this.askFrom(line) : dir ? this.askFromDirection(dir) : null;
    note.arrivalLine = line ?? dir;
    if (!ask) { this.breaks.push(`stage ${s}: card shut and no arrival/direction line to type from`); return false; }
    note.typed = ask;
    const closeMark = this.feedMark();
    this.tap(`type "${ask}" (the card is shut)`);
    await this.type(ask);
    await settle(() => this.stage() > s || this.enemiesUp() > 0, 2500);
    if (this.enemiesUp() > 0 && !(await this.fightOut(`stage ${s} after typing "${ask}"`))) return false;
    await settle(() => this.stage() > s, 2500);
    if (this.stage() <= s) { this.breaks.push(`stage ${s}: card shut, typed "${ask}" and nothing paid. feed:\n${this.feedSince(closeMark).slice(-8).map((l) => `  | ${l}`).join('\n')}`); return false; }
    return this.afterClose(s, note, closeMark, cardsBefore);
  }

  // ── the parent's play, resumable ─────────────────────────────────────────
  done0(): WalkReport {
    return {
      family: this.family, id: this.def.id, title: this.def.title,
      outcome: this.breaks.length === 0 ? 'complete' : 'broken',
      breaks: this.breaks, allowances: [...this.allowances], stages: this.stages, taps: this.taps,
    };
  }

  /** Play stages until the record reaches `until` (default: the end), then
   *  hand in if it is the end. The parent's own doors, stage by stage. */
  async playOn(until = this.def.stages.length): Promise<WalkReport> {
    let guard = 0;
    while (this.stage() < until) {
      if (guard++ > this.def.stages.length + 6) { this.breaks.push(`did not converge — stuck at stage ${this.stage()}`); return this.done0(); }
      if (!this.record()) { this.breaks.push('the record left the slate mid-mission'); return this.done0(); }
      if (!(await this.playStage())) return this.done0();
    }
    if (until >= this.def.stages.length) await this.turnIn();
    return this.done0();
  }

  // ── small thumbs ─────────────────────────────────────────────────────────
  /** ⚠ A step costs stamina and the flee just cost more — the first pass typed
   *  "north" on an empty tank and was told to rest, so the boots never left
   *  the cell and the return re-arm was never tested. Rest by fiat first (the
   *  parent's allowance), and refuse to pretend a step that did not move. */
  async stepOffAndBack(): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { playerGridCell } = require('../app/state/playerGrid') as typeof import('../app/state/playerGrid');
    const at = () => { const g = playerGridCell(get().player!); return `${g.x},${g.y}`; };
    const from = at();
    // ⚠ MEASURED (the 1699 sweep, hunt_mud_siren_queen): the Siren Queen's
    // first ask stands at the Hidden Market, and the market tile auto-enters
    // its building on arrival (OTA-508). Indoors a typed cardinal is swallowed
    // — "Inside, you move room to room. Tap a room, or EXIT to step back
    // outside." — so the boots never left the cell. A player walking out on
    // someone in a building taps EXIT first; so does this. The step back onto
    // the tile re-enters the market by itself, which the caller reads as the
    // return.
    if (get().activeBuildingId) { this.tap('EXIT (the building)'); get().exitBuilding(); await tick(); }
    if (get().player?.hubRoomId) { this.tap('EXIT'); await this.type('leave outpost'); }
    const p = get().player!;
    if (p.stamina < (p.staminaMax ?? 50)) { this.allowances.add('stamina restored by fiat instead of resting'); store.setState({ player: { ...p, stamina: p.staminaMax ?? 50 } }); }
    this.tap('NORTH'); await this.type('north');
    if (at() === from) { this.breaks.push(`typed "north" to step off the tile and the boots did not move. last lines:\n${this.lastLines(3)}`); return false; }
    if (this.enemiesUp() > 0) await this.fightOut('stepping off');
    this.tap('SOUTH'); await this.type('south');
    if (at() !== from) { this.breaks.push(`typed "south" to step back and the boots landed elsewhere (${at()} vs ${from}). last lines:\n${this.lastLines(3)}`); return false; }
    if (this.enemiesUp() > 0 && !this.enemiesAreTheStage()) await this.fightOut('stepping back');
    return true;
  }

  /** ⚠ MEASURED: a wandering pack on the ground (four Mud Wasps on the
   *  steeple) holds the mission arm — OTA-1605's one-fight-on-the-field — and
   *  the stage's own bodies stand up only when the field clears. A player
   *  fights the wasps and the Dragon rises after; so does this. Returns the
   *  count of the stage's own bodies once the field has settled. */
  async clearAmbient(name: string, why: string): Promise<number> {
    // ⚠ NOT fightOut: the last wanderer's death arms the stage's own body in
    // the same clear, and a loop that swings until the field is empty kills
    // the Dragon it was meant to measure (the fourth pass did exactly that).
    // Swing until the stage's body stands up, or the field is empty.
    for (let k = 0; k < 4 && this.enemiesUp() > 0 && this.livingNamed(name) === 0; k++) {
      await this.fightUntil(() => this.livingNamed(name) > 0, `a wandering pack ${why}`, 150);
      await settle(() => this.livingNamed(name) > 0, 600);
      this.dismissCards();
    }
    return this.livingNamed(name);
  }

  /** Are the bodies on the field the stage's own (a spawn or the apex)?
   *
   *  ⚠ OTA-1712 — by the OTA-1703 STAMP where a body carries one, falling back
   *  to the name where it does not. The walker asking this by name had the same
   *  hole the engine did, one layer up: a wandering pack that happens to share
   *  the stage's spawn name reads as "the stage is already up", and the road
   *  then skips the fight it was built to measure — a walker that mis-sees is
   *  worse than no walker, because its report still looks clean. */
  enemiesAreTheStage(): boolean {
    const st = this.def.stages[this.stage()];
    const sc = get().currentScene;
    if (!st || !sc) return false;
    const key = `${this.family}:${this.def.id}:${this.stage()}`;
    const names = new Set<string>();
    if (st.spawn) names.add(st.spawn.enemyName);
    if (this.map.apexBody) names.add(this.map.apexBody.name);
    return sc.enemies.some((e, i) => {
      if ((sc.enemyHps[i] ?? 0) <= 0) return false;
      const stamped = (e as { stageKey?: string }).stageKey;
      return stamped ? stamped === key : names.has(e.name);
    });
  }

  /** What the store holds right now — the field, the boots, and every modal
   *  that can swallow a typed action (OTA-1219's trap #2). Logged to the feed
   *  at probe boundaries so a silent turn can be read after the fact. */
  fieldReport(label: string): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { playerGridCell } = require('../app/state/playerGrid') as typeof import('../app/state/playerGrid');
    const st = get();
    const p = st.player!;
    const g = playerGridCell(p);
    const sc = st.currentScene;
    const field = (sc?.enemies ?? []).map((e, i) => `${e.name}:${sc!.enemyHps[i] ?? '?'}${sc!.enemyKnockedOut?.[i] ? '(ko)' : ''}`).join(', ') || 'empty';
    const modals = [
      st.pendingRolls ? 'rolls' : '', st.pendingMissionStinger ? 'stinger' : '', st.pendingMissionBeat ? 'beat' : '',
      st.pendingTravelConfirm ? 'travelConfirm' : '', st.pendingWhisperComplete ? 'whisperComplete' : '',
      (st as unknown as { pendingWanderer?: unknown }).pendingWanderer ? 'wanderer' : '',
    ].filter(Boolean).join('+') || 'none';
    const line = `(walker) ${label}: at ${p.currentLocationId} cell=${g.x},${g.y} room=${p.hubRoomId ?? '-'} bldg=${st.activeBuildingId ?? '-'} screen=${st.currentScreen} course=${p.travelTarget?.locationId ?? '-'} stage=${this.stage()} range=${sc?.range ?? '-'} field=[${field}] modals=${modals} stamina=${p.stamina}`;
    st.appendLog('system', line);
    return line;
  }

  /** Swing until `pred` holds (or the field clears). The parent's own fight
   *  shape (approach once when the scene reads far, attack, approach the
   *  active target up to three times on an ADVANCE line) — plus one guard the
   *  parent lacks: a typed action that draws NO line at all is a swallowed
   *  input, and the walker says what was holding the screen instead of
   *  typing into the void for a hundred rounds. */
  async fightUntil(pred: () => boolean, why: string, maxRounds = 40): Promise<void> {
    let silent = 0;
    for (let rounds = 0; rounds < maxRounds && this.enemiesUp() > 0 && !pred(); rounds++) {
      this.topUp();
      this.dismissCards();
      this.drainRolls();
      const sc = get().currentScene!;
      const m0 = this.feedMark();
      if (sc.range && sc.range !== 'close') {
        const idx = sc.enemies.findIndex((_, i) => (sc.enemyHps[i] ?? 0) > 0 && !(sc.enemyKnockedOut?.[i] ?? false));
        const name = sc.enemies[idx]?.name ?? '';
        this.tap(`approach ${name}`);
        await this.type(`approach ${name}`);
        if (this.enemiesUp() === 0 || pred()) break;
      }
      this.tap('attack');
      const before = this.feedMark();
      await this.type('attack');
      if (this.feedSince(before).some((l) => /ADVANCE to close in|need to close/i.test(l))) {
        for (let k = 0; k < 3; k++) {
          const live = get().currentScene!;
          const target = live.enemies[live.activeEnemyIdx]?.name ?? live.enemies[0]?.name ?? '';
          const m = this.feedMark();
          this.tap(`approach ${target}`);
          await this.type(`approach ${target}`);
          if (this.feedSince(m).some((l) => /close the gap|already at close/i.test(l))) break;
        }
      }
      // Two typed actions with no line back is the modal swallow, or a scene
      // that is not listening. Say so and stop.
      silent = this.feedSince(m0).some((l) => !/^(attack|approach )/.test(l)) ? 0 : silent + 1;
      if (silent >= 2) {
        this.breaks.push(`fight ${why}: typed actions draw no reply — ${this.fieldReport('swallowed')}`);
        return;
      }
    }
    if (!pred() && this.enemiesUp() > 0) this.breaks.push(`fight ${why}: ${maxRounds} rounds and the condition never held — ${this.fieldReport('stuck')}`);
  }

  /** The escape verb, dice on 18. */
  async flee(): Promise<boolean> {
    this.tap('FLEE');
    await this.type('flee');
    return this.enemiesUp() === 0;
  }

  /** The Contracts screen's ABANDON, then a fresh ACCEPT at the gate. */
  async abandonAndReaccept(): Promise<boolean> {
    this.tap(`ABANDON "${this.def.title}"`);
    get().abandonContract(this.family, this.def.id);
    await tick();
    if (this.record()) { this.breaks.push('ABANDON left the record on the slate'); return false; }
    return this.accept();
  }

  /** Every standing body of this name gets `hp` hit points (allowance recorded). */
  hardenBrood(name: string, hp: number): void {
    const sc = get().currentScene;
    if (!sc) return;
    this.allowances.add(`the brood hardened to ${hp} HP so one falls at a time`);
    store.setState({ currentScene: { ...sc, enemyHps: sc.enemyHps.map((h, i) => (sc.enemies[i]?.name === name && h > 0 ? hp : h)) } as never });
  }
  livingNamed(name: string): number {
    const sc = get().currentScene;
    if (!sc) return 0;
    return sc.enemies.filter((e, i) => e.name === name && (sc.enemyHps[i] ?? 0) > 0).length;
  }
  hpOf(name: string): number | null {
    const sc = get().currentScene;
    if (!sc) return null;
    const i = sc.enemies.findIndex((e) => e.name === name);
    return i < 0 ? null : sc.enemyHps[i] ?? null;
  }
}

/** ⚠ OTA-1700 — the flee is SAID when the feed carries one of the game's own flee
 *  lines (voicePools, thirty open + fifteen indoor) or the Guardian's rebuke. The
 *  1699 sweep read a four-phrase regex against a thirty-line pool and graded three
 *  honest flees silent. Read the pool the game reads. */
const FLEE_LINES: readonly string[] = [...FLEE_OPEN_LINES, ...FLEE_INDOOR_LINES];
export function isFleeLine(l: string): boolean {
  // ⚠ `includes`, not equality: two world entries inside 500ms merge into one feed
  // line (HANDOFF #4), so the flee sentence often arrives glued to its neighbour.
  return FLEE_LINES.some((f) => l.includes(f)) || /watches you go|The Guardian/.test(l);
}

// ── the four roads ──────────────────────────────────────────────────────────

// ⚠⚠ OTA-1699 — THE ROADS, FOR EVERY HUNT. The four roads used to name the Bog
// Dragon's stages by number (the reeve at 0, Mira at 2, the harpies at 5, the
// steeple at 6) and its nouns by hand. Every hunt in the catalog follows one of
// two templates (standard_7 / bait_switch_5), so the roadmap is READ from the
// definition: the first ask (an npc stage), a later ask that requires an item,
// the first "investigate" ground, the first brood (a spawn of two or more), the
// apex (the last stage), and the items held by the abandon point. A road whose
// probe has no ground on this hunt (no brood, no later ask) skips that probe
// and says so — a skipped probe is not a grade.

export interface HuntRoadmap {
  /** The last stage — always the apex on both templates. */
  apex: number;
  /** The first npc stage — the person who hands out the ask (stage 0 on every hunt today). */
  firstAsk: number | null;
  /** The first npc stage after firstAsk that REQUIRES an item — the door that should stay shut early. */
  laterAsk: number | null;
  /** The first stage whose check is "investigate" — where a wrong verb should draw the ground's own ask. */
  wrongVerb: number | null;
  /** The first stage whose spawn stands up two or more — where one can die and the rest be run from. */
  brood: number | null;
  /** The stage the contrary road abandons at: after three closes, or two on the short template. */
  abandonAt: number;
  /** Items granted before the abandon point — what the pack holds when the posting is dropped. */
  items: string[];
  /** The body the wound-and-run probe wounds — a hunt's `<target> (hunted)` on
   *  the apex, else the last spawn stage's body; null when the mission stands
   *  nothing up (a mystery's synthesis, a storyline's person). */
  apexBody: { stage: number; name: string } | null;
  apexName: string;
  broodName: string | null;
  broodCount: number;
  firstAskNpc: string | null;
  laterAskNpc: string | null;
  laterAskRequires: string | null;
}

const STOP_WORDS = new Set(['the', 'old', 'and', 'of', 'a', 'an', 'to', 'in', 'at', 'on', 'under', 'with', 'for', 'master', 'brother', 'sister']);

function words(s: string | undefined | null, min: number): string[] {
  if (!s) return [];
  return s.toLowerCase().replace(/'s\b/g, '').split(/[^a-z0-9-]+/).filter((w) => w.length >= min && !STOP_WORDS.has(w));
}

function stripThe(s: string): string { return s.replace(/^the\s+/i, '').trim(); }

function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function huntRoadmap(def: MissionLike): HuntRoadmap { return roadmap('hunt', def); }

export function roadmap(family: MissionFamily, def: MissionLike): HuntRoadmap {
  const raw = defOf(family, def.id);
  const stages = def.stages;
  // The apex: the last "boss" stage (a mystery's synthesis, a storyline's
  // reckoning, a hunt's kill), else the last stage. Hunts end on their boss.
  let apex = stages.length - 1;
  for (let i = stages.length - 1; i >= 0; i--) if (stages[i]!.checkKind === 'boss') { apex = i; break; }
  const lastSpawn = (() => { for (let i = stages.length - 1; i >= 0; i--) if (stages[i]!.spawn?.enemyName) return i; return -1; })();
  const apexBody = family === 'hunt' && raw?.targetEnemyName
    ? { stage: apex, name: `${raw.targetEnemyName} (hunted)` }
    : lastSpawn >= 0 ? { stage: lastSpawn, name: stages[lastSpawn]!.spawn!.enemyName } : null;
  const npcIdx = stages.map((s, i) => (s.npcName ? i : -1)).filter((i) => i >= 0);
  const firstAsk = npcIdx.length ? npcIdx[0]! : null;
  const laterAsk = npcIdx.find((i) => firstAsk !== null && i > firstAsk && !!stages[i]!.requires) ?? null;
  const wrongVerb = stages.findIndex((s) => s.checkKind === 'investigate');
  const brood = stages.findIndex((s) => (s.spawn?.count ?? 0) >= 2);
  // ⚠ STEP 3b — MEASURED FROM THE APEX, NOT THE STAGE COUNT. `stages.length - 2`
  // assumes the apex is the last stage, which is true of every hunt and false of
  // a mystery or storyline that carries a trailing epilogue after its boss beat:
  // mystery_drowned_bell_samarran is four stages with its boss on 2, so the old
  // formula put the abandon point ON the apex and the probe abandoned the beat it
  // was about to walk. For a hunt `apex - 1` IS `stages.length - 2`, so this is
  // the same number it always was there.
  const abandonAt = Math.min(3, Math.max(1, apex - 1));
  const items = stages.slice(0, abandonAt).map((s) => s.grants?.item).filter((x): x is string => !!x);
  return {
    apex,
    firstAsk,
    laterAsk,
    wrongVerb: wrongVerb >= 0 ? wrongVerb : null,
    brood: brood >= 0 ? brood : null,
    abandonAt,
    items,
    apexBody,
    apexName: apexBody?.name ?? '',
    broodName: brood >= 0 ? stages[brood]!.spawn!.enemyName : null,
    broodCount: brood >= 0 ? stages[brood]!.spawn!.count ?? 1 : 0,
    firstAskNpc: firstAsk !== null ? stages[firstAsk]!.npcName ?? null : null,
    laterAskNpc: laterAsk !== null ? stages[laterAsk]!.npcName ?? null : null,
    laterAskRequires: laterAsk !== null ? stages[laterAsk]!.requires?.item ?? null : null,
  };
}

/** The hunt's own nouns, read from its definition — a line has to be ABOUT the
 *  hunt to count as an acknowledgement. Place names are out on purpose (the
 *  compass names them on every arrival); people, beasts, items and the title
 *  are in. Roster names learned on the road (the reeve is "Halvard" to the
 *  card) are added by `learnNoun`. */
export function huntNouns(def: MissionLike, extra: readonly string[] = []): RegExp { return missionNouns('hunt', def, extra); }

export function missionNouns(family: MissionFamily, def: MissionLike, extra: readonly string[] = []): RegExp {
  const raw = defOf(family, def.id);
  const set = new Set<string>(FAMILY_WORDS[family]);
  const add = (s: string | undefined | null) => { const t = (s ?? '').toLowerCase().trim(); if (t.length >= 3) set.add(t); };
  add(def.title);
  // A beast's name and its plural — "Mud Harpy" is on the feed as "Mud Harpies" as often as not.
  const addBeast = (name: string) => { add(name); add(/y$/i.test(name) ? name.replace(/y$/i, 'ies') : `${name}s`); };
  if (raw?.targetEnemyName) {
    addBeast(raw.targetEnemyName);
    const tw = raw.targetEnemyName.split(/\s+/);
    if (tw.length > 1) add(`the ${tw[tw.length - 1]}`);
  }
  // Mysteries carry a trophyName too, and it is the thing every later line names.
  if (raw?.trophyName) { add(raw.trophyName); for (const w of words(raw.trophyName, 5)) add(w); }
  for (const st of def.stages) {
    if (st.npcName) { add(stripThe(st.npcName)); for (const w of words(st.npcName, 4)) add(w); }
    if (st.spawn?.enemyName) addBeast(st.spawn.enemyName);
    for (const item of [st.requires?.item, st.grants?.item]) {
      if (!item) continue;
      add(item);
      for (const w of words(item, 5)) add(w);
    }
  }
  for (const e of extra) add(e);
  const alts = [...set].filter(Boolean).sort((a, b) => b.length - a.length).map(esc);
  return new RegExp(`\\b(${alts.join('|')})\\b`, 'i');
}

export async function walkObedient(def: MissionLike, family: MissionFamily = 'hunt'): Promise<ContraryReport> {
  const finish = await playMission(family, def);
  const w = new ContraryWalker('obedient', def, family);
  const noCard = finish.stages.filter((s) => !s.closeCard).map((s) => s.stage);
  w.probes.push({
    path: 'obedient', step: `the whole ${family}, as asked`, did: 'accept at the gate, follow every course, type every arrival line, answer every card, hand in',
    expected: `${def.stages.length} stages close, each with a card, the purse moves`,
    saw: finish.stages.map((s) => `stage ${s.stage} via=${s.via}${s.closeCard ? ` card: ${s.closeCard.split('\n')[0]}` : ' NO CARD'}`),
    handled: finish.outcome === 'complete' ? 'yes' : 'no',
    acknowledged: noCard.length === 0 ? 'yes' : 'partial',
    priorKnowledge: 'n/a',
    verdict: finish.outcome === 'complete' ? `complete in ${finish.taps} taps${noCard.length ? `; stages ${noCard.join(',')} closed without a card` : ''}` : finish.breaks.join(' | '),
  });
  return { path: 'obedient', hunt: def.id, family, nouns: w.nouns.source, probes: w.probes, finish, taps: finish.taps, worldMemory: [], ...(finish.feed ? { feed: finish.feed } : {}) };
}

export async function walkPremature(def: MissionLike, family: MissionFamily = 'hunt'): Promise<ContraryReport> {
  const w = new ContraryWalker('premature', def, family);
  resetForRoad(w);
  const report = (finish: WalkReport | null): ContraryReport => w.report('premature', finish);
  if (!(await w.accept())) return report(w.done0());
  const m = w.map;
  const apexGround = w.ground[m.apex]!;
  const firstAsk = m.firstAskNpc ?? 'the first ask';
  // The apex's own verb — "attack" on a hunt, the synthesis or the reckoning
  // phrase on the others (stageVerbLabel, through the parent's contractsLabel).
  const apexVerb = w.contractsLabel(m.apex) ?? 'attack';

  await w.probe(
    'the apex ground before the first ask',
    `SET COURSE to ${apexGround} at stage 0, arrive, type "${apexVerb}" (the apex's own verb) and "investigate the area"`,
    `the slate says this is the apex's ground but not yet — ${firstAsk} first; nothing stands up`,
    async () => {
      if (!(await w.walkTo(apexGround, 'to the apex ground, early'))) return;
      w.dismissCards();
      w.tap(`type "${apexVerb}"`); await w.type(apexVerb);
      if (w.enemiesUp() > 0) await w.fightOut('on the apex ground, early');
      w.tap('type "investigate the area"'); await w.type('investigate the area');
      if (w.enemiesUp() > 0) await w.fightOut('on the apex ground, early');
    },
    (saw) => {
      const about = w.aboutTheHunt(saw).filter((l) => !/^\[/.test(l));
      const stoodUp = !!m.apexName && saw.some((l) => l.includes(m.apexName));
      const stillStage0 = w.stage() === 0;
      // ⚠ OTA-1700 walker — 'yes' when the slate says "not yet" AND names the first
      // ask (the OTA-1688 arrival reader's exact shape); 'partial' when the hunt is
      // merely mentioned. The 1699 sweep graded fourteen hunts 'partial' on the
      // same line and hid the three where that line never printed.
      const notYet = about.find((l) => /not yet/i.test(l) && /First:/.test(l));
      return {
        handled: stillStage0 && !stoodUp ? 'yes' : 'no',
        acknowledged: notYet ? 'yes' : about.length ? 'partial' : 'no',
        priorKnowledge: 'n/a',
        verdict: stoodUp ? 'the apex stood up with the hunt at stage 0' : notYet ? `the slate said not yet: ${notYet}` : about.length ? `the hunt was named, but not the order: ${about[0]}` : 'nothing on screen mentioned the hunt or its ground; the early visit is invisible',
      };
    },
  );
  if (w.breaks.length) return report(w.done0());

  if (m.laterAsk !== null && m.laterAskNpc) {
    const laterGround = w.ground[m.laterAsk]!;
    const npc = stripThe(m.laterAskNpc);
    const earlierWords = [...words(m.firstAskNpc, 4), ...words(m.laterAskRequires, 4)];
    const namesEarlier = earlierWords.length ? new RegExp(`\\b(${earlierWords.map(esc).join('|')})\\b`, 'i') : null;
    await w.probe(
      'a later door before the first ask',
      `SET COURSE to ${laterGround} at stage 0, arrive, type "negotiate" and "talk to ${npc.toLowerCase()}"`,
      `${npc} (or the slate) says the earlier ask comes first — names ${firstAsk} or the ${m.laterAskRequires ?? 'item'}; no card opens for a beat stages away`,
      async () => {
        if (!(await w.walkTo(laterGround, 'to the later door, early'))) return;
        w.dismissCards();
        const armed = armedEncounter(get().player);
        if (armed) get().appendLog('system', `(walker) a card is armed here: ${armed.key} with ${armed.person.name}`);
        w.tap('type "negotiate"'); await w.type('negotiate');
        if (w.enemiesUp() > 0) await w.fightOut('at the later door, early');
        w.tap(`type "talk to ${npc.toLowerCase()}"`); await w.type(`talk to ${npc.toLowerCase()}`);
        if (w.enemiesUp() > 0) await w.fightOut('at the later door, early');
      },
      (saw) => {
        const about = w.aboutTheHunt(saw).filter((l) => !/^\[/.test(l));
        const notHere = saw.find((l) => /Not here\.|points elsewhere/.test(l));
        const earlier = namesEarlier ? saw.some((l) => namesEarlier.test(l)) : false;
        const cardArmed = saw.some((l) => /a card is armed here/.test(l));
        return {
          handled: w.stage() === 0 && !cardArmed ? 'yes' : 'partial',
          acknowledged: earlier ? 'yes' : notHere ? 'partial' : about.length ? 'partial' : 'no',
          priorKnowledge: 'n/a',
          verdict: cardArmed ? 'a conversation card armed for a beat the record has not reached' : earlier ? 'the refusal names the earlier ask or its item' : notHere ? `the refusal is generic: ${notHere}` : 'nothing about the hunt was said at all',
        };
      },
    );
    if (w.breaks.length) return report(w.done0());
  } else {
    w.skipped.push(`a later door before the first ask — this ${family} has no later ask that requires an item`);
  }

  const stops = [...new Set([m.laterAsk ?? -1, m.apex, def.stages.length].filter((x) => x >= 0))].sort((a, b) => a - b);
  const marks: Record<number, number> = {};
  const finish = await (async () => {
    let r: WalkReport | null = null;
    for (const until of stops) {
      marks[until] = w.feedMark();
      r = await w.playOn(until);
      if (r.breaks.length) return r;
    }
    return r;
  })();
  const sawLater = m.laterAsk !== null ? w.feedSince(marks[m.laterAsk] ?? 0) : [];
  const sawApex = w.feedSince(marks[m.apex] ?? 0);
  const remembered = [...w.remembers(sawLater), ...w.remembers(sawApex)];
  w.probes.push({
    path: 'premature', step: 'the proper visits, after the early ones',
    did: `play stages 0–${m.apex} as asked after having stood on the early grounds already`,
    expected: 'the person or the Arbiter notes you came by once already; the apex arrival notes you have seen the ground',
    saw: remembered,
    handled: finish && finish.outcome === 'complete' ? 'yes' : 'no',
    acknowledged: 'n/a',
    priorKnowledge: remembered.length ? 'yes' : 'no',
    verdict: finish && finish.outcome === 'complete'
      ? (remembered.length ? 'a line remembered the early visit' : 'the hunt finished exactly as if the early visits never happened')
      : (finish?.breaks.join(' | ') ?? 'no finish'),
  });
  return report(finish);
}

export async function walkContrary(def: MissionLike, family: MissionFamily = 'hunt'): Promise<ContraryReport> {
  const w = new ContraryWalker('contrary', def, family);
  resetForRoad(w);
  const report = (finish: WalkReport | null): ContraryReport => w.report('contrary', finish);
  if (!(await w.accept())) return report(w.done0());
  const m = w.map;

  await w.probe(
    family === 'hunt' ? 'the trophy before the hunt' : 'the hand-in before the work',
    'TURN IN at Halem\'s counter straight after accepting',
    'a refusal that says what is missing (the trophy, the artifact, the unfinished chapter) — not a silent button',
    async () => {
      w.tap(`TURN IN "${def.title}"`);
      if (family === 'hunt') get().turnInHunt(def.id);
      else if (family === 'mystery') get().turnInMystery(def.id);
      else get().turnInStoryline(def.id);
      await tick();
      if (get().player?.hubRoomId) { w.tap('EXIT'); await w.type('leave outpost'); }
    },
    (saw) => {
      const refused = saw.find((l) => TURN_IN_REFUSED.test(l));
      return {
        handled: w.record() ? 'yes' : 'no',
        acknowledged: refused ? 'yes' : 'no',
        priorKnowledge: 'n/a',
        verdict: refused ? `refused out loud: ${refused}` : 'the hand-in said nothing',
      };
    },
  );

  if (m.firstAsk === 0 && m.firstAskNpc) {
    const askGround = w.ground[0]!;
    const npc = stripThe(m.firstAskNpc);
    await w.probe(
      'walking out on the first ask',
      `on ${npc}'s card tap the walk-away button, step off the tile and back, tap SUMMON, then PROCEED`,
      `the walk-away is said; ${npc} is still there on return; a line notes you came back`,
      async () => {
        if (!(await w.walkTo(askGround, 'to the first ask'))) return;
        w.dismissCards();
        const armed = armedEncounter(get().player);
        if (!armed || armed.key !== `${family}:${def.id}:0`) { w.breaks.push(`no card armed at the first ask (${armed?.key ?? 'none'})`); return; }
        w.learnNoun(armed.person.name);
        const enc = get().player!.missionEncounters?.[armed.key] ?? freshEncounter(armed.key);
        const offered = choicesFor(enc, { hasFight: armed.hasFight, canPersuade: armed.canPersuade, canKill: armed.person.canKill });
        if (!offered.includes('flee')) { w.breaks.push(`the first ask's card offers no walk-away (${offered.join('/')})`); return; }
        w.tap('card: FLEE (walk away)');
        get().answerMissionEncounter('flee');
        await tick();
        if (!(await w.stepOffAndBack())) return;
        const again = armedEncounter(get().player);
        const phase = again ? (get().player!.missionEncounters?.[again.key]?.phase ?? 'fresh') : 'no card';
        get().appendLog('system', `(walker) back on the tile: card ${again?.key ?? 'none'}, phase ${phase}`);
        w.tap(`▸ SUMMON ${npc.toUpperCase()}`);
        get().summonMissionEncounter();
        await tick();
        const reopened = armedEncounter(get().player);
        const st = reopened ? (get().player!.missionEncounters?.[reopened.key] ?? freshEncounter(reopened.key)) : null;
        const fwd = reopened && st ? choicesFor(st, { hasFight: reopened.hasFight, canPersuade: reopened.canPersuade, canKill: reopened.person.canKill }).find((c) => c !== 'flee') : null;
        if (!fwd) { w.breaks.push(`after SUMMON the first ask's card offers no way forward (phase ${st?.phase ?? 'none'})`); return; }
        w.tap(`card: ${fwd.toUpperCase()}`);
        get().answerMissionEncounter(fwd as never);
        await tick();
        w.dismissCards();
      },
      (saw) => {
        const left = saw.find((l) => /break off and step away/.test(l));
        const back = w.remembers(saw);
        return {
          handled: w.stage() >= 1 ? 'yes' : 'no',
          acknowledged: left ? 'yes' : 'no',
          priorKnowledge: back.length ? 'yes' : 'no',
          verdict: w.stage() >= 1 ? (back.length ? `the return was noted: ${back[0]}` : 'the walk-away was said; the person picked up as if nothing happened') : 'the beat did not close after the walk-away',
        };
      },
    );
    if (w.breaks.length) return report(w.done0());
  } else {
    w.skipped.push(`walking out on the first ask — stage 0 is not a person on this ${family}`);
  }

  if (m.wrongVerb !== null && m.wrongVerb > w.stage() - 1) {
    if (w.stage() < m.wrongVerb) {
      const r = await w.playOn(m.wrongVerb);
      if (r.breaks.length) return report(r);
    }
    const wv = m.wrongVerb;
    await w.probe(
      'the wrong verb on the right ground',
      `on ${w.ground[wv]} (stage ${wv}, "investigate") type "negotiate" and "attack" first`,
      'the slate says what this ground wants instead ("search this ground"), not silence or a generic nothing',
      async () => {
        if (!(await w.walkTo(w.ground[wv]!, 'to the investigate ground'))) return;
        w.dismissCards();
        if (w.enemiesUp() > 0) await w.fightOut('on arrival at the investigate ground');
        w.tap('type "negotiate"'); await w.type('negotiate');
        w.tap('type "attack"'); await w.type('attack');
        if (w.enemiesUp() > 0) await w.fightOut('after the wrong swing');
      },
      (saw) => {
        const about = w.aboutTheHunt(saw).filter((l) => !/^\[|^▸/.test(l));
        const arrival = saw.find((l) => l.startsWith(`▸ ${def.title}: this is the place`));
        return {
          handled: w.stage() === wv ? 'yes' : 'no',
          acknowledged: about.length ? 'yes' : arrival ? 'partial' : 'no',
          priorKnowledge: 'n/a',
          verdict: about.length ? `the wrong verb drew a line about the hunt: ${about[0]}` : arrival ? 'only the arrival line (printed before the wrong verbs) spoke for the hunt; the wrong verbs themselves drew nothing about it' : 'nothing about the hunt was said',
        };
      },
    );
    if (w.breaks.length) return report(w.done0());
  } else {
    w.skipped.push(`the wrong verb on the right ground — this ${family} has no "investigate" stage ahead of the walker`);
  }

  if (w.stage() < m.abandonAt) {
    const r = await w.playOn(m.abandonAt);
    if (r.breaks.length) return report(r);
  }
  const itemRe = m.items.length ? new RegExp(m.items.map(esc).join('|')) : null;
  const held = () => (get().player?.inventory ?? []).filter((i) => itemRe?.test(i.name)).map((i) => `${i.name}×${i.quantity}`);
  const before = held();
  const askGround = w.ground[m.firstAsk ?? 0]!;
  const askNpc = stripThe(m.firstAskNpc ?? 'the first ask');
  await w.probe(
    'abandon with the items, take it up again',
    `ABANDON at stage ${m.abandonAt} holding ${before.join(', ') || 'nothing'}; ACCEPT again at the gate; return to ${askNpc}`,
    `the slate says what is dropped; the re-accept resumes or says it starts over; ${askNpc}'s card comes back (or they say "back again") and the pack is not doubled`,
    async () => {
      if (!(await w.abandonAndReaccept())) return;
      get().appendLog('system', `(walker) re-accepted at stage ${w.stage()}; pack: ${held().join(', ') || 'nothing'}`);
      if (!(await w.walkTo(askGround, 'back to the first ask'))) return;
      w.dismissCards();
      const armed = armedEncounter(get().player);
      if (armed) w.learnNoun(armed.person.name);
      const st = armed ? get().player!.missionEncounters?.[armed.key] : undefined;
      get().appendLog('system', `(walker) at the first ask again: card ${armed?.key ?? 'none'}, phase ${st?.phase ?? 'fresh'}`);
      const offered = armed && armed.key === `${family}:${def.id}:0`
        ? choicesFor(st ?? freshEncounter(armed.key), { hasFight: armed.hasFight, canPersuade: armed.canPersuade, canKill: armed.person.canKill })
        : [];
      const fwd = offered.find((c) => c !== 'flee');
      if (fwd) {
        w.tap(`card: ${fwd.toUpperCase()}`);
        get().answerMissionEncounter(fwd as never);
        await tick();
      } else {
        const line = w.arrivalLine(w.prevCloseMark);
        const ask = line ? w.askFrom(line) : null;
        if (!ask) { w.breaks.push('no card and no arrival line at the first ask after re-accept'); return; }
        w.tap(`type "${ask}"`); await w.type(ask);
      }
      w.dismissCards();
    },
    (saw) => {
      const after = held();
      const dropped = saw.find((l) => /set .* aside|poster goes back/i.test(l));
      const cardBack = saw.some((l) => /phase (fresh|opening)/.test(l));
      const resumed = saw.find((l) => /re-accepted at stage ([1-9])/.test(l));
      const doubled = after.some((s) => /×[2-9]/.test(s));
      const back = w.remembers(saw);
      return {
        handled: w.stage() >= 1 && !doubled ? (cardBack || resumed ? 'yes' : 'partial') : 'no',
        acknowledged: dropped ? 'yes' : 'no',
        priorKnowledge: resumed || back.length ? 'yes' : 'no',
        verdict: [
          dropped ? 'the drop was said' : 'the drop was silent',
          resumed ? 'the re-accept resumed' : `the re-accept started over at stage ${saw.find((l) => /re-accepted at stage/.test(l))?.match(/stage (\d+)/)?.[1] ?? '?'}`,
          cardBack ? 'the first ask\'s card came back' : 'the first ask\'s card stayed shut (its record says resolved) — only the typed verb paid',
          doubled ? `the pack DOUBLED: ${after.join(', ')}` : `pack intact: ${after.join(', ') || 'nothing held'}`,
        ].join('; '),
      };
    },
  );
  if (w.breaks.length) return report(w.done0());
  const finish = await w.playOn();
  return report(finish);
}

export async function walkInterrupted(def: MissionLike, family: MissionFamily = 'hunt'): Promise<ContraryReport> {
  const w = new ContraryWalker('interrupted', def, family);
  resetForRoad(w);
  const report = (finish: WalkReport | null): ContraryReport => w.report('interrupted', finish);
  if (!(await w.accept())) return report(w.done0());
  const m = w.map;

  if (m.brood !== null && m.broodName) {
    const r0 = await w.playOn(m.brood);
    if (r0.breaks.length) return report(r0);
    const brood = m.broodName;
    const broodGround = w.ground[m.brood]!;
    let killed = 0;
    let n0 = 0;
    await w.probe(
      'one of the brood down, then run',
      `arrive on ${broodGround} (stage ${m.brood}), let the ${brood} ambush land, kill one, FLEE, step off and back`,
      'the flee is said; nothing re-summons on the fled tile; on return the brood is one short (the kill is remembered) and a line says they are back for more',
      async () => {
        if (!(await w.walkTo(broodGround, 'to the brood ground'))) return;
        w.dismissCards();
        w.fieldReport('on the brood ground');
        // ⚠ The arrival door arms HUNT spawns only (stageArrival.armSpawnStagesAtArrival
        // returns early on any other family); a mystery or storyline stands its
        // pack up when the stage's own verb is typed. A player types it; so does this.
        if (family !== 'hunt' && w.livingNamed(brood) === 0) { const v = w.contractsLabel(m.brood!) ?? 'attack'; w.tap(`type "${v}"`); await w.type(v); }
        n0 = await w.clearAmbient(brood, 'on the brood ground');
        if (n0 === 0) { w.breaks.push(`no ${brood} stood up on arrival at stage ${m.brood} — ${w.fieldReport('no brood')}`); return; }
        // ⚠ MEASURED (second sweep, sludge behemoth + harpy cradle): STR 20 with
        // whatever the road had looted swung once and the whole brood fell, so
        // "kill one and run" ran from an empty field, the stage closed, and the
        // return had nothing to stand up. A player with a splash weapon meets the
        // same thing; the probe is about the ONE survivor's memory, so the brood
        // is hardened by fiat until one falls at a time.
        w.hardenBrood(brood, 200);
        await w.fightUntil(() => w.livingNamed(brood) < n0, 'to thin the brood');
        killed = n0 - w.livingNamed(brood);
        get().appendLog('system', `(walker) killed ${killed} of ${n0} ${brood}, fleeing`);
        if (!(await w.flee())) { w.breaks.push('the flee from the brood did not clear the field'); return; }
        w.tap('type "investigate the area" (on the fled tile)'); await w.type('investigate the area');
        get().appendLog('system', `(walker) after investigate on the fled tile: ${w.livingNamed(brood)} ${brood} up`);
        if (!(await w.stepOffAndBack())) return;
        w.dismissCards();
        const back = await w.clearAmbient(brood, 'on the way back');
        get().appendLog('system', `(walker) back on the tile: ${back} ${brood} up`);
      },
      (saw) => {
        const fledLine = saw.find(isFleeLine);
        const resummoned = /after investigate on the fled tile: ([1-9])/.exec(saw.join('\n'));
        const backCount = Number(/back on the tile: (\d+)/.exec(saw.join('\n'))?.[1] ?? '0');
        const back = w.remembers(saw);
        return {
          handled: !resummoned && backCount > 0 ? 'yes' : 'no',
          acknowledged: fledLine ? 'yes' : 'no',
          priorKnowledge: killed > 0 && backCount === n0 - killed ? 'yes' : back.length ? 'partial' : 'no',
          verdict: [
            fledLine ? 'the flee was said' : 'the flee was silent',
            resummoned ? 'investigate on the fled tile RE-SUMMONED the brood' : 'the fled tile held',
            backCount === 0 ? 'nothing stood up on return' : `on return ${backCount} ${brood} stood up after ${killed} of ${n0} had died`,
            back.length ? `the return was noted: ${back[0]}` : 'the return drew the same stinger as the first arrival',
          ].join('; '),
        };
      },
    );
    if (w.breaks.length) return report(w.done0());
    if (w.enemiesUp() > 0 && !(await w.fightOut('the brood, second time'))) return report(w.done0());
    await new Promise((r) => setTimeout(r, 300));
    w.dismissCards();
    w.fieldReport('after the brood');
  } else {
    w.skipped.push(`one of the brood down, then run — this ${family} stands up no brood of two or more`);
  }

  // ⚠ STEP 3b — the wound-and-run probe wounds the last body the mission stands
  // up. A mystery's "boss" is the artifact in hand and a storyline's is usually
  // a person; neither stands anything up, so the probe is skipped and says so
  // rather than grading a fight that was never authored.
  if (!m.apexBody) {
    w.skipped.push(`the apex wounded, then run — this ${family} stands up no body to wound (its last step is a synthesis or a person)`);
    const finish = await w.playOn();
    return report(finish);
  }
  const apexStage = m.apexBody.stage;
  if (w.stage() !== apexStage) {
    const r = await w.playOn(apexStage);
    if (r.breaks.length) return report(r);
  }

  const apex = m.apexBody.name;
  const apexGround = w.ground[apexStage]!;
  const apexVerb = w.contractsLabel(apexStage) ?? 'attack';
  let hpAtFlee: number | null = null;
  let hpMax: number | null = null;
  await w.probe(
    'the apex wounded, then run',
    `arrive on ${apexGround} (a hunt's apex fires at arrival; the other families stand up on "${apexVerb}"), wound it, FLEE, step off and back`,
    'the flee is said; on return the apex is still wounded (or a line says it healed), and its first-arrival stinger is not replayed as if new',
    async () => {
      w.fieldReport('before the apex walk');
      if (!(await w.walkTo(apexGround, 'to the apex ground'))) return;
      w.dismissCards();
      w.fieldReport('on the apex ground');
      if (family !== 'hunt' && w.livingNamed(apex) === 0) { w.tap(`type "${apexVerb}"`); await w.type(apexVerb); }
      if ((await w.clearAmbient(apex, 'on the apex ground')) === 0) { w.breaks.push(`the apex did not stand up on arrival at its ground — ${w.fieldReport('no apex')}`); return; }
      hpMax = w.hpOf(apex);
      await w.fightUntil(() => (w.hpOf(apex) ?? 0) < (hpMax ?? 0), 'to wound the apex');
      hpAtFlee = w.hpOf(apex);
      get().appendLog('system', `(walker) apex at ${hpAtFlee}/${hpMax}, fleeing`);
      if (!(await w.flee())) { w.breaks.push('the flee from the apex did not clear the field'); return; }
      if (!(await w.stepOffAndBack())) return;
      w.dismissCards();
      await w.clearAmbient(apex, 'on the way back to the apex ground');
      if (family !== 'hunt' && w.livingNamed(apex) === 0) {
        get().appendLog('system', `(walker) back on the apex ground: nothing stood up by itself; typing "${apexVerb}" again`);
        w.tap(`type "${apexVerb}"`); await w.type(apexVerb);
        await w.clearAmbient(apex, 'on the way back, after the verb');
      }
      get().appendLog('system', `(walker) back on the apex ground: apex ${w.livingNamed(apex) ? `up at ${w.hpOf(apex)}` : 'not up'}`);
    },
    (saw) => {
      const fledLine = saw.find(isFleeLine);
      const backHp = Number(/back on the apex ground: apex up at (\d+)/.exec(saw.join('\n'))?.[1] ?? '-1');
      const back = w.remembers(saw);
      return {
        handled: backHp > 0 ? 'yes' : 'no',
        acknowledged: fledLine ? 'yes' : 'no',
        priorKnowledge: hpAtFlee !== null && backHp === hpAtFlee ? 'yes' : back.length ? 'partial' : 'no',
        verdict: [
          fledLine ? 'the flee was said' : 'the flee was silent',
          backHp < 0 ? 'the apex did not stand up again' : backHp === hpAtFlee ? 'the wound held' : `the apex came back at ${backHp} after being left at ${hpAtFlee} of ${hpMax}`,
          back.length ? `the return was noted: ${back[0]}` : 'no line knew you had run',
        ].join('; '),
      };
    },
  );
  if (w.breaks.length) return report(w.done0());
  if (w.enemiesUp() > 0 && !(await w.fightOut('the apex, second time'))) return report(w.done0());
  await new Promise((r) => setTimeout(r, 300));
  w.dismissCards();
  const finish = await w.playOn();
  return report(finish);
}

export async function walkAllFour(def: MissionLike, family: MissionFamily = 'hunt'): Promise<ContraryReport[]> {
  return [await walkObedient(def, family), await walkPremature(def, family), await walkContrary(def, family), await walkInterrupted(def, family)];
}

function nounsOf(r: ContraryReport): RegExp {
  try { return r.nouns ? new RegExp(r.nouns, 'i') : /\b(the bounty|the trophy|this hunt|the hunt)\b/i; } catch { return /\b(the bounty|the trophy|this hunt|the hunt)\b/i; }
}

export function formatContrary(r: ContraryReport): string {
  const nouns = nounsOf(r);
  const head = `── ${r.path.toUpperCase()}${r.hunt ? ` · ${r.hunt}` : ''} ── ${r.finish ? (r.finish.outcome === 'complete' ? 'finished clean' : `finished BROKEN: ${r.finish.breaks.length}`) : 'no finish'} (${r.taps} taps)`;
  const probes = r.probes.map((p) => [
    `  • ${p.step}`,
    `      did:       ${p.did}`,
    `      expected:  ${p.expected}`,
    `      handled=${p.handled} acknowledged=${p.acknowledged} prior=${p.priorKnowledge}`,
    `      verdict:   ${p.verdict}`,
    ...linesOf(p.saw).filter((l) => nouns.test(l) || /^\(walker\)|^\[|^▸/.test(l)).slice(0, 14).map((l) => `      | ${l}`),
  ].join('\n'));
  const skipped = (r.skipped ?? []).map((s) => `  ○ skipped: ${s}`);
  const breaks = (r.finish?.breaks ?? []).map((b) => `    ✗ ${b.split('\n').join('\n      ')}`);
  const memory = r.worldMemory.length ? [`  world memory on the road (${r.worldMemory.length}):`, ...r.worldMemory.slice(0, 8).map((l) => `      | ${l}`)] : [];
  const feed = r.feed ? ['    ── feed ──', ...r.feed.map((l) => `    | ${l.split('\n').join('\n    |   ')}`)] : [];
  return [head, ...probes, ...skipped, ...breaks, ...memory, ...feed].join('\n');
}

/** The punch list: every grade that is not a yes, one line each. */
export function punchList(reports: ContraryReport[]): string[] {
  const out: string[] = [];
  for (const r of reports) {
    const tag = r.hunt ? `${r.hunt} · ${r.path}` : r.path;
    for (const p of r.probes) {
      const misses: string[] = [];
      if (p.handled !== 'yes') misses.push(`handled=${p.handled}`);
      if (p.acknowledged === 'no' || p.acknowledged === 'partial') misses.push(`acknowledged=${p.acknowledged}`);
      if (p.priorKnowledge === 'no' || p.priorKnowledge === 'partial') misses.push(`prior knowledge=${p.priorKnowledge}`);
      if (misses.length) out.push(`[${tag}] ${p.step} — ${misses.join(', ')} — ${p.verdict}`);
    }
    if (r.finish && r.finish.outcome !== 'complete') out.push(`[${tag}] the finish broke: ${r.finish.breaks[0]?.split('\n')[0]}`);
  }
  return out;
}

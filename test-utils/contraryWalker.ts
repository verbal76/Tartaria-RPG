// ⚠⚠⚠ THE CONTRARY WALKER — step 1 of the Narrative Agency plan (2026-09-05).
//
// The player-shaped walker (playerWalker.ts) plays every mission the way the
// game asks: accept at the gate, follow the course, type the arrival line's
// own words, answer the card with its button. It proves the OBEDIENT path.
// The owner's next question is the one every real player asks the game
// without meaning to: what happens when I do it wrong, early, or halfway?
//
// This walker takes ONE hunt — the Bog Dragon of Old Drakova, seven stages,
// two people, three fights — down four roads:
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
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter } from '../app/engine/missionEncounter';
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

/** Words a line uses when it knows you have been here, or done this, before.
 *  ⚠ Measured tight: "before" matched "stands before you", "ran" matched
 *  "runes", "left" matched "You've left Drakova" on the first pass, and a bare
 *  "already" matched the Arbiter's combat quip "It already has." on the eighth. */
const RETURN_WORDS = /\b(again|you already|already (been|here|seen|done|met|stood|read|tried)|last time|second time|once more|returned|come back|came back|back for more|changed your mind|walked off|walked away|you left|you ran|you fled|here before)\b/i;
/** The hunt's own nouns — a line has to be ABOUT the hunt to count as an
 *  acknowledgement. ⚠ Place names and common nouns are out on purpose: the
 *  scene generator says "steeple", "roost" and "locket" of its own accord and
 *  the compass names The Broken Steeple on every Drakova arrival. */
const HUNT_NOUNS = /\b(bog dragon|the dragon|eshren|reeve|halvard|old mira|mira's|mud harp|mud wraith|boy's locket|brass token|name-token|the bounty|the trophy|this hunt|the hunt)\b/i;
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
  const done = p.completedHuntIds ?? [];
  if (done.includes(w.def.id)) {
    w.allowances.add('the finished hunt struck from the completed ledger so the posting can be taken again');
    store.setState({ player: { ...p, completedHuntIds: done.filter((id) => id !== w.def.id) } as never });
  }
  w.allowances.add('HP 600 / STR 20 / DEX 20 / standing 100 with every faction');
}

function grounds(def: MissionLike): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../app/engine/questStage') as typeof import('../app/engine/questStage');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CM = require('../app/engine/contractMarkers') as typeof import('../app/engine/contractMarkers');
  const hunt = findHuntById(def.id)!;
  return hunt.stages.map((st) => QS.stageLocationId(st, CM.huntAnchorId(hunt), CM.resolvePosterLocation));
}

export class ContraryWalker extends Walker {
  readonly path: ContraryPath;
  readonly probes: Probe[] = [];
  readonly ground: string[];

  constructor(path: ContraryPath, def: MissionLike) {
    super('hunt', def);
    this.path = path;
    this.ground = grounds(def);
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
    return linesOf(saw).filter((l) => HUNT_NOUNS.test(l) && !l.startsWith('(walker)'));
  }
  /** A line about the hunt that also knows it has happened before. */
  remembers(saw: string[]): string[] {
    return linesOf(saw).filter((l) => HUNT_NOUNS.test(l) && RETURN_WORDS.test(l) && !l.startsWith('(walker)'));
  }
  /** Any line that knows you have been here before — vendors' "You again",
   *  the room's "The bodies you left are still here" — the world's memory,
   *  whether or not it is about the hunt. Reported, never graded. */
  worldRemembers(saw: string[]): string[] {
    return linesOf(saw).filter((l) => RETURN_WORDS.test(l) && !l.startsWith('(walker)'));
  }

  report(path: ContraryPath, finish: WalkReport | null): ContraryReport {
    return {
      path, probes: this.probes, finish, taps: this.taps,
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
    if (armed && armed.key === `hunt:${this.def.id}:${s}` && st?.phase === 'resolved') {
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
      if (armedNow && armedNow.key === `hunt:${this.def.id}:${s}` && stNow?.phase === 'resolved') {
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
      family: 'hunt', id: this.def.id, title: this.def.title,
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

  /** Are the bodies on the field the stage's own (a spawn or the apex)? */
  enemiesAreTheStage(): boolean {
    const st = this.def.stages[this.stage()];
    const sc = get().currentScene;
    if (!st || !sc) return false;
    const names = new Set<string>();
    if (st.spawn) names.add(st.spawn.enemyName);
    const hunt = findHuntById(this.def.id);
    if (hunt) names.add(`${hunt.targetEnemyName} (hunted)`);
    return sc.enemies.some((e, i) => (sc.enemyHps[i] ?? 0) > 0 && names.has(e.name));
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
    get().abandonContract('hunt', this.def.id);
    await tick();
    if (this.record()) { this.breaks.push('ABANDON left the record on the slate'); return false; }
    return this.accept();
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

// ── the four roads ──────────────────────────────────────────────────────────

export async function walkObedient(def: MissionLike): Promise<ContraryReport> {
  const finish = await playMission('hunt', def);
  const w = new ContraryWalker('obedient', def);
  const noCard = finish.stages.filter((s) => !s.closeCard).map((s) => s.stage);
  w.probes.push({
    path: 'obedient', step: 'the whole hunt, as asked', did: 'accept at the gate, follow every course, type every arrival line, answer every card, hand in',
    expected: 'seven stages close, each with a card, the purse moves',
    saw: finish.stages.map((s) => `stage ${s.stage} via=${s.via}${s.closeCard ? ` card: ${s.closeCard.split('\n')[0]}` : ' NO CARD'}`),
    handled: finish.outcome === 'complete' ? 'yes' : 'no',
    acknowledged: noCard.length === 0 ? 'yes' : 'partial',
    priorKnowledge: 'n/a',
    verdict: finish.outcome === 'complete' ? `complete in ${finish.taps} taps${noCard.length ? `; stages ${noCard.join(',')} closed without a card` : ''}` : finish.breaks.join(' | '),
  });
  return { path: 'obedient', probes: w.probes, finish, taps: finish.taps, worldMemory: [], ...(finish.feed ? { feed: finish.feed } : {}) };
}

export async function walkPremature(def: MissionLike): Promise<ContraryReport> {
  const w = new ContraryWalker('premature', def);
  resetForRoad(w);
  const report = (finish: WalkReport | null): ContraryReport => w.report('premature', finish);
  if (!(await w.accept())) return report(w.done0());
  const steeple = w.ground[6]!;
  const mira = w.ground[2]!;

  // 1. Straight to the roost the poster names, before the reeve.
  await w.probe(
    'the steeple before the reeve',
    `SET COURSE to ${steeple} at stage 0, arrive, type "attack" (the apex's own verb) and "investigate the area"`,
    'the slate says this is the roost but not yet — the Drakovan reeve first; nothing stands up',
    async () => {
      if (!(await w.walkTo(steeple, 'to the roost, early'))) return;
      w.dismissCards();
      w.tap('type "attack"'); await w.type('attack');
      if (w.enemiesUp() > 0) await w.fightOut('at the steeple, early');
      w.tap('type "investigate the area"'); await w.type('investigate the area');
      if (w.enemiesUp() > 0) await w.fightOut('at the steeple, early');
    },
    (saw) => {
      const about = w.aboutTheHunt(saw).filter((l) => !/^\[/.test(l));
      const stoodUp = saw.some((l) => /Bog Dragon \(hunted\)/.test(l));
      const stillStage0 = w.stage() === 0;
      return {
        handled: stillStage0 && !stoodUp ? 'yes' : 'no',
        acknowledged: about.length ? 'partial' : 'no',
        priorKnowledge: 'n/a',
        verdict: stoodUp ? 'the apex stood up with no name-token in hand' : about.length ? `the hunt was named: ${about[0]}` : 'nothing on screen mentioned the hunt or the roost; the early visit is invisible',
      };
    },
  );
  if (w.breaks.length) return report(w.done0());

  // 2. Old Mira before the reeve — no token to show her.
  await w.probe(
    'Old Mira before the reeve',
    `SET COURSE to ${mira} at stage 0, arrive, type "negotiate" and "talk to old mira"`,
    'Mira (or the slate) says she wants the reeve\'s token before she talks; no card opens for a beat two stages away',
    async () => {
      if (!(await w.walkTo(mira, 'to Old Mira, early'))) return;
      w.dismissCards();
      const armed = armedEncounter(get().player);
      if (armed) get().appendLog('system', `(walker) a card is armed here: ${armed.key} with ${armed.person.name}`);
      w.tap('type "negotiate"'); await w.type('negotiate');
      if (w.enemiesUp() > 0) await w.fightOut("at Mira's, early");
      w.tap('type "talk to old mira"'); await w.type('talk to old mira');
      if (w.enemiesUp() > 0) await w.fightOut("at Mira's, early");
    },
    (saw) => {
      const about = w.aboutTheHunt(saw).filter((l) => !/^\[/.test(l));
      const notHere = saw.find((l) => /Not here\.|points elsewhere/.test(l));
      const namesReeve = saw.some((l) => /reeve|token/i.test(l));
      const cardArmed = saw.some((l) => /a card is armed here/.test(l));
      return {
        handled: w.stage() === 0 && !cardArmed ? 'yes' : 'partial',
        acknowledged: namesReeve ? 'yes' : notHere ? 'partial' : about.length ? 'partial' : 'no',
        priorKnowledge: 'n/a',
        verdict: cardArmed ? 'a conversation card armed for a beat the record has not reached' : namesReeve ? 'the refusal names the reeve or the token' : notHere ? `the refusal is generic: ${notHere}` : 'nothing about the hunt was said at all',
      };
    },
  );
  if (w.breaks.length) return report(w.done0());

  // 3. Now do it properly, and watch the two grounds for a memory of the early visit.
  const marks: Record<number, number> = {};
  const finish = await (async () => {
    let r: WalkReport | null = null;
    for (const until of [2, 6, 7]) {
      marks[until] = w.feedMark();
      r = await w.playOn(until);
      if (r.breaks.length) return r;
    }
    return r;
  })();
  const sawAtMira = w.feedSince(marks[2] ?? 0);
  const sawAtSteeple = w.feedSince(marks[6] ?? 0);
  w.probes.push({
    path: 'premature', step: 'the proper visits, after the early ones',
    did: 'play stages 0–6 as asked after having stood at Mira\'s door and on the roost already',
    expected: 'Mira or the Arbiter notes you came by once already; the steeple arrival notes you have seen the roost',
    saw: [...w.remembers(sawAtMira), ...w.remembers(sawAtSteeple)],
    handled: finish && finish.outcome === 'complete' ? 'yes' : 'no',
    acknowledged: 'n/a',
    priorKnowledge: w.remembers(sawAtMira).length || w.remembers(sawAtSteeple).length ? 'yes' : 'no',
    verdict: finish && finish.outcome === 'complete'
      ? (w.remembers(sawAtMira).length || w.remembers(sawAtSteeple).length ? 'a line remembered the early visit' : 'the hunt finished exactly as if the early visits never happened')
      : (finish?.breaks.join(' | ') ?? 'no finish'),
  });
  return report(finish);
}

export async function walkContrary(def: MissionLike): Promise<ContraryReport> {
  const w = new ContraryWalker('contrary', def);
  resetForRoad(w);
  const report = (finish: WalkReport | null): ContraryReport => w.report('contrary', finish);
  if (!(await w.accept())) return report(w.done0());

  // 1. Hand the bounty in with nothing to show, at the gate you just took it from.
  await w.probe(
    'the trophy before the hunt',
    'TURN IN at Halem\'s counter straight after accepting',
    'a refusal that says what is missing (the trophy) — not a silent button',
    async () => {
      w.tap(`TURN IN "${def.title}"`);
      get().turnInHunt(def.id);
      await tick();
      if (get().player?.hubRoomId) { w.tap('EXIT'); await w.type('leave outpost'); }
    },
    (saw) => {
      const refused = saw.find((l) => /trophy|not on your slate|don't have it yet/i.test(l));
      return {
        handled: w.record() ? 'yes' : 'no',
        acknowledged: refused ? 'yes' : 'no',
        priorKnowledge: 'n/a',
        verdict: refused ? `refused out loud: ${refused}` : 'the hand-in said nothing',
      };
    },
  );

  // 2. Walk away from the reeve mid-conversation, then come back to him.
  const drakova = w.ground[0]!;
  await w.probe(
    'walking out on the reeve',
    'on the reeve\'s card tap the walk-away button, step off the tile and back, tap SUMMON, then PROCEED',
    'the walk-away is said; the reeve is still there on return; a line notes you came back',
    async () => {
      if (!(await w.walkTo(drakova, 'to the reeve'))) return;
      w.dismissCards();
      const armed = armedEncounter(get().player);
      if (!armed || armed.key !== `hunt:${def.id}:0`) { w.breaks.push(`no card armed at the reeve (${armed?.key ?? 'none'})`); return; }
      const enc = get().player!.missionEncounters?.[armed.key] ?? freshEncounter(armed.key);
      const offered = choicesFor(enc, { hasFight: armed.hasFight, canPersuade: armed.canPersuade, canKill: armed.person.canKill });
      if (!offered.includes('flee')) { w.breaks.push(`the reeve's card offers no walk-away (${offered.join('/')})`); return; }
      w.tap('card: FLEE (walk away)');
      get().answerMissionEncounter('flee');
      await tick();
      if (!(await w.stepOffAndBack())) return;
      const again = armedEncounter(get().player);
      const phase = again ? (get().player!.missionEncounters?.[again.key]?.phase ?? 'fresh') : 'no card';
      get().appendLog('system', `(walker) back on the tile: card ${again?.key ?? 'none'}, phase ${phase}`);
      w.tap('▸ SUMMON THE DRAKOVAN REEVE');
      get().summonMissionEncounter();
      await tick();
      const reopened = armedEncounter(get().player);
      const st = reopened ? (get().player!.missionEncounters?.[reopened.key] ?? freshEncounter(reopened.key)) : null;
      const fwd = reopened && st ? choicesFor(st, { hasFight: reopened.hasFight, canPersuade: reopened.canPersuade, canKill: reopened.person.canKill }).find((c) => c !== 'flee') : null;
      if (!fwd) { w.breaks.push(`after SUMMON the reeve's card offers no way forward (phase ${st?.phase ?? 'none'})`); return; }
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
        verdict: w.stage() >= 1 ? (back.length ? `the return was noted: ${back[0]}` : 'the walk-away was said; the reeve picked up as if nothing happened') : 'the beat did not close after the walk-away',
      };
    },
  );
  if (w.breaks.length) return report(w.done0());

  // 3. The wrong verb on the right ground (stage 1 wants a search; type a parley and a swing).
  await w.probe(
    'the wrong verb on the right ground',
    'on the Cradle of Dusk (stage 1, "investigate") type "negotiate" and "attack" first',
    'the slate says what this ground wants instead ("search this ground"), not silence or a generic nothing',
    async () => {
      if (!(await w.walkTo(w.ground[1]!, 'to the Cradle of Dusk'))) return;
      w.dismissCards();
      if (w.enemiesUp() > 0) await w.fightOut('on arrival at the Cradle');
      w.tap('type "negotiate"'); await w.type('negotiate');
      w.tap('type "attack"'); await w.type('attack');
      if (w.enemiesUp() > 0) await w.fightOut('after the wrong swing');
    },
    (saw) => {
      const about = w.aboutTheHunt(saw).filter((l) => !/^\[|^▸/.test(l));
      const arrival = saw.find((l) => l.startsWith(`▸ ${def.title}: this is the place`));
      return {
        handled: w.stage() === 1 ? 'yes' : 'no',
        acknowledged: about.length ? 'yes' : arrival ? 'partial' : 'no',
        priorKnowledge: 'n/a',
        verdict: about.length ? `the wrong verb drew a line about the hunt: ${about[0]}` : arrival ? 'only the arrival line (printed before the wrong verbs) spoke for the hunt; the wrong verbs themselves drew nothing about it' : 'nothing about the hunt was said',
      };
    },
  );
  if (w.breaks.length) return report(w.done0());

  // 4. Do stages 1 and 2 as asked, then throw the hunt away with the token and the map in the pack.
  const r12 = await w.playOn(3);
  if (r12.breaks.length) return report(r12);
  const held = () => (get().player?.inventory ?? []).filter((i) => /Reeve's Brass Token|Mira's Shrine-Map/.test(i.name)).map((i) => `${i.name}×${i.quantity}`);
  const before = held();
  await w.probe(
    'abandon with the items, take it up again',
    `ABANDON at stage 3 holding ${before.join(', ')}; ACCEPT again at the gate; return to the reeve`,
    'the slate says what is dropped; the re-accept resumes or says it starts over; the reeve\'s card comes back (or he says "back again") and the pack is not doubled',
    async () => {
      if (!(await w.abandonAndReaccept())) return;
      get().appendLog('system', `(walker) re-accepted at stage ${w.stage()}; pack: ${held().join(', ') || 'nothing'}`);
      if (!(await w.walkTo(drakova, 'back to the reeve'))) return;
      w.dismissCards();
      const armed = armedEncounter(get().player);
      const st = armed ? get().player!.missionEncounters?.[armed.key] : undefined;
      get().appendLog('system', `(walker) at the reeve again: card ${armed?.key ?? 'none'}, phase ${st?.phase ?? 'fresh'}`);
      // The card, if it is there; else the arrival line's own words (the typed door).
      const offered = armed && armed.key === `hunt:${def.id}:0`
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
        if (!ask) { w.breaks.push('no card and no arrival line at the reeve after re-accept'); return; }
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
          cardBack ? 'the reeve\'s card came back' : 'the reeve\'s card stayed shut (its record says resolved) — only the typed verb paid',
          doubled ? `the pack DOUBLED: ${after.join(', ')}` : `pack intact: ${after.join(', ')}`,
        ].join('; '),
      };
    },
  );
  if (w.breaks.length) return report(w.done0());
  const finish = await w.playOn();
  return report(finish);
}

export async function walkInterrupted(def: MissionLike): Promise<ContraryReport> {
  const w = new ContraryWalker('interrupted', def);
  resetForRoad(w);
  const report = (finish: WalkReport | null): ContraryReport => w.report('interrupted', finish);
  if (!(await w.accept())) return report(w.done0());
  const r05 = await w.playOn(5);
  if (r05.breaks.length) return report(r05);
  const hunt = findHuntById(def.id)!;
  const harpy = hunt.stages[5]!.spawn!.enemyName;
  const apex = `${hunt.targetEnemyName} (hunted)`;

  // 1. The harpies: kill one, run, come back.
  let killed = 0;
  await w.probe(
    'one harpy down, then run',
    `arrive on the Mud Seas (stage 5), let the ${harpy} ambush land, kill one, FLEE, step off and back`,
    'the flee is said; nothing re-summons on the fled tile; on return the brood is one short (the kill is remembered) and a line says they are back for more',
    async () => {
      if (!(await w.walkTo(w.ground[5]!, 'to the Mud Seas'))) return;
      w.dismissCards();
      w.fieldReport('on the Mud Seas');
      const n0 = await w.clearAmbient(harpy, 'on the Mud Seas');
      if (n0 === 0) { w.breaks.push(`no ${harpy} stood up on arrival at stage 5 — ${w.fieldReport('no brood')}`); return; }
      await w.fightUntil(() => w.livingNamed(harpy) < n0, 'to thin the brood');
      killed = n0 - w.livingNamed(harpy);
      get().appendLog('system', `(walker) killed ${killed} of ${n0} ${harpy}, fleeing`);
      if (!(await w.flee())) { w.breaks.push('the flee from the harpies did not clear the field'); return; }
      w.tap('type "investigate the area" (on the fled tile)'); await w.type('investigate the area');
      get().appendLog('system', `(walker) after investigate on the fled tile: ${w.livingNamed(harpy)} ${harpy} up`);
      if (!(await w.stepOffAndBack())) return;
      w.dismissCards();
      const back = await w.clearAmbient(harpy, 'on the way back');
      get().appendLog('system', `(walker) back on the tile: ${back} ${harpy} up`);
    },
    (saw) => {
      const fledLine = saw.find((l) => /break for|You run|open ground|escape/i.test(l));
      const resummoned = /after investigate on the fled tile: ([1-9])/.exec(saw.join('\n'));
      const backCount = Number(/back on the tile: (\d+)/.exec(saw.join('\n'))?.[1] ?? '0');
      const back = w.remembers(saw);
      return {
        handled: !resummoned && backCount > 0 ? 'yes' : 'no',
        acknowledged: fledLine ? 'yes' : 'no',
        priorKnowledge: killed > 0 && backCount === 3 - killed ? 'yes' : back.length ? 'partial' : 'no',
        verdict: [
          fledLine ? 'the flee was said' : 'the flee was silent',
          resummoned ? 'investigate on the fled tile RE-SUMMONED the brood' : 'the fled tile held',
          backCount === 0 ? 'nothing stood up on return' : `on return ${backCount} ${harpy} stood up after ${killed} had died`,
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
  if (w.stage() !== 6) {
    // The escort clear should have moved the stage; give the parent's door a turn.
    const r = await w.playOn(6);
    if (r.breaks.length) return report(r);
  }

  // 2. The Dragon: wound it, run, come back.
  let hpAtFlee: number | null = null;
  let hpMax: number | null = null;
  await w.probe(
    'the Dragon wounded, then run',
    'arrive on the Broken Steeple (the apex fires at arrival), take three swings, FLEE, step off and back',
    'the flee is said; on return the Dragon is still wounded (or a line says it healed), and the name-token trick is not offered a second time as if new',
    async () => {
      w.fieldReport('before the steeple walk');
      if (!(await w.walkTo(w.ground[6]!, 'to the steeple'))) return;
      w.dismissCards();
      w.fieldReport('on the steeple');
      if ((await w.clearAmbient(apex, 'on the steeple')) === 0) { w.breaks.push(`the apex did not stand up on arrival at the steeple — ${w.fieldReport('no apex')}`); return; }
      hpMax = w.hpOf(apex);
      await w.fightUntil(() => (w.hpOf(apex) ?? 0) < (hpMax ?? 0), 'to wound the Dragon');
      hpAtFlee = w.hpOf(apex);
      get().appendLog('system', `(walker) Dragon at ${hpAtFlee}/${hpMax}, fleeing`);
      if (!(await w.flee())) { w.breaks.push('the flee from the Dragon did not clear the field'); return; }
      if (!(await w.stepOffAndBack())) return;
      w.dismissCards();
      await w.clearAmbient(apex, 'on the way back to the steeple');
      get().appendLog('system', `(walker) back on the steeple: Dragon ${w.livingNamed(apex) ? `up at ${w.hpOf(apex)}` : 'not up'}`);
    },
    (saw) => {
      const fledLine = saw.find((l) => /break for|You run|open ground|escape/i.test(l));
      const backHp = Number(/back on the steeple: Dragon up at (\d+)/.exec(saw.join('\n'))?.[1] ?? '-1');
      const stalls = saw.filter((l) => /ESHREN/.test(l) && /stalls/.test(l)).length;
      const back = w.remembers(saw);
      return {
        handled: backHp > 0 ? 'yes' : 'no',
        acknowledged: fledLine ? 'yes' : 'no',
        priorKnowledge: hpAtFlee !== null && backHp === hpAtFlee ? 'yes' : back.length ? 'partial' : 'no',
        verdict: [
          fledLine ? 'the flee was said' : 'the flee was silent',
          backHp < 0 ? 'the Dragon did not stand up again' : backHp === hpAtFlee ? 'the wound held' : `the Dragon came back at ${backHp} after being left at ${hpAtFlee} of ${hpMax}`,
          stalls >= 2 ? 'the name stalled it a second time, word for word' : stalls === 1 ? 'the name was read once' : 'the name line did not print',
          back.length ? `the return was noted: ${back[0]}` : 'no line knew you had run',
        ].join('; '),
      };
    },
  );
  if (w.breaks.length) return report(w.done0());
  if (w.enemiesUp() > 0 && !(await w.fightOut('the Dragon, second time'))) return report(w.done0());
  await new Promise((r) => setTimeout(r, 300));
  w.dismissCards();
  const finish = await w.playOn();
  return report(finish);
}

export async function walkAllFour(def: MissionLike): Promise<ContraryReport[]> {
  return [await walkObedient(def), await walkPremature(def), await walkContrary(def), await walkInterrupted(def)];
}

export function formatContrary(r: ContraryReport): string {
  const head = `── ${r.path.toUpperCase()} ── ${r.finish ? (r.finish.outcome === 'complete' ? 'finished clean' : `finished BROKEN: ${r.finish.breaks.length}`) : 'no finish'} (${r.taps} taps)`;
  const probes = r.probes.map((p) => [
    `  • ${p.step}`,
    `      did:       ${p.did}`,
    `      expected:  ${p.expected}`,
    `      handled=${p.handled} acknowledged=${p.acknowledged} prior=${p.priorKnowledge}`,
    `      verdict:   ${p.verdict}`,
    ...linesOf(p.saw).filter((l) => HUNT_NOUNS.test(l) || /^\(walker\)|^\[|^▸/.test(l)).slice(0, 14).map((l) => `      | ${l}`),
  ].join('\n'));
  const breaks = (r.finish?.breaks ?? []).map((b) => `    ✗ ${b.split('\n').join('\n      ')}`);
  const memory = r.worldMemory.length ? [`  world memory on the road (${r.worldMemory.length}):`, ...r.worldMemory.slice(0, 8).map((l) => `      | ${l}`)] : [];
  const feed = r.feed ? ['    ── feed ──', ...r.feed.map((l) => `    | ${l.split('\n').join('\n    |   ')}`)] : [];
  return [head, ...probes, ...breaks, ...memory, ...feed].join('\n');
}

/** The punch list: every grade that is not a yes, one line each. */
export function punchList(reports: ContraryReport[]): string[] {
  const out: string[] = [];
  for (const r of reports) {
    for (const p of r.probes) {
      const misses: string[] = [];
      if (p.handled !== 'yes') misses.push(`handled=${p.handled}`);
      if (p.acknowledged === 'no' || p.acknowledged === 'partial') misses.push(`acknowledged=${p.acknowledged}`);
      if (p.priorKnowledge === 'no' || p.priorKnowledge === 'partial') misses.push(`prior knowledge=${p.priorKnowledge}`);
      if (misses.length) out.push(`[${r.path}] ${p.step} — ${misses.join(', ')} — ${p.verdict}`);
    }
    if (r.finish && r.finish.outcome !== 'complete') out.push(`[${r.path}] the finish broke: ${r.finish.breaks[0]?.split('\n')[0]}`);
  }
  return out;
}

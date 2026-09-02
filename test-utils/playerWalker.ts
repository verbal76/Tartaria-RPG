// ⚠⚠⚠ THE PLAYER-SHAPED WALKER.
//
// Owner, 2026-09-02: *"you walkers don't play it the way a human does so it
// can't seem to catch the plethora of broken mess"* — and then: *"continue with
// the new type of walker, make it as close to the way a player has to interact
// as possible."*
//
// Every mission walker before this one was DATA-SHAPED. It seeded the player
// onto the stage's cell with `placedAt`, read the stage's own bindings, and
// typed the intent it already knew would pay. It never walked a tile, never
// read the arrival line, never typed the game's own words back at it. That is
// exactly why it could not catch "go quietly" walking the owner off the tile
// (OTA-1621), the arrival that never fired on the way back (OTA-1619), or a
// close buried under an ambush (OTA-1622). Those are all defects in what the
// game SAYS versus what it ACCEPTS, and the data walkers skip the saying.
//
// THIS WALKER READS ONLY WHAT THE PLAYER SEES AND DOES ONLY WHAT A THUMB DOES:
//
//   · It accepts at the gate of an outpost, from Halem the Trader, who brokers
//     every faction's postings — the door a player actually walks through.
//   · It routes with SET COURSE and the → DESTINATION button, tile by tile,
//     and fights whatever stands up on the road.
//   · On the ground it reads the feed for "▸ <title>: this is the place — …"
//     and TYPES THAT PHRASE. If the phrase does not pay, that is a break.
//   · It answers conversation cards with the button they offer.
//   · After every close it looks for the card the owner asked for, and reads
//     what the card and the feed said.
//   · It hands in at the gate, to Halem, and checks the purse.
//
// ALLOWANCES — the places it is NOT a player, each recorded on the report so
// nobody mistakes them for play: a fat HP pool and high standing (so every
// posting is on the board and no fight is a death), stamina restored by fiat
// instead of resting, dice that land on 18 when the roller asks, and a coup de
// grâce if a fight runs past sixty rounds. Everything else is the real doors.
//
// The output is a REPORT, not a pass: every mission comes back with the list of
// breaks it hit, in the player's own terms. Those become OTAs.

import { useGameStore } from '../app/state/gameStore';
import type { GameStore } from '../app/state/gameStore';
import { HUNTS, findHuntById, checkKindLabel } from '../app/engine/hunts';
import { MYSTERIES, findMysteryById } from '../app/engine/mysteries';
import { STORYLINES, findStorylineById } from '../app/engine/factionStorylines';
import { FACTIONS } from '../app/engine/factions';
import { openContractMarkers } from '../app/engine/contractMarkers';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter } from '../app/engine/missionEncounter';
import { stageVerbLabel, type MissionFamily } from '../app/engine/questStage';
import { hubLocationIds } from '../app/engine/hub';
import { canonicalCellOf, canonicalDistanceFromGrid } from '../app/engine/worldMap';
import { playerGridCell } from '../app/state/playerGrid';
import { CONTRACT_BROKER_VENDOR_ID } from '../app/engine/contractBroker';

const store = useGameStore;
const get = (): GameStore => store.getState();

export type WalkFamily = MissionFamily;

export interface StageNote {
  stage: number;
  ground: string;
  arrivalLine: string | null;
  typed: string | null;
  via: 'card' | 'typed' | 'fight' | 'label-fallback' | 'none';
  closeCard: string | null;
  closeFeed: string[];
}

export interface WalkReport {
  family: WalkFamily;
  id: string;
  title: string;
  outcome: 'complete' | 'broken';
  breaks: string[];
  allowances: string[];
  stages: StageNote[];
  taps: number;
  /** The whole feed the player saw, when PLAYER_WALKER_FEED=1 — the device
   *  log's shape, for reading a break the way a device log is read. */
  feed?: string[];
}

export interface MissionLike {
  id: string;
  title: string;
  factionId: string | null;
  stages: ReadonlyArray<{
    checkKind: string | null;
    narration: string;
    npcName?: string;
    spawn?: { enemyName: string; count?: number };
    requires?: { item: string; quantity?: number };
    grants?: { item: string; quantity?: number };
  }>;
}

export const ALL_MISSIONS: Array<{ family: WalkFamily; def: MissionLike }> = [
  ...HUNTS.map((d) => ({ family: 'hunt' as const, def: d as unknown as MissionLike })),
  ...MYSTERIES.map((d) => ({ family: 'mystery' as const, def: d as unknown as MissionLike })),
  ...STORYLINES.map((d) => ({ family: 'storyline' as const, def: d as unknown as MissionLike })),
];

export function findMission(family: WalkFamily, id: string): MissionLike | null {
  const d = family === 'hunt' ? findHuntById(id) : family === 'mystery' ? findMysteryById(id) : findStorylineById(id);
  return (d as unknown as MissionLike) ?? null;
}

async function settle(pred: () => boolean, deadlineMs = 4000): Promise<boolean> {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 12));
  }
  return pred();
}

const tick = () => new Promise((r) => setTimeout(r, 40));

class Walker {
  readonly family: WalkFamily;
  readonly def: MissionLike;
  readonly breaks: string[] = [];
  readonly allowances = new Set<string>();
  readonly stages: StageNote[] = [];
  taps = 0;
  /** Where the feed stood when the last stage closed (or the posting was taken). */
  prevCloseMark = 0;

  constructor(family: WalkFamily, def: MissionLike) {
    this.family = family;
    this.def = def;
  }

  // ── the thumb ────────────────────────────────────────────────────────────
  tap(label: string): void {
    this.taps += 1;
    get().appendLog('debug', `ui: tap "${label}"`);
  }

  async type(text: string): Promise<void> {
    await get().submitPlayerAction(text);
    this.drainRolls();
    await tick();
    this.drainRolls();
  }

  /** The dice roller: a player taps ROLL. Allowance: the die lands on 18. */
  drainRolls(): void {
    let guard = 0;
    while (get().pendingRolls) {
      if (guard++ > 60) { this.breaks.push('the dice roller never closed'); return; }
      this.allowances.add('dice land on 18');
      const pr = get().pendingRolls!;
      const step = pr.steps[pr.currentStep]!;
      this.tap('ROLL');
      get().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 18));
    }
  }

  // ── what the player sees ─────────────────────────────────────────────────
  // ⚠ The store keeps a bounded window (MAX_LOG_IN_MEMORY) and trims from the
  // front, so an index into `gameLog` goes stale mid-mission — the first
  // catalogue run reported empty feeds for that reason. The walker mirrors
  // the feed by entry identity instead, and marks index the mirror.
  private mirror: string[] = [];
  private lastEntry: unknown = null;

  private syncFeed(): void {
    const log = get().gameLog as ReadonlyArray<{ channel: string; text: string }>;
    let start = 0;
    if (this.lastEntry) {
      const i = (log as readonly unknown[]).indexOf(this.lastEntry);
      if (i >= 0) start = i + 1;
    }
    for (let i = start; i < log.length; i++) {
      const e = log[i]!;
      if (e.channel !== 'debug') this.mirror.push(e.text);
    }
    if (log.length) this.lastEntry = log[log.length - 1];
  }

  feed(): string[] {
    this.syncFeed();
    return this.mirror;
  }

  feedMark(): number { this.syncFeed(); return this.mirror.length; }

  feedSince(mark: number): string[] {
    this.syncFeed();
    return this.mirror.slice(mark);
  }

  lastLines(n = 6): string {
    return this.feed().slice(-n).map((l) => `  | ${l}`).join('\n');
  }

  /** Every card the thumb has dismissed, in order — the stage reads back
   *  what went up since its own start, so a card dismissed mid-fight still
   *  counts as seen. */
  readonly cardsSeen: string[] = [];

  /** A card is on the screen: read it, tap its button. Returns what it said. */
  dismissCards(): string[] {
    const said: string[] = [];
    let guard = 0;
    while (guard++ < 8) {
      const st = get();
      if (st.pendingMissionStinger) {
        const c = st.pendingMissionStinger as { title: string; line: string; next?: string | null; granted?: string[] };
        said.push(`[FIGHT card] ${c.title}: ${c.line}${c.granted?.length ? ` ✦ ${c.granted.join(', ')}` : ''}${c.next ? ` ${c.next}` : ''}`);
        this.tap('FIGHT');
        st.dismissMissionStinger();
        continue;
      }
      if (st.pendingMissionBeat) {
        const c = st.pendingMissionBeat as { title: string; line: string; next?: string | null; granted?: string[] };
        said.push(`[CONTINUE card] ${c.title}: ${c.line}${c.granted?.length ? ` ✦ ${c.granted.join(', ')}` : ''}${c.next ? ` ${c.next}` : ''}`);
        this.tap('CONTINUE');
        st.dismissMissionBeat();
        continue;
      }
      break;
    }
    this.cardsSeen.push(...said);
    return said;
  }

  peekCard(): string | null {
    const st = get();
    const c = (st.pendingMissionStinger ?? st.pendingMissionBeat) as { title: string; line: string } | null;
    return c ? `${c.title}: ${c.line}` : null;
  }

  record(): { id: string; stage: number; tracked?: boolean } | undefined {
    const p = get().player;
    if (!p) return undefined;
    const list = this.family === 'hunt' ? p.activeHunts : this.family === 'mystery' ? p.activeMysteries : p.activeStorylines;
    return (list ?? []).find((r) => r.id === this.def.id);
  }

  stage(): number { return this.record()?.stage ?? -1; }

  enemiesUp(): number {
    const sc = get().currentScene;
    if (!sc) return 0;
    return sc.enemies.filter((_, i) => (sc.enemyHps[i] ?? 0) > 0 && !(sc.enemyKnockedOut?.[i] ?? false)).length;
  }

  onCell(locationId: string): boolean {
    const p = get().player;
    if (!p) return false;
    const g = playerGridCell(p);
    const c = canonicalCellOf(locationId);
    return g.x === c.x && g.y === c.y;
  }

  // ── allowances ───────────────────────────────────────────────────────────
  restByFiat(): void {
    const p = get().player;
    if (!p) return;
    if (p.stamina < 5) {
      this.allowances.add('stamina restored by fiat instead of resting');
      store.setState({ player: { ...p, stamina: p.staminaMax ?? 50 } });
    }
  }

  topUp(): void {
    const p = get().player;
    if (!p) return;
    if (p.hp < p.hpMax) {
      this.allowances.add('HP kept full');
      store.setState({ player: { ...p, hp: p.hpMax } });
    }
  }

  // ── travel ───────────────────────────────────────────────────────────────
  nearestHub(): string {
    const p = get().player!;
    const g = playerGridCell(p);
    let best = hubLocationIds()[0]!;
    let bd = Infinity;
    for (const id of hubLocationIds()) {
      const d = canonicalDistanceFromGrid(g.x, g.y, id);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  /** SET COURSE, then → DESTINATION until the boots are on the cell. */
  async walkTo(locationId: string, why: string): Promise<boolean> {
    if (this.onCell(locationId)) return true;
    const p0 = get().player!;
    if (p0.travelTarget?.locationId !== locationId) {
      this.tap(`SET COURSE (${why})`);
      get().setTravelCourse(locationId);
      await tick();
      if (get().pendingTravelConfirm) {
        this.tap('LEAVE AND TRAVEL');
        get().confirmLeaveAndTravel();
        await tick();
      }
    }
    let guard = 0;
    while (!this.onCell(locationId)) {
      if (guard++ > 240) {
        this.breaks.push(`route to ${locationId} (${why}) did not arrive in 240 taps — standing at ${get().player?.currentLocationId}, ${canonicalDistanceFromGrid(playerGridCell(get().player!).x, playerGridCell(get().player!).y, locationId)} tiles out`);
        return false;
      }
      if (this.enemiesUp() > 0) {
        const ok = await this.fightOut('on the road');
        if (!ok) return false;
        continue;
      }
      this.dismissCards();
      this.restByFiat();
      const before = get().player!;
      if (!before.travelTarget) {
        // The course dropped (an ambush, a refusal, an arrival the game did
        // not count). Set it again — a player would tap SET COURSE again.
        this.tap(`SET COURSE again (${why})`);
        get().setTravelCourse(locationId);
        await tick();
        if (!get().player?.travelTarget && !this.onCell(locationId)) {
          this.breaks.push(`SET COURSE to ${locationId} (${why}) set no course. last lines:\n${this.lastLines(4)}`);
          return false;
        }
        continue;
      }
      this.tap('→ DESTINATION');
      get().continueTravel();
      await tick();
      this.drainRolls();
    }
    // ⚠ The step that lands can leave a course behind (arrival cleared by a
    // different reader than the one that set it). A player would see the
    // travel row still lit — that is a break in its own right.
    if (get().player?.travelTarget?.locationId === locationId) {
      this.breaks.push(`arrived on ${locationId} (${why}) but the travel row still shows a course to it`);
      get().stopTravel();
    }
    return true;
  }

  async enterOutpost(): Promise<boolean> {
    // The gate holds its truce: whatever closed on you at the tile is dealt
    // with first, as the Arbiter says ("Not with blades out").
    if (this.enemiesUp() > 0 && !(await this.fightOut('at the outpost gate'))) return false;
    if (get().player?.hubRoomId) {
      // Already inside (the opening leaves a new character standing in the
      // gate room, and the opening scene seats nobody at the gate). A player
      // steps out and back in — EXIT, then ENTER OUTPOST.
      this.tap('EXIT');
      await this.type('leave outpost');
      if (get().player?.hubRoomId) {
        this.breaks.push(`EXIT from ${get().player?.hubRoomId} at ${get().player?.currentLocationId} did not leave the outpost. last lines:\n${this.lastLines(4)}`);
        return false;
      }
    }
    this.tap('ENTER OUTPOST');
    await this.type('enter outpost');
    const st = get();
    if (!st.player?.hubRoomId) {
      this.breaks.push(`ENTER OUTPOST at ${st.player?.currentLocationId} did not open the gate. last lines:\n${this.lastLines(4)}`);
      return false;
    }
    if (st.currentScene?.vendor?.id !== CONTRACT_BROKER_VENDOR_ID) {
      this.breaks.push(`inside ${st.player.currentLocationId}, gate room ${st.player.hubRoomId}: expected Halem at the gate, scene vendor is ${st.currentScene?.vendor?.name ?? 'nobody'}`);
      return false;
    }
    return true;
  }

  // ── combat ───────────────────────────────────────────────────────────────
  async fightOut(why: string): Promise<boolean> {
    let rounds = 0;
    let coup = false;
    while (this.enemiesUp() > 0) {
      rounds += 1;
      if (rounds > 90) {
        this.breaks.push(`fight ${why} would not end after 90 rounds (${this.enemiesUp()} still up). last lines:\n${this.lastLines(4)}`);
        return false;
      }
      if (rounds > 60 && !coup) {
        coup = true;
        this.allowances.add('coup de grâce after 60 rounds');
        const sc = get().currentScene!;
        store.setState({ currentScene: { ...sc, enemyHps: sc.enemyHps.map((h) => (h > 0 ? 1 : h)) } });
      }
      this.topUp();
      this.dismissCards();
      this.drainRolls();
      const sc = get().currentScene!;
      if (sc.range && sc.range !== 'close') {
        // The APPROACH chip opens a picker of what is in front of you; the
        // pick submits "approach <name>".
        const idx = sc.enemies.findIndex((_, i) => (sc.enemyHps[i] ?? 0) > 0 && !(sc.enemyKnockedOut?.[i] ?? false));
        const name = sc.enemies[idx]?.name ?? '';
        this.tap(`approach ${name}`);
        await this.type(`approach ${name}`);
        if (this.enemiesUp() === 0) break;
      }
      this.tap('attack');
      const before = this.feedMark();
      await this.type('attack');
      // The Arbiter's own instruction when the ACTIVE target is out of reach
      // while the scene as a whole reads close ("you're at mid-range. ADVANCE
      // to close in"): a player taps APPROACH on that one. Second catalogue
      // pass: ninety refused swings at a Mud Elemental Spawn nobody approached.
      if (this.feedSince(before).some((l) => /ADVANCE to close in|need to close/i.test(l))) {
        const live = get().currentScene!;
        const target = live.enemies[live.activeEnemyIdx]?.name ?? live.enemies[0]?.name ?? '';
        this.tap(`approach ${target}`);
        await this.type(`approach ${target}`);
      }
    }
    this.dismissCards();
    return true;
  }

  // ── the surfaces ─────────────────────────────────────────────────────────
  pin(): { anchorId: string; ready: boolean } | null {
    const m = openContractMarkers(get().player).find((x) => x.key === `${this.family}:${this.def.id}`);
    return m ? { anchorId: m.anchorId, ready: !!(m as { ready?: boolean }).ready } : null;
  }

  /** The line the feed printed when the boots landed on the mission's ground. */
  arrivalLine(sinceMark: number): string | null {
    const head = `▸ ${this.def.title}: this is the place`;
    // ⚠ Only since the mark — a wider search re-read the PREVIOUS stage's
    // arrival line on a same-ground beat and typed its verb back (the walker's
    // own version of the owner's "doing what it says and nothing pays").
    const recent = this.feedSince(sinceMark);
    return [...recent].reverse().find((l) => l.startsWith(head)) ?? null;
  }

  /** What the arrival line told the player to DO, in the line's own words. */
  askFrom(fullLine: string): string | null {
    // ⚠ The arrival line can share a feed ENTRY with the scene paragraph that
    // follows it (the walker's first catalogue run typed the whole paragraph).
    // A player reads the first line; so does this.
    const line = fullLine.split('\n')[0]!;
    let rest = line.slice(`▸ ${this.def.title}: this is the place`.length);
    rest = rest.replace(/\s+Outside the walls — the outpost holds its truce\.$/, '');
    rest = rest.replace(/\s*\(you still need [^)]*\)/, '');
    rest = rest.replace(/\.$/, '');
    const parts = rest.split(' — ').map((s) => s.trim()).filter(Boolean);
    // "find <npc>" is a direction, not an action; the action is the other clause.
    const action = parts.find((p) => !/^find /.test(p));
    return action ?? null;
  }

  /** The "▸ Next: … · <ask> · bring …" line a close prints — the freshest
   *  instruction the player holds when the next beat is on the same ground
   *  (no arrival happens, so no arrival line). ⚠ It does not name the mission;
   *  with two contracts live a player could not tell whose it is. */
  directionLine(sinceMark: number): string | null {
    const head = `▸ ${this.def.title}:`;
    const lines = this.feedSince(sinceMark).filter((l) => l.startsWith('▸ ') && !l.startsWith(head));
    return lines.length ? lines[lines.length - 1]! : null;
  }

  askFromDirection(fullLine: string): string | null {
    const body = fullLine.split('\n')[0]!.slice(2).replace(/\.$/, '');
    const parts = body.split(' · ').map((s) => s.trim()).filter(Boolean);
    const action = parts.find((p) => !/^(Next: |bring |find )/.test(p));
    return action ?? null;
  }

  contractsLabel(stageIdx: number): string | null {
    const st = this.def.stages[stageIdx];
    if (!st) return null;
    return this.family === 'hunt'
      ? checkKindLabel(st.checkKind as never)
      : stageVerbLabel(this.family, st as never);
  }

  // ── the play ─────────────────────────────────────────────────────────────
  /** ⚠ WHERE A POSTING IS TAKEN — measured on the first catalogue run. Halem
   *  at every gate takes hand-ins for any faction (OTA-1201) but POSTS only
   *  the open, faction-less work; a faction's own postings come from its own
   *  vendors, or from the Hidden Market's stalls, which broker every faction's
   *  board (OTA-782, `isBrokerVendorId`). So: neutral work at the nearest
   *  gate, faction work at the Market — the two doors a player actually has. */
  async acceptAtMarket(): Promise<boolean> {
    if (!(await this.walkTo('hidden_market', 'to the Hidden Market to take the posting'))) return false;
    if (this.enemiesUp() > 0 && !(await this.fightOut('at the market'))) return false;
    if (get().player?.hubRoomId) { this.tap('EXIT'); await this.type('leave outpost'); }
    if (get().activeBuildingId !== 'market') {
      this.tap('ENTER (the market)');
      get().enterBuilding('market');
      await tick();
      if (get().activeBuildingId !== 'market') {
        this.breaks.push(`ENTER at the Hidden Market did not open the market. last lines:\n${this.lastLines(4)}`);
        return false;
      }
    }
    this.tap('stall: WEAPONS');
    get().goBuildingRoom('weapons_stall');
    await tick();
    const v = get().currentScene?.vendor;
    if (!v || !v.id.startsWith('hidden_market_')) {
      this.breaks.push(`at the Hidden Market weapons stall, no broker stands there (vendor: ${v?.name ?? 'nobody'})`);
      return false;
    }
    // The VendorScreen opened on the stall; the posting is on its board.
    get().setScreen('exploration');
    return true;
  }

  async accept(): Promise<boolean> {
    let door: string;
    if (this.def.factionId === null) {
      const hub = this.nearestHub();
      door = `Halem's gate (${hub})`;
      if (!(await this.walkTo(hub, 'to an outpost gate to take the posting'))) return false;
      if (!(await this.enterOutpost())) return false;
    } else {
      door = 'the Hidden Market stall';
      if (!(await this.acceptAtMarket())) return false;
    }
    this.tap(`ACCEPT "${this.def.title}"`);
    const mark = this.feedMark();
    if (this.family === 'hunt') get().acceptHunt(this.def.title);
    else if (this.family === 'mystery') get().acceptMystery(this.def.title);
    else get().acceptStoryline(this.def.title);
    await tick();
    const rec = this.record();
    if (!rec) {
      this.breaks.push(`ACCEPT at ${door} refused. feed:\n${this.feedSince(mark).map((l) => `  | ${l}`).join('\n')}`);
      return false;
    }
    this.prevCloseMark = mark;
    if (get().activeBuildingId) { this.tap('EXIT (the market)'); get().exitBuilding(); await tick(); }
    if (rec.tracked === false) {
      this.tap('ACTIVATE');
      const p = get().player!;
      const bump = <T extends { id: string; tracked?: boolean }>(l: T[] | undefined) => (l ?? []).map((r) => (r.id === this.def.id ? { ...r, tracked: true } : r));
      store.setState({
        player: {
          ...p,
          activeHunts: this.family === 'hunt' ? bump(p.activeHunts) : p.activeHunts,
          activeMysteries: this.family === 'mystery' ? bump(p.activeMysteries) : p.activeMysteries,
          activeStorylines: this.family === 'storyline' ? bump(p.activeStorylines) : p.activeStorylines,
        } as never,
      });
    }
    return true;
  }

  async playStage(): Promise<boolean> {
    const s = this.stage();
    const note: StageNote = { stage: s, ground: '', arrivalLine: null, typed: null, via: 'none', closeCard: null, closeFeed: [] };
    this.stages.push(note);
    this.dismissCards();

    const pin = this.pin();
    if (!pin) {
      this.breaks.push(`stage ${s}: the Contracts screen shows no pin for this mission`);
      return false;
    }
    note.ground = pin.anchorId;
    const arriveMark = this.feedMark();
    const cardsBefore = this.cardsSeen.length;
    let walked = false;
    if (!this.onCell(pin.anchorId)) {
      walked = true;
      if (!(await this.walkTo(pin.anchorId, `stage ${s}`))) return false;
    }
    if (this.stage() > s) { // arriving paid the stage (an arm, an arrival heal) — read the close
      note.via = 'fight';
      return this.afterClose(s, note, arriveMark, cardsBefore);
    }
    // Something stood up on arrival (an armed spawn, the apex): deal with it.
    if (this.enemiesUp() > 0) {
      note.via = 'fight';
      if (!(await this.fightOut(`stage ${s} on arrival`))) return false;
      if (this.stage() > s) return this.afterClose(s, note, arriveMark, cardsBefore);
    }
    // The card door.
    const card = armedEncounter(get().player);
    if (card && card.key === `${this.family}:${this.def.id}:${s}`) {
      const enc = get().player!.missionEncounters?.[card.key] ?? freshEncounter(card.key);
      const offered = choicesFor(enc, { hasFight: card.hasFight, canPersuade: card.canPersuade, canKill: card.person.canKill });
      const forward = offered.find((c) => c !== 'flee');
      if (!forward) {
        this.breaks.push(`stage ${s}: the conversation card with ${card.person.name} offers no way forward (${offered.join('/')}); owed=${card.owed ?? 'nothing'}`);
        return false;
      }
      note.via = 'card';
      const closeMark = this.feedMark();
      this.tap(`card: ${forward.toUpperCase()}`);
      get().answerMissionEncounter(forward as never);
      await settle(() => this.stage() > s || this.enemiesUp() > 0, 3000);
      this.drainRolls();
      if (this.enemiesUp() > 0 && !(await this.fightOut(`stage ${s} from the card`))) return false;
      await settle(() => this.stage() > s, 3000);
      if (this.stage() <= s) {
        this.breaks.push(`stage ${s}: answered the card (${forward}) and the stage did not move. last lines:\n${this.lastLines(5)}`);
        return false;
      }
      return this.afterClose(s, note, closeMark, cardsBefore);
    }
    // The typed door: the game's own words — the arrival line if the boots
    // landed here (a close's auto-route can land them before this stage even
    // starts, so the search reaches back to the previous close), else the
    // direction line the last close printed.
    // ⚠ Whichever "▸" line is LOWEST on the screen is the instruction — the
    // second catalogue pass typed a stale arrival line's verb ("strike") on
    // a same-ground beat whose close had printed "▸ search this ground"
    // underneath it. A player reads the bottom of the feed; so does this.
    let line = this.arrivalLine(this.prevCloseMark);
    let dir = this.directionLine(this.prevCloseMark);
    if (line && dir) {
      const since = this.feedSince(this.prevCloseMark);
      if (since.lastIndexOf(dir) > since.lastIndexOf(line)) line = null; else dir = null;
    }
    note.arrivalLine = line ?? (dir ? `(direction) ${dir}` : null);
    let ask = line ? this.askFrom(line) : dir ? this.askFromDirection(dir) : null;
    if (!line && !dir) {
      this.breaks.push(`stage ${s}: standing on ${pin.anchorId}${walked ? ' after walking there' : ''} and nothing on screen says what to do — no "▸ ${this.def.title}: this is the place" line, no "▸ Next" line. feed since the last close:\n${this.feedSince(this.prevCloseMark).slice(-16).map((l) => `  | ${l}`).join('\n')}`);
      ask = this.contractsLabel(s);
      if (!ask) return false;
      note.via = 'label-fallback';
    } else if (!line && walked) {
      this.breaks.push(`stage ${s}: walked onto ${pin.anchorId} and no "▸ ${this.def.title}: this is the place" line was printed (only the earlier "▸ Next" line). feed since arrival:\n${this.feedSince(arriveMark).slice(-14).map((l) => `  | ${l}`).join('\n')}`);
    }
    if (!ask) {
      // A verbless beat: the game should have moved it on its own.
      const moved = await settle(() => this.stage() > s, 1500);
      if (!moved) {
        this.breaks.push(`stage ${s}: the arrival line named no action ("${line}") and the stage did not move on its own`);
        return false;
      }
      return this.afterClose(s, note, arriveMark, cardsBefore);
    }
    note.typed = ask;
    if (note.via === 'none') note.via = 'typed';
    const closeMark = this.feedMark();
    this.tap(`type "${ask}"`);
    await this.type(ask);
    await settle(() => this.stage() > s || this.enemiesUp() > 0, 2500);
    if (this.enemiesUp() > 0) {
      if (!(await this.fightOut(`stage ${s} after typing "${ask}"`))) return false;
      await settle(() => this.stage() > s, 2500);
    }
    if (this.stage() <= s) {
      // One more try with what the Contracts screen prints under "Advance by".
      const label = this.contractsLabel(s);
      if (label && label !== ask) {
        this.tap(`type "${label}" (the Contracts label)`);
        await this.type(label);
        await settle(() => this.stage() > s || this.enemiesUp() > 0, 2500);
        if (this.enemiesUp() > 0) {
          if (!(await this.fightOut(`stage ${s} after typing "${label}"`))) return false;
          await settle(() => this.stage() > s, 2500);
        }
        if (this.stage() > s) {
          this.breaks.push(`stage ${s}: the arrival line said "${ask}" and it did NOT pay; the Contracts label "${label}" did`);
          note.via = 'label-fallback';
          return this.afterClose(s, note, closeMark, cardsBefore);
        }
      }
      this.breaks.push(`stage ${s}: typed "${ask}" (the arrival line's own words) on ${pin.anchorId} and nothing paid. feed since:\n${this.feedSince(closeMark).slice(-8).map((l) => `  | ${l}`).join('\n')}`);
      return false;
    }
    return this.afterClose(s, note, closeMark, cardsBefore);
  }

  /** The close: what popped, what the feed said. The owner's rule is a card on every one. */
  afterClose(s: number, note: StageNote, mark: number, cardsBefore: number): boolean {
    note.closeFeed = this.feedSince(mark).slice(-10);
    this.dismissCards();
    // The close's own "▸ Next" line is printed DURING the close — the next
    // stage's instruction search starts from where this close began.
    this.prevCloseMark = mark;
    // A CLOSE card is a CONTINUE card, or a FIGHT card that carries a next
    // line (a stage that stood bodies up and closed in the same breath). A
    // bare FIGHT card is the stand-up, not the close.
    const seen = this.cardsSeen.slice(cardsBefore);
    const closeCards = seen.filter((c) => c.startsWith('[CONTINUE card]') || (c.startsWith('[FIGHT card]') && c.includes(' ▸ ')));
    if (closeCards.length === 0) {
      const done = this.stage() >= this.def.stages.length;
      this.breaks.push(`stage ${s} closed ${done ? '(mission complete) ' : ''}with NO card — feed-only:\n${note.closeFeed.map((l) => `  | ${l}`).join('\n')}`);
      note.closeCard = seen.length ? `(only: ${seen.join(' || ')})` : null;
    } else {
      note.closeCard = closeCards.join(' || ');
    }
    return true;
  }

  async turnIn(): Promise<boolean> {
    const pin = this.pin();
    if (!pin) { this.breaks.push('finished, and the Contracts screen shows no pin to hand it in'); return false; }
    if (!pin.ready) this.breaks.push(`finished, but the pin is not marked READY (points at ${pin.anchorId})`);
    if (!(await this.walkTo(pin.anchorId, 'to hand it in'))) return false;
    if (!(await this.enterOutpost())) return false;
    const tc0 = get().player!.tc ?? 0;
    const mark = this.feedMark();
    this.tap(`TURN IN "${this.def.title}"`);
    if (this.family === 'hunt') get().turnInHunt(this.def.id);
    else if (this.family === 'mystery') get().turnInMystery(this.def.id);
    else get().turnInStoryline(this.def.id);
    await settle(() => !this.record(), 2000);
    if (this.record()) {
      this.breaks.push(`TURN IN at Halem's gate (${pin.anchorId}) refused. feed:\n${this.feedSince(mark).map((l) => `  | ${l}`).join('\n')}`);
      return false;
    }
    if ((get().player!.tc ?? 0) <= tc0) this.breaks.push('handed in and the purse did not move');
    this.dismissCards();
    return true;
  }

  async play(): Promise<WalkReport> {
    const done = (): WalkReport => ({
      family: this.family, id: this.def.id, title: this.def.title,
      outcome: this.breaks.length === 0 ? 'complete' : 'broken',
      breaks: this.breaks, allowances: [...this.allowances], stages: this.stages, taps: this.taps,
    });
    if (!(await this.accept())) return done();
    let guard = 0;
    while (this.stage() < this.def.stages.length) {
      if (guard++ > this.def.stages.length + 6) {
        this.breaks.push(`did not converge — stuck at stage ${this.stage()}`);
        return done();
      }
      if (!this.record()) { this.breaks.push('the record left the slate mid-mission'); return done(); }
      if (!(await this.playStage())) return done();
    }
    await this.turnIn();
    return done();
  }
}

/** A fresh slate for one mission on the one long-lived character. */
export function resetForMission(): void {
  const p = get().player!;
  const questless = p.inventory.filter((i) => !(i.tags ?? []).includes('quest') && !(i.tags ?? []).includes('mission'));
  store.setState({
    player: {
      ...p,
      hp: 600, hpMax: 600, stamina: p.staminaMax ?? 50,
      stats: { ...p.stats, strength: 20, dexterity: 20 },
      factionStanding: FACTIONS.map((f) => ({ factionId: f.id, standing: 100 })),
      activeHunts: [], activeMysteries: [], activeStorylines: [],
      missionEncounters: {}, travelTarget: undefined, whisperCourse: null, routedMission: null,
      inventory: questless,
      tc: 0,
    } as never,
    pendingMissionStinger: null,
    pendingMissionBeat: null,
    pendingTravelConfirm: null,
  });
  const sc = get().currentScene;
  if (sc) store.setState({ currentScene: { ...sc, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never });
}

export async function playMission(family: WalkFamily, def: MissionLike): Promise<WalkReport> {
  resetForMission();
  const w = new Walker(family, def);
  w.allowances.add('HP 600 / STR 20 / DEX 20 / standing 100 with every faction');
  const r = await w.play();
  if (process.env.PLAYER_WALKER_FEED === '1') r.feed = [...w.feed()];
  return r;
}

export function formatReport(r: WalkReport): string {
  const head = `${r.outcome === 'complete' ? 'OK  ' : 'BRK '} ${r.family}:${r.id} — ${r.title} (${r.stages.length} stages played, ${r.taps} taps)`;
  const stages = r.stages.map((s) =>
    `    stage ${s.stage} @${s.ground} via=${s.via}${s.typed ? ` typed="${s.typed}"` : ''}${s.arrivalLine ? `\n      arrival: ${s.arrivalLine}` : ''}${s.closeCard ? `\n      card: ${s.closeCard}` : ''}`);
  const breaks = r.breaks.map((b) => `    ✗ ${b.split('\n').join('\n      ')}`);
  const feed = r.feed ? ['    ── feed ──', ...r.feed.map((l) => `    | ${l.split('\n').join('\n    |   ')}`)] : [];
  return [head, ...stages, ...breaks, `    allowances: ${r.allowances.join('; ')}`, ...feed].join('\n');
}

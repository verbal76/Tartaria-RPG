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

import { createHash } from 'node:crypto';
import { useGameStore, setHomeworkTick } from '../app/state/gameStore';
import type { GameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS, findHuntById, checkKindLabel } from '../app/engine/hunts';
import { MYSTERIES, findMysteryById } from '../app/engine/mysteries';
import { STORYLINES, findStorylineById } from '../app/engine/factionStorylines';
import { FACTIONS } from '../app/engine/factions';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { openContractMarkers } from '../app/engine/contractMarkers';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter } from '../app/engine/missionEncounter';
import { stageVerbLabel, type MissionFamily } from '../app/engine/questStage';
import { hubLocationIds, hubFirstStepToward, findHubRoom } from '../app/engine/hub';
import { CHAINS, describeWhisperStage, whisperRouteTarget, pickTargetTile, isHourInWindow, type ChainDef } from '../app/engine/whispers';
import type { WhisperRecord } from '../app/engine/types';
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
  family: WalkFamily | 'faction' | 'whisper';
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

/* ⚠⚠⚠ DEBT #54 — A WAIT MEASURED IN MILLISECONDS IS A DECISION MADE BY THE CPU.
 *
 * This used to be `while (!pred() && Date.now() - t0 < deadlineMs)`. Its RETURN
 * VALUE is load-bearing — `const moved = await settle(...)` at the road fork
 * picks a different branch when it comes back false — so on a machine that
 * hiccuped, the walker took another road and reported another walk. That is the
 * last input a replay token cannot carry: not the seed, not the world, the
 * clock.
 *
 * ⚠ MEASURED. With the seed anchored and the homework interval disarmed, the
 * SAME prefix command run twice still gave `hunt_mud_titan` 1,060 taps and then
 * 785 — and 785 is exactly what the full run walked. So the replay was not
 * wrong, it was a coin toss, and the coin was how fast this box happened to be.
 *
 * The fix is to count POLLS instead of milliseconds. Each poll still yields to
 * the event loop, so the engine's own promises and timers get exactly as many
 * turns to finish as they did before; what changes is that a slow machine now
 * waits longer in real time rather than giving up earlier. The poll budget is
 * the old deadline at the old poll interval, so no wait got shorter.
 *
 * ⚠ This is the harness, not the game. No probability, no product timer and no
 * engine behaviour is touched — only how long the test agrees to keep looking. */
const SETTLE_POLL_MS = 12;
async function settle(pred: () => boolean, deadlineMs = 4000): Promise<boolean> {
  const polls = Math.max(1, Math.ceil(deadlineMs / SETTLE_POLL_MS));
  for (let i = 0; i < polls; i++) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, SETTLE_POLL_MS));
  }
  return pred();
}

const tick = () => new Promise((r) => setTimeout(r, 40));

export class Walker {
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
    // ⚠⚠ THE ABORT TOKEN. Jest cannot cancel a promise: a road that outran the
    // test timeout kept walking while the next hunt's test began, and two walkers
    // drove ONE store — the 1699 sweep's five-hunt cascade ("ENTER OUTPOST did
    // not open the gate" a breath after "You cross to the gate and step through":
    // the abandoned road's SET COURSE had cleared the room). A sweep that gives
    // up on a road flips this flag; the next tap throws the road out.
    if (walkerControl.abort) throw new WalkerAborted(`road abandoned at tap "${label}"`);
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

  /** ⚠ The 1699 sweep's cascade (five hunts broken at a gate after one finished
   *  inside an outpost) could not be read from four feed lines: the break never
   *  said where the boots were. This does. */
  whereAmI(): string {
    const st = get();
    const p = st.player;
    if (!p) return '[no player]';
    const g = playerGridCell(p);
    const sc = st.currentScene;
    const field = (sc?.enemies ?? []).map((e, i) => `${e.name}:${sc!.enemyHps[i] ?? '?'}`).join(',') || 'empty';
    return `[at ${p.currentLocationId} cell=${g.x},${g.y} map=${p.mapX ?? '-'},${p.mapY ?? '-'} room=${p.hubRoomId ?? '-'} bldg=${st.activeBuildingId ?? '-'} course=${p.travelTarget?.locationId ?? '-'} confirm=${st.pendingTravelConfirm ? 'yes' : '-'} field=[${field}] screen=${st.currentScreen}]`;
  }

  async enterOutpost(): Promise<boolean> {
    // The gate holds its truce: whatever closed on you at the tile is dealt
    // with first, as the Arbiter says ("Not with blades out").
    if (this.enemiesUp() > 0 && !(await this.fightOut('at the outpost gate'))) return false;
    if (get().player?.hubRoomId) {
      // Already inside (the opening leaves a new character standing in the
      // gate room, and the opening scene seats nobody at the gate). A player
      // steps out and back in — EXIT, then ENTER OUTPOST. Leaving is a
      // travel and travel costs stamina; a player would rest first.
      this.restByFiat();
      this.tap('EXIT');
      await this.type('leave outpost');
      if (get().player?.hubRoomId) {
        this.breaks.push(`EXIT from ${get().player?.hubRoomId} at ${get().player?.currentLocationId} did not leave the outpost. ${this.whereAmI()} last lines:\n${this.lastLines(4)}`);
        return false;
      }
    }
    this.tap('ENTER OUTPOST');
    await this.type('enter outpost');
    const st = get();
    if (!st.player?.hubRoomId) {
      this.breaks.push(`ENTER OUTPOST at ${st.player?.currentLocationId} did not open the gate. ${this.whereAmI()} last lines:\n${this.lastLines(4)}`);
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
        // Raw log with the debug channel: the `move:` lines say what the
        // approach did (intermittent on the catalogue pass, clean solo).
        const raw = get().gameLog.slice(-14).map((e) => `[${e.channel}] ${e.text.split('\n')[0]}`).join('\n');
        this.breaks.push(`fight ${why} would not end after 90 rounds (${this.enemiesUp()} still up). range=${get().currentScene?.range} raw log:\n${raw}`);
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
        // Under heavy weather one approach is a partial step (runMoveCombatRange
        // ticks toward a cost); a player keeps tapping until the gap closes.
        for (let k = 0; k < 3; k++) {
          const live = get().currentScene!;
          const target = live.enemies[live.activeEnemyIdx]?.name ?? live.enemies[0]?.name ?? '';
          const m = this.feedMark();
          this.tap(`approach ${target}`);
          await this.type(`approach ${target}`);
          if (this.feedSince(m).some((l) => /close the gap|already at close/i.test(l))) break;
        }
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
      // The Contracts screen's ACTIVATE button — the same store action it calls.
      this.tap('ACTIVATE');
      get().setContractActive(this.family, this.def.id, true);
      if (this.record()?.tracked === false) {
        this.breaks.push(`ACTIVATE on "${this.def.title}" left it paused. last lines:\n${this.lastLines(3)}`);
        return false;
      }
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
/** ⚠ One flag, read at every tap (Walker.tap): a sweep that abandons a road sets
 *  it, the road's next tap throws WalkerAborted, and the sweep clears it before
 *  the next road. Without this two roads share one store. */
export const walkerControl = { abort: false };
export class WalkerAborted extends Error {}

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

// ── THE FOURTH FAMILY: faction quests ──────────────────────────────────────
// Staged faction quests are counters ("Defeat 3 enemies", "Travel 5 times",
// "Steal successfully from any vendor", "Reach 100 TC"). The player reads the
// OBJECTIVE on the Contracts card and does that thing in the world; the game
// ticks a stage on each deed. The walker reads the same sentence.

export interface FactionQuestLike {
  id: string;
  title: string;
  factionId: string;
  objective: string;
  targetLocationName?: string;
  tcThreshold?: number;
  stages?: ReadonlyArray<{ narration: string; advanceOn?: string }>;
}

export const ALL_FACTION_QUESTS: FactionQuestLike[] = (FACTION_QUESTS as unknown as FactionQuestLike[])
  .filter((q) => (q.stages?.length ?? 0) > 0);

type Deed = 'kill' | 'travel' | 'steal' | 'any';

/** What the objective sentence asks for, read the way a player reads it. */
export function deedFromObjective(objective: string): Deed {
  const o = objective.toLowerCase();
  if (/\b(defeat|destroy|eliminate|clear|break|drive off|cut through|scatter|recover|kill|slay|hunt)\b/.test(o)) return 'kill';
  if (/\b(steal|pinch|lift|pickpocket)\b/.test(o)) return 'steal';
  if (/\b(travel|discover|reach the|go to|journey)\b/.test(o)) return 'travel';
  return 'any';
}

class FactionWalker extends Walker {
  readonly fq: FactionQuestLike;
  constructor(def: FactionQuestLike) {
    super('hunt', { id: def.id, title: def.title, factionId: def.factionId, stages: [] });
    this.fq = def;
  }

  fqRecord(): { id: string; stage: number; tracked?: boolean } | undefined {
    return (get().player?.activeFactionQuests ?? []).find((r) => r.id === this.fq.id);
  }
  fqStage(): number { return this.fqRecord()?.stage ?? -1; }
  fqTotal(): number { return this.fq.stages?.length ?? 0; }

  async acceptFq(): Promise<boolean> {
    if (!(await this.acceptAtMarket())) return false;
    this.tap(`ACCEPT "${this.fq.title}"`);
    const mark = this.feedMark();
    get().acceptFactionQuest(this.fq.title);
    await tick();
    if (!this.fqRecord()) {
      this.breaks.push(`ACCEPT at the Hidden Market stall refused. feed:\n${this.feedSince(mark).map((l) => `  | ${l}`).join('\n')}`);
      return false;
    }
    this.prevCloseMark = mark;
    if (get().activeBuildingId) { this.tap('EXIT (the market)'); get().exitBuilding(); await tick(); }
    if (this.fqRecord()?.tracked === false) {
      this.tap('ACTIVATE');
      get().setContractActive('faction_quest', this.fq.id, true);
      if (this.fqRecord()?.tracked === false) { this.breaks.push(`ACTIVATE on "${this.fq.title}" left it paused`); return false; }
    }
    return true;
  }

  /** Walk open ground until something stands up, then put it down. */
  async findAFight(): Promise<boolean> {
    // Fresh ground each step — a tile rolls its encounter once, so a square
    // walk re-treads rolled tiles (the first smoke walked 38 tiles in a box).
    // Fifteen tiles a leg, turning; and out of any building the road put us in.
    const dirs = ['north', 'east', 'south', 'west'];
    for (let i = 0; i < 80; i++) {
      if (this.enemiesUp() > 0) return this.fightOut('for the contract');
      this.dismissCards();
      this.restByFiat();
      if (get().player?.hubRoomId) { this.tap('EXIT'); await this.type('leave outpost'); }
      if (get().activeBuildingId) { this.tap('EXIT (building)'); get().exitBuilding(); await tick(); }
      const d = dirs[Math.floor(i / 15) % 4]!;
      this.tap(d.toUpperCase());
      await this.type(`go ${d}`);
    }
    this.breaks.push('walked eighty tiles looking for a fight and nothing stood up');
    return false;
  }

  /** One named tile away and back is one "travel" — the game counts arrivals. */
  async travelOnce(): Promise<boolean> {
    const p = get().player!;
    const g = playerGridCell(p);
    // A named location other than the one under the boots, nearest first.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { allKnownLocations } = require('../app/engine/worldMap') as typeof import('../app/engine/worldMap');
    const ids: readonly string[] = allKnownLocations().map((l) => l.id);
    const best = ids
      .filter((id) => !this.onCell(id))
      .map((id) => ({ id, d: canonicalDistanceFromGrid(g.x, g.y, id) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!best) { this.breaks.push('no named location to travel to'); return false; }
    return this.walkTo(best.id, 'for the contract (a travel)');
  }

  async doDeed(deed: Deed, s: number): Promise<boolean> {
    switch (deed) {
      case 'kill': return this.findAFight();
      case 'travel': {
        // The final travel of a destination quest has to land at the named place.
        const last = s === this.fqTotal() - 1;
        if (last && this.fq.targetLocationName) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { resolvePosterLocation } = require('../app/engine/contractMarkers') as typeof import('../app/engine/contractMarkers');
          const dest = resolvePosterLocation(this.fq.targetLocationName);
          if (dest) return this.walkTo(dest, `to ${this.fq.targetLocationName} (the objective names it)`);
        }
        return this.travelOnce();
      }
      case 'steal': {
        // The PICKPOCKET chip on a vendor — Halem at the nearest gate.
        this.allowances.add('STE 20 for the pinch');
        const p = get().player!;
        store.setState({ player: { ...p, stats: { ...p.stats, stealth: 20 } } as never });
        const hub = this.nearestHub();
        if (!(await this.walkTo(hub, 'to a gate to find a vendor to pinch'))) return false;
        if (!(await this.enterOutpost())) return false;
        const mark = get().currentScene?.vendor?.name ?? '';
        for (let tries = 0; tries < 4; tries++) {
          this.tap(`pickpocket ${mark}`);
          get().pickpocketPerson(mark);
          await tick();
          this.drainRolls();
          if (this.enemiesUp() > 0 && !(await this.fightOut('caught with a hand in a pocket'))) return false;
          if (this.fqStage() > s) return true;
          if (!get().currentScene?.vendor) break;
        }
        this.breaks.push(`pickpocketing ${mark} four times did not tick the contract. last lines:\n${this.lastLines(5)}`);
        return false;
      }
      default:
        // "any" is any of the three DEEDS (kill / travel / steal), not any
        // action — the quest machine only hears those three. A travel is the
        // cheapest of them.
        return this.travelOnce();
    }
  }

  async playFq(): Promise<WalkReport> {
    const done = (): WalkReport => ({
      family: 'hunt', id: this.fq.id, title: this.fq.title,
      outcome: this.breaks.length === 0 ? 'complete' : 'broken',
      breaks: this.breaks, allowances: [...this.allowances], stages: this.stages, taps: this.taps,
    });
    if (!(await this.acceptFq())) return done();
    const deed = deedFromObjective(this.fq.objective);
    let guard = 0;
    while (this.fqStage() < this.fqTotal()) {
      const s = this.fqStage();
      if (guard++ > this.fqTotal() * 3 + 4) { this.breaks.push(`did not converge — stuck at stage ${s} of ${this.fqTotal()} (deed: ${deed})`); return done(); }
      const note: StageNote = { stage: s, ground: get().player?.currentLocationId ?? '', arrivalLine: `(objective) ${this.fq.objective}`, typed: deed, via: 'typed', closeCard: null, closeFeed: [] };
      this.stages.push(note);
      const cardsBefore = this.cardsSeen.length;
      const mark = this.feedMark();
      if (this.fq.tcThreshold && s === this.fqTotal() - 1 && (get().player?.tc ?? 0) < this.fq.tcThreshold) {
        this.allowances.add(`purse set to ${this.fq.tcThreshold} TC for the wealth gate`);
        store.setState({ player: { ...get().player!, tc: this.fq.tcThreshold } as never });
      }
      if (!(await this.doDeed(deed, s))) return done();
      await settle(() => this.fqStage() > s, 1500);
      if (this.fqStage() <= s) {
        // A counter that did not tick on the deed the sentence asked for.
        this.breaks.push(`stage ${s}: did "${deed}" as the objective ("${this.fq.objective}") asks and the contract did not move. feed since:\n${this.feedSince(mark).slice(-8).map((l) => `  | ${l}`).join('\n')}`);
        return done();
      }
      this.afterClose(s, note, mark, cardsBefore);
    }
    // Hand in at Halem's gate — the broker takes any faction's work.
    const hub = this.nearestHub();
    const tcBeforeWalk = get().player!.tc ?? 0;
    if (!(await this.walkTo(hub, 'to hand it in'))) return done();
    if (!this.fqRecord()) {
      // The hub is this faction's own ground: arriving at the gate hands the
      // contract in by itself (OTA-617), with its "Contract Turned In" card.
      // A player sees the card and is paid; nothing left to type.
      if ((get().player!.tc ?? 0) <= tcBeforeWalk) this.breaks.push(`the contract left the slate on arrival at ${hub} and the purse did not move`);
      this.dismissCards();
      return done();
    }
    if (!(await this.enterOutpost())) return done();
    const tc0 = get().player!.tc ?? 0;
    const mark = this.feedMark();
    this.tap(`TURN IN "${this.fq.title}"`);
    get().turnInFactionQuest(this.fq.id);
    await settle(() => !this.fqRecord(), 2000);
    if (this.fqRecord()) this.breaks.push(`TURN IN at Halem's gate (${hub}) refused. feed:\n${this.feedSince(mark).map((l) => `  | ${l}`).join('\n')}`);
    else if ((get().player!.tc ?? 0) <= tc0) this.breaks.push('handed in and the purse did not move');
    this.dismissCards();
    return done();
  }
}

export async function playFactionQuest(def: FactionQuestLike): Promise<WalkReport> {
  resetForMission();
  const w = new FactionWalker(def);
  w.allowances.add('HP 600 / STR 20 / DEX 20 / standing 100 with every faction');
  const r = await w.playFq();
  r.family = 'hunt';
  (r as { family: string }).family = 'faction';
  if (process.env.PLAYER_WALKER_FEED === '1') r.feed = [...w.feed()];
  return r;
}

// ── THE FIFTH FAMILY: whisper chains ───────────────────────────────────────
// A whisper is overheard in an outpost room (the plant), followed by SET
// COURSE to a camp, answered from the SPEAK TO bar, chased to a mark's tile,
// fought, carried back and handed over. The player's surface for every leg is
// the WHISPERS panel line (describeWhisperStage) and its SET COURSE button.

export const ALL_WHISPER_CHAINS: ChainDef[] = [...CHAINS];

class WhisperWalker extends Walker {
  readonly chain: ChainDef;
  constructor(chain: ChainDef) {
    super('hunt', { id: chain.id, title: chain.title, factionId: null, stages: [] });
    this.chain = chain;
  }

  rec(): WhisperRecord | undefined {
    return (get().player?.activeWhispers ?? []).find((w) => w.id === this.chain.id);
  }
  stageName(): string {
    return this.rec()?.stage ?? ((get().player?.completedWhisperIds ?? []).includes(this.chain.id) ? 'done' : '-');
  }
  onGrid(x: number, y: number): boolean {
    const g = playerGridCell(get().player!);
    return g.x === x && g.y === y;
  }
  /** The WHISPERS panel line for this chain, as the Contracts screen prints it. */
  panelLine(): string | null {
    const r = this.rec();
    return r ? describeWhisperStage(r, playerGridCell(get().player!)) : null;
  }

  /** The whisper cards: the return raises "Contract Turned In"-style completion. */
  dismissWhisperCards(): string[] {
    const said: string[] = [];
    const st = get();
    if (st.pendingWhisperComplete) {
      const c = st.pendingWhisperComplete;
      said.push(`[CONTINUE card] ${c.title}: ${c.lines.join(' / ')}${c.rewards?.length ? ` ✦ ${c.rewards.join(', ')}` : ''}`);
      this.tap('CONTINUE');
      st.dismissWhisperComplete();
    }
    said.push(...this.dismissCards());
    return said;
  }

  /** Inside the outpost, walk room to room to the plant room, typing the cardinal. */
  async walkRooms(roomId: string): Promise<boolean> {
    for (let i = 0; i < 14; i++) {
      const here = get().player?.hubRoomId;
      if (!here) { this.breaks.push(`lost the outpost interior on the way to ${roomId}`); return false; }
      if (here === roomId) return true;
      const next = hubFirstStepToward(here, roomId);
      const room = findHubRoom(here);
      const dir = next && room ? (['north', 'south', 'east', 'west'] as const).find((d) => room.exits[d] === next) : undefined;
      if (!next || !dir) { this.breaks.push(`no door from ${here} toward ${roomId}`); return false; }
      this.tap(dir.toUpperCase());
      await this.type(dir);
      if (get().player?.hubRoomId !== next) {
        this.breaks.push(`typed "${dir}" in ${here} and did not reach ${next}. last lines:\n${this.lastLines(4)}`);
        return false;
      }
    }
    this.breaks.push(`fourteen room steps did not reach ${roomId}`);
    return false;
  }

  /** Hear the rumour: stand in the plant room until it is said. Leave and
   *  come back up to eight times (the plant is a roll on entering); after
   *  that the walker plants it by fiat from the room, the game's own shape. */
  async hear(): Promise<boolean> {
    const room = this.chain.plantLocations[0]!;
    const hub = this.nearestHub();
    if (!(await this.walkTo(hub, 'to hear the rumour'))) return false;
    if (!(await this.enterOutpost())) return false;
    if (!(await this.walkRooms(room))) return false;
    for (let i = 0; i < 8 && !this.rec(); i++) {
      // Step out to the neighbouring room and back in — a fresh entry, a fresh roll.
      const here = findHubRoom(room);
      const dir = here ? (['north', 'south', 'east', 'west'] as const).find((d) => here.exits[d]) : undefined;
      if (!dir) break;
      const back = ({ north: 'south', south: 'north', east: 'west', west: 'east' } as const)[dir];
      this.tap(dir.toUpperCase()); await this.type(dir);
      this.tap(back.toUpperCase()); await this.type(back);
      if (get().player?.hubRoomId !== room) { this.breaks.push(`stepping ${dir} and ${back} did not return to ${room}`); return false; }
    }
    if (!this.rec()) {
      this.allowances.add(`rumour planted by fiat in ${room} (the entry roll is ${this.chain.plantChance})`);
      const p = get().player!;
      const px = p.mapX ?? 0, py = p.mapY ?? 0;
      const tile = pickTargetTile(this.chain, px, py);
      const g = playerGridCell(p);
      const whisper: WhisperRecord = {
        id: this.chain.id, stage: 'planted', plantedAtHour: p.hoursElapsed ?? 0,
        targetMapX: tile.x, targetMapY: tile.y,
        targetGridX: g.x + (tile.x - px), targetGridY: g.y + (tile.y - py),
        targetLocationId: p.currentLocationId,
        activeFromHour: this.chain.activeHours?.[0], activeToHour: this.chain.activeHours?.[1],
      };
      store.setState({ player: { ...p, activeWhispers: [...(p.activeWhispers ?? []), whisper] } as never });
    }
    return true;
  }

  /** SET COURSE on the WHISPERS row, then → DESTINATION until the boots are on the tile. */
  async walkCourse(why: string): Promise<boolean> {
    const r = this.rec();
    const tgt = r ? whisperRouteTarget(r) : null;
    if (!tgt) { this.breaks.push(`SET COURSE (${why}) offered no tile at stage ${this.stageName()}`); return false; }
    if (this.onGrid(tgt.gridX, tgt.gridY)) return true;
    this.tap(`SET COURSE (${tgt.label})`);
    get().setWhisperCourse(tgt.gridX, tgt.gridY, tgt.label);
    await tick();
    for (let guard = 0; guard < 240; guard++) {
      if (this.onGrid(tgt.gridX, tgt.gridY)) return true;
      if (this.enemiesUp() > 0) { if (!(await this.fightOut('on the road'))) return false; continue; }
      this.dismissWhisperCards();
      this.restByFiat();
      if (!get().player?.whisperCourse) {
        this.tap(`SET COURSE again (${tgt.label})`);
        get().setWhisperCourse(tgt.gridX, tgt.gridY, tgt.label);
        await tick();
        if (!get().player?.whisperCourse && !this.onGrid(tgt.gridX, tgt.gridY)) {
          this.breaks.push(`SET COURSE (${why}) set no course. last lines:\n${this.lastLines(4)}`);
          return false;
        }
        continue;
      }
      this.tap('→ DESTINATION');
      get().continueWhisperCourse();
      await tick();
      this.drainRolls();
    }
    this.breaks.push(`course (${why}) did not arrive in 240 taps`);
    return false;
  }

  /** Off the tile and back on — the arrival is what the chain hears. */
  async stepOffAndBack(): Promise<void> {
    this.tap('NORTH'); await this.type('north');
    if (this.enemiesUp() > 0) await this.fightOut('stepping off');
    this.tap('SOUTH'); await this.type('south');
    if (this.enemiesUp() > 0) await this.fightOut('stepping back');
  }

  note(stage: number, typed: string | null, via: StageNote['via'], cards: string[], mark: number): void {
    this.stages.push({
      stage, ground: this.stageName(), arrivalLine: this.panelLine(), typed, via,
      closeCard: cards.length ? cards.join(' || ') : null, closeFeed: this.feedSince(mark).slice(-6),
    });
  }

  async playWhisper(): Promise<WalkReport> {
    const c = this.chain.content;
    const done = (): WalkReport => ({
      family: 'whisper', id: this.chain.id, title: this.chain.title,
      outcome: this.breaks.length ? 'broken' : 'complete',
      breaks: this.breaks, allowances: [...this.allowances], stages: this.stages, taps: this.taps,
    });
    // 1. The rumour.
    let mark = this.feedMark();
    if (!(await this.hear())) return done();
    this.note(0, null, 'none', this.dismissWhisperCards(), mark);
    if (this.rec()?.stage !== 'planted') { this.breaks.push(`heard the rumour and the panel reads stage ${this.stageName()}`); return done(); }
    // 2. The camp.
    mark = this.feedMark();
    if (!(await this.walkCourse('to the camp'))) return done();
    for (let waits = 0; this.rec()?.stage === 'planted' && waits < 6; waits++) {
      const hour = Math.floor((get().player?.hoursElapsed ?? 0) % 24);
      const r = this.rec()!;
      if (!isHourInWindow(hour, r.activeFromHour, r.activeToHour)) {
        // "This is X's spot — but the camp is cold. X works here <hours>.
        // Wait for the hour — type 'wait until 7 am' — and look again." A
        // player types the verb the line names.
        const cold = this.feedSince(mark).filter((l) => /the camp is cold/.test(l)).pop() ?? '';
        const cmd = cold.match(/type '([^']+)'/)?.[1] ?? 'wait';
        this.tap(cmd.toUpperCase()); await this.type(cmd);
        if (this.enemiesUp() > 0 && !(await this.fightOut('waiting at the camp'))) return done();
        this.topUp();
        if (this.rec()?.stage === 'met_yulka') break;
        continue;
      }
      await this.stepOffAndBack();
    }
    if (this.rec()?.stage !== 'met_yulka') {
      this.breaks.push(`stood on ${c.npcName}'s tile in hours and the camp did not wake (stage ${this.stageName()}). feed since:\n${this.feedSince(mark).slice(-6).map((l) => `  | ${l}`).join('\n')}`);
      return done();
    }
    const meetCards = this.dismissWhisperCards();
    if (!meetCards.length) this.breaks.push(`met ${c.npcName} at the camp and no card came up (it has to pop up in your face)`);
    this.note(1, null, 'none', meetCards, mark);
    // 3. The answer — the panel says "take the job"; the typed form the meet line offers.
    mark = this.feedMark();
    const acceptCmd = `accept ${c.npcName.toLowerCase()}`;
    this.tap(`SPEAK TO ${c.npcName.toUpperCase()} → take the job`);
    await this.type(acceptCmd);
    if (this.rec()?.stage !== 'fetch_in_progress') {
      this.breaks.push(`typed "${acceptCmd}" at the meet and the chain did not take it (stage ${this.stageName()}). feed since:\n${this.feedSince(mark).slice(-6).map((l) => `  | ${l}`).join('\n')}`);
      return done();
    }
    this.note(2, acceptCmd, 'typed', this.dismissWhisperCards(), mark);
    // 4. The mark.
    mark = this.feedMark();
    if (!(await this.walkCourse(`to ${c.markNoun}`))) return done();
    if (this.enemiesUp() === 0 && this.rec()?.stage !== 'fetch_active') await this.stepOffAndBack();
    if (this.enemiesUp() === 0) {
      this.breaks.push(`on ${c.markNoun}'s tile and nobody stood up (stage ${this.stageName()}). feed since:\n${this.feedSince(mark).slice(-6).map((l) => `  | ${l}`).join('\n')}`);
      return done();
    }
    const cardsBeforeFight = this.cardsSeen.length;
    if (!(await this.fightOut(`with the ${c.fetchEnemy}`))) return done();
    const holds =(get().player?.inventory ?? []).some((i) => i.name === c.stolen.name && i.quantity > 0);
    if (this.rec()?.stage !== 'fetch_returned' || !holds) {
      this.breaks.push(`put the ${c.fetchEnemy} down and ${holds ? 'the chain did not move' : `the ${c.goodsShort} did not come off the body`} (stage ${this.stageName()}). feed since:\n${this.feedSince(mark).slice(-8).map((l) => `  | ${l}`).join('\n')}`);
      return done();
    }
    const recoverCards = this.cardsSeen.slice(cardsBeforeFight).concat(this.dismissWhisperCards());
    if (!recoverCards.some((s) => /CONTINUE card/.test(s))) this.breaks.push(`recovered the ${c.goodsShort} off the ${c.fetchEnemy} and no card came up (it has to pop up in your face)`);
    this.note(3, null, 'fight', recoverCards, mark);
    // 5. The return and the hand-over.
    mark = this.feedMark();
    if (!(await this.walkCourse(`back to ${c.npcName}`))) return done();
    if (this.rec()?.stage !== 'handback') await this.stepOffAndBack();
    if (this.rec()?.stage !== 'handback') {
      this.breaks.push(`back on ${c.npcName}'s tile with the ${c.goodsShort} and nothing waited (stage ${this.stageName()}). feed since:\n${this.feedSince(mark).slice(-6).map((l) => `  | ${l}`).join('\n')}`);
      return done();
    }
    const armCards = this.dismissWhisperCards();
    if (!armCards.length) this.breaks.push(`${c.npcName} saw the ${c.goodsShort} and no card came up (it has to pop up in your face)`);
    const tc0 = get().player!.tc ?? 0;
    const giveCmd = `give ${c.npcName.toLowerCase()} the ${c.goodsShort.toLowerCase()}`;
    this.tap(`SPEAK TO ${c.npcName.toUpperCase()} → hand it over`);
    await this.type(giveCmd);
    const completed = (get().player?.completedWhisperIds ?? []).includes(this.chain.id);
    if (!completed || this.rec()) {
      this.breaks.push(`typed "${giveCmd}" and the chain did not close (stage ${this.stageName()}). feed since:\n${this.feedSince(mark).slice(-6).map((l) => `  | ${l}`).join('\n')}`);
      return done();
    }
    const paid = (get().player!.tc ?? 0) > tc0
      || (c.reward.item ? (get().player?.inventory ?? []).some((i) => i.name === c.reward.item!.name) : false);
    if (!paid) this.breaks.push('handed the goods over and nothing was paid');
    const cards = this.dismissWhisperCards();
    if (!cards.length) this.breaks.push('the chain closed and no card came up (it has to pop up in your face)');
    this.note(4, giveCmd, 'typed', cards, mark);
    return done();
  }
}

export async function playWhisperChain(chain: ChainDef): Promise<WalkReport> {
  resetForMission();
  const p = get().player!;
  store.setState({ player: { ...p, activeWhispers: [], completedWhisperIds: [], whisperCourse: null } as never, pendingWhisperComplete: null });
  const w = new WhisperWalker(chain);
  w.allowances.add('HP 600 / STR 20 / DEX 20 / standing 100 with every faction');
  const r = await w.playWhisper();
  if (process.env.PLAYER_WALKER_FEED === '1') r.feed = [...w.feed()];
  return r;
}

/* ⚠⚠⚠ DEBT #54 — A WALK THAT CANNOT BE REPLAYED IS NOT REPRODUCIBLE.
 *
 * The harness has had a fixed seed since OTA-1831, and a fixed seed is NOT the
 * same thing as a replayable one. Measured on this tree at c94e3ebc, the same
 * scenario under the same hardcoded seed walked two different paths:
 *
 *   in the full run     Nessa camps 4 tiles away (3 south, 1 EAST) · 60 taps
 *   PLAYER_WALKER_ONLY  Nessa camps 4 tiles away (3 south, 1 WEST) · 34 taps
 *
 * Both walks are legitimate. They differ because `beforeAll` builds ONE world
 * and every scenario inherits what the scenarios before it left, while the
 * per-test reseed restarts only the DICE. So the isolated run is not the walk
 * that broke — it is a different walk of the same mission, and debugging it
 * tells you about a world the failing run never had.
 *
 * ⚠ THE FIX IS THE PREFIX, NOT ISOLATION. Isolating every scenario onto a fresh
 * world would make replay trivial and would DELETE what this suite is for:
 * walking the catalogue the way a player actually accumulates it. The exact
 * state a scenario saw is reproduced by replaying the same ordered prefix under
 * the same seed — `PLAYER_WALKER_UPTO=<family:id>` — which is what the block
 * below prints, and which changes nothing about how the full run behaves. */
export function walkerBaseSeed(): number {
  const g = globalThis as { __TARTARIA_TEST_SEED__?: number };
  return typeof g.__TARTARIA_TEST_SEED__ === 'number' ? g.__TARTARIA_TEST_SEED__ : 0x74617274;
}

export function walkerDefaultSeed(): number {
  const g = globalThis as { __TARTARIA_DEFAULT_TEST_SEED__?: number };
  return typeof g.__TARTARIA_DEFAULT_TEST_SEED__ === 'number' ? g.__TARTARIA_DEFAULT_TEST_SEED__ : 0x74617274;
}

/* ⚠⚠⚠ DEBT #54, SECOND PASS — THE PRINTED COMMAND AND THE SUITE'S SELECTOR ARE
 * ONE OBJECT NOW, BECAUSE TWO OF THEM CANNOT BE TESTED.
 *
 * The first pass shipped both halves of the replay and proved each half by
 * READING ITS SOURCE: `replayBlock()` was asserted to print the string
 * `PLAYER_WALKER_UPTO=…`, and `playerWalkerSim.test.ts` was asserted to contain
 * the text `ORDER.indexOf(key) <= UPTO_INDEX`. Two independent claims about two
 * independent spellings in two files, with nothing executing the relationship
 * between them.
 *
 * ⚠ THAT LEFT THE EXACT HOLE THE DEBT IS ABOUT. Rename the variable the suite
 * reads — `const UPTO = process.env.PLAYER_WALKER_PREFIX` — and every one of
 * those assertions still passes, while the command a break prints silently
 * selects NOTHING and runs the whole catalogue instead of the prefix. A replay
 * token that reads as green while reproducing a different run is worse than no
 * token at all: it is the c94e3ebc defect with a receipt stapled to it.
 *
 * So the names below are the single spelling. `replayBlock()` BUILDS the
 * command out of them and `walkerSelection()` READS the environment by them,
 * which makes the relationship executable: hand the printed command's own text
 * back to the selector and the prefix it returns either is, or is not, the
 * ordered prefix. `walkerReplaySeed` §E does exactly that. */
export const REPLAY_SEED_VAR = 'TARTARIA_TEST_SEED';
export const REPLAY_PREFIX_VAR = 'PLAYER_WALKER_UPTO';
export const REPLAY_ISOLATE_VAR = 'PLAYER_WALKER_ONLY';
export const WALKER_SUITE_PATH = '__tests__/playerWalkerSim.test.ts';

/**
 * Every scenario key in the order `playerWalkerSim` registers them — missions,
 * then faction quests, then whispers.
 *
 * ⚠ THE ORDER IS THE PREFIX. `beforeAll` builds ONE world and each scenario
 * inherits what the scenarios before it left, so "the world that broke" is
 * reproduced by replaying this exact sequence up to the target and no other.
 */
export function walkOrder(): readonly string[] {
  return [
    ...ALL_MISSIONS.map(({ family, def }) => `${family}:${def.id}`),
    ...ALL_FACTION_QUESTS.map((q) => `faction:${q.id}`),
    ...ALL_WHISPER_CHAINS.map((c) => `whisper:${c.id}`),
  ];
}

export interface WalkerSelection {
  /** full = the catalogue; prefix = the ordered replay; isolated = one mission or family. */
  mode: 'full' | 'prefix' | 'isolated';
  /** What the environment asked for, or null in a full run. */
  target: string | null;
  /** ⚠ A replay that walks NOTHING reads as green. False says so out loud. */
  targetFound: boolean;
  /** The scenario keys this environment selects, in registration order. */
  keys: readonly string[];
}

/**
 * Which scenarios an environment selects. Pure, so the regression can feed it
 * the env parsed out of a printed replay command rather than trust the source
 * text of two files to agree.
 */
export function walkerSelection(env: Record<string, string | undefined> = process.env): WalkerSelection {
  const order = walkOrder();
  const upto = env[REPLAY_PREFIX_VAR];
  if (upto) {
    const i = order.indexOf(upto);
    return { mode: 'prefix', target: upto, targetFound: i >= 0, keys: i >= 0 ? order.slice(0, i + 1) : [] };
  }
  const only = env[REPLAY_ISOLATE_VAR];
  if (only) {
    const keys = order.filter((k) => only === k || only === k.slice(0, k.indexOf(':')));
    return { mode: 'isolated', target: only, targetFound: keys.length > 0, keys };
  }
  return { mode: 'full', target: null, targetFound: true, keys: order };
}

/** How this process selected its scenarios — which decides what a replay must say. */
export function walkerRunMode(): 'full' | 'prefix' | 'isolated' {
  return walkerSelection().mode;
}

export function walkerSeedToken(seed = walkerBaseSeed()): string {
  return `0x${(seed >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * The lines a broken walk prints so the next reader reproduces it with ONE
 * command. Seed, scenario, whether the walk was sequence-dependent, and the
 * command itself — a replay instruction missing any of those is a guess.
 */
export function replayBlock(family: string, id: string): string[] {
  const seed = walkerSeedToken();
  const scenario = `${family}:${id}`;
  const mode = walkerRunMode();
  const isDefault = walkerBaseSeed() === walkerDefaultSeed();
  // ⚠ BUILT FROM THE SAME NAMES `walkerSelection()` READS. See the note above
  // REPLAY_SEED_VAR: a command assembled from its own private spelling is how a
  // replay token becomes decorative without a single test going red.
  const cmd = `${REPLAY_SEED_VAR}=${seed} ${REPLAY_PREFIX_VAR}=${scenario} npx jest ${WALKER_SUITE_PATH} --runInBand`;
  const seq = mode === 'isolated'
    ? 'isolated — started from a world no other scenario had touched'
    : 'sequence-dependent — inherited the world every earlier scenario left';
  return [
    '    ── replay ──',
    `      seed:     ${seed}${isDefault ? ' (harness default)' : ' (override via TARTARIA_TEST_SEED)'}`,
    `      scenario: ${scenario}`,
    `      mode:     ${mode} · ${seq}`,
    `      replay:   ${cmd}`,
    ...(mode === 'isolated'
      ? []
      : ['      ⚠ PLAYER_WALKER_ONLY reproduces the MISSION, not this WALK — it starts',
         '        from a fresh world and legitimately takes a different path.']),
    /* ⚠⚠⚠ THE HONEST LIMIT, PRINTED RATHER THAN IMPLIED — AND IT IS A MEASURED
     * CORRECTION OF WHAT THIS BLOCK USED TO IMPLY.
     *
     * The command above reconstructs the WORLD exactly, every time; that is
     * proven by execution in `walkerReplaySeed` §W rather than claimed. It
     * reproduces the WALK on most runs, and on this tree not on all of them.
     * MEASURED, three consecutive runs of the identical prefix command on an
     * otherwise idle box, `hunt:hunt_mud_titan` taps: 1,122 · 785 · 1,122 — and
     * the same three on the tree BEFORE this pass touched anything, to the tap,
     * so it is the harness's inheritance of production's clock and not an edit.
     *
     * Production decides several things by ELAPSED REAL TIME and the walker
     * inherits every one of them. Freezing those gates from the harness would
     * delete the behaviour the walker exists to walk, so the complete fix is a
     * harness-level deterministic clock and belongs to its own owner-ruled pass
     * — named debt #173, which already holds it.
     *
     * Handing a reader "this reproduces it" without that sentence would be the
     * same class of defect this block exists to close: an instruction that
     * sounds exact and is not. So the block says it, in the block. */
    '      ⚠ run it more than once. The WORLD is reconstructed exactly; the WALK can',
    '        still differ where production decides by elapsed real time (debt #173).',
  ];
}

export function formatReport(r: WalkReport): string {
  const head = `${r.outcome === 'complete' ? 'OK  ' : 'BRK '} ${r.family}:${r.id} — ${r.title} (${r.stages.length} stages played, ${r.taps} taps)`;
  const stages = r.stages.map((s) =>
    `    stage ${s.stage} @${s.ground} via=${s.via}${s.typed ? ` typed="${s.typed}"` : ''}${s.arrivalLine ? `\n      arrival: ${s.arrivalLine}` : ''}${s.closeCard ? `\n      card: ${s.closeCard}` : ''}`);
  const breaks = r.breaks.map((b) => `    ✗ ${b.split('\n').join('\n      ')}`);
  // ⚠ ON A BREAK ONLY. A green walk needs no replay instructions, and printing
  // them on all 89 would bury the one report a reader is actually looking for.
  const replay = r.breaks.length > 0 ? replayBlock(r.family, r.id) : [];
  const feed = r.feed ? ['    ── feed ──', ...r.feed.map((l) => `    | ${l.split('\n').join('\n    |   ')}`)] : [];
  return [head, ...stages, ...breaks, `    allowances: ${r.allowances.join('; ')}`, ...replay, ...feed].join('\n');
}

/* ══════════════════════════════════════════════════════════════════════════
 * ⚠⚠⚠ DEBT #54, SECOND PASS — THE WORLD THE REPLAY HAS TO RECONSTRUCT.
 *
 * `playerWalkerSim` built this world inline in its own `beforeAll`, which meant
 * the three things that make the world reproducible — the re-seed FIRST, the
 * homework interval disarmed, the settles counted in polls — could only ever be
 * asserted by reading that `beforeAll` as text. Source text cannot answer the
 * question the debt actually asks: *does replaying it produce the same world?*
 *
 * Moved here it is a function, so `walkerReplaySeed` §W can CALL it: twice, and
 * with the RNG cursor shoved 250,000 draws sideways first, and under a second
 * seed, and once with the re-seed suppressed — and compare the worlds that come
 * back. The suite's `beforeAll` is now the call and nothing else, so the thing
 * the regression executes is the thing the catalogue walk runs.
 *
 * ⚠ NOT ONE CALL, ARGUMENT OR ORDERING CHANGED IN THE MOVE, and that matters:
 * this sequence IS the world 89 scenarios inherit. Same re-seed first, same
 * hydrate, same character, same skipTutorial, same two settles at the same
 * 15 ms poll (the walker's own `settle` polls at 12 — a different phase would
 * be a different world), same disarm between them.
 * ══════════════════════════════════════════════════════════════════════════ */

/* ⚠ DEBT #54 — polls, not milliseconds; see the long note on `settle` above.
 * Kept at the suite's original 15 ms so the reconstructed world is the world
 * the catalogue walk has always started from. */
const WORLD_SETTLE_POLL_MS = 15;
async function worldSettle(pred: () => boolean, deadlineMs: number): Promise<void> {
  const polls = Math.max(1, Math.ceil(deadlineMs / WORLD_SETTLE_POLL_MS));
  for (let i = 0; i < polls && !pred(); i++) {
    await new Promise((r) => setTimeout(r, WORLD_SETTLE_POLL_MS));
  }
}

/**
 * The one world `playerWalkerSim` walks the catalogue in. Deterministic given
 * the harness seed: re-seed BEFORE anything is drawn, build, then disarm the
 * product's homework interval so the world stops advancing on the wall clock.
 */
export async function buildWalkerWorld(): Promise<void> {
  /* ⚠⚠⚠ FIRST, BEFORE A SINGLE DRAW. `beforeAll` runs before any `beforeEach`,
   * so without this line the world is dealt from wherever module import left
   * the cursor — a function of the loaded tree's BYTES, which is what makes a
   * replay token expire the moment anybody edits anything. Re-seeding after the
   * world is built buys nothing: the grounds, the weather and the roster are
   * already drawn. */
  (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
  await get().hydrate();
  await get().startNewGame({ name: 'Thumb', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  get().skipTutorial?.();
  await worldSettle(() => !!get().currentScene, 5000);
  /* ⚠⚠⚠ AND THE WORLD MUST NOT ADVANCE ON THE WALL CLOCK EITHER. `hydrate()`
   * arms a 5-second interval in gameStore; across an 18-minute catalogue walk it
   * fires ~200 times and WHERE each firing lands between two taps is decided by
   * how fast the machine ran. This is the product's own stop path, already
   * called this way from jest.teardown.js — no timer, probability or product
   * code changes, and the suites that test homework drive it by hand through
   * `_homeworkTickForTest()`. It has to sit AFTER hydrate (hydrate is what arms
   * it) and BEFORE the first walk. */
  setHomeworkTick(null);
  let last = -1;
  await worldSettle(() => {
    const n = get().gameLog.length;
    const stable = n === last;
    last = n;
    return stable;
  }, 10000);
}

/* ⚠⚠ WHAT IS MASKED, AND WHY IT IS NOT A CONVENIENCE. Measured on this tree,
 * exactly two things differ between two reconstructions of this world, and both
 * are the same thing wearing different clothes — a millisecond stamped into an
 * IDENTITY string:
 *
 *   · `player.mapSeed` = `name|raceId|factionId|<Date.now()>`, minted at
 *     creation as the save system's character key (`characterKeyOf`). It is not
 *     world state: `generateWorldMap` opens with
 *     `void characterSeed; // positions are canon now`, so it decides nothing
 *     the walker walks.
 *   · starter inventory instance ids — `starter_torch_<Date.now()>_0` — whose
 *     uniqueness comes from the stamp. The STEM and the ORDINAL still compare,
 *     so a different item, a different count or a different order is still a
 *     different world.
 *
 * So the mask is exactly "a 13-digit epoch, wherever it is written", and nothing
 * else. ⚠ THE WORD BOUNDARY IS NOT OPTIONAL AND `\b` IS THE WRONG ONE: the
 * stamps sit between underscores, which are word characters, so `\b` never
 * matched them and the first draft of this fingerprint reported every pair of
 * reconstructions as different worlds. With the digit-boundary form below, the
 * scene, the world memory, the rolled character and all thirty-odd feed lines
 * are byte-identical across independent reconstructions. */
const EPOCH_MS_IN_TEXT = /(?<![0-9])1[6-9][0-9]{11}(?![0-9])/g;
function canonicalizeWorldValue(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(EPOCH_MS_IN_TEXT, '<epoch>');
  if (typeof v === 'number') return v > 1e12 ? '<epoch>' : v;
  if (Array.isArray(v)) return v.map(canonicalizeWorldValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    // Sorted, so a store that reorders its keys is not reported as a new world.
    for (const k of Object.keys(v as object).sort()) {
      out[k] = canonicalizeWorldValue((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/**
 * A compact fingerprint of the world a replay has to reconstruct: the scene the
 * player stands in, the world memory behind it, the rolled character, and every
 * line the build wrote to the feed.
 *
 * ⚠ A FINGERPRINT, NOT A SNAPSHOT. Nothing is pinned to a stored value — it
 * exists only to be compared against another reconstruction made in the same
 * process, so an edit anywhere in the game changes both sides and the claim
 * stays true without a golden file to re-bless.
 */
export function walkerWorldDigest(): string {
  const s = get();
  const world = {
    scene: s.currentScene,
    worldMemory: s.worldMemory,
    player: s.player,
    feed: s.gameLog.map((l) => l.text),
  };
  return createHash('sha256').update(JSON.stringify(canonicalizeWorldValue(world))).digest('hex').slice(0, 16);
}

// P3 — CanonicalWalker.
//
// Subclasses test-utils/playerWalker.ts's Walker: it stays the chassis
// (tap()/type()/drainRolls()/feed()/dismissCards() infrastructure), per the
// owner's ruling — this is not a parallel engine.
//
// REMOVED / NEVER CALLED, by owner ruling:
//   - resetForMission()   — a free function in playerWalker.ts; simply never
//                            imported here.
//   - Walker.topUp() / Walker.restByFiat() — overridden below to throw, so a
//                            future edit that calls them fails loudly instead
//                            of silently cheating.
//   - Walker.fightOut()   — contains the 60-round coup de grâce; overridden
//                            to throw. Combat in a canonical run is driven by
//                            real production actions through decide()
//                            (policy.ts) — building that loop is P7's job,
//                            explicitly out of scope for this package (no
//                            canonical Nine-Guardian run runs here).
//   - direct enemy/player HP edits, hidden-state route decisions — never
//     written anywhere in this file.
//
// Character creation uses exactly the fields a real player's creation
// screen submits (app/components/CharacterCreationScreen.tsx:186 —
// `name: '', raceId, factionId, motiveId, pressure, sex: sex ?? undefined`),
// with named constants below instead of the old walker's impossible
// `name:'Thumb'` (no motive/sex, a name no creation screen can produce).
//
// The tutorial is PLAYED NORMALLY. SKIP is never called. Every beat below
// is driven by the exact typed phrase or direct door verified against
// gameStore.ts's own tutorial-beat handlers (citations inline) — where a
// beat's typed form was ambiguous, the door actually used is the same one a
// documented UI control calls (tutorialScreenPick(), the MAIN QUEST chip's
// onPress body, setTravelCourse()), never an invented shortcut.

import { Walker, type WalkFamily, type MissionLike } from '../playerWalker';
import { useGameStore } from '../../app/state/gameStore';
import type { GameStore } from '../../app/state/gameStore';
import type { CreateCharacterInput } from '../../app/engine/character';
import { getRaces, getFactions } from '../../app/engine/character';
import { STORY_MOTIVE_IDS } from '../../app/engine/story';
import { DEFAULT_PRESSURE } from '../../app/engine/pressure';
import { rollStepLikeProductionUI } from './dice';
import { completeChapterDismissal, completeForkDismissal, completeSheetDismissal } from './presentation';
import { recordDecision } from './decisionJournal';

const store = useGameStore;
const get = (): GameStore => store.getState();
const tick = () => new Promise((r) => setTimeout(r, 40));

// ── legitimate character-creation constants ──────────────────────────────
// Every value below is a real id from the game's own catalogs (getRaces() /
// getFactions() / STORY_MOTIVE_IDS / DEFAULT_PRESSURE) — the same lists
// CharacterCreationScreen.tsx renders as pickable rows/chips. Nothing here
// is invented; a real player could tap these exact rows.
export const CANONICAL_RACE_ID = 'reclaimer';
export const CANONICAL_FACTION_ID = 'reclaimers_guild';
export const CANONICAL_MOTIVE_ID = STORY_MOTIVE_IDS[0]; // 'debt'
export const CANONICAL_PRESSURE = DEFAULT_PRESSURE; // 'owed' — "the game as it has always played"
export const CANONICAL_SEX: 'male' | 'female' = 'female';
export const CANONICAL_NAME = 'Aless Vance';

const CANONICAL_MISSION_STUB: MissionLike = {
  id: '__canonical_run__',
  title: 'Canonical Guardian Run',
  factionId: null,
  stages: [],
};

export interface DirectDoorRecord {
  beatOrAction: string;
  uiSurface: string;
  preconditions: string;
  storeAction: string;
  policyVisibleJustification: string;
}

export class CanonicalWalker extends Walker {
  readonly directDoors: DirectDoorRecord[] = [];

  constructor() {
    super('hunt' as WalkFamily, CANONICAL_MISSION_STUB);
  }

  private logDoor(rec: DirectDoorRecord): void {
    this.directDoors.push(rec);
    get().appendLog('debug', `canonical: direct door — ${rec.beatOrAction} (${rec.storeAction})`);
  }

  // ── cheat methods removed ─────────────────────────────────────────────
  override restByFiat(): never {
    throw new Error('CanonicalWalker: restByFiat() is forbidden — fiat stamina restore is not a legitimate player action.');
  }

  override topUp(): never {
    throw new Error('CanonicalWalker: topUp() is forbidden — fiat HP restore is not a legitimate player action.');
  }

  override async fightOut(_why: string): Promise<boolean> {
    throw new Error(
      'CanonicalWalker: fightOut() is forbidden (60-round coup de grâce + fiat combat). ' +
        'Combat must be driven by real production actions through the P4 policy, not this shortcut.',
    );
  }

  // ── production-faithful dice (P3, Phase 2B UNK-P2-10 / W4) ────────────
  // Replaces the base Walker's hardcoded "every die lands on 18, adv/dis
  // ignored" with the exact DiceRoller.tsx algorithm (rollStepLikeProductionUI,
  // test-utils/canonical/dice.ts), fed by whatever Math.random is installed —
  // the seeded harness stream, optionally wrapped by the RNG ledger.
  override drainRolls(): void {
    let guard = 0;
    while (get().pendingRolls) {
      if (guard++ > 200) { this.breaks.push('the dice roller never closed'); return; }
      const pr = get().pendingRolls!;
      const step = pr.steps[pr.currentStep]!;
      this.tap('ROLL');
      const { submitValues } = rollStepLikeProductionUI(step);
      get().resolveRollStep(submitValues);
    }
  }

  // ── presentation, released by the real dismissal door ─────────────────
  // Overrides the base dismissCards() (which assumes mission-stinger/beat
  // cards only) to ALSO release chapter/fork/sheet handoffs via the same
  // production door notePresentationDismissed() would be called from
  // (presentation.ts), journaled as PLAYER-LEGITIMATE PRESENTATION
  // DISMISSAL rather than waiting on the 400ms fallback timer.
  async dismissPresentationIfPending(): Promise<void> {
    const chapter = completeChapterDismissal();
    if (chapter) {
      this.tap('DISMISS CHAPTER CARD');
      get().appendLog('debug', 'canonical: PLAYER-LEGITIMATE PRESENTATION DISMISSAL — chapter');
    }
    const fork = completeForkDismissal();
    if (fork) {
      this.tap('DISMISS FORK');
      get().appendLog('debug', 'canonical: PLAYER-LEGITIMATE PRESENTATION DISMISSAL — fork');
    }
    const sheet = completeSheetDismissal();
    if (sheet) {
      this.tap('DISMISS SHEET');
      get().appendLog('debug', 'canonical: PLAYER-LEGITIMATE PRESENTATION DISMISSAL — sheet');
    }
    await tick();
  }

  // ── P3: legitimate character creation ──────────────────────────────────
  // Same shape CharacterCreationScreen.tsx submits (bootSlice.ts:1094
  // startNewGame(input)): name is blank at submission (the tutorial's name
  // beat fills it — see playTutorialNormally()'s 'name' step), race/faction/
  // motive/pressure/sex are real catalog ids a player picks on the creation
  // screen's own rows.
  //
  // Phase 6 (owner-authorized measured canonical run) — `choices` lets a
  // caller supply real owner-picked creation values instead of the
  // CANONICAL_* defaults above. Defaulting to those constants keeps every
  // existing caller (all pre-Phase-6 test files) byte-identical; this is
  // additive, not a behavior change for anyone who doesn't pass an argument.
  /** Phase 7 — the name actually typed during the tutorial's `name` beat.
   *  Defaults to CANONICAL_NAME so every pre-Phase-7 caller is unaffected;
   *  a caller may override it (e.g. the owner's Phase 7 instruction not to
   *  reuse the Phase 3 placeholder for a new canonical life). */
  canonicalNameOverride: string | null = null;

  async createCharacterLegitimately(choices?: {
    raceId?: string;
    factionId?: string;
    motiveId?: string;
    pressure?: string;
    sex?: 'male' | 'female';
  }): Promise<void> {
    const raceId = choices?.raceId ?? CANONICAL_RACE_ID;
    const factionId = choices?.factionId ?? CANONICAL_FACTION_ID;
    const motiveId = choices?.motiveId ?? CANONICAL_MOTIVE_ID;
    const pressure = choices?.pressure ?? CANONICAL_PRESSURE;
    const sex = choices?.sex ?? CANONICAL_SEX;
    const races = getRaces();
    const factions = getFactions();
    if (!races.some((r) => r.id === raceId)) {
      throw new Error(`CanonicalWalker: race id '${raceId}' is not in getRaces() — catalog drift, STOP.`);
    }
    if (!factions.some((f) => f.id === factionId)) {
      throw new Error(`CanonicalWalker: faction id '${factionId}' is not in getFactions() — catalog drift, STOP.`);
    }
    if (!STORY_MOTIVE_IDS.includes(motiveId as (typeof STORY_MOTIVE_IDS)[number])) {
      throw new Error(`CanonicalWalker: motive id '${motiveId}' is not in STORY_MOTIVE_IDS — catalog drift, STOP.`);
    }
    const input: CreateCharacterInput = {
      name: '',
      raceId,
      factionId,
      motiveId,
      pressure: pressure as CreateCharacterInput['pressure'],
      sex,
    };
    this.tap('CREATE CHARACTER');
    await get().startNewGame(input);
    await tick();
  }

  // ── P3: the opening story crawl, dismissed through its real door ──────
  // dismissStoryIntro() is the SAME single door a player's tap on the crawl
  // calls — it both ends the crawl AND (when storyIntroSeen===false &&
  // !hasSeenIntro) starts the tutorial internally. Calling it twice, or
  // calling startTutorial() separately, would not match what the UI does.
  async dismissStoryIntroLegitimately(): Promise<void> {
    if (!get().storyIntro) return;
    this.tap('DISMISS STORY INTRO');
    get().dismissStoryIntro();
    await tick();
    await this.dismissPresentationIfPending();
  }

  // ── P3: the tutorial, played normally — SKIP is never called ──────────
  // Each beat below is driven by the exact typed phrase (or, where the
  // production UI itself uses a direct store door instead of free text —
  // screen_pick, main_quest, pick_city — that same door) that gameStore.ts's
  // submitPlayerAction() tutorial intercepts require. Citations are the
  // exact regex/branch each command must satisfy, read from golem-line
  // @ f25aee76's app/state/gameStore.ts.
  async playTutorialNormally(): Promise<void> {
    // Guard: only proceed if a tutorial is actually active. A STOP is
    // recorded (not silently skipped) if character creation didn't arm one.
    if (get().tutorialStep === null) {
      throw new Error('CanonicalWalker: no tutorial is armed after character creation — STOP, missing production door.');
    }

    const beat = (): string | null => {
      const s = get().tutorialStep;
      return s === null ? null : (require('../../app/components/tutorialSteps') as typeof import('../../app/components/tutorialSteps')).TUTORIAL_STEPS[s]?.id ?? null;
    };

    // name — gameStore.ts:12292-12303 accepts any typed text while
    // awaitingTutorialName is true, appends it as the player's name, then
    // maybeAdvanceTutorial('name').
    if (beat() === 'name') {
      await this.type(this.canonicalNameOverride ?? CANONICAL_NAME);
      await this.dismissPresentationIfPending();
    }

    // look — the 'look'/'look around you'/'examine room'/'survey' typed
    // twin is explicitly allowed through the outpost lockdown
    // (gameStore.ts:12442, isLookCmd) and calls maybeAdvanceTutorial('look')
    // (gameStore.ts:33945).
    if (beat() === 'look') {
      await this.type('look around you');
    }

    // cudgel — gameStore.ts:12311, /\btake\s+.*cudgel\b/i.
    if (beat() === 'cudgel') {
      await this.type('take the cudgel');
    }

    // armor — TWO steps: the take (gameStore.ts:12357,
    // /\b(take|grab|pick\s*up|get)\s+.*(vest|mud-warden|warden)/i) grants the
    // vest but does NOT advance the beat (armor advances on the EQUIP,
    // inventorySlice.ts:152-158); the wear ("equip"/"wear"/"put on"/"don",
    // gameStore.ts:12443 isWearCmd, explicitly let through the lockdown for
    // this beat) resolves through the normal equip-by-name parser path and
    // fires maybeAdvanceTutorial('armor') from inside equipItem().
    if (beat() === 'armor') {
      await this.type('take the vest');
      await this.type('wear the vest');
    }

    // screen_pick — the beat's OWN control is the on-screen ★ offer on the
    // story text, not a typed phrase; gameStore.ts's own tutorialScreenPick()
    // (28417-28432) is the exact door that offer calls (grant the cap, equip
    // it, maybeAdvanceTutorial('screen_pick')). A typed twin also exists
    // (12352) but calling the same door the UI control calls directly is the
    // documented, owner-approved exception for this beat.
    if (beat() === 'screen_pick') {
      this.logDoor({
        beatOrAction: 'tutorial:screen_pick',
        uiSurface: 'the ★ offer inlined in the story-text feed',
        preconditions: "tutorialStep beat id === 'screen_pick' (verified via beat() above)",
        storeAction: 'get().tutorialScreenPick()',
        policyVisibleJustification: 'Same door the feed offer\'s own onPress calls; no hidden state read to decide to call it.',
      });
      this.tap('TAP ★ OFFER (screen_pick)');
      get().tutorialScreenPick();
      await tick();
    }

    // rope — gameStore.ts:12335, take/grab/get/pick up/pickup/collect/snag + rope.
    if (beat() === 'rope') {
      await this.type('take rope');
    }

    // scrap — gameStore.ts:12386, scrap/salvage/break + chest plate/plate/breastplate.
    if (beat() === 'scrap') {
      await this.type('salvage the chest plate');
    }

    // climb — the beat's own remind text (tutorialSteps.ts) is the typed
    // phrasing: "climb again to go higher, or climb down to come back".
    // Bare 'climb' is explicitly let through the lockdown for this beat
    // (gameStore.ts:12438 isClimbCmd) and the beat completes on the descent
    // (maybeAdvanceTutorial('climb'), gameStore.ts:19520/19533) — climb
    // until the top tier, then climb down once.
    if (beat() === 'climb') {
      let guard = 0;
      while (beat() === 'climb' && guard++ < 8) {
        await this.type('climb');
        if (get().currentScene?.elevatedOn) {
          await this.type('climb down');
        }
      }
    }

    // investigate — gameStore.ts:12401, /\binvestigate\s+.*door\b/i.
    if (beat() === 'investigate') {
      await this.type('investigate the door');
    }

    // explore_or_leave — the beat's own body offers EXPLORE (stay) or
    // "leave outpost" (typed, explicitly let through the lockdown as
    // isLeaveCmd, gameStore.ts:12447). The canonical run takes the road:
    // typing "leave outpost" advances straight to main_quest via
    // finishOutpostTutorial.
    if (beat() === 'explore_or_leave') {
      await this.type('leave outpost');
    }

    // main_quest — the MAIN QUEST objective chip's own onPress body
    // (app/screens/ExplorationScreen.tsx:2000-2006) is exactly
    // `maybeAdvanceTutorial('main_quest'); setScreen('contracts')` — no
    // typed twin exists for a screen-navigation chip, so the door called
    // here IS the UI control's own handler, verbatim.
    if (beat() === 'main_quest') {
      this.logDoor({
        beatOrAction: 'tutorial:main_quest',
        uiSurface: 'the MAIN QUEST objective chip (ExplorationScreen.tsx:1996-2006)',
        preconditions: "tutorialStep beat id === 'main_quest'; chip is always rendered/tappable at this beat",
        storeAction: "get().maybeAdvanceTutorial('main_quest'); get().setScreen('contracts')",
        policyVisibleJustification: 'Verbatim body of the chip\'s onPress — pure screen navigation, no mechanic decided by hidden state.',
      });
      this.tap('MAIN QUEST');
      get().maybeAdvanceTutorial('main_quest');
      get().setScreen('contracts');
      await tick();
    }

    // pick_city — completes the instant setTravelCourse(capitalId) is
    // called while the pick_city beat is active (gameStore.ts:26505-26520):
    // the SAME door the Contracts screen's capital row uses, and the same
    // door the base Walker's own walkTo() already calls for ordinary
    // travel. No auto-departure — the beat hands control back to the travel
    // row, matching production (gameStore.ts:26509-26518).
    if (beat() === 'pick_city') {
      const capitalId = this.pickCanonicalFirstCapital();
      this.tap(`SET COURSE (${capitalId})`);
      get().setTravelCourse(capitalId);
      await tick();
      get().setScreen('exploration');
      await tick();
    }

    if (get().tutorialStep !== null) {
      throw new Error(
        `CanonicalWalker: tutorial did not complete after driving every known beat (stuck on '${beat()}') — ` +
          'STOP, missing production door.',
      );
    }
    recordDecision({
      actionSeq: 0,
      virtualTimeMs: Date.now(),
      position: { locationId: get().player?.currentLocationId ?? null, gridX: get().player?.gridX ?? null, gridY: get().player?.gridY ?? null },
      playerViewHash: { hp: get().player?.hp ?? -1, inventoryCount: get().player?.inventory?.length ?? 0, locationId: get().player?.currentLocationId ?? '', sceneEnemyCount: get().currentScene?.enemies.length ?? 0 },
      optionsShown: [],
      decision: 'tutorial-complete',
      reason: 'Tutorial driven to completion through legitimate production doors only; no SKIP called.',
      productionDoor: 'playTutorialNormally()',
      resultingDiffRange: null,
    });
  }

  /** Displayed-only: the first Lost Capital location id, per mainQuest.ts's
   *  own LOST_CAPITAL_LOCATIONS list (the exact list the Contracts screen's
   *  capital picker renders) — "any works" per the beat's own body text, so
   *  taking the first is not a hidden-state decision. */
  private pickCanonicalFirstCapital(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LOST_CAPITAL_LOCATIONS } = require('../../app/engine/mainQuest') as typeof import('../../app/engine/mainQuest');
    const first = LOST_CAPITAL_LOCATIONS[0];
    if (!first) throw new Error('CanonicalWalker: LOST_CAPITAL_LOCATIONS is empty — catalog drift, STOP.');
    return first;
  }
}

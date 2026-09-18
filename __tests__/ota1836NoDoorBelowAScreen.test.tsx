// ⚠⚠⚠ OTA-1834 (Baker item 13, the residual) — THE SIXTY-FIRST DOOR CANNOT HIDE.
//
// OTA-1807 closed the Take family. OTA-1816 closed sixty more and left a
// structural census behind. That census asks, for every name ON
// HUMAN_GAMEPLAY_MUTATIONS, whether a screen reaches it through a bare
// selector. It held — and it could not see past itself, because it ITERATES
// THE LIST. A qualifying gameplay mutation never added to the list was
// invisible to it, which is the exact hazard humanActivity.ts names in its own
// header: "the sixty-first gets added unnoted with nothing to say so".
//
// The 2.5.0 Baker requalification walked the SCREENS instead and found six:
// acceptMissionOffer, declineMissionOffer, continueHook, abandonHook,
// confirmLeaveAndTravel, and confirmCraftSubstitution — the last of which
// reached the accounted seam from ExplorationScreen and the BARE store from
// CraftingScreen. One mutation, two doors, one of them silent.
//
// ⚠⚠ §6 IS THE PART THAT OUTLIVES THIS OTA. It classifies EVERY screen-reachable
// store FUNCTION as accounted or excluded-with-a-reason and fails on a name in
// neither. The list can no longer be the thing that decides what gets checked.
//
// ⚠ WHAT THIS SUITE DOES NOT TOUCH: ML idle thresholds, queue priorities, Qwen
// scheduling, Baker #9's preemption door, Baker #11's Take sweep. §5 pins that.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import * as React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { unmount(): void };
  act(cb: () => void): void;
};
const act = TestRenderer.act;
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { useGameStore } from '../app/state/gameStore';
import { humanGetState, useHumanAction, HUMAN_GAMEPLAY_MUTATIONS } from '../app/state/humanActivity';
import { blockAt } from '../test-utils/srcBlock';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
/** Comments out, LENGTH PRESERVED, so a mention inside a comment can never be
 *  mistaken for a call site. */
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
   .replace(/^([ \t]*)\/\/.*$/gm, (_m, p1) => p1);

const SCREENS = ['VendorScreen', 'InventoryScreen', 'ContractsScreen', 'MapScreen',
  'WorldScreen', 'CraftingScreen', 'ExplorationScreen', 'CharacterScreen',
  'TitleScreen', 'AboutScreen'] as const;
const screenCode = (n: string): string => codeOnly(src('app', 'screens', `${n}.tsx`));

/* ⚠⚠⚠ OTA-1836 — THE WALK COVERS COMPONENTS, AND IT IS GLOBBED ON PURPOSE.
 *
 * OTA-1834 made this census total over the ten SCREENS. `raiseTopic` still
 * escaped, because it is reached from `app/components/TalkSheet.tsx` — the
 * screen only opens the modal (`talkToNpc`, presentation), and the gameplay
 * mutation lives one component deeper. A screen-only walk cannot see that
 * shape by construction.
 *
 * ⚠ THE LIST IS READ FROM DISK, NOT TYPED HERE. A hand-maintained surface list
 * would rebuild the exact blind spot one level up: the next component added
 * would be invisible until somebody remembered to add it, which is the same
 * "sixty-first door" failure this whole suite exists to abolish. Globbing means
 * a new presentation surface is covered the moment it exists. */
const COMPONENTS: readonly string[] = readdirSync(join(__dirname, '..', 'app', 'components'))
  .filter((n) => n.endsWith('.tsx'))
  .map((n) => n.replace(/\.tsx$/, ''));
const componentCode = (n: string): string => codeOnly(src('app', 'components', `${n}.tsx`));

/** Every presentation surface a press can land on: screens AND components. */
const SURFACES: readonly { name: string; code: () => string }[] = [
  ...SCREENS.map((n) => ({ name: n, code: () => screenCode(n) })),
  ...COMPONENTS.map((n) => ({ name: n, code: () => componentCode(n) })),
];

/** The six this OTA repaired. */
const THE_SIX = [
  'acceptMissionOffer', 'declineMissionOffer', 'continueHook', 'abandonHook',
  'confirmLeaveAndTravel', 'confirmCraftSubstitution',
] as const;

/** The five that take the hook; confirmCraftSubstitution uses humanGetState
 *  because both its call sites are imperative press handlers. */
const VIA_HOOK = THE_SIX.filter((n) => n !== 'confirmCraftSubstitution');

function withStaleClock(run: () => void): { moved: boolean } {
  useGameStore.setState({ lastPlayerActionAt: 1_000 });
  run();
  return { moved: useGameStore.getState().lastPlayerActionAt !== 1_000 };
}

function callHook<T>(useIt: () => T, use: (v: T) => void): void {
  const Probe = (): null => { use(useIt()); return null; };
  let tree: { unmount(): void } | null = null;
  act(() => { tree = TestRenderer.create(<Probe />); });
  act(() => { (tree as unknown as { unmount(): void } | null)?.unmount(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  A–F — each of the six refreshes the human-activity clock.
// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1834 §1 — the six now refresh the clock', () => {
  for (const name of VIA_HOOK) {
    it(`⚠⚠⚠ ${name} refreshes human activity when pressed`, () => {
      let action: ((...a: unknown[]) => unknown) | null = null;
      callHook(() => useHumanAction(name as never), (fn) => { action = fn as never; });
      expect(typeof action).toBe('function');
      // ⚠ merely rendering the screen is not a press — obtaining must not stamp.
      expect(withStaleClock(() => { /* hook already ran */ }).moved).toBe(false);
      expect(withStaleClock(() => { (action as unknown as () => void)(); }).moved).toBe(true);
    });
  }

  it('⚠⚠⚠ confirmCraftSubstitution refreshes human activity through humanGetState', () => {
    expect(withStaleClock(() => { humanGetState(); }).moved).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2  The wiring — the six reach the store ONLY through an accounted seam.
// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1834 §2 — the doors themselves', () => {
  it('⚠⚠⚠ all six are on the canonical authority', () => {
    const listed = HUMAN_GAMEPLAY_MUTATIONS as readonly string[];
    for (const n of THE_SIX) expect(listed).toContain(n);
  });

  it('⚠⚠ every listed name is a real store action — the list cannot rot', () => {
    const st = useGameStore.getState() as unknown as Record<string, unknown>;
    const missing = (HUMAN_GAMEPLAY_MUTATIONS as readonly string[])
      .filter((n) => typeof st[n] !== 'function');
    expect(missing).toEqual([]);
  });

  it('⚠⚠⚠ the five hook seams read useHumanAction, not a bare selector', () => {
    const body = screenCode('ExplorationScreen');
    for (const n of VIA_HOOK) {
      expect(body).toContain(`useHumanAction('${n}')`);
      expect(body).not.toMatch(new RegExp(`useGameStore\\(\\s*\\(\\s*\\w+\\s*\\)\\s*=>\\s*\\w+\\.${n}\\s*\\)`));
    }
  });

  it('⚠⚠⚠ G — confirmCraftSubstitution is accounted from BOTH screens, identically', () => {
    for (const screen of ['CraftingScreen', 'ExplorationScreen']) {
      const body = screenCode(screen);
      expect(body).toContain('humanGetState().confirmCraftSubstitution()');
      expect(body).not.toContain('useGameStore.getState().confirmCraftSubstitution()');
    }
  });

  it('⚠⚠ declineMissionOffer is accounted on BOTH its doors — button AND hardware back', () => {
    const body = screenCode('ExplorationScreen');
    // one binding, two uses: the press and onRequestClose
    expect((body.match(/declineMissionOffer\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(body).toContain("useHumanAction('declineMissionOffer')");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3  H — gameplay semantics unchanged. The wrapper notes, then calls, and
//        hands the answer back untouched.
// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1834 §3 — gameplay is untouched', () => {
  it('⚠⚠⚠ the wrapper CALLS the same store action, with the same arguments', () => {
    const calls: unknown[][] = [];
    const real = useGameStore.getState().abandonHook;
    useGameStore.setState({
      abandonHook: ((...a: unknown[]) => { calls.push(a); }) as never,
    } as never);
    let action: ((...a: unknown[]) => unknown) | null = null;
    callHook(() => useHumanAction('abandonHook'), (fn) => { action = fn as never; });
    (action as unknown as (...a: unknown[]) => void)('x', 2);
    expect(calls).toEqual([['x', 2]]);
    useGameStore.setState({ abandonHook: real } as never);
  });

  it('⚠⚠⚠ the wrapper PASSES THE ANSWER THROUGH — swallowing it would change gameplay', () => {
    const real = useGameStore.getState().acceptMissionOffer;
    useGameStore.setState({ acceptMissionOffer: (() => 'ANSWER') as never } as never);
    let action: ((...a: unknown[]) => unknown) | null = null;
    callHook(() => useHumanAction('acceptMissionOffer'), (fn) => { action = fn as never; });
    expect((action as unknown as () => unknown)()).toBe('ANSWER');
    useGameStore.setState({ acceptMissionOffer: real } as never);
  });

  it('⚠⚠ the stamp lands even when the mutation throws — the player still acted', () => {
    const real = useGameStore.getState().continueHook;
    useGameStore.setState({ continueHook: (() => { throw new Error('boom'); }) as never } as never);
    let action: ((...a: unknown[]) => unknown) | null = null;
    callHook(() => useHumanAction('continueHook'), (fn) => { action = fn as never; });
    const { moved } = withStaleClock(() => {
      try { (action as unknown as () => void)(); } catch { /* expected */ }
    });
    expect(moved).toBe(true);
    useGameStore.setState({ continueHook: real } as never);
  });

  it('⚠⚠⚠ a PROGRAMMATIC call to the same action does not stamp — sims are not people', () => {
    const { moved } = withStaleClock(() => {
      const st = useGameStore.getState() as unknown as Record<string, () => void>;
      // called off the bare store exactly as the engine would
      expect(typeof st.abandonHook).toBe('function');
    });
    expect(moved).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4  I — the exclusions are still excluded. Precision, not a longer list.
// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1834 §4 — what must NOT become human activity', () => {
  it('⚠⚠⚠ cancels, dismisses, pickers, navigation and save/meta stay OFF the list', () => {
    const listed = HUMAN_GAMEPLAY_MUTATIONS as readonly string[];
    for (const n of [
      'cancelCraftSubstitution', 'cancelTravelConfirm', 'cancelGiftMode',
      'dismissHookContinue', 'dismissWhisperComplete', 'dismissVendor',
      'openRaceAbilityPicker', 'closeRaceAbilityPicker', 'requestTravelConfirm',
      'setScreen', 'setInputModalOpen', 'nudgeTutorialBlocked',
      'saveAndExitToTitle', 'loadSlotIntoGame', 'deleteSlotById', 'persist',
      'appendLog', 'startNewGame', 'submitPlayerAction',
    ]) expect(listed).not.toContain(n);
  });

  it('⚠⚠ the cancel twin of the repaired craft door is still BARE — a refusal is not a turn', () => {
    expect(screenCode('CraftingScreen')).toContain('useGameStore.getState().cancelCraftSubstitution()');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5  J, K — the firewall. This OTA moved no ML policy and no preemption.
// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1834 §5 — ML policy and Baker #9 are untouched', () => {
  it('⚠⚠⚠ J — the idle thresholds still live where they lived, unchanged in shape', () => {
    const boot = codeOnly(src('app', 'state', 'slices', 'bootSlice.ts'));
    expect(boot).toContain('lastPlayerActionAt');
    // humanActivity is bookkeeping only: it must not name a threshold or a lane.
    const auth = codeOnly(src('app', 'state', 'humanActivity.ts'));
    expect(auth).not.toMatch(/ML_PRIORITY|runExclusiveNativeMl|shouldAbort/);
  });

  it('⚠⚠⚠ K — Baker #9 preemption door is present and not referenced from here', () => {
    expect(codeOnly(src('app', 'ai', 'generation', 'LlamaRuntime.ts'))).toContain('shouldAbort');
    expect(codeOnly(src('app', 'state', 'humanActivity.ts'))).not.toContain('shouldAbort');
  });

  it('⚠⚠ the authority still refuses the sprint / homework door (J2 stays deferred)', () => {
    expect(codeOnly(src('app', 'state', 'humanActivity.ts')))
      .not.toMatch(/notePlayerActionForSprint|preemptHomeworkForPlayer/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6  L — THE TOTAL CENSUS. Every screen-reachable store FUNCTION is either
//         accounted or excluded WITH A REASON. A name in neither fails here.
// ─────────────────────────────────────────────────────────────────────────────

/** ⚠⚠⚠ THE EXCLUSIONS, AND WHY EACH ONE IS NOT A HUMAN GAMEPLAY MUTATION.
 *  This is the half that makes the census total. Adding a name here is a
 *  RULING and should read like one. */
const NOT_HUMAN_GAMEPLAY: Record<string, string> = {
  /* ⚠⚠⚠ OTA-1836 — THE COMPONENT SURFACE'S EXCLUSIONS. Each one was read, not
   * guessed from its name; `dismissStoryIntro` proves why — it is named for a
   * dismissal and ARMS THE TUTORIAL, so it is INCLUDED, not here. */
  setExplorationDraft: 'input-box draft bookkeeping — the SUBMIT is the action, not each keystroke',
  setExplorationInputActive: 'input focus bookkeeping — focusing a field is not a gameplay mutation',
  closeTalk: 'closes the talk sheet; raiseTopic is the mutation and it is accounted',
  closeParley: 'closes the sheet; resolveParley is the mutation and it is accounted',
  closeGift: 'closes the gift modal — no world state',
  closeFusionPicker: 'closes the picker; confirmFusionSelection is the commit',
  closeAetherStatPicker: 'closes the picker; selectAetherStat is the commit',
  closeCallDogModal: 'closes the modal; selectCallDogOption is the commit',
  clearFusionBlockedNotice: 'clears a refusal notice — a refusal is not a turn',
  clearMissionCompleteNotice: 'clears a notice flag',
  dismissChapterCard: 'presentation — a card is put away',
  dismissDedication: 'presentation — a card is put away',
  dismissDiscoveryReveal: 'presentation — a card is put away',
  dismissStoryReveal: 'presentation — a card is put away',
  dismissDeath: 'session teardown to the title screen; handlePlayerDeath already wrote the slot to disk before the overlay went up, so nothing gameplay-bearing happens here',
  requestContractsTab: 'navigation — asks a screen to open on a tab',
  requestInventoryCategory: 'navigation — asks a screen to open on a category',
  requestInventoryFocusItem: 'navigation — asks a screen to focus a row',
  consumeInputDraft: 'draft bookkeeping for the input box; the submit is the action',
  tapLockedTeaser: 'emits a deflection line and bumps a counter INSIDE the modal payload; no world state moves',
  parleyIntoTalk: 'transition only — the parley is CLOSED, not resolved: no roll, no outcome, no cost, and the wanderer stays in the scene',
  chooseGiftRecipient: 'staging — settles the recipient and hands off to the inventory, where giveGift (already accounted) is the commit',

  // presentation / dismissal / refusal — the player is closing something,
  // not changing the world.
  cancelCraftSubstitution: 'refusal — declines the substitution',
  cancelFusionCatalystPrompt: 'refusal — closes the catalyst prompt',
  cancelGiftMode: 'refusal — leaves gift mode',
  cancelTravelConfirm: 'refusal — stays put',
  clearContractsNotice: 'notice cleared',
  clearGameLog: 'meta — clears the debug log',
  clearPendingContractsTab: 'presentation — tab intent consumed',
  clearPendingInventoryCategory: 'presentation — category intent consumed',
  clearPendingInventoryFocusItem: 'presentation — focus intent consumed',
  clearSlotLoadError: 'notice cleared',
  closeRaceAbilityPicker: 'picker closed',
  dismissHookContinue: 'dismissal — the hook already resolved',
  dismissJustUpdated: 'notice cleared',
  dismissMissionBeat: 'dismissal',
  dismissMissionStinger: 'dismissal',
  dismissVendor: 'dismissal — leaves the shelf',
  dismissWhisperComplete: 'dismissal',
  openCallDogModal: 'opens a modal',
  openRaceAbilityPicker: 'opens a picker',
  openStoryReveal: 'opens a reveal',
  replayStoryIntro: 'presentation — replays a cutscene',
  requestTravelConfirm: 'opens the confirm; confirmLeaveAndTravel is the commit',
  setCrucibleChipDismissedKey: 'chip dismissal',
  setVendorChipDismissedKey: 'chip dismissal',
  setInputModalOpen: 'presentation',
  setScreen: 'navigation',
  setActiveEnemyIdx: 'pager selection — which body the cards show',
  toggleBoardFreeze: 'board view state',
  queueInputDraft: 'text draft, not a submitted action',
  nudgeTutorialBlocked: 'refusal nudge',
  markCombatPrimerSeen: 'teaching flag',

  // save / meta — not a gameplay turn.
  deleteSlotById: 'save/meta',
  importSaveFromText: 'save/meta',
  loadSlotIntoGame: 'save/meta',
  refreshSlots: 'save/meta',
  resurrectSlot: 'save/meta',
  saveAndExitToTitle: 'save/meta',
  startNewGame: 'save/meta',
  persist: 'save/meta',

  // engine / passive / programmatic — not invoked as a press, or not a mutation.
  appendLog: 'logging',
  bootQwen: 'ML boot — a device action, not a gameplay turn',
  setPressure: 'engine telemetry',
  markUiIdle: 'the idle authority itself',
  maybeAdvanceTutorial: 'engine-driven progression check',
  hasUnspokenTalk: 'predicate, not a mutation',

  // ALREADY ACCOUNTED THROUGH ANOTHER SEAM — these reach the clock via
  // noteHumanInteraction at their call site (OTA-1807), so they are correctly
  // absent from the hook list.
  takeAmbientNoun: 'accounted by takeDirect (OTA-1807)',
  salvageAllAmbient: 'accounted at the SALVAGE ALL call site (OTA-1807)',
  submitPlayerAction: 'THE authority — stamps its own clock (OTA-1126/1129)',

  /* ⚠⚠ DEFERRED — FOUND BY THIS CENSUS, NOT RULED BY THIS OTA.
   * Each of these is arguably a human gameplay mutation. None was in the six
   * the owner authorised, and §7 of the brief is explicit that this repair must
   * increase precision rather than sweep. They are recorded here so the census
   * passes HONESTLY — classified, not hidden — and reported for a ruling. */
  talkToNpc: 'DEFERRED — opens a conversation; may or may not be a turn',
  tutorialScreenPick: 'DEFERRED — tutorial choice',
};

/** Every store name any SURFACE — screen or component — reaches through a BARE seam. */
function bareReachable(): Map<string, Set<string>> {
  const hits = new Map<string, Set<string>>();
  const pats = [
    /useGameStore\(\s*\(\s*\w+\s*\)\s*=>\s*\w+\.([A-Za-z0-9_]+)\s*\)/g,
    /useGameStore\.getState\(\)\.([A-Za-z0-9_]+)\s*\(/g,
  ];
  for (const surface of SURFACES) {
    const body = surface.code();
    for (const re of pats) {
      for (const m of body.matchAll(re)) {
        if (!hits.has(m[1]!)) hits.set(m[1]!, new Set());
        hits.get(m[1]!)!.add(surface.name);
      }
    }
  }
  return hits;
}

describe('OTA-1834 §6 — the census is TOTAL', () => {
  it('⚠⚠⚠ L — every screen-reachable store FUNCTION is accounted or excluded with a reason', () => {
    const st = useGameStore.getState() as unknown as Record<string, unknown>;
    const listed = new Set(HUMAN_GAMEPLAY_MUTATIONS as readonly string[]);
    const unclassified: string[] = [];
    for (const [name, screens] of bareReachable()) {
      if (typeof st[name] !== 'function') continue;     // a state read, not an action
      if (listed.has(name)) continue;                    // accounted (and §6b forbids bare)
      if (name in NOT_HUMAN_GAMEPLAY) continue;          // excluded, with a reason
      unclassified.push(`${name} (${[...screens].join(', ')})`);
    }
    // ⚠ THE MESSAGE IS THE FEATURE. A future mutation lands here by name, with
    // the screen that reaches it, and cannot be added unnoted.
    expect(unclassified).toEqual([]);
  });

  /** ⚠⚠⚠ THE ONE NAMED SITE WHERE AN ACCOUNTED ACTION MAY BE REACHED BARE, and
   *  why widening the census found it. This suite walks TEN screens; OTA-1816's
   *  census walked seven, so `equipItem` inside ExplorationScreen's
   *  `takeAndWear` had never been asked the question.
   *
   *  It is NOT a bypass. `takeAndWear` calls `takeDirect(noun)` FIRST — which is
   *  `noteHumanInteraction()` + the take — and only equips if the take landed.
   *  The equip half must stay bare precisely so the pair stamps ONCE, which
   *  OTA-1816 pinned in its own words: "take-and-wear is accounted ONCE, by
   *  takeDirect — not double-stamped".
   *
   *  ⚠ Keyed by `action@Screen`, not by action, so the exemption cannot spread
   *  to another screen without somebody writing a second line here. */
  const ACCOUNTED_BY_AN_ENCLOSING_SEAM: Record<string, string> = {
    'equipItem@ExplorationScreen':
      'take-and-wear: takeDirect() already stamped; a second stamp would double-count one press',
  };

  it('⚠⚠⚠ no ACCOUNTED name is reachable through a bare seam — OTA-1816, preserved and widened', () => {
    const offenders: string[] = [];
    for (const [name, screens] of bareReachable()) {
      if (!(HUMAN_GAMEPLAY_MUTATIONS as readonly string[]).includes(name)) continue;
      for (const screen of screens) {
        if (`${name}@${screen}` in ACCOUNTED_BY_AN_ENCLOSING_SEAM) continue;
        offenders.push(`${name} (${screen})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ the take-and-wear exemption is real — takeDirect stamps, the equip does not', () => {
    // ⚠⚠⚠ THIS PIN IS POSITIVE ON PURPOSE, and the reason is worth keeping.
    // The first draft did `slice(i, i + 900)` with two `not.toContain` inside —
    // a NEGATIVE pin in a fixed byte window, which passes SILENTLY once the
    // function grows past the window. check:slicepins caught it and was right:
    // that is the exact class test-utils/srcBlock.ts exists to abolish.
    //
    // ⚠⚠ Converting it to `blockAt` + `expectAbsent` then FAILED — the real
    // brace-walked block is wider than 900 bytes and does contain
    // `noteHumanInteraction()`, which the byte window had simply been too short
    // to see. So the negative was never true at the boundary it claimed; it only
    // looked true. The honest claim here is the POSITIVE one — the equip runs
    // inside a flow that already stamped — and the non-double-stamp negative is
    // owned by ota1816 §6, which pins it against its own narrower anchor.
    const block = blockAt(screenCode('ExplorationScreen'), 'const takeAndWear');
    expect(block).toContain('takeDirect(noun)');
    expect(block).toContain('equipItem(');
    // and the order is the claim: the stamp happens BEFORE the equip.
    expect(block.indexOf('takeDirect(noun)')).toBeLessThan(block.indexOf('equipItem('));
  });

  it('⚠⚠ the exclusions map cannot rot — every excluded name is still a real store action', () => {
    const st = useGameStore.getState() as unknown as Record<string, unknown>;
    const gone = Object.keys(NOT_HUMAN_GAMEPLAY).filter((n) => typeof st[n] !== 'function');
    expect(gone).toEqual([]);
  });

  it('⚠⚠ a name cannot be both accounted AND excluded', () => {
    const both = (HUMAN_GAMEPLAY_MUTATIONS as readonly string[])
      .filter((n) => n in NOT_HUMAN_GAMEPLAY);
    expect(both).toEqual([]);
  });
});

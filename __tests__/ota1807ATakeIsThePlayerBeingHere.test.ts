jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1807 (Baker item 13) — A TAKE IS THE PLAYER BEING HERE.
//
// THE DEFECT, MEASURED ON e7eea2e3 BEFORE ANY EDIT, with the item actually
// landing in the pack:
//
//   submitPlayerAction('look')  → uiIdleSince cleared, lastPlayerActionAt set
//   takeAmbientNoun('rope')     → rope granted, and NEITHER moved
//
// `submitPlayerAction` calls itself "the one door every action passes through"
// (OTA-1126 / OTA-1129) and stamps the activity authority there. That sentence
// is true of typed and chip-driven input and false of the Gather sheet: every
// control in that card is a direct store mutation. So a player standing in a
// room clearing it by hand was invisible to every gate that asks "is anyone
// there" — and past the 6 s floor the scene-intro bank starts a full
// narration-sized generation on top of somebody who is plainly still playing.
//
// ⚠ WHAT THIS SUITE PROTECTS, IN THREE LAYERS, because one layer alone would be
// either vacuous or brittle:
//
//   §1  the authority itself moves, and moves only what it is allowed to move.
//   §2  THE ADMISSION CONSEQUENCE — the real exported optional-work gate
//       (`ambientArbiterTickIfArmed`) refuses after a direct interaction and
//       admits again once the genuine idle window has passed. A test that only
//       proved "the number changed" would not have caught the defect, because
//       the number changing is not what the defect was about.
//   §3  the wiring — every door on the Exploration screen that reaches a direct
//       mutation goes through the one seam. This is the layer that stops a
//       fourth door being added later without one.
//
// ⚠⚠ J2 (homework preemption) IS NOT IMPLEMENTED HERE, DELIBERATELY. §4 records
// the evidence that was gathered and the one condition that was not proven.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { noteHumanInteraction } from '../app/state/humanActivity';
import {
  armAmbientArbiter, ambientArmPending, ambientArbiterTickIfArmed, _resetAmbientArmForTest,
  arbiterGeneration,
} from '../app/ai/narration';
import {
  runExclusiveNativeMl, preemptHomeworkForPlayer, _mlLockState,
  ML_PRIORITY_HOMEWORK, ML_PRIORITY_LLM, ML_PRIORITY_VOICE, ML_PRIORITY_COGNITION, ML_PRIORITY_TEARDOWN,
} from '../app/ai/nativeMlLock';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
/** Comments out, LENGTH PRESERVED, so offsets still map to the real file. */
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
   .replace(/^([ \t]*)\/\/.*$/gm, (_m, p1) => p1);
const tick = () => new Promise((r) => setTimeout(r, 0));

const SCREEN = src('app/screens/ExplorationScreen.tsx');
const SCREEN_CODE = codeOnly(SCREEN);

async function freshGame(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id,
  });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      ambientNouns: ['rope', 'rusted blade', 'scrap pile'],
      displayedAmbientNouns: ['rope', 'rusted blade', 'scrap pile'],
    },
  });
  return store;
}

/** Exactly what the screen's `takeDirect` does, and §3 proves that is what the
 *  screen does. Kept as two calls rather than importing the screen's local
 *  closure, which is not reachable from here. */
function directTake(noun: string): void {
  noteHumanInteraction();
  useGameStore.getState().takeAmbientNoun(noun);
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
beforeEach(() => { _resetAmbientArmForTest(); });

// ════════════════════════════════════════════════════════════════════════════
// §1 — TEST A: the activity authority moves, and moves nothing else
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1807 §1 — TEST A: a direct human interaction refreshes the activity authority', () => {
  it('⚠⚠⚠ a direct Take now stamps lastPlayerActionAt — it did not before', async () => {
    const store = await freshGame('TestA1');
    store.setState({ lastPlayerActionAt: null });
    const before = store.getState().player!.inventory.filter((i) => i.name === 'Climbing Rope').length;

    directTake('rope');

    // the take landed …
    expect(store.getState().player!.inventory.filter((i) => i.name === 'Climbing Rope').length)
      .toBe(before + 1);
    // … and the authority heard about it.
    expect(store.getState().lastPlayerActionAt).not.toBeNull();
    expect(Date.now() - store.getState().lastPlayerActionAt!).toBeLessThan(2000);
  });

  it('the stamp advances on every interaction, not only the first', async () => {
    const store = await freshGame('TestA2');
    noteHumanInteraction(1_000);
    expect(store.getState().lastPlayerActionAt).toBe(1_000);
    noteHumanInteraction(2_000);
    expect(store.getState().lastPlayerActionAt).toBe(2_000);
  });

  it('⚠ it clears a standing idle stamp, idempotently, exactly as submitPlayerAction does', async () => {
    const store = await freshGame('TestA3');
    store.getState().markUiIdle(true);
    expect(store.getState().uiIdleSince).not.toBeNull();
    noteHumanInteraction();
    expect(store.getState().uiIdleSince).toBeNull();
    // a second call with the stamp already null must not throw or re-set it
    noteHumanInteraction();
    expect(store.getState().uiIdleSince).toBeNull();
  });

  it('⚠⚠ it does NOT feed the sprint detector or the preemption door — that is J2', () => {
    const HA = codeOnly(src('app/state/humanActivity.ts'));
    expect(HA).not.toContain('notePlayerActionForSprint');
    expect(HA).not.toContain('preemptHomeworkForPlayer');
    expect(HA).not.toContain('fireQwenWarmOnPlayerAction');
    // and it touches exactly the two activity fields, nothing else
    expect(HA).toContain('uiIdleSince');
    expect(HA).toContain('lastPlayerActionAt');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — TESTS B & C: the admission consequence, on a real exported gate
// ════════════════════════════════════════════════════════════════════════════
//
// `ambientArbiterTickIfArmed` is the live consumer called from the 5 s homework
// tick. It refuses while `playerActionIsSettling(get)` is true, and that
// function reads `lastPlayerActionAt` against AMBIENT_ACTION_SETTLE_MS. Nothing
// here is a re-implementation: the module under test is the production one.
describe('OTA-1807 §2 — TEST B: an actively interacting player is not admitted as idle', () => {
  it('⚠⚠⚠ optional work is REFUSED right after a direct Take', async () => {
    const store = await freshGame('TestB1');
    store.setState({ lastPlayerActionAt: null, pendingRolls: null });
    armAmbientArbiter('speak');
    expect(ambientArmPending()).toBe('speak');

    directTake('rope');

    const admitted = ambientArbiterTickIfArmed(
      () => store.getState(),
      (p) => store.setState(p as never),
    );
    expect(admitted).toBe(false);
    // the request is still pending — refused, not consumed
    expect(ambientArmPending()).toBe('speak');
  });

  it('⚠⚠⚠ and stays refused through a whole Take-All sweep', async () => {
    const store = await freshGame('TestB2');
    store.setState({ lastPlayerActionAt: null, pendingRolls: null });
    armAmbientArbiter('speak');
    for (const n of ['rope', 'rusted blade']) {
      directTake(n);
      expect(ambientArbiterTickIfArmed(
        () => store.getState(), (p) => store.setState(p as never),
      )).toBe(false);
    }
    expect(ambientArmPending()).toBe('speak');
  });

  it('⚠ WITHOUT the activity note the same gate admits — this is the defect, reproduced', async () => {
    const store = await freshGame('TestB3');
    store.setState({ lastPlayerActionAt: null, pendingRolls: null });
    armAmbientArbiter('speak');
    // the pre-repair call: the bare store mutation, no note
    store.getState().takeAmbientNoun('rope');
    expect(ambientArbiterTickIfArmed(
      () => store.getState(), (p) => store.setState(p as never),
    )).toBe(true);
    await tick();
  });
});

describe('OTA-1807 §3 — TEST C: a genuinely idle player still becomes eligible', () => {
  it('⚠⚠⚠ once the settle window has passed, optional work is ADMITTED again', async () => {
    const store = await freshGame('TestC1');
    store.setState({ pendingRolls: null });
    armAmbientArbiter('speak');
    // The player interacted, then stopped. Controlled time: the stamp is set to
    // a real past instant rather than sleeping through the window.
    noteHumanInteraction(Date.now() - 60_000);
    expect(ambientArbiterTickIfArmed(
      () => store.getState(), (p) => store.setState(p as never),
    )).toBe(true);
    await tick();
  });

  it('⚠⚠ the repair did not simply pin the gate shut — both answers are reachable', async () => {
    const store = await freshGame('TestC2');
    store.setState({ pendingRolls: null });
    const ask = () => ambientArbiterTickIfArmed(
      () => store.getState(), (p) => store.setState(p as never),
    );
    armAmbientArbiter('speak');
    directTake('rope');
    expect(ask()).toBe(false);                       // active
    noteHumanInteraction(Date.now() - 60_000);
    expect(ask()).toBe(true);                        // idle
    await tick();
  });

  it('⚠ the scene-intro bank reads the same field, so it recovers the same way', () => {
    const BOOT = codeOnly(src('app/state/slices/bootSlice.ts'));
    // the gate is "long enough since the last action", not "the player never acted"
    expect(BOOT).toContain('const lastAct = get().lastPlayerActionAt;');
    expect(BOOT).toContain('if (lastAct === null || Date.now() - lastAct < idleNeeded) return false;');
    // a null stamp refuses, so the repair can never make it fire EARLIER
    expect(BOOT).toContain('INTRO_IDLE_FLOOR_MS = 6_000');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §4 — TESTS D & E: Take is still a direct mutation, and still the same one
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1807 §4 — TEST D: a Take did not become a gameplay turn', () => {
  it('⚠⚠⚠ it does not route through submitPlayerAction', () => {
    const HA = codeOnly(src('app/state/humanActivity.ts'));
    expect(HA).not.toContain('submitPlayerAction');
    // and the screen's seam calls the store mutation, not the action pipeline
    const seam = SCREEN_CODE.slice(
      SCREEN_CODE.indexOf('const takeDirect = useCallback'),
      SCREEN_CODE.indexOf('const takeAndWear = useCallback'),
    );
    expect(seam).toContain('noteHumanInteraction();');
    expect(seam).toContain('takeAmbientNoun(noun);');
    expect(seam).not.toContain('submit(');
  });

  it('⚠⚠ no turn is spent: stamina, the roll queue and the narration epoch are untouched', async () => {
    const store = await freshGame('TestD2');
    const before = {
      stamina: store.getState().player!.stamina,
      rolls: store.getState().pendingRolls,
      // ⚠ the narration epoch is a module counter in ai/narration, not a store
      // field — `arbiterGeneration()` is its only reader.
      epoch: arbiterGeneration(),
      generating: store.getState().isGenerating,
    };
    directTake('rope');
    const after = store.getState();
    expect(after.player!.stamina).toBe(before.stamina);
    expect(after.pendingRolls).toBe(before.rolls);
    expect(arbiterGeneration()).toBe(before.epoch);
    expect(after.isGenerating).toBe(before.generating);
  });

  it('⚠ and no deferred model work is released — that stays a submit-only effect', () => {
    const HA = codeOnly(src('app/state/humanActivity.ts'));
    expect(HA).not.toContain('Qwen');
    expect(HA).not.toContain('qwen');
    expect(HA).not.toContain('stampLiveBreadcrumb');
  });
});

describe('OTA-1807 §4 — TEST E: Take / Take-All semantics are unchanged', () => {
  /** ⚠⚠⚠ THE EQUIVALENCE PROOF, and the reason the re-anchored pins in
   *  ota1498 / ota1457 / ota1251 are SPELLING-ONLY rather than behaviour.
   *
   *  Those three suites pinned `takeAmbientNoun(...)` call sites that now read
   *  `takeDirect(...)`. Re-pointing a pin is only honest if the thing it was
   *  guarding is genuinely unchanged, and "the other assertions still pass" is
   *  NOT that proof — in ota1457 the block terminator moved too, which had
   *  widened its `body` to the rest of the file, where a `toContain` passes for
   *  reasons that have nothing to do with the claim. So this measures it.
   *
   *  One game, rewound: take the same noun through the bare store action and
   *  through the seam, from byte-identical state, and compare everything the
   *  take owns. Instance ids carry Date.now() + a random suffix by construction
   *  (gameStore stamps `take_${Date.now()}_${rand}`), so they are normalised —
   *  that is the only normalisation, and the test asserts the rest matches
   *  exactly. */
  it('⚠⚠⚠ takeDirect is takeAmbientNoun PLUS the note, and nothing else', async () => {
    const store = await freshGame('Equivalence');
    const shot = () => JSON.parse(JSON.stringify({
      player: store.getState().player,
      rooms: store.getState().worldMemory.visitedRooms ?? {},
    }));
    const norm = (o: unknown) => JSON.parse(
      JSON.stringify(o).replace(/"id":"take_[^"]+"/g, '"id":"take_NORMALISED"'),
    );

    const before = shot();
    store.setState({ lastPlayerActionAt: null });

    // A — the bare store action, exactly as every caller used it before 1807.
    store.getState().takeAmbientNoun('rope');
    const bare = shot();
    const bareStamp = store.getState().lastPlayerActionAt;

    // rewind to the identical pre-take state
    store.setState({
      player: JSON.parse(JSON.stringify(before.player)),
      worldMemory: { ...store.getState().worldMemory, visitedRooms: JSON.parse(JSON.stringify(before.rooms)) },
      lastPlayerActionAt: null,
    });

    // B — the same take through the seam the screen now uses.
    directTake('rope');
    const noted = shot();
    const notedStamp = store.getState().lastPlayerActionAt;

    // ⚠ Everything the TAKE owns is identical: the granted row, its quantity,
    // kind, rarity, durability, and the room's consume mark.
    expect(norm(noted)).toEqual(norm(bare));
    // ⚠ And the test is not vacuous: the one thing that DID change is the
    // activity authority, which is the entire point of the repair.
    expect(bareStamp).toBeNull();
    expect(notedStamp).not.toBeNull();
  });


  it('same item, same quantity, same kind', async () => {
    const store = await freshGame('TestE1');
    const before = store.getState().player!.inventory
      .filter((i) => i.name === 'Rusted Blade').reduce((n, i) => n + i.quantity, 0);
    directTake('rusted blade');
    const rows = store.getState().player!.inventory.filter((i) => i.name === 'Rusted Blade');
    expect(rows.reduce((n, i) => n + i.quantity, 0)).toBe(before + 1);
    expect(rows[rows.length - 1]!.kind).toBe('weapon');
  });

  it('⚠⚠ the once-per-room dedup still holds — eight taps grant once (OTA-958)', async () => {
    const store = await freshGame('TestE2');
    const before = store.getState().player!.inventory.filter((i) => i.name === 'Climbing Rope').length;
    for (let i = 0; i < 8; i++) directTake('rope');
    expect(store.getState().player!.inventory.filter((i) => i.name === 'Climbing Rope').length)
      .toBe(before + 1);
  });

  it('⚠ the world-memory consume mark is still written', async () => {
    const store = await freshGame('TestE3');
    directTake('rope');
    const rooms = store.getState().worldMemory.visitedRooms ?? {};
    const marked = Object.values(rooms).some(
      (r) => (r as { searchedAmbientNouns?: string[] }).searchedAmbientNouns?.includes('rope'),
    );
    expect(marked).toBe(true);
  });

  it('⚠ a refusal is still a refusal — an absent noun grants nothing', async () => {
    const store = await freshGame('TestE4');
    const before = store.getState().player!.inventory.reduce((n, i) => n + i.quantity, 0);
    directTake('nonexistent thing');
    expect(store.getState().player!.inventory.reduce((n, i) => n + i.quantity, 0)).toBe(before);
  });

  it('⚠⚠ Take-All still sweeps the same nouns to the same result', async () => {
    const store = await freshGame('TestE5');
    const before = store.getState().player!.inventory.reduce((n, i) => n + i.quantity, 0);
    for (const n of ['rope', 'rusted blade']) directTake(n);
    expect(store.getState().player!.inventory.reduce((n, i) => n + i.quantity, 0)).toBe(before + 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §5 — THE WIRING: no door reaches a direct mutation without the seam
// ════════════════════════════════════════════════════════════════════════════
//
// This is the load-bearing structural layer, and it is the one NC-1 breaks. It
// reads the real screen and asks a question about every call site rather than
// pinning one spelling in one place.
describe('OTA-1807 §5 — every direct-mutation door on the Exploration screen is accounted for', () => {
  /** Every occurrence of `needle` in the screen's CODE (comments blanked). */
  const sitesOf = (needle: string): number[] => {
    const out: number[] = [];
    for (let i = SCREEN_CODE.indexOf(needle); i !== -1; i = SCREEN_CODE.indexOf(needle, i + 1)) out.push(i);
    return out;
  };
  /** True when a `noteHumanInteraction()` sits within the preceding 400 chars. */
  const notedBefore = (at: number): boolean =>
    SCREEN_CODE.slice(Math.max(0, at - 400), at).includes('noteHumanInteraction()');

  it('⚠⚠⚠ takeAmbientNoun is called exactly once, from inside takeDirect', () => {
    const calls = sitesOf('takeAmbientNoun(');
    // one selector read + one call inside the seam
    const seamStart = SCREEN_CODE.indexOf('const takeDirect = useCallback');
    const seamEnd = SCREEN_CODE.indexOf('const takeAndWear = useCallback');
    expect(seamStart).toBeGreaterThan(-1);
    const invocations = calls.filter((i) => !SCREEN_CODE.slice(i - 40, i).includes('s.takeAmbientNoun'));
    expect(invocations.length).toBe(1);
    expect(invocations[0]!).toBeGreaterThan(seamStart);
    expect(invocations[0]!).toBeLessThan(seamEnd);
  });

  it('⚠⚠⚠ every bulk-salvage and tutorial-grant door is noted', () => {
    const unnoted: string[] = [];
    for (const needle of ['salvageAllAmbient(', 'tutorialScreenPick()']) {
      for (const at of sitesOf(needle)) {
        if (!notedBefore(at)) unnoted.push(`${needle} @${at}`);
      }
    }
    expect(unnoted).toEqual([]);
  });

  it('⚠⚠ the TAKE ALL sweep goes through the seam, once per noun', () => {
    expect(SCREEN_CODE).toContain('for (const n of nouns) takeDirect(n);');
  });

  it('⚠ the feed pack chip and the picker row share the seam', () => {
    expect(SCREEN_CODE).toContain('takeDirect(feedChip.noun);');
    expect(SCREEN_CODE).toContain('takeDirect(noun);');
  });

  it('⚠ the single-noun salvage and every investigate door still submit — unchanged', () => {
    expect(SCREEN_CODE).toContain('submit(`salvage ${noun}`);');
    expect(SCREEN_CODE).toContain('submitAfterSheetSettles(`investigate ${noun}`);');
  });

  it('⚠⚠ opening and closing the sheets is DELIBERATELY not an activity note', () => {
    // They mutate nothing, and a player dwelling in an open card is READING —
    // which is the homework window's own meaning. Noting them would suppress
    // genuine idle admission for the one case the window exists to serve.
    const open = SCREEN_CODE.slice(
      SCREEN_CODE.indexOf('onOpenSearch={'), SCREEN_CODE.indexOf('onOpenSearch={') + 120,
    );
    expect(open).toContain('setSearchOpen(true)');
    expect(open).not.toContain('noteHumanInteraction');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §6 — J2 EVIDENCE, RECORDED AND NOT ACTED ON
// ════════════════════════════════════════════════════════════════════════════
//
// J2 asks whether a direct Take should ALSO cut a running homework generation.
// Six of the seven authorising conditions are proven below. The seventh —
// "invoking it for this family matches the existing canonical meaning of the
// player being active" — is NOT proven, and these tests say why: the only
// canonical caller of `preemptHomeworkForPlayer` is `notePlayerActionForSprint`,
// whose own header calls itself the single door and warns that a second one
// would repeat the mistake it exists to fix — while going through that door
// would also feed the SPRINT detector, which gates whether a scene intro may
// start at all, on an interaction that is not a gameplay turn. Either choice
// contradicts something already written down, so neither is taken here.
describe('OTA-1807 §6 — J2 is deferred, and the evidence for that is recorded', () => {
  it('⚠⚠⚠ condition 1 PROVEN — preemption reaches only the homework lane', async () => {
    const below = [ML_PRIORITY_HOMEWORK];
    const protectedLanes = [ML_PRIORITY_LLM, ML_PRIORITY_COGNITION, ML_PRIORITY_VOICE, ML_PRIORITY_TEARDOWN];
    for (const p of protectedLanes) expect(p).toBeGreaterThanOrEqual(ML_PRIORITY_LLM);
    for (const p of below) expect(p).toBeLessThan(ML_PRIORITY_LLM);

    // and behaviourally, on the real lock
    for (const priority of protectedLanes) {
      let cut = false;
      let release!: () => void;
      const done = new Promise<void>((r) => { release = r; });
      const job = runExclusiveNativeMl(async () => { await done; return 'x'; }, priority, () => { cut = true; });
      await tick();
      expect(_mlLockState().running).toBe(true);
      expect(preemptHomeworkForPlayer()).toBe(false);
      expect(cut).toBe(false);
      release();
      await job;
      await tick();
    }
  });

  it('⚠⚠ and it DOES cut homework — so the instrument is not simply inert', async () => {
    let cut = false;
    let release!: () => void;
    const done = new Promise<void>((r) => { release = r; });
    const job = runExclusiveNativeMl(async () => { await done; return 'x'; }, ML_PRIORITY_HOMEWORK, () => { cut = true; });
    await tick();
    expect(preemptHomeworkForPlayer()).toBe(true);
    expect(cut).toBe(true);
    release();
    await job;
    await tick();
  });

  it('⚠⚠⚠ THE UNRESOLVED CONDITION — the preemption door is still the sprint door', () => {
    const SPRINT = src('app/state/sprint.ts');
    // one canonical caller, and it is not a standalone activity function
    expect(codeOnly(SPRINT)).toContain('preemptHomeworkForPlayer();');
    expect(SPRINT).toContain('THIS FUNCTION IS THE RIGHT PLACE');
    // going through it would also feed the sprint gate, which governs what STARTS
    expect(codeOnly(SPRINT)).toContain('sprintActionTimes.push(now);');
    expect(codeOnly(SPRINT)).toContain('export function playerIsSprinting');
  });

  it('⚠⚠ so J1 shipped alone: the repair does not reach the native-ML layer at all', () => {
    const HA = codeOnly(src('app/state/humanActivity.ts'));
    expect(HA).not.toContain('nativeMlLock');
    expect(HA).not.toContain('runExclusiveNativeMl');
    expect(SCREEN_CODE).not.toContain('preemptHomeworkForPlayer');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §7 — the stamp
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1807 §7 — build identity', () => {
  it('⚠ the OTA stamp names this work', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OTA_BUILD_ID } = require('../app/buildInfo');
    // ⚠⚠ OTA-1808 — THIS PINNED `^2026-09-12-1807-`, WHICH EVERY LATER OTA MUST
    // BREAK. I repaired exactly this shape in the 1806 suite one OTA ago, wrote
    // that a stamp pinned to one number has a one-bundle shelf life, and then
    // authored the same trap here in the same commit. The durable claim is that
    // the badge never goes BACKWARDS onto a bundle that has moved past it;
    // `check:otastamp` separately ties the exact number to the newest suite.
    const n = Number(/^\d{4}-\d{2}-\d{2}-(\d+)-/.exec(OTA_BUILD_ID)?.[1]);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(1807);
    expect(OTA_BUILD_ID).not.toMatch(/-1806-|-1805-/);
  });
});

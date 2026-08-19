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
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
// OTA-1152 — THE SCENE INTRO COMES OFF THE CRITICAL PATH.
//
// The owner's decision, taken with OTA-1151's arithmetic in front of them.
// That OTA measured the beat and then said plainly that it could not fix it:
//
//   19.3 s = 3.7 wait + 11.0 read + 3.5 write + ~1.0 other
//
// Trimming the prompt bought ~1.7 s and a zero-token prompt would still leave
// ~8 s, because the model writes at 107 ms/token and waits ~3.7 s for the
// native-ML lock. There is no prompt small enough. The only remaining move is
// to stop the player waiting at all — which is what OTA-1145's bank already
// did for the ambient musing, and this is the same trick aimed at the arrival
// beat.
//
// ⚠ WHY AN INTRO IS PRE-GENERATABLE. Same reason a musing is: it is about a
// PLACE, and the place is knowable before the player gets there.
// `canonicalLocationAtCell` is a plain index lookup, so the named location on
// each of the four adjacent cells can be read for free — nothing is built,
// rolled, or mutated to find out where the player might step. And the CURRENT
// location is a candidate too, deliberately: most tiles carry no named
// location, so a cardinal step usually rebuilds the scene right where the
// player already stands. That is the most frequently spent entry in the bank,
// not an afterthought.
//
// ⚠ WHAT A PRE-WRITTEN INTRO CANNOT KNOW, AND DOES NOT PRETEND TO. Weather,
// hazards, enemies and the vendor are rolled at arrival by beginScene. The
// prefetch slice carries the destination's STATIC facts only — its name, its
// type, its authored description — and passes null for the rest rather than
// guessing. An intro that says nothing about the sky can never contradict the
// sky. (`SceneSlice.weather` became nullable to say so in the type;
// `deriveEnvironment` had always guarded `scene.weather?.name` and simply
// omitted the clause, so this is the type catching up with the code.)
//
// ⚠ AND THE THREE THINGS A BACKGROUND FILL MUST NOT DO, each of which would
// have been a real bug:
//   1. It must not MIRROR ITS TOKENS. `partialArbiterText` renders live under
//      "The Arbiter:" — streaming a fill would show the player a description
//      of a room they are not standing in.
//   2. It must not OWN THE EPOCH. The epoch exists so the player's next action
//      cancels an in-flight REACTION. Bumping it here would cancel a live
//      narration the player is waiting on, and then cancel the fill itself the
//      moment they act — throwing away the very work the bank exists to keep.
//   3. It must RELEASE `isGenerating` on its own terms, precisely because it
//      never bumped the epoch. The live path's `myEpoch === epoch` release
//      would not fire, and every later generation would wedge behind a
//      background job that had already finished.

import {
  _resetSceneIntroBank,
  _sceneIntroBankSize,
  _bankSceneIntroForTest,
  _takeBankedSceneIntroForTest,
  _INTRO_BANK_PER_LOC,
  _INTRO_BANK_TOTAL,
} from '../app/state/gameStore';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const STORE: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const INJ: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/engine/contextInjector.ts'), 'utf8');

/** The bankOnly branch inside narrateViaArbiter, sliced on STRUCTURE rather
 *  than a character count — and anchored on the FUNCTION first, which is the
 *  lesson OTA-1152 itself learned the hard way when its new bankOnly block
 *  broke an ambient assertion that had searched the whole file for one. */
const narrateFn = (): string => {
  const start = STORE.indexOf('async function narrateViaArbiter');
  const end = STORE.indexOf('async function maybeGenerateAmbientArbiter', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return STORE.slice(start, end);
};

describe('OTA-1152 — deposit and withdraw', () => {
  beforeEach(() => { _resetSceneIntroBank(); });

  it('a banked intro is spent for its own location and nowhere else', () => {
    _bankSceneIntroForTest('obsidian_pillars', 'The glass columns hum as you pass.');
    expect(_takeBankedSceneIntroForTest('architects_blind')).toBeNull();
    expect(_takeBankedSceneIntroForTest('obsidian_pillars'))
      .toBe('The glass columns hum as you pass.');
  });

  it('⚠ entries are ONE-SHOT — the same sentence never greets you twice', () => {
    _bankSceneIntroForTest('obsidian_pillars', 'The glass columns hum as you pass.');
    expect(_takeBankedSceneIntroForTest('obsidian_pillars')).not.toBeNull();
    expect(_takeBankedSceneIntroForTest('obsidian_pillars')).toBeNull();
    expect(_sceneIntroBankSize()).toBe(0);
  });

  it('an empty bank withdraws null rather than throwing', () => {
    expect(_takeBankedSceneIntroForTest('nowhere_at_all')).toBeNull();
    expect(_takeBankedSceneIntroForTest('')).toBeNull();
  });

  it('a duplicate deposit is a no-op — the same line is not banked twice', () => {
    _bankSceneIntroForTest('obsidian_pillars', 'Same line.');
    _bankSceneIntroForTest('obsidian_pillars', 'Same line.');
    expect(_sceneIntroBankSize()).toBe(1);
  });

  it('empty text and empty ids are refused', () => {
    _bankSceneIntroForTest('obsidian_pillars', '');
    _bankSceneIntroForTest('', 'A line.');
    expect(_sceneIntroBankSize()).toBe(0);
  });

  it('per-location cap holds — oldest out', () => {
    for (let i = 0; i < _INTRO_BANK_PER_LOC + 3; i++) {
      _bankSceneIntroForTest('obsidian_pillars', `line ${i}`);
    }
    expect(_sceneIntroBankSize()).toBe(_INTRO_BANK_PER_LOC);
    // The survivors are the NEWEST ones; `line 0` was evicted first.
    expect(_takeBankedSceneIntroForTest('obsidian_pillars')).not.toBe('line 0');
  });

  it('⚠ the total ceiling holds across MANY locations, not just one', () => {
    // A player criss-crossing a junction must not accumulate an unbounded set
    // of rooms' worth of prose in memory.
    for (let loc = 0; loc < 12; loc++) {
      for (let i = 0; i < _INTRO_BANK_PER_LOC; i++) {
        _bankSceneIntroForTest(`loc_${loc}`, `loc ${loc} line ${i}`);
      }
    }
    expect(_sceneIntroBankSize()).toBeLessThanOrEqual(_INTRO_BANK_TOTAL);
  });

  it('the caps are sane relative to each other', () => {
    expect(_INTRO_BANK_PER_LOC).toBeGreaterThan(0);
    expect(_INTRO_BANK_TOTAL).toBeGreaterThanOrEqual(_INTRO_BANK_PER_LOC);
  });
});

describe('OTA-1152 — ⚠ what a background fill must NOT do', () => {
  it('it does not mirror its tokens to the live Arbiter tail', () => {
    const fn = narrateFn();
    // The token callback bails before touching partialArbiterText.
    expect(fn).toContain('if (opts?.bankOnly || previewBlocked) return;');
    // And the pre-flight set() omits partialArbiterText entirely for a fill.
    expect(fn).toContain("set(opts?.bankOnly ? { isGenerating: true }");
  });

  it('⚠ it does not bump the generation epoch', () => {
    const fn = narrateFn();
    expect(fn).toContain('opts?.bankOnly ? arbiterGenerationEpoch : ++arbiterGenerationEpoch');
    // The live path still increments — a stale REACTION must still be cancelled.
    expect(fn).toContain('++arbiterGenerationEpoch');
  });

  it('⚠ it releases isGenerating on its own terms, since it never owned the epoch', () => {
    const fn = narrateFn();
    expect(fn).toContain('if (opts?.bankOnly) set({ isGenerating: false });');
  });

  it('it does not speak, and it does not fall back to a template', () => {
    const fn = narrateFn();
    const start = fn.indexOf('if (opts?.bankOnly) {', fn.indexOf('const usedFallback'));
    expect(start).toBeGreaterThan(-1);
    // ⚠ The end anchor is the FIRST LINE OF THE LIVE PATH, not the enclosing
    // `} catch {`. Reaching for the catch overruns the block and swallows the
    // speaking path below it — which is the third time in this OTA that a
    // slice ended somewhere later than the thing it was measuring. Anchor on
    // what comes NEXT, not on what encloses.
    const end = fn.indexOf("get().appendLog('arbiter', finalText);", start);
    expect(end).toBeGreaterThan(start);
    const block = fn.slice(start, end);
    expect(block).toContain('bankSceneIntro(');
    expect(block).not.toContain("appendLog('arbiter'");
    expect(block).toContain('return;');
  });

  it('a fill that produced nothing usable banks NOTHING', () => {
    const fn = narrateFn();
    // usedFallback means the cleaned output was empty and the template carried
    // it — and the template is already free at arrival, so banking it would
    // spend a generation to store something we already had.
    // ⚠ OTA-1260 added two more refusal reasons to the same branch (an
    // action-narrating line, and a preempted partial cut mid-sentence). The RULE
    // is unchanged and is what is asserted: nothing unusable reaches the bank.
    expect(fn).toContain('if (usedFallback || repDup || narratesAction || truncated) {');
    expect(fn).toContain("'intro-fill:∅'");
    expect(fn).toContain("'intro-fill:near-dup'");
  });

  it('being cut short is reported as the ordinary outcome, not as a loss', () => {
    const fn = narrateFn();
    // ⚠⚠ OTA-1260 (N3) REVERSED HALF OF THIS. Being cut short was reported as the
    // ordinary outcome AND the partial text was binned on the spot, before any
    // cleaning ran. The runtime had always returned the tokens already assembled.
    // **For a FILL there is nothing to speak** — it goes to the bank and is
    // re-vetted at spend time — so late text is still free text later.
    expect(fn).toContain('const preemptedFill = opts?.bankOnly === true');
    expect(fn).toContain('if (myEpoch !== arbiterGenerationEpoch && !preemptedFill) {');
    expect(fn).toContain("'intro-fill:preempted-partial'");
    // …and the live path keeps its own, different reason.
    expect(fn).toContain("'cancelled:player-acted-again'");
  });

  it('it rides the homework priority rather than competing with the player', () => {
    const fn = narrateFn();
    expect(fn).toContain('homework: opts?.bankOnly === true');
    expect(fn).toContain('`narration:${intent}_fill`');
  });

  it('⚠ the voice cooldown does NOT ration it', () => {
    const fn = narrateFn();
    // Rationing background fill by the timer that exists to protect the voice
    // would mean the bank could only fill in the gaps between the very
    // generations it exists to eliminate. The harness is the stronger guard.
    expect(fn).toContain('const cooldownActive = !opts?.bankOnly');
  });
});

describe('OTA-1152 — ⚠ a pre-written intro does not pretend to know the weather', () => {
  it('the prefetch slice carries static facts and nulls the rolled ones', () => {
    const fn = narrateFn();
    expect(fn).toContain(
      '{ location: forLoc, weather: null, hazard: null, enemies: [], enemyHps: [], vendor: null }');
  });

  it('SceneSlice.weather is nullable, matching what deriveEnvironment always did', () => {
    expect(INJ).toContain('weather: WeatherEntry | null;');
    // The guard that made this safe all along.
    expect(INJ).toContain('if (scene.weather?.name)');
  });

  it('⚠ the world ladder is NOT borrowed for a destination', () => {
    // The room the ladder picks is chosen fresh on arrival; reusing the
    // CURRENT room's ladder would write about the wrong room entirely.
    expect(narrateFn()).toContain('scene.microMicroId && !forLoc');
  });
});

describe('OTA-1152 — the spend site, and the muzzles it inherits', () => {
  it('⚠ the bank is checked BEFORE a generation is started', () => {
    // ⚠ OTA-1260 (N1) re-keyed the bank by ROOM, so the spend call now carries
    // `introBankKey(...)`. The rule asserted — spend before you generate — holds.
    const i = STORE.indexOf('takeBankedSceneIntro(get, introBankKey(');
    const j = STORE.indexOf('void narrateViaArbiter(', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it('⚠ a banked line is NOT spent into a fight', () => {
    // Two reasons, and both matter: the combat muzzle is about whether model
    // prose is wanted at all, and the line was written against a scene with no
    // enemies in it — spending it into an ambush would describe a room that is
    // no longer the situation.
    expect(STORE).toContain('const banked = hasEnemies');
    expect(STORE).toContain(': takeBankedSceneIntro(get, introBankKey(location.id, inHub ? hubRoomId : null));');
  });

  it('the spend is logged so a device log can show the bank working', () => {
    expect(STORE).toContain('arbiter: intro ✓ 0ms (banked,');
  });

  it('the fill is logged under the homework label, like every other slot', () => {
    expect(STORE).toContain('homework: scene_intro "');
  });
});

describe('OTA-1152 — the idle signal, and why it is a different one', () => {
  it('⚠ the intro slot reads TIME SINCE LAST ACTION, not the stationary-screen stamp', () => {
    // uiIdleSince is stamped by the pack and the map — exactly right for item
    // descriptions and exactly wrong here, because a scene intro is needed
    // while the player is out walking, which is the one time it is never set.
    expect(STORE).toContain('const lastAct = get().lastPlayerActionAt;');
    // ⚠ OTA-1260 (N2) made the THRESHOLD dynamic — it reads the job's measured
    // average instead of a fixed 6s that was shorter than the job it armed. The
    // SIGNAL asserted here is unchanged: time since the last player action.
    expect(STORE).toContain('Date.now() - lastAct < idleNeeded');
  });

  it('the stamp is written at the one door every action passes through', () => {
    const sub = STORE.slice(STORE.indexOf('submitPlayerAction(text, _opts) {'));
    expect(sub.slice(0, 2500)).toContain('set({ lastPlayerActionAt: Date.now() });');
  });

  it('it starts null — no stamp, no fill', () => {
    expect(STORE).toContain('lastPlayerActionAt: null,');
  });

  it('⚠ the intro slot runs BEFORE the item slot — nearer deadline wins', () => {
    const tick = STORE.slice(STORE.indexOf('const homeworkTick = (): void => {'));
    const intro = tick.indexOf('if (introFillTick()) return;');
    const item = tick.indexOf('const target = nextHomeworkItem();');
    expect(intro).toBeGreaterThan(-1);
    expect(item).toBeGreaterThan(intro);
  });

  it('it inherits the combat and tutorial muzzles from the shared tick', () => {
    const tick = STORE.slice(
      STORE.indexOf('const homeworkTick = (): void => {'),
      STORE.indexOf('if (introFillTick()) return;'),
    );
    expect(tick).toContain("enemies?.length ?? 0) > 0) return;");
    expect(tick).toContain('inScriptedTutorialPhase(get)');
    expect(tick).toContain('get().isGenerating');
  });

  it('⚠ only one model job at a time — a started fill stops the tick', () => {
    // introFillTick returns TRUE when it started work, and the caller returns
    // on true, so the item slot never stacks a second generation on top.
    expect(STORE).toContain('/** Returns true when it STARTED a fill, so the tick stops there and the');
    expect(STORE).toContain('if (introFillTick()) return;');
    expect(STORE).toContain('if (introFillInFlight) return false;');
  });
});

describe('OTA-1152 — the candidate set is READ, never built', () => {
  it('it uses the one source of truth for where the player is', () => {
    const fn = STORE.slice(
      STORE.indexOf('function introPrefetchCandidates'),
      STORE.indexOf('function bankMusing'),
    );
    expect(fn).toContain('playerGridCell(player)');
    expect(fn).toContain('canonicalLocationAtCell(cell.x, cell.y)');
    expect(fn).toContain('clampGridCell(');
    // ⚠ Nothing here builds a scene, rolls weather, or mutates state.
    expect(fn).not.toContain('beginScene');
    expect(fn).not.toContain('set(');
  });

  it('⚠ the CURRENT location is a candidate, and it is first', () => {
    const fn = STORE.slice(
      STORE.indexOf('function introPrefetchCandidates'),
      STORE.indexOf('function bankMusing'),
    );
    const cur = fn.indexOf('const out: Location[] = [scene.location];');
    const loop = fn.indexOf('for (const [dx, dy] of');
    expect(cur).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(cur);
  });

  it('all four cardinals are considered, and duplicates are dropped', () => {
    const fn = STORE.slice(
      STORE.indexOf('function introPrefetchCandidates'),
      STORE.indexOf('function bankMusing'),
    );
    expect(fn).toContain('[[0, -1], [1, 0], [0, 1], [-1, 0]]');
    expect(fn).toContain('out.some((l) => l.id === named.locationId)');
  });

  it('an unknown location id is skipped rather than thrown', () => {
    const fn = STORE.slice(
      STORE.indexOf('function introPrefetchCandidates'),
      STORE.indexOf('function bankMusing'),
    );
    expect(fn).toContain('try { out.push(getLocationById(named.locationId)); } catch');
  });
});

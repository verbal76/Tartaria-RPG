jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// ⚠ The store pulls these in transitively. Mocked, not stubbed out — the house
// pattern; NO `{ virtual: true }` on a module that genuinely exists.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

// ⚠⚠ OTA-1258 — NARRATION TRACK N1–N3, WORKED IN ORDER.
//
// Owner: *"let's work on n1-6 in order."* The plan lives in HANDOFF; these are the
// first three, each with the measurement that says whether it worked.
//
// ⚠⚠ N1 — A BANKED INTRO NARRATED THE PAST. From the owner's 2026-08-14 log:
// `"You climb down the arch, feeling the weight of the city's collapse before
// you"` — spoken on ARRIVAL at the Court of Standards, four rooms and forty
// seconds after the climb, which happened in the Atrium. Two causes, both fixed:
//   (a) the bank was keyed by LOCATION, and every outpost room reports the same
//       one (`loc=monarch_waystation` for the Atrium, Court, Arsenal, Workshop),
//       so a line written in one room was spent in another;
//   (b) nothing stopped a banked line from narrating a player ACTION, which is
//       true only in the instant it was written — and the bank is the one channel
//       where time passes between writing and speaking.
//
// ⚠⚠ N2 — THE TRIGGER WAS SHORTER THAN THE JOB IT ARMS. `INTRO_IDLE_MS = 6_000`
// armed a job whose own telemetry reports ~9s (9009ms in that log; an earlier
// sweep measured avg 9.5s / max 11.4s). **Preemption was the EXPECTED outcome**,
// not the exception. The threshold now reads the measured average rather than
// restating it as a second constant that drifts.
//
// ⚠⚠ N3 — FINISHED TEXT WAS BINNED. `LlamaRuntime` has always returned the tokens
// already assembled when a job is cut short; `narrateViaArbiter` threw them away
// on the epoch check before any cleaning ran. For a LIVE line that is correct —
// the player moved on. **For a FILL there is nothing to speak**, so late text is
// still free text later, which was the entire premise of the bank.
import {
  _resetSceneIntroBank, _bankSceneIntroForTest, _takeBankedSceneIntroForTest,
  _introBankKeyForTest, _sceneIntroBankSize,
} from '../app/state/gameStore';
import { isSecondPersonActionOpener } from '../app/engine/foreignText';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

beforeEach(() => { _resetSceneIntroBank(); });

describe('OTA-1258 N1 — a banked line belongs to the room it was written in', () => {
  it('⚠⚠ THE OWNER\'S BUG: two rooms of one outpost no longer share a bank', () => {
    // The Atrium and the Court both report loc=monarch_waystation. Before this,
    // both read the same key and a line written in one was spent in the other.
    const atrium = _introBankKeyForTest('monarch_waystation', 'outpost_gate');
    const court = _introBankKeyForTest('monarch_waystation', 'outpost_central');
    expect(atrium).not.toBe(court);

    _bankSceneIntroForTest(atrium, 'Mud-glass tiles catch what little light there is.');
    expect(_takeBankedSceneIntroForTest(court)).toBeNull();
    expect(_takeBankedSceneIntroForTest(atrium))
      .toBe('Mud-glass tiles catch what little light there is.');
  });

  it('⚠⚠ ...and an OUTDOOR tile is unchanged — the fix must not cost the common case', () => {
    // Most tiles carry no hub room at all, and they are the bank's whole point.
    // A key change that quietly disabled banking outdoors would trade one bug for
    // a slower game everywhere.
    const tile = _introBankKeyForTest('obsidian_pillars', null);
    expect(tile).toBe('obsidian_pillars');
    _bankSceneIntroForTest(tile, 'The glass columns hum as you pass.');
    expect(_takeBankedSceneIntroForTest(tile)).toBe('The glass columns hum as you pass.');
  });

  it('⚠⚠ the SPEND site keys by room, and the PREFETCH writes for tiles only', () => {
    // ⚠ The two halves have to agree or the bank silently never hits. The
    // prefetch already refuses to target hub rooms (`introPrefetchCandidates`
    // returns [] indoors), so hub rooms have no bank and fall through to the live
    // path — which is the honest outcome: we never wrote a line about the Court.
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain('takeBankedSceneIntro(get, introBankKey(location.id, inHub ? hubRoomId : null))');
    expect(store).toContain('introBankKey(forLoc.id, null)');
    expect(store).toContain("if (get().player?.hubRoomId) return []; // indoor outpost rooms");
  });

  it('⚠⚠ a line that narrates an ACTION is refused at the bank', () => {
    // ⚠ ONE CHECKER, BOTH CHANNELS. The ambient path has filtered these since it
    // was built; the intro bank never did. A second copy of the rule would drift —
    // this session has paid for that six times.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const narratesAction = isSecondPersonActionOpener(introOpener);');
    expect(i).toBeGreaterThan(-1);
    // ⚠ The window reaches past N3's comment block, which landed between the
    // check and the discard reason. Anchoring on a neighbour's prose is what bit
    // ota1231; the slice ends at the branch itself.
    expect(store.slice(i, store.indexOf('} else {', i))).toContain("'intro-fill:action-opener'");

    // And the checker really does catch the owner's line.
    expect(isSecondPersonActionOpener('You climb down the arch, feeling the weight of the city.')).toBe(true);
    // ...while leaving ordinary scene prose alone — it fails OPEN by design.
    expect(isSecondPersonActionOpener('The hearth is cold but swept clean.')).toBe(false);
    expect(isSecondPersonActionOpener('You have come a long way for this.')).toBe(false);
  });
});

describe('OTA-1258 N2 — the trigger is no longer shorter than the job', () => {
  /** Mirrors the shipped arithmetic. The POINT is the relationship between the
   *  threshold and the measured job time, which is what was wrong. */
  const idleFor = (avgMs: number, count: number): number => {
    if (count < 3 || avgMs <= 0) return 6_000;
    return Math.min(20_000, Math.max(6_000, Math.round(avgMs * 1.25)));
  };

  it('⚠⚠ MEASURED: at the job\'s real ~9s, the old 6s trigger left a 3s hole', () => {
    // Every fill armed at 6s was started with three seconds of exposure: any
    // action in that window kills it. The owner's log shows exactly that — one
    // intro preempted at 5555ms, discarded, zero tokens out.
    const measuredJobMs = 9_009; // from the 2026-08-14 device log
    expect(6_000).toBeLessThan(measuredJobMs);
    expect(idleFor(measuredJobMs, 25)).toBeGreaterThan(measuredJobMs);
  });

  it('⚠ it holds the old floor until there is a real measurement', () => {
    // Two samples is not a measurement. Arming off noise would be the same
    // mistake in the other direction.
    expect(idleFor(9_009, 2)).toBe(6_000);
    expect(idleFor(0, 50)).toBe(6_000);
  });

  it('⚠ a pathological sample cannot switch the feature off', () => {
    expect(idleFor(120_000, 40)).toBe(20_000);
  });

  it('⚠⚠ the threshold READS the telemetry rather than restating it', () => {
    // ⚠ A second constant claiming "the job takes about N" is a copy of a number
    // that already exists and drifts from it. `avgMs` is the same figure the debug
    // rollup prints, so the threshold and the log cannot disagree.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const introIdleMs = (): number => {');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 500);
    expect(block).toContain("qwenJobStats().find((j) => j.job === 'scene_intro')");
    expect(block).toContain('st.avgMs');
    expect(block).toContain('st.count < 3');
    // The old fixed constant is gone as a trigger.
    expect(store).not.toContain('Date.now() - lastAct < INTRO_IDLE_MS');
    // And the chosen value is logged, so the next device log can grade the change.
    expect(store).toContain('intro-fill armed after ${idleNeeded}ms idle');
  });
});

describe('OTA-1258 N3 — preempted text is kept, not binned', () => {
  it('⚠⚠ a FILL no longer returns early on the epoch check', () => {
    // ⚠ The live path still must: the player has moved on and the line must not
    // be spoken. Only the fill falls through, because a fill has nothing to say.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const preemptedFill = opts?.bankOnly === true');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 320);
    expect(block).toContain('if (myEpoch !== arbiterGenerationEpoch && !preemptedFill) {');
    expect(block).toContain("noteQwenDiscarded('cancelled:player-acted-again');");
  });

  it('⚠⚠ ...but a partial cut MID-SENTENCE is still refused', () => {
    // ⚠ THE TRAP: `trimToLastSentence` returns its input UNCHANGED when it finds
    // no terminal punctuation — correct for a finished generation, wrong for one
    // cut mid-word. Without this the bank would store a fragment and speak it
    // later as if it were finished.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const endsWhole = /[.!?]["\']?$/.test(finalText);');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 500);
    expect(block).toContain('const truncated = preemptedFill && !endsWhole;');
    expect(block).toContain("'intro-fill:preempted-partial'");

    // The rule itself, exercised.
    const endsWhole = (t: string): boolean => /[.!?]["']?$/.test(t);
    expect(endsWhole('The hearth is cold but swept clean.')).toBe(true);
    expect(endsWhole('The hearth is cold and a single chair faces')).toBe(false);
    expect(endsWhole('"Keep it close."')).toBe(true);
  });

  it('⚠ a preempted fill still passes every filter a live line passes', () => {
    // The bank stores VETTED prose (OTA-1129). Falling through the epoch check
    // must not skip the cleaning — it deliberately re-joins the SAME path.
    const store = src('app', 'state', 'gameStore.ts');
    const fall = store.indexOf('const preemptedFill = opts?.bankOnly === true');
    const clean = store.indexOf('const deforeigned = repairGluedNarration(stripForeignWords(text));');
    const bank = store.indexOf('if (opts?.bankOnly) {');
    expect(fall).toBeLessThan(clean);
    expect(clean).toBeLessThan(bank);
  });
});

describe('OTA-1258 — the bank still behaves like a bank', () => {
  it('⚠ one-shot, deduped, and capped — the OTA-1129 contract survives the rekey', () => {
    const k = _introBankKeyForTest('test_loc', null);
    _bankSceneIntroForTest(k, 'A line.');
    _bankSceneIntroForTest(k, 'A line.'); // duplicate — no-op
    expect(_sceneIntroBankSize()).toBe(1);
    expect(_takeBankedSceneIntroForTest(k)).toBe('A line.');
    expect(_takeBankedSceneIntroForTest(k)).toBeNull(); // one-shot
  });

  it('⚠ an empty key or empty text is still refused', () => {
    _bankSceneIntroForTest('', 'text');
    _bankSceneIntroForTest('loc', '');
    expect(_sceneIntroBankSize()).toBe(0);
  });
});

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

// ⚠⚠ OTA-1263 — FOUR THINGS FROM ONE DEVICE LOG, AND TWO OF THEM WERE MINE.
//
// ⚠⚠ (A) OTA-1258's N2 FIX NEVER FIRED, AND THE LINE I ADDED TO PROVE IT HAD
// WORKED IS THE LINE THAT PROVED IT HAD NOT. The adaptive idle threshold looked up
// `j.job === 'scene_intro'`; the telemetry label for that job is
// `narration:scene_intro_fill`. The find never matched, so every fill fell back to
// the 6s floor — the exact behaviour N2 existed to change. The log says it three
// times: `homework: intro-fill armed after 6000ms idle`, in a session carrying
// several 6–9s `scene_intro_fill` samples. **Print the number a change depends on,
// then go and read it.**
//
// ⚠⚠ (B) OTA-1259's PER-CALL `ms/t` PRINTED IMPOSSIBLE NUMBERS, AND I BUILT A
// FINDING ON ONE. OTA-1139 had already established that llama.rn's native
// `prompt_ms` is not always per-call and made the AGGREGATE reject any sample
// whose prefill exceeds the whole call. OTA-1259 added the per-call figure and did
// not copy that guard. It then filed `investigate_lore` at "64.7 ms/prompt-token —
// where the prefill money actually is", from the row `ok 6863ms read 8286ms/write
// 4020ms`: **twelve seconds of reported work inside a seven-second call.** The next
// log settled the real behaviour — three consecutive `investigate_lore` calls at
// 59.2 (cold, itself impossible), then **2.4 and 2.5 ms/t**, which is prefix reuse
// working exactly as OTA-1259 concluded from the source.
//
// ⚠⚠ (C) "TAKE /SALVAGE IS STILL GREEN BUT THE POPUP HAS NOTHING IN IT TO CLAIM."
// The light came from `takeableCount` + `salvageableCount`, two predicates written
// in 2026-05 to mirror TakeModal's and SalvageModal's filter chains — **two modals
// retired at OTA-1233.** They were never updated to match GatherModal, so the light
// and the card held different opinions about the room. Seventh instance this
// session of a rule computed twice.
//
// ⚠⚠ (D) "I DON'T THINK INVESTIGATE ALL SHOULD BE INSTANT." Measured from the same
// log: five investigates inside FIFTY MILLISECONDS, then three more inside forty.
// The sweep arrived as one wall of text with no way to tell which line answered
// which noun.
import { readFileSync } from 'fs';
import { join } from 'path';
// ⚠ OTA-1395 — reads the store AND its slices. Part 4 is splitting gameStore
// into slices, and the literals these pins look for travel with the code. A
// pin like this was never a claim about a FILE; it is a claim about the STORE.
// See __tests__/helpers/storeSource.ts for when NOT to use it.
import { storeSource } from '../test-utils/storeSource';
// ⚠ OTA-1405 — the REAL predicate, not a copy of it. See the note on `shows`.
import { qwenTimingsArePossible } from '../app/ai/generation/qwenTelemetry';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1263 (A) — the adaptive idle threshold actually finds its job', () => {
  it('⚠⚠ it looks up the label the telemetry ACTUALLY records', () => {
    const store = storeSource() + '\n' + src('app', 'ai', 'narration.ts');
    // The label is built here, and it is the only place it is built.
    expect(store).toContain('job: opts?.bankOnly ? `narration:${intent}_fill` : `narration:${intent}`,');
    // ...so the lookup must use the assembled form, not the bare intent.
    expect(store).toContain("qwenJobStats().find((j) => j.job === 'narration:scene_intro_fill')");
    expect(store).not.toContain("qwenJobStats().find((j) => j.job === 'scene_intro')");
  });

  it('⚠⚠ MEASURED: the label the old lookup wanted is not one the telemetry emits', () => {
    // The bug, stated as the check that would have caught it. `intent` is
    // 'scene_intro'; every recorded job for it carries the `narration:` prefix and
    // the fill carries `_fill` as well.
    const intent = 'scene_intro';
    const liveLabel = `narration:${intent}`;
    const fillLabel = `narration:${intent}_fill`;
    expect(liveLabel).not.toBe(intent);
    expect(fillLabel).not.toBe(intent);
    // Which is exactly why the find returned undefined and the floor always won.
    const jobs = [{ job: fillLabel, count: 9, avgMs: 9_397 }];
    expect(jobs.find((j) => j.job === intent)).toBeUndefined();
    expect(jobs.find((j) => j.job === fillLabel)).toBeDefined();
  });

  it('⚠ the armed-at line survives — it is how the NEXT log grades this', () => {
    const store = storeSource() + '\n' + src('app', 'ai', 'narration.ts');
    expect(store).toContain('intro-fill armed after ${idleNeeded}ms idle');
  });
});

describe('OTA-1263 (B) — the per-call ms/t obeys the same guard the aggregate does', () => {
  /** ⚠ OTA-1405 — NO LONGER MIRRORED. This used to be a hand-copy of the shipped
   *  expression, which is how a guard ends up living in three places and being
   *  fixed in two: OTA-1139 guarded the range, OTA-1263 guarded this figure, and
   *  the raw `read Xms/write Yms` pair beside it kept printing native numbers as
   *  fact until the owner's 2026-08-20 log carried `read 49256ms` on a 5.4-second
   *  call. The rule now lives in `qwenTimingsArePossible` and this suite calls the
   *  real thing, so the test cannot keep passing against a copy that drifted. */
  const shows = (prefillMs: number | null, totalMs: number, promptTokens: number): boolean =>
    qwenTimingsArePossible({ prefillMs: prefillMs ?? undefined, totalMs }) && promptTokens > 0;

  it('⚠⚠ the rows that produced the bogus finding are REFUSED', () => {
    // Both verbatim from device logs, both physically impossible.
    expect(shows(8_286, 6_863, 128)).toBe(false); // the 64.7 ms/t row
    expect(shows(7_578, 5_555, 128)).toBe(false); // the 59.2 ms/t row
  });

  it('⚠⚠ ...and the honest rows still print — the guard is not a mute button', () => {
    expect(shows(308, 6_526, 128)).toBe(true);   // 2.4 ms/t — a warm prefix
    expect(shows(8_142, 9_397, 688)).toBe(true); // 11.8 ms/t — a cold one
  });

  it('⚠ a preempted or zero-token call has no honest number', () => {
    expect(shows(null, 6_171, 700)).toBe(false);
    expect(shows(100, 1_000, 0)).toBe(false);
  });

  it('⚠⚠ the source asks the SHARED predicate, so the three copies cannot drift again', () => {
    const store = storeSource() + '\n' + src('app', 'ai', 'narration.ts');
    const i = store.indexOf('const prefillIsPossible = timingsOk');
    expect(i).toBeGreaterThan(-1);
    expect(store.slice(i, i + 200)).toContain('(r.promptTokens ?? 0) > 0');
    // ⚠ OTA-1405 — and the RAW pair on the same line obeys it too. That is the
    // half OTA-1139 and OTA-1263 both left open, and the half the owner read.
    expect(store).toContain('const timingsOk = qwenTimingsArePossible(r);');
    expect(store).toContain('NOT-PER-CALL');
    // The rule is defined once, and not re-derived here or anywhere else.
    const tel = src('app', 'ai', 'generation', 'qwenTelemetry.ts');
    expect(tel).toContain('export function qwenTimingsArePossible(');
    expect((store.match(/prefillMs <= r\.totalMs/g) ?? []).length).toBe(0);
  });
});

describe('OTA-1263 (C) — the button and the card read the same array', () => {
  it('⚠⚠ the green comes from `gatherChips`, not from two retired modals\' predicates', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('takeableCount={gatherRowCount}');
    // The 2026-05 predicates are GONE, not left dangling as dead props.
    expect(screen).not.toContain('takeableCount={(() => {');
    expect(screen).not.toContain('salvageableCount={(() => {');
    expect(screen).not.toContain('_retired');
    // And the count is derived in the same memo as the lane count, off the same
    // array the picker renders.
    const i = screen.indexOf('const gatherCounts = useMemo(');
    expect(i).toBeGreaterThan(-1);
    const block = screen.slice(i, i + 700);
    expect(block).toContain('for (const c of gatherChips)');
    expect(block).toContain('return { lanes: lanes.size, rows };');
    expect(screen).toContain('chips={gatherChips}');
  });

  it('⚠⚠ an empty room answers in the FEED — no card, no IGNORE tap', () => {
    // Owner: "and I have to hit ignore rest to close it." OTA-1240 deliberately
    // made an already-empty open explain itself and wait. The explanation was
    // right; the modal was the wrong place for it.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('onOpenTake={() => {');
    expect(i).toBeGreaterThan(-1);
    const block = screen.slice(i, i + 600);
    expect(block).toContain('if (gatherRowCount === 0) {');
    expect(block).toContain('The room is picked clean.');
    expect(block).toContain('return;');
    // ⚠ It ANSWERS rather than refusing in silence — the OTA-1164 bug.
    expect(block).toContain("appendLog(");
  });

  it('⚠ a room with rows still opens the picker', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('onOpenTake={() => {');
    expect(screen.slice(i, i + 600)).toContain('setTakeOpen(true);');
  });
});

describe('OTA-1263 (D) — INVESTIGATE ALL resolves one at a time', () => {
  it('⚠⚠ the sweep is PACED, not a loop that lands in one frame', () => {
    // ⚠⚠ OTA-1268 CAVEAT, LEARNED THE EXPENSIVE WAY: this source pin passed for
    // three days over a sweep that resolved exactly ONE noun — the pacing
    // existed and the self-abort killed it. A pin like this proves the
    // MECHANISM is present, never that it runs. ota1268 owns the behavioural
    // claim now (it presses the button and counts); this stays only as a cheap
    // tripwire against re-introducing the synchronous wall.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('onInvestigateAll={(nouns) => {');
    expect(i).toBeGreaterThan(-1);
    const block = screen.slice(i, i + 1800);
    expect(block).toContain('setTimeout(step, INVESTIGATE_ALL_GAP_MS)');
    // The old shape — every submit inside one synchronous for-loop — is gone.
    expect(block).not.toContain('for (const n of ordered) {');
  });

  it('⚠ the gap is in the range the owner asked for', () => {
    // "maybe 2+3 seconds". Low end, because a six-noun sweep must stay readable
    // without becoming a stall.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const m = /const INVESTIGATE_ALL_GAP_MS = ([\d_]+);/.exec(screen);
    expect(m).not.toBeNull();
    const ms = Number(m![1]!.replace(/_/g, ''));
    expect(ms).toBeGreaterThanOrEqual(2_000);
    expect(ms).toBeLessThanOrEqual(3_000);
  });

  it('⚠⚠ BOTH aborts survive, and they matter MORE now the sweep is live for seconds', () => {
    // Enemies: OTA-1236's rule — firing commands into a fight the player has not
    // seen yet is how a sweep eats half the room. And a paced sweep must never
    // talk over a player who has started doing something else.
    // ⚠⚠ OTA-1268 — the player-action abort now compares against a WATERMARK
    // re-read after each of the sweep's own submits, not the pre-sweep stamp.
    // The old pin (`!== startedAt`) was asserting the exact line that made the
    // sweep abort on its own footsteps.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('onInvestigateAll={(nouns) => {');
    const block = screen.slice(i, i + 1800);
    expect(block).toContain("(s.currentScene?.enemies ?? []).length > 0) return;");
    expect(block).toContain('s.lastPlayerActionAt !== watermark');
    expect(block).toContain('watermark = useGameStore.getState().lastPlayerActionAt;');
  });

  it('⚠ the story-tier ordering is untouched — the dog quest still goes last', () => {
    // OTA-1236: a lead sorts last so the sweep cannot bury the next step.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('onInvestigateAll={(nouns) => {');
    expect(screen.slice(i, i + 1200)).toContain('orderByStoryTier(nouns, (n) => n, leadCtx)');
  });
});

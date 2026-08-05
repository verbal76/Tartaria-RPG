// OTA-1109 — ⚠ THE AMBIENT TRIM LANDED AND THE LINE STILL ARRIVED LATER.
//
// OTA-1108's own check, from the first device log running it:
//
//   investigate_lore n5 avg8.5s  max12.8s read1.1s/write0.9s in126t→out25t reuse0t wait6.5s
//   item_synthesis   n3 avg13.7s max19.6s read2.2s/write4.2s in310t→out119t reuse0t cap2 wait4.2s ∅1 ✂2/32.2s
//   ambient          n2 avg11.6s max14.6s read4.4s/write3.0s in361t→out31t reuse0t cap2 wait4.0s ✂2/23.2s
//   || WASTED 4 calls / 55.4s
//
// WHAT WORKED, exactly as predicted: ambient's prompt fell 545 → 361 tokens
// (the estimate was ~360) and its READ time fell 5.8-9.9s → 4.4s. The trim is
// not in question.
//
// ⚠ WHAT THE SAME LOG THEN SHOWED: ambient's TOTAL went UP anyway — 8-11.8s
// before, 11.6s average now — because the saving was handed straight to
// something else. Ambient now waits 4.0s for the lock and spends 3.0s writing
// 31 tokens, which is ~2.5× the ~40ms/token it managed in the OTA-1107 log.
// Neither number is about ambient. Both are about the device being busy.
//
// ⚠ WHAT WAS BUSY: item synthesis. Three calls, THREE failures, 41 seconds —
// `item_synth:unparseable` every time, two of them having burned the entire
// 180-token budget without ever closing a brace (472ch and 488ch for a shape
// that needs ~200). It is 41 of the session's 55.4 wasted seconds, and while
// it burns them it holds the shared native-ML lock, which is why every other
// job in that rollup carries 4-6.5 seconds of queue.
//
// Stated plainly, the trade was indefensible: a background enrichment that
// lands on the NEXT inventory open was delaying the companion line and the
// lore flourish the player is waiting on now. Four changes:
//   1. IT YIELDS — one synthesis at a time, 20s gap measured from completion.
//      A dropped request is free; the name asks again on the next lookup.
//   2. THE BRIEF SHRINKS — the old one handed a 0.5B model a six-field nested
//      effect object and six prose rules, then asked for one line. It filled
//      the shape it was shown and the cap arrived first. ~900 → ~430 chars.
//   3. THE CAP RISES 180 → 240 as insurance, since a cap only costs time when
//      it is reached and 180 was guaranteeing failure.
//   4. THE RAW TEXT IS PRINTED on a parse failure. `unparseable` does not say
//      whether the model wrote prose, opened a fence, emitted two objects, or
//      simply ran long — and an EMPTY return is now its own reason, because
//      the log's `empty 8809ms ... out 0t` was the watchdog's dormant-context
//      bug moments later, not bad JSON.

jest.setTimeout(20000);

import { synthesizeItemViaQwen } from '../app/engine/itemSynthesisQwen';
import { _resetCacheForTests } from '../app/engine/itemSynthesisCache';
import {
  recordQwenCall,
  setQwenDiscardSink,
  qwenJobStats,
  resetQwenTelemetry,
} from '../app/ai/generation/qwenTelemetry';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

const engine = (reply: string) => ({
  isReady: () => true,
  generate: () => Promise.resolve(reply),
});

/** Capture the reason strings the discard sink is handed. */
const withSink = (): string[] => {
  const seen: string[] = [];
  setQwenDiscardSink((_job, reason) => seen.push(reason));
  return seen;
};

const armLastCall = (): void =>
  recordQwenCall({
    job: 'item_synthesis', totalMs: 13700, waitMs: 0, chars: 472, outcome: 'ok', at: 0,
  });

describe('OTA-1109 — a failed synthesis names its own culprit', () => {
  beforeEach(() => {
    resetQwenTelemetry();
    _resetCacheForTests();
  });

  it('⚠ an unparseable reply is reported WITH the text, not just a verdict', async () => {
    const seen = withSink();
    armLastCall();
    const reply = 'Sure! Here is the JSON you asked for:\n```json\n{"kind":"misc","description":"A cog';
    const out = await synthesizeItemViaQwen('Brass Cog Cluster', ['metal'], engine(reply));
    expect(out).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('item_synth:unparseable');
    // The two things the OTA-1108 log could not tell us: how long it was, and
    // what it actually said.
    expect(seen[0]).toContain(`(${reply.length}ch)`);
    expect(seen[0]).toContain('Here is the JSON you asked for');
  });

  it('the sample is bounded and single-line — a 900-char ramble cannot flood the feed', async () => {
    const seen = withSink();
    armLastCall();
    await synthesizeItemViaQwen('Rambler', [], engine(`no json here\n${'x'.repeat(900)}`));
    expect(seen[0]!.length).toBeLessThan(260);
    expect(seen[0]).not.toContain('\n');
  });

  it('⚠ an EMPTY return is its own reason — the dormant-context bug is not a parse bug', async () => {
    // `item_synthesis empty 8809ms read 0ms/write 0ms in 309t→out 0t`, then:
    // "Qwen dormant (status='ready' but the native context was released)".
    // Filing that under `unparseable` would aim the next investigation at the
    // parser instead of at the watchdog.
    const seen = withSink();
    armLastCall();
    const out = await synthesizeItemViaQwen('Ghost', [], engine('   '));
    expect(out).toBeNull();
    expect(seen).toEqual(['item_synth:empty']);
  });

  it('a clamp rejection stays distinct from both', async () => {
    const seen = withSink();
    armLastCall();
    await synthesizeItemViaQwen('Nonsense', [], engine('{"kind":"not-a-kind"}'));
    expect(seen[0]).toMatch(/item_synth:(rejected-by-clamp|unparseable)/);
    expect(seen[0]).not.toBe('item_synth:empty');
  });

  it('the waste still lands on the job, so the rollup total stays honest', async () => {
    withSink();
    armLastCall();
    await synthesizeItemViaQwen('Broken', [], engine('nothing parseable'));
    const j = qwenJobStats()[0]!;
    expect(j.job).toBe('item_synthesis');
    expect(j.discarded).toBe(1);
    expect(j.discardedMs).toBe(13700);
  });
});

describe('OTA-1109 — the brief stops asking for an essay', () => {
  const mod = src('app/engine/itemSynthesisQwen.ts');

  it('⚠ the six-field nested effect object is gone from the shape', () => {
    // What the model was shown, and therefore what it set out to fill.
    expect(mod).not.toContain('"buffStat":"<stat>","buffBonus":<n>,"buffDuration":<n>');
    expect(mod).not.toContain('Cap healHP at 10, restoreStamina at 8, any bonus at 2');
  });

  it('the shape the VALIDATOR reads is still specified in full', () => {
    // Trimming the brief must not trim what the parser depends on.
    for (const field of ['"kind"', '"description"', '"extraTags"', '"effect"']) {
      expect(mod).toContain(field);
    }
    expect(mod).toContain('consumable');
    expect(mod).toContain('passive');
    // RETARGETED BY OTA-1115: the five stat names are still specified in full,
    // but as PROSE rather than as a pipe alternation — the alternation is the
    // thing the model copied into the value position and looped on. Asserting
    // the pipe form here would now be asserting the bug.
    for (const stat of ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma']) {
      expect(mod).toContain(stat);
    }
  });

  it('⚠ the cap rises off the value that was guaranteeing failure', () => {
    expect(mod).toContain('maxNewTokens: 240');
    expect(mod).not.toContain('maxNewTokens: 180');
  });

  it('one line is still the instruction — the parser tolerates noise, it should not need to', () => {
    expect(mod).toMatch(/Reply with ONE line/);
  });
});

describe('OTA-1109 — item synthesis yields to the jobs the player is waiting on', () => {
  const store = src('app/state/gameStore.ts');

  it('⚠ only one synthesis runs at a time — a salvage haul cannot queue five', () => {
    expect(store).toContain('let synthInFlight = false;');
    expect(store).toContain('if (synthInFlight) return;');
    expect(store).toContain('synthInFlight = true;');
  });

  it('⚠ and there is a gap between them, measured from COMPLETION', () => {
    expect(store).toContain('const SYNTH_GAP_MS = 20_000;');
    expect(store).toContain('if (Date.now() - lastSynthAt < SYNTH_GAP_MS) return;');
    // A 19-second call must not be followed instantly just because the clock
    // ran while it held the lock — so the stamp is re-taken when it finishes.
    const tail = store.slice(store.lastIndexOf('synthInFlight = false;'));
    expect(tail.slice(0, 200)).toContain('lastSynthAt = Date.now();');
  });

  it('the per-name dedup survives — the gap is an addition, not a replacement', () => {
    expect(store).toContain('if (pending.has(key)) return;');
    expect(store).toContain('pending.delete(key);');
  });

  it('a dropped request is genuinely free — the requester is still fire-and-forget', () => {
    // Nothing awaits the synthesis; the caller gets the static-inference row.
    expect(store).toContain('void Promise.resolve().then(async () => {');
    expect(store).toContain('await synth.synthesizeItemViaQwen(name, hintTags, qwen);');
  });

  it('the readiness gate still comes first — no work queued at all when Qwen is down', () => {
    const block = store.slice(store.indexOf('setQwenSynthRequester('));
    expect(block.indexOf('if (!qwen.isReady()) return;'))
      .toBeLessThan(block.indexOf('if (synthInFlight) return;'));
  });
});

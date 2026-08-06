// OTA-1161 — THE COMMA THAT ATE THE BEAT, and the label that lied about a
// feature working.
//
// Both findings come from the same device log that confirmed OTA-1159/1160,
// and both are small, which is exactly why they ship together before the next
// test session muddies them.
//
// ── 1. The attribution comma survived the attribution ───────────────────────
// The log preview showed what Kokoro was actually given:
//
//   voice⏱ … "You attack as if you mean to leave, Good…"
//   voice⏱ … "Footwork over fury, The ay thur ik drone…"
//
// The source lines were fine: `"You attack as if you mean to leave," the
// Arbiter murmurs. "Good."` — two sentences, properly terminated.
// `stripArbiterFrame` removes the narration between the quotes (the owner's own
// immersion ask, and still correct) but joined the quoted pieces RAW. Dialogue
// convention puts a comma inside the closing quote when narration follows; with
// the narration gone, that comma had nothing to hand off to — and it fused the
// two sentences into a run-on. Downstream, chunkForSpeech found no terminator,
// so OTA-1159's 280 ms sentence beat NEVER FIRED on exactly the class of line
// it was built for. One bug, two symptoms.
//
// The comma promotes to a full stop ONLY when it was the attribution comma:
// next quoted piece starts a new sentence (capital), or there is no next piece.
// A genuine mid-sentence handoff ("You attack," he said, "as if you mean to
// leave.") keeps its comma because the continuation starts lowercase.
//
// ── 2. `item_synth:empty` was the preemption feature being mislabelled ──────
//
//   qwen⏱ item_synthesis preempted 3535ms … out 0t
//   qwen⏱ ✂ DISCARDED item_synthesis after 3535ms — item_synth:empty
//
// Two adjacent lines, contradicting each other. `empty` is the DORMANCY
// signature — the OTA-1142 watchdog's cue, the thing that once cost a week to
// chase. `preempted` is OTA-1157 working as built. The discard classifier
// could not see the outcome the record line had just printed, because
// `lastCall` did not carry it. Now it does, and item synthesis asks before
// classifying.
//
// ── 3. Verified, no change: "ay thur ik" is the AUTHORED pronunciation ──────
// Flagged from the same log as a mispronunciation; it is not one. The lore
// lexicon (playtester spec OTA-107) respells the whole Aether family as
// "ay thur …" ON PURPOSE, and the voice log prints the post-lexicon text. The
// test pins the family so a lexicon edit that drops it gets caught.

import { stripArbiterFrame } from '../app/voice/arbiterFrame';
import { applyLoreLexicon } from '../app/voice/loreLexicon';
import {
  recordQwenCall,
  noteQwenDiscarded,
  lastQwenCallPreempted,
  resetQwenTelemetry,
} from '../app/ai/generation/qwenTelemetry';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const read = (p: string): string => require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', p), 'utf8');

describe('OTA-1161 — ⚠ the attribution comma promotes to a full stop', () => {
  it('⚠ THE REPRODUCTION: both lines from the device log come out as two sentences', () => {
    expect(stripArbiterFrame('"You attack as if you mean to leave," the Arbiter murmurs. "Good."'))
      .toBe('You attack as if you mean to leave. Good.');
    expect(stripArbiterFrame('"Footwork over fury," the Arbiter says quietly. "The aetheric drone is patient. Be patienter."'))
      .toBe('Footwork over fury. The aetheric drone is patient. Be patienter.');
  });

  it('⚠ a mid-sentence handoff KEEPS its comma — lowercase continuation', () => {
    // Promoting THIS comma would break one sentence into two fragments, which
    // is the mirror-image bug. The capital/lowercase test is the whole rule.
    expect(stripArbiterFrame('"You attack," he said, "as if you mean to leave."'))
      .toBe('You attack, as if you mean to leave.');
  });

  it('a single quote ending in the attribution comma still gets its stop', () => {
    expect(stripArbiterFrame('"Hold the line," the Arbiter says.')).toBe('Hold the line.');
  });

  it('a quote already ending on a terminator is untouched', () => {
    expect(stripArbiterFrame('The Arbiter nods. "Well fought."')).toBe('Well fought.');
    expect(stripArbiterFrame('"Run!" the Arbiter barks.')).toBe('Run!');
  });

  it('semicolons take the same promotion — same convention, same orphan', () => {
    expect(stripArbiterFrame('"Stand fast;" the Arbiter says. "Nothing moves."'))
      .toBe('Stand fast. Nothing moves.');
  });

  it('⚠ WHY IT MATTERS: the promoted stop is what re-arms the sentence beat', () => {
    // chunkForSpeech splits on terminators and the 280 ms pause applies at a
    // sentence boundary (OTA-1159). A comma is not a terminator, so the old
    // join silently disabled the beat on every attributed two-quote line.
    const out = stripArbiterFrame('"You attack as if you mean to leave," the Arbiter murmurs. "Good."');
    expect(/\.\s+Good\.$/.test(out)).toBe(true);
    const voice = read('app/voice/PiperTTSManager.ts');
    expect(voice).toContain("/[.!?]['\")\\]]*$/");   // endsOnTerminator — what the beat keys on
  });

  it('curly quotes get the identical treatment', () => {
    expect(stripArbiterFrame('“Hold the line,” the Arbiter says. “Nothing moves.”'))
      .toBe('Hold the line. Nothing moves.');
  });
});

describe('OTA-1161 — ⚠ a preempted synthesis is no longer filed as empty', () => {
  beforeEach(() => { resetQwenTelemetry(); });

  it('⚠ lastQwenCallPreempted reads the outcome of the call in flight', () => {
    expect(lastQwenCallPreempted()).toBe(false);
    recordQwenCall({ job: 'item_synthesis', totalMs: 3535, waitMs: 0, outcome: 'preempted' } as never);
    expect(lastQwenCallPreempted()).toBe(true);
  });

  it('an ordinary call reads false — empty stays empty', () => {
    recordQwenCall({ job: 'item_synthesis', totalMs: 8809, waitMs: 0, outcome: 'empty' } as never);
    expect(lastQwenCallPreempted()).toBe(false);
  });

  it('⚠ the flag is CONSUMED with the call — a discard clears it', () => {
    // noteQwenDiscarded nulls lastCall (one discard per call); the flag must
    // die with it or the NEXT job's empty return inherits a stale "preempted".
    recordQwenCall({ job: 'item_synthesis', totalMs: 3535, waitMs: 0, outcome: 'preempted' } as never);
    noteQwenDiscarded('item_synth:preempted');
    expect(lastQwenCallPreempted()).toBe(false);
  });

  it('the synthesis site asks before classifying', () => {
    const synth = read('app/engine/itemSynthesisQwen.ts');
    expect(synth).toContain("lastQwenCallPreempted() ? 'item_synth:preempted' : 'item_synth:empty'");
  });

  it('⚠ WHY: empty is the dormancy signature and must stay clean', () => {
    // The OTA-1142 dormancy hunt keyed off `empty`. Preemptions polluting that
    // count would make the watchdog look for a dead context that is actually a
    // healthy voice winning the lock.
    const synth = read('app/engine/itemSynthesisQwen.ts');
    expect(synth).toContain('AN INTERRUPTED CALL IS NOT AN EMPTY ONE');
  });
});

// ⚠ RE-AUTHORED BY OTA-1170, NOT RE-NUMBERED — the CLAIM changed, not the
// string. This block used to assert that "ay thur ik" *IS the canonical
// respelling, not a mispronunciation*: OTA-1161 looked at the device log,
// decided the two-beat reading was working as designed, and closed it. The
// owner has since overruled that outright — *"aether should be āther"* — so
// keeping the old expectation with a swapped string would leave a test whose
// title asserts something now false. What survives, and what this block is
// really for, is the STRUCTURAL claim OTA-1161 needed: the family is respelled
// by the lexicon (not by Kokoro guessing), and the log preview prints
// POST-lexicon text, which is why it looks odd in the log and correct in the ear.
describe('OTA-1161 — the Aether family is respelled by the lexicon, not by Kokoro', () => {
  it('the family carries the authored head (OTA-1170: "ayther")', () => {
    expect(applyLoreLexicon('Aetheric')).toBe('aytheric');
    expect(applyLoreLexicon('Aether')).toBe('ayther');
    expect(applyLoreLexicon('Aetherstone')).toBe('ayther stone');
  });

  it('⚠ the two-beat "ay thur" reading OTA-1161 defended is retired', () => {
    for (const w of ['Aether', 'Aetheric', 'Aetherstone', 'Aetherkin', 'Aetherstorm']) {
      expect(applyLoreLexicon(w)).not.toContain('ay thur');
    }
  });

  it('the respelling survives inside a sentence', () => {
    expect(applyLoreLexicon('The Aetheric drone is patient.'))
      .toBe('The aytheric drone is patient.');
  });
});

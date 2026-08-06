// OTA-1153 — THE VOICE STOPS ARRIVING AFTER YOU HAVE ALREADY READ THE LINE.
//
// Owner, three questions in one message, and the third is a bug report:
//
//   "is any of this homework spoken? or is it all written? also when the
//    arbiter welcomes you back and other in-game related chatter, who writes
//    that? and do we need to see the text and then hear it? that's what makes
//    the voice feel late sometimes, you read it then hear it 10 seconds later."
//
// ⚠ THE MECHANISM, AND IT IS NOT AN ACCIDENT. Kokoro and Qwen share ONE lock —
// arb159 put them there because running both at once SIGSEGV'd the Tensor G5,
// and that exclusivity is non-negotiable. OTA-634 then made the lock
// priority-aware and wrote its trade down plainly:
//
//   "LLM narration jumps ahead of voice synth so the words land promptly and
//    the voice fills in behind."
//
// So a line ALREADY ON SCREEN had to wait behind whatever the model was doing
// next. OTA-1151 measured what that is: a scene_intro generation runs 19.3
// seconds. The voice was not merely trailing — it was trailing by the length of
// the NEXT narration. That is the reported ten seconds, and it is structural.
//
// ⚠ THE TWO SIDES ARE NOT SYMMETRICAL, which is what OTA-634 could not see from
// where it stood. A narration delayed two seconds is INVISIBLE: nothing is
// shown until it completes anyway. A voice delayed ten seconds is the most
// obvious defect in the game — you have already read the line it is reading to
// you. So the order flips.
//
// ⚠ AND A REVERSAL NEEDS AN ANSWER TO THE FEAR IT REVIVES. OTA-634's worry was
// a voice backlog making responses feel slow. Two things bound it now:
//   1. the total queue cap of three whole lines (OTA-634's own mitigation), and
//   2. the STALE-LINE DROP added here — a line whose text has been on screen
//      longer than six seconds is never spoken at all. Past that point the
//      audio is an echo of something the player has read and moved on from,
//      laid over whatever is happening now, and silence is better.
// The backlog cannot grow old, because old lines do not get spoken.
//
// ⚠ THIRD PIECE: PRE-SYNTHESIS. OTA-1152 banked scene intros so the TEXT lands
// instantly — which made this gap MORE visible, not less, and that was flagged
// in its own handoff rather than left to be discovered. The bank is also what
// makes the real fix possible for the first time: if the line exists before it
// is needed, so can its audio. A banked line is now synthesised during the same
// idle window that wrote it, at HOMEWORK priority, and `speak()` finds the PCM
// already waiting. Text and voice land together — which is the actual answer to
// "do we need to see the text and then hear it?" No. They should arrive at once.

import {
  runExclusiveNativeMl,
  ML_PRIORITY_VOICE,
  ML_PRIORITY_LLM,
  ML_PRIORITY_HOMEWORK,
} from '../app/ai/nativeMlLock';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TTS: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/voice/PiperTTSManager.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOCK: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/ai/nativeMlLock.ts'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STORE: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('OTA-1153 — ⚠ the voice now outranks the LLM', () => {
  it('the constants say so', () => {
    expect(ML_PRIORITY_VOICE).toBeGreaterThan(ML_PRIORITY_LLM);
    // …and homework is still below both, which OTA-1146 owns and this must
    // not have quietly broken.
    expect(ML_PRIORITY_HOMEWORK).toBeLessThan(ML_PRIORITY_LLM);
  });

  it('⚠ a line already on screen is spoken BEFORE the next narration runs', async () => {
    // The exact shape of the owner's complaint: the player acts, a narration is
    // queued, and a line is already waiting to be read aloud. Under OTA-634 the
    // narration went first and the voice waited out its whole duration.
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const busy = runExclusiveNativeMl(async () => { await held; order.push('busy'); });
    const voice = runExclusiveNativeMl(async () => { order.push('voice'); }, ML_PRIORITY_VOICE);
    const narration = runExclusiveNativeMl(async () => { order.push('narration'); }, ML_PRIORITY_LLM);
    await tick();
    release();
    await Promise.all([busy, voice, narration]);
    expect(order).toEqual(['busy', 'voice', 'narration']);
  });

  it('exclusivity is untouched — the arb159 crash guarantee still holds', async () => {
    let inFlight = 0;
    let peak = 0;
    const job = (p: number) => runExclusiveNativeMl(async () => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    }, p);
    await Promise.all([
      job(ML_PRIORITY_VOICE), job(ML_PRIORITY_LLM), job(ML_PRIORITY_HOMEWORK),
      job(ML_PRIORITY_VOICE), job(ML_PRIORITY_LLM),
    ]);
    expect(peak).toBe(1);
  });

  it('the reversal is documented where the constant lives, not just in a commit', () => {
    // A bare number flip with no reason attached is how OTA-634's trade would
    // get silently re-flipped by the next person to read this file.
    expect(LOCK).toContain('REVERSING OTA-634');
    expect(LOCK).toContain('you read it then hear it 10 seconds later');
  });
});

describe('OTA-1153 — ⚠ a line you already read past is not spoken', () => {
  it('lines carry the moment they went on screen', () => {
    expect(TTS).toContain('queuedAt?: number;');
    expect(TTS).toContain('queuedAt: Date.now(),');
  });

  it('the drop happens at SPEAK time, not at enqueue', () => {
    // A line that waits three seconds and then plays is fine; only the lock
    // knows in advance which lines will lose that fight, so the decision has
    // to be made at the last possible moment.
    const drain = TTS.slice(TTS.indexOf('async function drain()'));
    expect(drain.indexOf('STALE_LINE_MS')).toBeGreaterThan(-1);
    expect(drain.indexOf('STALE_LINE_MS')).toBeLessThan(drain.indexOf('const next = queue.shift();'));
  });

  it('⚠ whole LINES are dropped, never half of one', () => {
    const drain = TTS.slice(TTS.indexOf('async function drain()'));
    expect(drain).toContain('staleLineIds');
    expect(drain).toContain('q.lineId');
    // Half-speaking a line would be worse than either extreme.
    expect(drain).toContain('staleLineIds.has(queue[i]!.lineId!)');
  });

  it('the threshold sits past a normal synth, so ordinary lines are never at risk', () => {
    expect(TTS).toContain('const STALE_LINE_MS = 6_000;');
  });

  it('⚠ and it is named as the thing that licenses the priority reversal', () => {
    expect(TTS).toContain('LICENSES THE PRIORITY REVERSAL');
  });
});

describe('OTA-1153 — ⚠ pre-synthesis: text and voice land together', () => {
  it('a banked scene intro also banks its audio', () => {
    const fn = STORE.slice(
      STORE.indexOf('function bankSceneIntro'),
      STORE.indexOf('function takeBankedSceneIntro'),
    );
    // RETARGETED BY OTA-1162 (audit) — the bank now pre-synthesizes the
    // STRIPPED text: the live path runs stripArbiterFrame before Kokoro, so a
    // raw-text cache key could never match a quoted intro's spoken chunks.
    expect(fn).toContain('presynthesize(safStrip(text))');
  });

  it('the fill is fire-and-forget — a failure costs one normal synth, not a line', () => {
    const fn = STORE.slice(
      STORE.indexOf('function bankSceneIntro'),
      STORE.indexOf('function takeBankedSceneIntro'),
    );
    expect(fn).toContain('.catch(');
    // Lazily required like every other voice touch in the store, so the tests
    // and every non-speaking consumer never pull in native audio.
    expect(fn).toContain("require('../voice/PiperTTSManager')");
  });

  it('⚠ pre-synthesis runs at HOMEWORK priority — it must never delay a real line', () => {
    const fn = TTS.slice(TTS.indexOf('export async function presynthesize'));
    expect(fn.slice(0, 1400)).toContain('ML_PRIORITY_HOMEWORK');
  });

  it('speak() consumes the cache at enqueue, and it is one-shot', () => {
    expect(TTS).toContain('resolvedSamples: takePresynth(resolvedVoice, chunk),');
    const take = TTS.slice(TTS.indexOf('function takePresynth'));
    expect(take.slice(0, 400)).toContain('presynth.delete(k)');
  });

  it('⚠ the cache is keyed by VOICE as well as text', () => {
    // The player can change the Arbiter's voice at any time, and audio in the
    // wrong voice is worse than a short wait.
    expect(TTS).toContain('const presynthKey = (voiceId: string, chunk: string)');
    expect(TTS).toContain('`${voiceId}::${chunk}`');
  });

  it('⚠ BOTH paths chunk through ONE function', () => {
    // The cache is keyed per chunk and read at enqueue. A split that differed
    // by one character between speak() and presynthesize() would miss every
    // single time, and miss SILENTLY — the feature would just appear not to
    // help, with nothing in any log to say why.
    expect((TTS.match(/chunkForSpeech\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    const speak = TTS.slice(TTS.indexOf('export function speak('), TTS.indexOf('async function drain()'));
    expect(speak).toContain('const chunks = chunkForSpeech(prepared);');
    // …and the old inline copy is gone, so there is nothing left to drift.
    expect(speak).not.toContain('splitSentences(prepared)');
  });

  it('the cache is bounded — PCM is bulky and this is a latency buffer', () => {
    expect(TTS).toContain('const PRESYNTH_CAP = 6;');
    expect(TTS).toContain('if (presynth.size >= PRESYNTH_CAP) return false;');
  });

  it('it respects the TTS-off setting — no silent battery burn', () => {
    const fn = TTS.slice(TTS.indexOf('export async function presynthesize'));
    expect(fn.slice(0, 600)).toContain('if (!settings.ttsEnabled) return false;');
  });
});

describe('OTA-1153 — the answers to the other two questions, recorded', () => {
  it('item-description homework is WRITTEN only — it never reaches the spoken channel', () => {
    // It lands in the item popup via the synthesis cache. Nothing on that path
    // calls appendLog('arbiter', …), which is the only channel TTS speaks.
    const slot = STORE.slice(
      STORE.indexOf('const homeworkTick = (): void => {'),
      STORE.indexOf('setHomeworkTick(homeworkTick);'),
    );
    expect(slot).toContain('homework: item_desc');
    expect(slot).not.toContain("appendLog('arbiter'");
  });

  it('a banked scene intro IS spoken — it goes out on the arbiter channel', () => {
    expect(STORE).toContain("get().appendLog('arbiter', banked);");
  });

  it('the welcome-back is HAND-AUTHORED, not generated', () => {
    // Owner asked who writes it. Five authored lines with {name} substituted —
    // the model is not involved, which is worth knowing before anyone tries to
    // fix its voice by changing a prompt.
    expect(STORE).toContain('const WELCOME_BACK_LINES = [');
    expect(STORE).toContain("line.replace('{name}', name)");
  });
});

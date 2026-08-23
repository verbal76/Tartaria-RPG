/**
 * OTA-1460 — WHAT THE PLAYER JUST DID OUTRANKS WHAT WE SAY ABOUT IT.
 *
 * ⚠⚠⚠ THE MEASUREMENT THIS EXISTS FOR, from the owner's device log:
 *
 *     [cognitive] REST    (4954ms)
 *     [cognitive] REST    (2380ms)
 *     [cognitive] TRAVEL  (1474ms)
 *
 * against a ~100ms typical. The ONNX classifier that decides what the player's
 * action WAS queued at `ML_PRIORITY_LLM` — the same rank as Qwen — so a 100ms
 * inference sat behind a multi-second generation, and FIFO-within-rank did the
 * rest. The game was waiting on that answer to know what had happened.
 *
 * ⚠⚠ THE PINS ARE ON ORDERING PROPERTIES, NOT ON THE NUMBERS. `1.5` is an
 * implementation detail and should be free to change; "cognition beats
 * generation and loses to voice" is the claim. A test that asserts the constant
 * equals 1.5 breaks when someone renumbers the ladder to integers and teaches
 * nobody anything — that is the label-shaped pin failure, seven of which broke
 * in this codebase in three days.
 */
import {
  ML_PRIORITY_TEARDOWN, ML_PRIORITY_VOICE, ML_PRIORITY_COGNITION,
  ML_PRIORITY_LLM, ML_PRIORITY_HOMEWORK, VOICE_RESERVATION_MS,
} from '../app/ai/nativeMlLock';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const LOCK = read('app', 'ai', 'nativeMlLock.ts');
const EMBED = read('app', 'ai', 'embedding', 'SemanticEmbeddingService.ts');

describe('OTA-1460 — the ladder says what it means', () => {
  it('⚠⚠⚠ COGNITION BEATS GENERATION — the whole point', () => {
    expect(ML_PRIORITY_COGNITION).toBeGreaterThan(ML_PRIORITY_LLM);
  });

  it('⚠⚠⚠ …AND STILL LOSES TO THE VOICE — OTA-1130 is not disturbed', () => {
    // The voice is the one thing a player perceives as late; OTA-1130 settled
    // that with arithmetic (a line already on screen waiting out a 19.3s
    // generation). Cognition slots BETWEEN elaboration and performance.
    expect(ML_PRIORITY_COGNITION).toBeLessThan(ML_PRIORITY_VOICE);
  });

  it('⚠⚠ the full ladder is strictly ordered, top to bottom', () => {
    // Any two ranks compare, and none collide — a tie would put two different
    // KINDS of work into one FIFO queue, which is the defect being fixed.
    const ladder = [
      ML_PRIORITY_TEARDOWN, ML_PRIORITY_VOICE, ML_PRIORITY_COGNITION,
      ML_PRIORITY_LLM, ML_PRIORITY_HOMEWORK,
    ];
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i - 1]!).toBeGreaterThan(ladder[i]!);
    }
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it('⚠⚠ homework is still below everything, and teardown above it', () => {
    // The two ends carry crash history: homework must never delay a player's tap
    // (OTA-1123), and teardown outranks all because a backgrounded app holding
    // 425MB is what Android's low-memory killer reaps first (OTA-1452).
    expect(ML_PRIORITY_HOMEWORK).toBeLessThan(ML_PRIORITY_LLM);
    expect(ML_PRIORITY_TEARDOWN).toBeGreaterThan(ML_PRIORITY_VOICE);
  });
});

describe('OTA-1460 — the classifier actually uses the new rank', () => {
  it('⚠⚠⚠ EVERY EMBEDDING CALL IS AT COGNITION RANK — not one left behind', () => {
    // Three call sites: two session creations and the run itself. Leaving any at
    // the old rank leaves the stall in place for that path, and "a rule applied
    // at three of the four call sites leaves the fifth to ramble" is this
    // codebase's most repeated lesson.
    const calls = EMBED.match(/runExclusiveNativeMl\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    const atCognition = EMBED.match(/ML_PRIORITY_COGNITION/g) ?? [];
    // one import + one per call site
    expect(atCognition.length).toBeGreaterThanOrEqual(calls.length + 1);
  });

  it('⚠⚠⚠ AND NO EMBEDDING CALL STILL SITS AT THE GENERATION RANK', () => {
    // The positive check above passes if someone ADDS the new rank while leaving
    // an old one behind. This is the half that catches that.
    expect(EMBED).not.toContain('ML_PRIORITY_LLM');
  });
});

describe('OTA-1460 — cognition does not wait on a voice that may never come', () => {
  it('⚠⚠⚠ THE RESERVATION HOLD EXEMPTS COGNITION', () => {
    // OTA-1144's hold stops unrelated speculative work slipping into the gap
    // between a line appearing and the request to speak it. Cognition is not
    // speculative — it is the current action still resolving. Holding a ~100ms
    // inference for up to 350ms on the chance audio might arrive is the same
    // inversion this OTA fixes, one rank lower.
    expect(LOCK).toContain('priority < ML_PRIORITY_COGNITION');
    expect(LOCK).not.toContain('priority < ML_PRIORITY_VOICE');
  });

  it('⚠⚠ …so only work BELOW cognition can be deferred by it', () => {
    // Expressed as arithmetic on the real constants rather than on the source
    // text, so a rename cannot make this quietly stop meaning anything.
    const deferred = (p: number): boolean => p < ML_PRIORITY_COGNITION;
    expect(deferred(ML_PRIORITY_HOMEWORK)).toBe(true);
    expect(deferred(ML_PRIORITY_LLM)).toBe(true);
    expect(deferred(ML_PRIORITY_COGNITION)).toBe(false);
    expect(deferred(ML_PRIORITY_VOICE)).toBe(false);
    expect(deferred(ML_PRIORITY_TEARDOWN)).toBe(false);
  });

  it('⚠ the reservation still exists and is still short', () => {
    // It was cut to 350ms because "a reservation is a DELAY on LLM work, and
    // 1200ms of it was the thing being complained about". A guard rail, not a
    // mechanism — and one that must not grow back quietly.
    expect(VOICE_RESERVATION_MS).toBeGreaterThan(0);
    expect(VOICE_RESERVATION_MS).toBeLessThanOrEqual(500);
  });
});

describe('OTA-1460 — exclusivity, which is not negotiable', () => {
  it('⚠⚠⚠ STILL EXACTLY ONE NATIVE OP AT A TIME', () => {
    // Concurrent Qwen + Kokoro produced a reproducible process SIGSEGV. Adding a
    // rank must not become adding a lane: `running` is the guard, and priority
    // only ever reorders the WAITING set.
    expect(LOCK).toContain('if (running || pending.length === 0) return;');
    expect(LOCK).toContain('running = true;');
    expect(LOCK).toContain('priority only reorders the WAITING set');
  });
});

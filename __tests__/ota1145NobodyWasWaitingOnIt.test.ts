// OTA-1145 — NOBODY WAS WAITING ON IT.
//
// Owner, rejecting OTA-1144's shape of fix: *"we closed it yesterday, I even
// commented that it was fixed after you dropped it. now we fixed something
// until it was broke. we reintroduced a delay on the js side."*
//
// ⚠ HE IS RIGHT, AND THE DIFF SAYS SO. Between OTA-1134 (the commit he tested
// and confirmed) and the log that reopened this, the only substantive JS
// changes on the voice/LLM path were: the sentence pause he asked for
// (160→280 ms), the presynth eviction repair — and OTA-1144's RESERVATION,
// which makes LLM work wait up to 1200 ms so the voice can go first. That is
// a delay, added by us, on the JS side. It arbitrated the collision instead of
// removing it.
//
// ⚠ THE COLLISION HAD A CAUSE, and it is a scheduling bug in this file's
// requester. `inferGear` runs over the WHOLE INVENTORY during save-load
// hydration, so a save holding one unclassifiable item fired an
// interactive-priority generation ~160 ms into the load — which then held the
// native-ML lock through 3.5 s of uninterruptible prefill while the greeting
// the player had already read waited to be spoken.
//
// Nobody was waiting on that description. This path's own contract is that the
// result "lands in the cache for the NEXT lookup" — the current render keeps
// its static row, and OTA-192 restamps later. So it is fixed where it belongs:
//   · it only fires while the player is on a STATIONARY screen (`uiIdleSince`,
//     the owner's own homework signal) — which is never during a load; and
//   · it runs as HOMEWORK, which is what it always was: below voice, and cut
//     short the instant real work arrives.
// With the cause gone, 1167's reservation drops 1200 → 350 ms: a guard rail
// sized to the real handoff (a model lookup and a breadcrumb write), not a
// mechanism anything relies on.
import { VOICE_RESERVATION_MS } from '../app/ai/nativeMlLock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const STORE: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

/** The on-demand requester registered with itemDefaults — NOT the homework
 *  slot above it. Sliced so the two can't be confused for one another. */
const REQUESTER = STORE.slice(STORE.indexOf('itemDefaults.setQwenSynthRequester('));

describe('OTA-1145 — the load no longer fires an interactive generation', () => {
  it('⚠ THE FIX: the requester is gated on the stationary-screen signal', () => {
    // uiIdleSince is null during hydration, so a save load can no longer start
    // a generation into the greeting.
    expect(REQUESTER).toContain('if (get().uiIdleSince === null) return;');
  });

  it('the gate sits BEFORE anything is marked in flight', () => {
    const gateAt = REQUESTER.indexOf('if (get().uiIdleSince === null) return;');
    const claimAt = REQUESTER.indexOf('synthInFlight = true;');
    expect(gateAt).toBeGreaterThan(0);
    expect(claimAt).toBeGreaterThan(gateAt);
  });

  it('⚠ and it runs as HOMEWORK — below voice, and interruptible', () => {
    expect(REQUESTER).toContain('synthesizeItemViaQwen(name, hintTags, qwen, { homework: true })');
  });

  it('the existing valves are untouched — dedupe, readiness, and the gap', () => {
    // OTA-1109's one-at-a-time + 20 s gap is what keeps a salvage haul from
    // firing five generations; this OTA narrows WHEN, it does not widen HOW MUCH.
    expect(REQUESTER).toContain('if (pending.has(key)) return;');
    expect(REQUESTER).toContain('if (!qwen.isReady()) return;');
    expect(REQUESTER).toContain('if (synthInFlight) return;');
    expect(REQUESTER).toContain('if (Date.now() - lastSynthAt < SYNTH_GAP_MS) return;');
  });

  it('the witholdIdentity rule dial still wins over everything', () => {
    const dialAt = REQUESTER.indexOf('witholdIdentity');
    const gateAt = REQUESTER.indexOf('if (get().uiIdleSince === null) return;');
    expect(dialAt).toBeGreaterThan(0);
    expect(dialAt).toBeLessThan(gateAt);
  });
});

describe('OTA-1145 — the reservation shrinks to a guard rail', () => {
  it('⚠ 1200 → 350 ms: it can no longer be felt as latency of its own', () => {
    expect(VOICE_RESERVATION_MS).toBe(350);
  });

  it('the reversal is recorded with the owner\'s objection, not silently', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const LOCK: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '..', 'app', 'ai', 'nativeMlLock.ts'), 'utf8');
    // (the quote wraps across comment lines — anchor on the contiguous half)
    expect(LOCK).toContain('we reintroduced a delay on the');
    expect(LOCK).toContain('OTA-1145');
  });
});

describe('OTA-1145 — the homework slot is unchanged', () => {
  it('the idle slot still has its own gap and idle window', () => {
    // Two callers, one generator. The homework TICK (scheduled enrichment) is
    // a different thing from the REQUESTER (an unknown item was just resolved),
    // and this OTA only re-labels the second.
    expect(STORE).toContain('const HOMEWORK_GAP_MS = 30_000;');
    expect(STORE).toContain('synthesizeItemViaQwen(target.name, target.tags, qwen, { homework: true })');
  });
});

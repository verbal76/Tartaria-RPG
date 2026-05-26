// OTA-060 — Arbiter shouldn't fire "I'm not sure what you're trying
// to tell me" after a successful CLIMB on a flavor-prefixed scene
// noun. Two compounding pre-OTA bugs:
//
//   1. 'climb' was missing from ARBITER_ENGAGED_INTENTS in
//      gameStore.ts, so post-climb the on-target Arbiter line ran
//      with the climbed noun.
//   2. The garbage-noun heuristic in narrativeGenerator.ts flagged
//      any noun > 3 words as junk, but legit flavor-prefixed scene
//      nouns ("jagged dormant architectural sentinel" — 4 words;
//      "salt-crusted sentinel diagnostic console" — 5 words) hit
//      this and triggered the "I'm not sure" line.
//
// Repro from playtester log (2026-05-26):
//   [player] climb jagged dormant architectural sentinel
//   [world]  Tier 2/4 cleared.
//   [arbiter] The Arbiter studies you, plainly. "I'm not sure
//             what you're trying to tell me..."

import { buildArbiterRemark } from '../app/engine/narrativeGenerator';

// buildArbiterRemark drives the on-target branch via playerTargetNoun.
// We use an unknown location id so LOCATION_FLAVORS pool lookup misses
// and the function deterministically hits the noun-defer branch where
// the garbage gate lives.
function makeCtx(playerTargetNoun: string | undefined) {
  return {
    location: { id: 'unknown_loc_for_test', name: 'Test Location' } as any,
    playerTargetNoun,
    playerHpFraction: 1,
    playerStaminaFraction: 1,
  };
}

describe('OTA-060 — Arbiter does not garbage-flag legit scene nouns', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
  });

  it('4-word flavor-prefixed scene noun does NOT trigger the "not sure" line', () => {
    // Run many times because LOCATION_FLAVORS pick is RNG-gated;
    // we want to verify the GARBAGE branch is NOT reachable, even
    // if some runs land in the location-flavor branch.
    let triggeredGarbage = 0;
    for (let i = 0; i < 100; i++) {
      const line = buildArbiterRemark(makeCtx('jagged dormant architectural sentinel'));
      if (line && /not sure what you're trying to tell me/i.test(line)) {
        triggeredGarbage += 1;
      }
    }
    expect(triggeredGarbage).toBe(0);
  });

  it('5-word flavor-prefixed scene noun does NOT trigger the "not sure" line', () => {
    let triggeredGarbage = 0;
    for (let i = 0; i < 100; i++) {
      const line = buildArbiterRemark(makeCtx('salt-crusted sentinel diagnostic console'));
      if (line && /not sure what you're trying to tell me/i.test(line)) {
        triggeredGarbage += 1;
      }
    }
    expect(triggeredGarbage).toBe(0);
  });

  it('actual garbage prose (long sentence) STILL triggers the garbage gate', () => {
    // A 9-word, question-marked, 70-char player rant should still
    // be caught by the gate so the regression doesn't go the wrong
    // way and start echoing player typos as if they were nouns.
    const garbage = 'why did you not tell me about the trapped door earlier?';
    let triggeredGarbage = 0;
    for (let i = 0; i < 50; i++) {
      const line = buildArbiterRemark(makeCtx(garbage));
      if (line && /not sure what you're trying to tell me/i.test(line)) {
        triggeredGarbage += 1;
      }
    }
    // Should fire every time since this is plain garbage and
    // location-flavor branch is gated on length being reasonable.
    expect(triggeredGarbage).toBeGreaterThan(0);
  });
});

describe('OTA-060 — engaged intents include climb', () => {
  it("ARBITER_ENGAGED_INTENTS contains 'climb' and other action verbs", () => {
    // The set is private to gameStore.ts; we exercise the behavior
    // indirectly by reading the file source. This is a guard against
    // future regressions of someone editing the set and dropping
    // 'climb' (or the other newly-added verbs) silently.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'),
      'utf8',
    );
    // Find the ARBITER_ENGAGED_INTENTS literal block.
    const match = src.match(/ARBITER_ENGAGED_INTENTS[\s\S]*?\]\);/);
    expect(match).toBeTruthy();
    const block = match![0];
    expect(block).toMatch(/['"]climb['"]/);
    expect(block).toMatch(/['"]search['"]/);
    expect(block).toMatch(/['"]drop['"]/);
    expect(block).toMatch(/['"]scrap['"]/);
    expect(block).toMatch(/['"]talk['"]/);
  });
});

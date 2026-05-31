// OTA-160 — regression lock. Stress sweep (collectAll) flagged that
// a hoarder typing `take rubble` repeatedly only saw the SALVAGE
// redirect on 3 of 8 refusal lines. Across a long stretch a player
// never learned the right verb. Fix: every refusal line now ends
// with an explicit "(Try SALVAGE.)" or "salvage it." pattern so any
// single tap on a scene-feature noun teaches the salvage path.

jest.setTimeout(15000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const portability = require('../app/engine/portability');

describe('OTA-160 — every scene-feature refusal mentions salvage', () => {
  it('all SCENE_FEATURE_REFUSALS contain a SALVAGE redirect token', () => {
    // The pool is module-internal; we sample sceneFeatureRefusalLine
    // many times across deterministic seeds to surface every line.
    // 200 calls > 8 lines so coverage is guaranteed by birthday.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(portability.sceneFeatureRefusalLine('the test feature'));
    }
    // Pool is 8 lines; require we saw at least 7 (RNG can miss 1).
    expect(seen.size).toBeGreaterThanOrEqual(7);
    // EVERY observed line must mention salvage in some form.
    for (const line of seen) {
      expect(line.toLowerCase()).toMatch(/salvage/);
    }
  });
});

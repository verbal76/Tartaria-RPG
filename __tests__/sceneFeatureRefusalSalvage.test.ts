// OTA-137 — regression lock. Stress sweep (collectAll) flagged that
// a hoarder typing `take rubble` repeatedly only saw the SALVAGE
// redirect on 3 of 8 refusal lines. Across a long stretch a player
// never learned the right verb. Fix: every refusal line ended
// with an explicit "(Try SALVAGE.)" or "salvage it." pattern so any
// single tap on a scene-feature noun teaches the salvage path.
//
// ⚠⚠ OTA-1232 — THE GUARANTEE IS INTACT; ITS SCOPE IS NOT. The original rule was
// "every line teaches SALVAGE", full stop — and that turned out to be advice the
// game could not keep. Measured against the shipped pools, `sign`, `arch` and
// `wall` match NO salvage pool, so on those nouns a universal pointer sent the
// player off to do the one thing that provably cannot help: the same defect the
// contract refusal used to commit when it blamed travel for an empty board.
//
// ⚠ SO THIS SUITE NOW ASSERTS BOTH HALVES, and the first is OTA-137's original
// lock, UNWEAKENED — on a noun that does pay, every line still names the verb, so
// one tap is still enough to learn it. The second is the new rule: on a noun that
// does not pay, no line may name it.
//
// ⚠ The old test asked this of `'the test feature'`, a noun with no pool — which
// is exactly the case that changed. It now asks it of nouns whose answer is
// known and asserted, because a fixture sitting on the boundary tests the
// boundary by accident rather than on purpose.

jest.setTimeout(15000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const portability = require('../app/engine/portability');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { hasSalvageYield } = require('../app/engine/salvagePools');

describe('OTA-137 — a refusal teaches SALVAGE wherever SALVAGE pays', () => {
  it('⚠⚠ every line on a salvageable noun still names the verb (the original lock)', () => {
    for (const noun of ['brick', 'bench', 'gate', 'crate']) {
      expect(hasSalvageYield(noun)).toBe(true);
      // The pool is module-internal; sample well past 8 so coverage is
      // guaranteed rather than hoped for.
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(portability.sceneFeatureRefusalLine(noun));
      expect(seen.size).toBeGreaterThanOrEqual(7);
      for (const line of seen) {
        expect(line.toLowerCase()).toMatch(/salvage/);
      }
    }
  });

  it('⚠⚠ ...and NO line on a scenery-only noun names it, because it would not pay', () => {
    // ⚠ OTA-1242 — FIXTURES MOVED, RULE UNCHANGED. `sign` and `arch` gained salvage
    // pools in the census pass, which is the census WORKING — the owner's rule is
    // that anything you cannot take, you can salvage. So this now asks the question
    // of nouns that are pool-less BY NATURE: you cannot strip a stain, a fog bank or
    // a corridor. Those cannot quietly become salvageable the way the old ones did.
    for (const noun of ['blood stain', 'fog bank', 'corridor']) {
      expect(hasSalvageYield(noun)).toBe(false);
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(portability.sceneFeatureRefusalLine(noun));
      expect(seen.size).toBeGreaterThanOrEqual(7);
      for (const line of seen) {
        expect(line.toLowerCase()).not.toMatch(/salvage/);
      }
    }
  });

  it('⚠ both pools stayed eight deep — the variety is why a hoarder does not reread one sentence', () => {
    for (const noun of ['brick', 'blood stain']) {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) seen.add(portability.sceneFeatureRefusalLine(noun));
      expect(seen.size).toBe(8);
    }
  });
});

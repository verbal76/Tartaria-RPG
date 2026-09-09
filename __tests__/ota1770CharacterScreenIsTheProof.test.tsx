/**
 * OTA-1770 — CHARACTERSCREEN, THE PROOF. The rollout's step 2.
 *
 * Tier 0 is complete; this is the first screen to adopt it, and the plan chose
 * this one deliberately: *"1,515 lines, 39 gold declarations (worst density in
 * the game), 20 referencing suites, 19 conditional branches, no tabs and no
 * modals of its own. Cheapest possible proof that the schema transfers."*
 *
 * WHAT TRANSFERRED, MEASURED:
 *   · the hand-rolled header → `TScreenHeader`. Its `header`, `backBtn` and
 *     `backText` were BYTE-IDENTICAL to the kit's `schRow`, `schBack` and
 *     `schBackText`, so the row, the pill and the label move no pixel.
 *   · 29 interface golds → `T.gold`. Same colour, one source, and the ratchet
 *     falls 367 → 331 — the biggest single drop it has taken.
 *   · three hand-typed vitality ramps → `vitalityColor`.
 *   · the corruption tier → a newly named `corruptionColor`.
 *   · one defect fixed: the empty state was painted in brand gold.
 *
 * ⚠⚠ TWO THINGS DO MOVE ON SCREEN, AND BOTH ARE THE RULING RATHER THAN TASTE:
 * the screen TITLE goes from brand gold to ink (the kit: "a screen's own name is
 * not a live obligation"), and the empty state goes from gold to ink-dim. Every
 * other change is the same pixel from a better address.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { vitalityColor, corruptionColor, CORRUPTION, VITALITY } from '../app/ui/semanticColor';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const SCREEN = read('app', 'screens', 'CharacterScreen.tsx');
const KIT = read('app', 'ui', 'tartariaKit.tsx');

/* ⚠ GRADE THE CODE, NOT THE PROSE — eleventh time in this rollout. This file's
 * own comments quote the hex it asserts is gone, twice. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the header transferred, and it moved no pixel', () => {
  test('⚠⚠ the screen uses TScreenHeader and its own header styles are GONE', () => {
    const code = codeOf(SCREEN);
    expect(code).toContain('<TScreenHeader');
    expect(code).toContain('title="CHARACTER"');
    expect(code).toContain("onBack={() => setScreen('exploration')}");
    for (const orphan of ['header:', 'backBtn:', 'backText:']) {
      expect([orphan, new RegExp(`\\n  ${orphan}`).test(code)]).toEqual([orphan, false]);
    }
  });

  test('⚠⚠⚠ the kit\'s values ARE the screen\'s old values — that is why this is free', () => {
    /* Measured before adopting rather than asserted after. If these ever differ,
     * this adoption stopped being an extraction and became a restyle, and the
     * next screen inherits the difference. */
    const kitBack = /schBack: \{([\s\S]*?)\n  \},/.exec(KIT)?.[1] ?? '';
    expect(kitBack).not.toBe('');
    for (const v of ["backgroundColor: '#1a1714'", "borderColor: '#3a342c'", 'borderWidth: 1',
      'borderRadius: 4', 'paddingHorizontal: 14', 'paddingVertical: 10', 'minWidth: 80']) {
      expect([v, kitBack.includes(v)]).toEqual([v, true]);
    }
    expect(KIT).toContain("schRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 }");
    expect(KIT).toContain('schBackText: { color: T.gold, fontSize: 14, letterSpacing: 2, fontWeight: \'700\' }');
  });

  test('⚠ the REPLAY OPENING button kept its place, its handler and its label', () => {
    /* Owner's placement, OTA-1023: "across the top is back, character, and then
     * replay opening." It is the header's `right` slot now; a header adoption
     * that silently dropped a control would be a regression wearing a refactor's
     * clothes. */
    const code = codeOf(SCREEN);
    expect(code).toContain('right={(');
    expect(code).toContain('replayStoryIntro()');
    expect(code).toContain('Replay the opening crawl');
  });

  test('⚠⚠ the TITLE goes ink, and that is the ruling — not a preference', () => {
    /* The kit's own note: "A screen's own name is not a live obligation. Ink by
     * default." A gold title has to be asked for BY NAME, and this screen has no
     * reason to ask. This is one of only two visible changes in the pass. */
    expect(codeOf(SCREEN)).not.toContain('tone="gold"');
    expect(KIT).toContain('schTitle: { color: T.ink');
  });
});

describe('the gold, routed rather than kept', () => {
  test('⚠⚠⚠ NOT ONE bare brand-gold literal survives in this screen', () => {
    /* The headline claim, and the reason this screen was chosen: it had the
     * worst density in the game. Everything that was interface now reads
     * `T.gold`; everything that was semantic reads a named authority. */
    expect(codeOf(SCREEN)).not.toContain('#c9a86a');
    expect(codeOf(SCREEN)).not.toContain('#C9A86A');
    expect(codeOf(SCREEN)).toContain('T.gold');
  });

  test('⚠⚠ the ratchet actually fell, and its ledger says why', () => {
    const gate = read('scripts', 'check-gold.mjs');
    const baseline = Number(/const BASELINE = (\d+);/.exec(gate)?.[1]);
    expect(Number.isFinite(baseline)).toBe(true);
    /* ⚠ Asserted as a CEILING, not as 331. A ratchet only moves down, and a
     * suite that pins today's number turns the next correct removal into a red
     * test — the mistake this rollout has now made four times. */
    expect(baseline).toBeLessThanOrEqual(331);
    expect(gate).toContain('OTA-1770');
  });

  test('⚠⚠ three hand-typed vitality ramps became the authority the file ALREADY used', () => {
    /* ⚠⚠⚠ THE FINDING WORTH KEEPING: this screen already imported and used
     * `vitalityColor` for the player's own HP (OTA-1757) — and three more ramps
     * in the SAME FILE were that function typed out by hand and were missed.
     * "The screen uses the authority" and "the screen uses the authority
     * EVERYWHERE" are different claims, and only the second one is worth
     * anything. */
    const code = codeOf(SCREEN);
    expect(code).toContain('const hpColorDog = vitalityColor(hpPctDog)');
    expect(code).toContain('const hpColorG = vitalityColor(hpPctG)');
    expect(code).toContain('const loyaltyColor = vitalityColor(loyaltyPct, [0.5, 0.3])');
    // no ramp left typed out by hand
    expect(code).not.toMatch(/> 0\.5 \? '#9ec96a'/);
  });

  test('⚠ and the ramps produce EXACTLY what they produced before', () => {
    /* Exercised, not read. The whole claim of a routing pass is that no pixel
     * changes; a ramp whose cuts drifted would change one silently. */
    expect(vitalityColor(0.9)).toBe(VITALITY.good);
    expect(vitalityColor(0.4)).toBe(VITALITY.warn);
    expect(vitalityColor(0.1)).toBe(VITALITY.bad);
    // ⚠ loyalty's lower cut is 0.3, not HP's 0.25 — a dog at 28% is not yet red
    expect(vitalityColor(0.28, [0.5, 0.3])).toBe(VITALITY.bad);
    expect(vitalityColor(0.28)).toBe(VITALITY.warn);
  });

  test('⚠⚠ the corruption tier is NAMED, which is what the ruling prescribes', () => {
    /* The legacy hunt's own classification: a meaningful colour under the
     * owner's ruling is KEPT and *named in the kit*, not left as a literal.
     * This was the last bare gold in the screen; leaving it would have meant the
     * ratchet counting a semantic use as interface debt forever. */
    expect(corruptionColor('hollowed')).toBe(CORRUPTION.hollowed);
    expect(corruptionColor('corrupted')).toBe(CORRUPTION.corrupted);
    expect(corruptionColor('tainted')).toBe(CORRUPTION.tainted);
    expect(corruptionColor('clean')).toBe(CORRUPTION.clean);
    // ⚠ an unknown tier reads CLEAN — the safe direction; it must not paint alarm
    expect(corruptionColor(undefined)).toBe(CORRUPTION.clean);
    expect(corruptionColor('something-new')).toBe(CORRUPTION.clean);
    // ⚠ tainted IS the brand gold, and caution is gold in VITALITY too
    expect(CORRUPTION.tainted).toBe(VITALITY.warn);
    expect(codeOf(SCREEN)).toContain('corruptionColor(tier)');
  });
});

describe('the defect that was logged, and is now fixed', () => {
  test('⚠⚠⚠ the empty state is no longer painted in brand gold', () => {
    /* OTA-1760 logged this and predicted its own death: "This test fails the day
     * someone fixes it, which is the point." It did, on this pass. */
    expect(codeOf(SCREEN)).toContain('placeholder: { color: T.inkDim');
    expect(codeOf(SCREEN)).toContain('No character loaded.');
  });
});

describe('the suite grades code', () => {
  test('⚠ comments are stripped, or the "no bare gold" claim is vacuous', () => {
    expect(codeOf(SCREEN).length).toBeLessThan(SCREEN.length * 0.9);
    expect(codeOf('/* #c9a86a */ const a = 1;')).not.toContain('c9a86a');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1770-character-is-the-proof'");
  });
});

/**
 * OTA-1760 — TWO THE OWNER SAW IN A SCREENSHOT, BOTH MEASURED BEFORE TOUCHING.
 *
 * Owner, on the shots sent with OTA-1759: *"the deal with your choices image
 * needs work, the border covers the top sentence, also the turn off tips button
 * isn't centered."*
 *
 * ⚠⚠ NEITHER WAS DIAGNOSED BY LOOKING HARDER AT THE PICTURE. Both were measured
 * from the real exported bundle first, because "it looks off" and "here is the
 * number that is wrong" are different claims and only the second one can be
 * fixed with confidence:
 *
 *   1. THE BORDER COVERING THE SENTENCE — a ZERO GAP, not an overlap.
 *        placeholder text   y 106 → 122
 *        back button box    y 122 → 162
 *      The button's 1px top border lands exactly on the text's line box, so it
 *      slices the descenders of "You're not as fast as you think you are."
 *      `placeholder` had a `marginTop` and no `marginBottom`.
 *      ⚠ And the same button was stretched to the full 387pt column: this branch
 *      has no header row for it to sit in, so the container's default
 *      `alignItems: 'stretch'` blew it out and it read as a banner.
 *
 *   2. ⚠⚠⚠ THE LINK — REVERTED BY OTA-1761, BECAUSE IT WAS NOT A DEFECT.
 *      Kept named here rather than edited out: this pass shipped two changes
 *      and only one of them survived, which is worth being able to see.
 *
 * ⚠⚠⚠ AND ONE THING IN THAT SCREENSHOT DOES NOT SHIP. The gold rounded box drawn
 * around "Turn off tips" is the HEADLESS BROWSER'S FOCUS RING. On a device that
 * control is bare underlined text with no border at all.
 * ⚠ THIS PASS WROTE THAT SENTENCE AND THEN ACTED ON THE RING ANYWAY. Naming an
 * artifact is not the same as not being fooled by it. See OTA-1761.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const VENDOR = read('app', 'screens', 'VendorScreen.tsx');
const HINT = read('app', 'components', 'FirstTimeHint.tsx');

/** Pull one StyleSheet entry's body out of a source file. */
const rule = (src: string, name: string): string => {
  const i = src.indexOf(`\n  ${name}: {`);
  if (i < 0) return '';
  return src.slice(i, src.indexOf('\n  },', i));
};

// ═══ 1. THE ZERO GAP ═════════════════════════════════════════════════════════
describe('the back button no longer sits on the sentence above it', () => {
  test('⚠⚠ the placeholder has a bottom margin, not only a top one', () => {
    const p = /placeholder: \{([^}]*)\}/.exec(VENDOR);
    expect(p).not.toBeNull();
    const body = p![1] ?? '';
    expect(body).toContain('marginTop: 80');
    expect(body).toMatch(/marginBottom: \d+/);
    const mb = Number(/marginBottom: (\d+)/.exec(body)?.[1] ?? NaN);
    // Enough to clear a 1px border and read as separation, not a hairline.
    expect(mb).toBeGreaterThanOrEqual(12);
  });

  test('⚠ the button is sized by its label instead of filling the column', () => {
    expect(VENDOR).toContain("placeholderBtn: { alignSelf: 'center' }");
    expect(VENDOR).toContain('style={[styles.backBtn, styles.placeholderBtn]}');
  });

  test('⚠⚠ the measurement that found it is written down, not just the fix', () => {
    /* "The border covers the sentence" is what it looked like. "The text's box
     * ends at 122 and the button's starts at 122" is what was true. A fix whose
     * reason is only the symptom gets undone by the next person who thinks the
     * gap looks big. */
    expect(VENDOR).toContain('y=122');
    expect(VENDOR).toContain('ZERO gap');
  });

  test('⚠⚠ the other eight declarations are NOT swept up — and counting them found one', () => {
    /* I first wrote that `placeholder` was "byte-identical in seven screens".
     * ⚠ IT IS NINE DECLARATIONS AND THEY ARE NOT ALL IDENTICAL, which is what
     * counting rather than asserting is for:
     *   6 byte-identical  RecipesView, Map, Inventory, Exploration, Crafting,
     *                     Contracts — `#a2977b`, centred, marginTop 80
     *   1 Ending          the same plus `fontSize: 14`
     *   1 Vendor          the one fixed here
     *   1 CharacterScreen ⚠ `#c9a86a` — THE BRAND GOLD, on "No character
     *                     loaded." An empty state is neither a live obligation
     *                     nor a live process, which is the whole of VIS-3's
     *                     rule, so this is interface gold the rollout should
     *                     drive down. RECORDED, not fixed: CharacterScreen is
     *                     the rollout's next adoption and it belongs to that
     *                     pass, not to a two-line spacing fix.
     * Vendor is the only one of the nine with a sibling after it, so it is the
     * only one where the missing gap was ever visible. */
    const grey = "placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 }";
    for (const s of ['MapScreen', 'InventoryScreen', 'CraftingScreen', 'ExplorationScreen', 'ContractsScreen']) {
      expect(read('app', 'screens', `${s}.tsx`)).toContain(grey);
    }
    expect(read('app', 'components', 'RecipesView.tsx')).toContain(grey);
    expect(read('app', 'screens', 'EndingScreen.tsx')).toContain(`${grey.slice(0, -2)}, fontSize: 14 }`);
  });

  test('⚠⚠⚠ CharacterScreen no longer spends the BRAND GOLD on an empty state — FIXED', () => {
    /* ⚠⚠ THE RECORD DID NOT OUTLIVE THE DEFECT, WHICH IS EXACTLY WHAT IT
     * PROMISED. OTA-1760 logged this and wrote: "This test fails the day someone
     * fixes it, which is the point." OTA-1770 fixed it — the empty state is
     * ink-dim now — and this went red on that pass, on schedule.
     * ⚠ It is REAIMED rather than deleted. A defect that has been fixed once and
     * has no test is a defect that can come back silently; the assertion now
     * defends the fix, and the reasoning above stays so the next reader knows
     * why this colour is not a choice anyone should revisit casually.
     * Gold is reserved for a live obligation or a live process. An empty state
     * is the absence of both — the loudest colour in the game announcing that
     * there is nothing to do. */
    const src = read('app', 'screens', 'CharacterScreen.tsx');
    expect(src).toContain('placeholder: { color: T.inkDim');
    expect(src).not.toContain("placeholder: { color: '#c9a86a'");
  });
});

/* ═══ 2. ⚠⚠⚠ MOVED OUT — AND THAT MOVE IS THE RECORD ═════════════════════════
 * This block used to assert a "fix" to FirstTimeHint's tips link. OTA-1761
 * REVERTED that change: it was not a defect. The link's cover now lives in
 * __tests__/ota1761TheOneThatWasNotBroken.test.tsx, where it DEFENDS the
 * shipped values instead of changing them.
 *
 * ⚠ The block is not silently deleted, because the two halves of this pass had
 * very different fates and a suite that quietly dropped one would read as if it
 * had always been about VendorScreen alone. Section 1 above was a real defect
 * measured and fixed. Section 2 was a browser focus ring mistaken for a layout
 * bug, twice. Both are worth keeping visible. */

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1760-two-in-a-screenshot'");
  });
});

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
 *   2. THE LINK OFF-CENTRE ON ITS OWN LABEL — 0.0 left, 10.0 right.
 *      ⚠ And the FIRST fix for this was wrong — see the second describe block.
 *        Got it         box x284.2 w72.3 · text x303.2 w34.3 → 19.0 / 19.0  ✓
 *        Turn off tips  box x 54.5 w71.4 · text x 54.5 w61.4 →  0.0 / 10.0  ✗
 *      `paddingRight: 10` with no `paddingLeft`: every pixel of slack on one
 *      side, and no tap forgiveness at all to the LEFT of the label.
 *
 * ⚠⚠⚠ AND ONE THING IN THAT SCREENSHOT DOES NOT SHIP, WHICH IS WORTH SAYING
 * PLAINLY RATHER THAN QUIETLY FIXING. The gold rounded box drawn around "Turn
 * off tips" is the HEADLESS BROWSER'S FOCUS RING. On a device that control is
 * bare underlined text with no border at all. The asymmetry underneath it was
 * real and is fixed; the box was not ours and there was nothing to fix.
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

  test('⚠⚠⚠ CharacterScreen spends the BRAND GOLD on an empty state, and that is logged', () => {
    /* This test fails the day someone fixes it, which is the point: the record
     * must not outlive the defect. `check:gold` counts this declaration in its
     * interface total, so converting it is a real step down the ratchet. */
    expect(read('app', 'screens', 'CharacterScreen.tsx'))
      .toContain("placeholder: { color: '#c9a86a', textAlign: 'center', marginTop: 80 }");
  });
});

// ═══ 2. THE OFF-CENTRE TARGET ════════════════════════════════════════════════
describe('the tips link is centred on its own label', () => {
  test('⚠⚠⚠ the padding is symmetric, which it was not', () => {
    const r = rule(HINT, 'linkBtn');
    expect(r).toContain('paddingHorizontal: 10');
    expect(r).not.toMatch(/paddingRight: \d/);
    expect(r).not.toMatch(/paddingLeft: \d/);
  });

  test('⚠⚠⚠ and it is NOT pulled back out of the card — the first fix for this was wrong', () => {
    /* Owner, on the fix: *"now the turn off tips button is too close to the
     * outer edge."* It was. I had added `marginLeft: -10` to keep the LABEL
     * flush with the card's body text, which pulled the box into the padding:
     *     Got it         box right 356.5 · card inner right 374.5 → 18.0
     *     Turn off tips  box left   44.5 · card inner left   36.5 →  8.0
     * Symmetric on its own label and crowded against the card: two problems
     * traded, not one solved.
     * ⚠ The rule was already sitting in the same row. `Got it`'s BOX is on the
     * card's padding edge and its LABEL is inset by its own padding — it does
     * not align with the body text either, and it has never looked wrong. Boxes
     * align to the card; labels align to their boxes. No offset. */
    const r = rule(HINT, 'linkBtn');
    expect(r).not.toContain('marginLeft');
    expect(r).not.toContain('marginRight');
    const pad = Number(/paddingHorizontal: (\d+)/.exec(r)?.[1] ?? NaN);
    expect(Number.isFinite(pad)).toBe(true);
    expect(pad).toBeGreaterThan(0);
  });

  test('⚠⚠ both controls now sit the SAME distance from their side of the card', () => {
    /* Measured from the real bundle after the correction: the link's box left is
     * 18.0 from the card's inner edge and `Got it`'s box right is 18.0 from the
     * other, which is the card's own padding on both sides. That equality is the
     * claim; the card's padding is where it comes from. */
    expect(rule(HINT, 'card')).toContain('padding: 18');
    // and neither control cancels it with a margin of its own
    for (const n of ['linkBtn', 'btn']) expect(rule(HINT, n)).not.toContain('margin');
  });

  test('⚠ it now matches the three sibling controls that were already right', () => {
    // Same control, same words, three other places — all symmetric already.
    for (const c of ['CombatPrimerModal', 'WandererEncounterModal', 'DogOnboardingModal']) {
      const src = read('app', 'components', `${c}.tsx`);
      expect(src).toMatch(/turnOffBtn: \{[^}]*paddingHorizontal: \d+/);
      expect(src).toContain('Turn off tips');
    }
  });

  test('the primary button beside it was already symmetric and is untouched', () => {
    const r = rule(HINT, 'btn');
    expect(r).toContain('paddingHorizontal: 18');
    expect(r).toContain('paddingVertical: 8');
  });

  test('⚠ the link is still a quiet link, not promoted to a second button', () => {
    /* OTA-860 made this deliberately quiet — it reads as a toggle-off, not a
     * primary action. Fixing a tap target is not licence to restyle it, and the
     * owner's amendment is explicit: do not homogenize. */
    const r = rule(HINT, 'linkText');
    expect(r).toContain("textDecorationLine: 'underline'");
    expect(r).toContain("color: '#a2977b'");
    expect(rule(HINT, 'linkBtn')).not.toContain('borderWidth');
  });

  test('⚠⚠⚠ the gold box in the screenshot was the browser, and that is recorded', () => {
    /* Worth a test because the record is the only thing stopping a later reader
     * from "fixing" a border that does not exist. The control has no border in
     * the stylesheet; what was photographed was a focus ring. */
    expect(HINT).toContain('focus ring');
    const sheet = StyleSheet.create({ probe: { paddingHorizontal: 10, marginLeft: -10 } });
    expect(StyleSheet.flatten(sheet.probe).marginLeft).toBe(-10);
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1760-two-in-a-screenshot'");
  });
});

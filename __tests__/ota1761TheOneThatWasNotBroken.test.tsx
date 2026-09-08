/**
 * OTA-1761 — THE ONE THAT WAS NOT BROKEN.
 *
 * Owner, on the corrected screenshot: *"those 2 images have the misalignment
 * again, the one before it was fine."* It was. This pass REVERTS OTA-1760's
 * change to the tips link and leaves the file exactly as it shipped.
 *
 * ⚠⚠⚠ THE MISTAKE IS THE POINT, SO IT IS WRITTEN DOWN RATHER THAN QUIETLY UNDONE.
 * OTA-1760 measured the link's label sitting at the left edge of its own padding
 * box and called it an off-centre tap target:
 *     Got it         box x284.2 w72.3 · text x303.2 w34.3 → 19.0 / 19.0
 *     Turn off tips  box x 54.5 w71.4 · text x 54.5 w61.4 →  0.0 / 10.0
 * Both halves of that reading were wrong.
 *   1. The box in the screenshot was the HEADLESS BROWSER'S FOCUS RING. On a
 *      device the control has no border, so nothing was visibly off-centre.
 *      ⚠ OTA-1760'S OWN COMMIT MESSAGE SAYS THE RING IS AN ARTIFACT AND THEN
 *      ACTS ON IT. Naming an artifact is not the same as not being fooled by it.
 *   2. The tap target was never asymmetric. `hitSlop={8}` on that
 *      TouchableOpacity already extends the touchable area 8pt on ALL FOUR
 *      sides. The claim "no tap forgiveness at all to the left of the label"
 *      was made without reading the JSX it was about — the line was four lines
 *      from the style being changed.
 *
 * ⚠⚠ AND THE SHIPPED VALUES WERE RIGHT ON BOTH THINGS A PLAYER CAN SEE:
 *      label x 54.5 — flush with the card's body text above it
 *      box   x 54.5 — 18.0 from the card's inner edge, matching `Got it`
 * There is no third value that satisfies both. `marginLeft: -10` kept the label
 * and pulled the box to 8.0 from the card edge; deleting the offset fixed the
 * box and indented the label 10pt. Two attempts, each breaking the half the
 * other preserved, to fix something that was not broken.
 *
 * ⚠ WHAT SURVIVES FROM OTA-1760: the VendorScreen half. That was a real defect
 * (a zero gap letting a border cut a sentence) and it is untouched by this pass.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const HINT = read('app', 'components', 'FirstTimeHint.tsx');
const VENDOR = read('app', 'screens', 'VendorScreen.tsx');

/** Pull one StyleSheet entry's body out of a source file. */
const rule = (src: string, name: string): string => {
  const i = src.indexOf(`\n  ${name}: {`);
  if (i < 0) return '';
  return src.slice(i, src.indexOf('\n  },', i));
};

// ═══ 2. ⚠⚠⚠ THE ONE THAT WAS NEVER BROKEN ═══════════════════════════════════
/* OTA-1761 REPLACED THIS WHOLE BLOCK. It used to assert a "fix" to the tips
 * link. There was no defect. The tests below now defend the SHIPPED values
 * against being changed again, which is the opposite of what they did. */
describe('the tips link is left exactly as it shipped', () => {
  test('⚠⚠⚠ the shipped padding is restored, byte for byte', () => {
    const r = rule(HINT, 'linkBtn');
    expect(r).toContain('paddingVertical: 8');
    expect(r).toContain('paddingRight: 10');
    expect(r).not.toContain('paddingHorizontal');
    expect(r).not.toContain('margin');
  });

  test('⚠⚠⚠ the tap target was NEVER asymmetric — hitSlop is why', () => {
    /* This is the fact that made OTA-1760's whole justification wrong, and it
     * was sitting in the JSX the claim was about. `hitSlop={8}` extends the
     * touchable area 8pt on ALL FOUR sides. "No tap forgiveness at all to the
     * left of the label" was asserted without reading this line. */
    expect(HINT).toMatch(/hitSlop=\{8\}/);
    const btn = HINT.slice(HINT.indexOf('one-tap escape hatch'), HINT.indexOf('Turn off tips'));
    expect(btn).toContain('styles.linkBtn');
    expect(btn).toContain('hitSlop={8}');   // ⚠ on the SAME control
  });

  test('⚠⚠ and the shipped geometry was already right on both visible counts', () => {
    /* Measured from the real bundle, original build:
     *   label x 54.5 — FLUSH with the card's body text above it
     *   box   x 54.5 — 18.0 from the card's inner edge, matching `Got it`'s
     *                  18.0 on the other side
     * Both come from `paddingLeft` being absent and the card's padding being
     * 18. Either change breaks one of them: `marginLeft: -10` kept the label
     * and pulled the box to 8.0; deleting the offset fixed the box and indented
     * the label 10pt. There is no third value that satisfies both. */
    expect(rule(HINT, 'card')).toContain('padding: 18');
    expect(rule(HINT, 'linkBtn')).not.toContain('paddingLeft');
  });

  test('the primary button beside it was always symmetric and was never touched', () => {
    const r = rule(HINT, 'btn');
    expect(r).toContain('paddingHorizontal: 18');
    expect(r).toContain('paddingVertical: 8');
  });

  test('⚠ it is still a quiet link, not promoted to a second button', () => {
    const r = rule(HINT, 'linkText');
    expect(r).toContain("textDecorationLine: 'underline'");
    expect(r).toContain("color: '#a2977b'");
    expect(rule(HINT, 'linkBtn')).not.toContain('borderWidth');
  });

  test('⚠⚠⚠ the reason NOT to touch it is in the file, where the next reader will be', () => {
    /* A revert with no record invites the same "fix" again — the focus ring is
     * still there in every harness shot, and it still looks off-centre. */
    expect(HINT).toContain('DO NOT');
    expect(HINT).toMatch(/focus ring/i);
    expect(HINT).toContain('hitSlop');
  });
});

describe("OTA-1760's real fix is untouched by this revert", () => {
  test('⚠ the Vendor placeholder gap and button width stay fixed', () => {
    // That one was a genuine defect — a border cutting a sentence — and it is
    // not collateral in a revert of an unrelated change in another file.
    expect(VENDOR).toMatch(/placeholder: \{[^}]*marginBottom: \d+/);
    expect(VENDOR).toContain("placeholderBtn: { alignSelf: 'center' }");
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1761-not-broken'");
  });
});

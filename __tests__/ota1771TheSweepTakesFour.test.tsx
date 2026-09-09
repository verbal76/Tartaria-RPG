/**
 * OTA-1771 — THE MODAL SWEEP, BATCH 1. The rollout's step 3.
 *
 * OTA-1765 extracted the shell and left a CENSUS rather than a memory: eight
 * files still declared their own scrim beside a Family-A card. Two of those are
 * "moment" modals held under HOLD 3, so six were measurable. Measured:
 *
 *   ApproachModal     scrim standard · card 380 · NO vertical scroll   HELD
 *   ClimbModal        scrim standard · card 380 · scroll maxHeight 280 adopts
 *   CraftRefusalModal scrim standard · card 400 · scroll, computed cap  adopts
 *   KeyboardSafeCard  scrim 0.78 + paddingHorizontal 16 · measured height NOT A COPY
 *   SearchModal       scrim standard · card 380 · scroll maxHeight 280 adopts
 *   TorchProbeModal   scrim standard · card 380 · scroll maxHeight 280 adopts
 *
 * ⚠⚠ THE ADOPTION IS NOT FREE, AND THE PRICE IS ONE LINE EACH. The kit's card
 * carries `maxHeight: '85%'` (OTA-1614) so the scrim — and with it the
 * tap-outside escape — always stays reachable. RN views do not shrink by
 * default, so a card that stops growing while its list holds its 280 pushes the
 * button row out of the bottom instead. `HookContinueModal` hit exactly this on
 * its own adoption. Every adopter's scrolling middle gains `flexShrink`.
 *
 * ⚠⚠⚠ AND THE FIFTH FAMILY-A DIALOG IS HELD RATHER THAN FORCED. `ApproachModal`
 * has NO vertical scroll: its two chip strips scroll horizontally, so shrinking
 * them clips chips rather than shortening the card. There is nothing to yield
 * under the ceiling, and the first thing off the bottom is CANCEL / APPROACH.
 * Giving it a scrolling middle would fix that AND change what the player sees,
 * which is a layout decision, not a material extraction. HOLD 4; pixels
 * untouched.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { tModalCard, tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const cmp = (n: string) => read('app', 'components', `${n}.tsx`);

/** The four that adopted, with the width each one shipped and keeps. */
const ADOPTERS: ReadonlyArray<readonly [string, number]> = [
  ['ClimbModal', 380],
  ['TorchProbeModal', 380],
  ['SearchModal', 380],
  ['CraftRefusalModal', 400],
];

/* ⚠ GRADE THE CODE, NOT THE PROSE — TWELFTH time in this rollout. This file's
 * header quotes `maxHeight: '85%'` and every hex and number it asserts is gone. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// ═══ 1. THE ADOPTION ═════════════════════════════════════════════════════════
describe('four dialogs stopped hand-copying the shell', () => {
  test('⚠⚠ each one reaches the kit for BOTH pieces, and declared neither locally', () => {
    for (const [n] of ADOPTERS) {
      const code = codeOf(cmp(n));
      expect([n, code.includes('style={kit.modalScrim}')]).toEqual([n, true]);
      expect([n, code.includes('style={CARD}')]).toEqual([n, true]);
      // the orphans are DELETED, not shadowed by a live duplicate
      expect([n, /\n {2}scrim: \{/.test(code)]).toEqual([n, false]);
      expect([n, /\n {2}card: \{/.test(code)]).toEqual([n, false]);
    }
  });

  test('⚠⚠⚠ every shipped width is PRESERVED — including the one that is not 380', () => {
    /* This is the claim that makes `tModalCard` a parameter rather than a variant
     * set. `CraftRefusalModal` ships at 400 and keeps 400; had the sweep quietly
     * normalised it, the extraction would have been a restyle. */
    for (const [n, w] of ADOPTERS) {
      expect([n, codeOf(cmp(n)).includes(`tModalCard(${w})`)]).toEqual([n, true]);
    }
  });

  test('⚠ the card the kit hands back is the card those files declared', () => {
    /* Exercised rather than read. Three of the four asked for 380 and one for
     * 400; the rest of the material has to be identical or "same pixel, better
     * address" is just a slogan. */
    const { StyleSheet } = require('react-native');
    const at380 = StyleSheet.flatten(tModalCard(380)) as Record<string, unknown>;
    const at400 = StyleSheet.flatten(tModalCard(400)) as Record<string, unknown>;
    expect(at380.maxWidth).toBe(380);
    expect(at400.maxWidth).toBe(400);
    for (const [k, v] of Object.entries(at380)) {
      if (k === 'maxWidth') continue;
      expect([k, at400[k]]).toEqual([k, v]);
    }
    expect(at380.width).toBe('100%');
    expect(at380.borderWidth).toBe(1);
    expect(at380.borderRadius).toBe(4);
    expect(at380.padding).toBe(14);
    expect(at380.backgroundColor).toBe('#13110f');
  });

  test('⚠ and the scrim is the one object, not four copies of its values', () => {
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(kit.modalScrim)).toEqual({
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    });
  });
});

// ═══ 2. THE ONE LINE THAT MAKES THE CEILING SAFE ═════════════════════════════
describe('⚠⚠⚠ every adopter\'s scrolling middle can give way', () => {
  test('the kit\'s card really does cap its height — that is what needs absorbing', () => {
    const { StyleSheet } = require('react-native');
    expect((StyleSheet.flatten(tModalCard(380)) as Record<string, unknown>).maxHeight)
      .toBe('85%');
  });

  test('⚠⚠ each adopter has a shrinking scroll, asserted as the PROPERTY not the number', () => {
    /* ⚠ PIN THE CLAIM, NEVER THE MECHANISM — this rollout's most expensive rule,
     * and it has been broken six times. The claim is "the middle yields", not
     * "the middle is 280 tall". A later pass that changes a cap or renames the
     * style key must not turn this red; a later pass that DELETES the flexShrink
     * must. So: find the file's bounded scroll style, whatever it is called, and
     * require that it shrinks. */
    for (const [n] of ADOPTERS) {
      const code = codeOf(cmp(n));
      /* ⚠ Read the key off the JSX rather than off the stylesheet. SearchModal's
       * `chipFullText` also carries a `flexShrink` — for text ellipsis, nothing
       * to do with this — so scanning the stylesheet for the property finds
       * styles that are not the middle. The claim is about the ScrollView the
       * card actually renders, so start from the ScrollView. */
      const keys = [...code.matchAll(/<ScrollView[\s\S]{0,200}?style=\{\[?\s*styles\.(\w+)/g)]
        .map((m) => m[1]!);
      expect([n, keys.length]).toEqual([n, 1]);
      const decl = new RegExp(`\\n {2}${keys[0]}: \\{([^}]*)\\}`).exec(code)?.[1] ?? '';
      expect([n, /flexShrink: 1/.test(decl)]).toEqual([n, true]);
      expect([n, /flexGrow: 0/.test(decl)]).toEqual([n, true]);
    }
  });

  test('⚠ the lesson is credited where the next reader will look for it', () => {
    /* `HookContinueModal` paid for this once already. A rule that lives only in
     * one commit message gets re-learned; a rule in the kit next to the property
     * that causes it does not. */
    const KIT = read('app', 'ui', 'tartariaKit.tsx');
    expect(KIT).toContain('flexShrink');
    expect(KIT).toContain('HookContinueModal');
  });
});

// ═══ 3. THE HOLD ═════════════════════════════════════════════════════════════
describe('⚠⚠⚠ ApproachModal is HELD, and holding is not the same as skipping', () => {
  test('its shipped pixels are UNCHANGED — the card and the scrim are still its own', () => {
    /* The owner's standing rule for a held item: preserve current shipped
     * behaviour, do not guess. So this asserts the file still draws exactly what
     * it drew, which is the opposite of the assertion every adopter gets. */
    const code = codeOf(cmp('ApproachModal'));
    expect(code).toContain("scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)'");
    expect(code).toContain("card: { width: '100%', maxWidth: 380");
    expect(code).not.toContain('tModalCard');
    expect(code).not.toContain('kit.modalScrim');
  });

  test('⚠⚠ the REASON it is held is a structural fact about the file, not a preference', () => {
    /* The whole hold rests on one measurable claim: this card has no vertical
     * ScrollView to absorb an 85% ceiling. If someone later adds one, this test
     * goes red and the hold should be revisited — which is the correct failure. */
    const code = codeOf(cmp('ApproachModal'));
    const scrolls = [...code.matchAll(/<ScrollView\b[\s\S]*?>/g)];
    expect(scrolls.length).toBeGreaterThan(0);
    for (const s of scrolls) expect(s[0]).toContain('horizontal');
    expect(code).not.toMatch(/maxHeight/);
  });

  test('⚠ and the hold is WRITTEN DOWN in the file, or the next reader re-decides it', () => {
    /* ⚠ Matched on fragments that cannot wrap — OTA-1769 learned that asserting a
     * whole phrase grades the formatter's line breaks. */
    const src = cmp('ApproachModal');
    expect(src).toContain('HELD OUT OF THE MODAL SWEEP');
    expect(src).toContain('HOLD 4');
    expect(src).toContain('HORIZONTALLY');
  });
});

// ═══ 4. THE SECOND SHELL, WHICH IS NOT A COPY OF THE FIRST ═══════════════════
describe('⚠⚠ KeyboardSafeCard stays out, and it is a genuine second shell', () => {
  test('its scrim and its card differ from Family A in ways that are the point', () => {
    /* It matches OTA-1765's predicate — own scrim, `#13110f`, brand-gold rim — so
     * a sweep run by pattern-match would have swallowed it. Measured, it is a
     * different construction on both halves:
     *   the SCRIM is darker (0.78 against Family A's 0.70) and pads only
     *     horizontally, where Family A pads 20 on all four sides;
     *   the CARD's height ceiling is a MEASURED keyboard edge, not 85% of a
     *     screen that does not know the keyboard exists (OTA-1718's whole
     *     point), and its width is a per-call-site PROP rather than one of the
     *     four fixed numbers `tModalCard` was built for.
     * ⚠ The first draft of this test claimed the card had "no width cap" — it
     * has one, defaulted to 420 and passed in. Wrong reason, right conclusion,
     * which is the more dangerous kind of wrong. */
    const code = codeOf(cmp('KeyboardSafeCard'));
    expect(code).toContain("backgroundColor: 'rgba(0,0,0,0.78)'");
    expect(code).toContain('paddingHorizontal: 16');
    // the width is a prop with a default, never a literal inside the card style
    expect(code).toContain('maxWidth = 420');
    expect(code).not.toMatch(/\n {4}maxWidth:/);
    // the height ceiling is measured, not a percentage
    expect(code).toContain('cardMaxHeight(vp)');
    expect(code).not.toContain("maxHeight: '85%'");
    // ⚠ and it already ships the shrinking middle, which is where the rule came from
    expect(code).toContain('flexShrink: 1');
  });

  test('⚠ it did NOT adopt, and that is a decision rather than an omission', () => {
    const code = codeOf(cmp('KeyboardSafeCard'));
    expect(code).not.toContain('tModalCard');
    expect(code).not.toContain('kit.modalScrim');
  });
});

// ═══ 5. THE CENSUS MOVED BECAUSE THE CODE DID ════════════════════════════════
describe('the census is the ledger, and it fell by four', () => {
  test('⚠⚠ OTA-1765\'s own predicate now names four files, and names WHY each', () => {
    /* Re-run here rather than trusted: the census lives in ota1765's suite, and a
     * sweep that edited the expected list without moving the code would pass
     * there and fail here. */
    const census = read('__tests__', 'ota1765TheShellElevenCopied.test.tsx');
    for (const [n] of ADOPTERS) {
      expect([n, census.includes(`'${n}.tsx',`)]).toEqual([n, false]);
    }
    /* ⚠ OTA-1774 took two more off this list, so what THIS suite can honestly
     * assert is that ITS OWN four adopters left — not a fixed remainder. Pinning
     * the remainder would make a later correct adoption fail an earlier pass's
     * test, which is this rollout's most-repeated mistake. The two that remain
     * for a stated reason are pinned in ota1774's suite, where they belong. */
    for (const n of ['ApproachModal', 'KeyboardSafeCard']) {
      expect([n, census.includes(`'${n}.tsx',`)]).toEqual([n, true]);
    }
  });

  test('⚠⚠ the gold ratchet fell, and its ledger says which four rims moved', () => {
    const gate = read('scripts', 'check-gold.mjs');
    const baseline = Number(/const BASELINE = (\d+);/.exec(gate)?.[1]);
    expect(Number.isFinite(baseline)).toBe(true);
    // ⚠ a CEILING, not 327 — a ratchet only moves down, and pinning today's
    // number turns the next correct removal into a red test.
    expect(baseline).toBeLessThanOrEqual(327);
    expect(gate).toContain('OTA-1771');
  });
});

// ═══ 6. THE STRIPPER STILL WORKS ═════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments are stripped, or the "declared neither locally" claims are vacuous', () => {
    const src = cmp('ApproachModal');
    expect(codeOf(src).length).toBeLessThan(src.length * 0.75);
    expect(codeOf('/* maxWidth: 380 */ const a = 1;')).not.toContain('380');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1771-the-sweep-takes-four'");
  });
});

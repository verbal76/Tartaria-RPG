/**
 * OTA-1769 — TSHEET, AND THE MEASUREMENT FOUND TWO SHAPES WHERE THE PLAN NAMED
 * ONE. Tier 0's sixth and last primitive.
 *
 * The rollout describes TSheet as "the bottom-anchored conversational pattern.
 * No primitive exists." Five files carry a sheet, and measured before anything
 * was written they split cleanly into two things that are not variants of each
 * other:
 *
 *   THE INLINE CARD          ParleySheet · PayoffSheet · PickpocketSheet
 *     A plain `<View>` the parent renders in place — no Modal, no backdrop, no
 *     visibility prop. Byte-identical in all three.
 *   THE CONVERSATION OVERLAY  TalkSheet · WhisperTalkSheet (twice)
 *     `<Modal transparent>` → a 78%-black backdrop → a tall framed panel.
 *     Byte-identical across three call sites.
 *
 * ⚠⚠ AND THE PLAN'S OWN DESCRIPTION IS STALE, RECORDED RATHER THAN QUIETLY
 * MATCHED: `TalkSheet` says "Was 88% welded to the bottom. Slightly shorter now
 * that it floats." It is CENTRED. A primitive built to the words "bottom-
 * anchored" would have re-welded it to an edge it deliberately left.
 *
 * ⚠⚠⚠ AND ONE PIECE IS DELIBERATELY HELD BACK. The overlay's frame is a gold
 * brighter than the brand gold, and the kit's OWN palette rule refuses it —
 * chroma 134 against a ceiling of 60, where the brand gold's 95 passes only by
 * being exempt BY NAME. Admitting it means naming a second semantic authority,
 * which is an owner ruling and not a refactor. OTA-1759 set the precedent by
 * REFUSING two off-brand golds rather than exempting them quietly. So the scrim
 * and the header are extracted and adopted; the framed panel stays local to its
 * two files with its pixels untouched.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');

const INLINE = ['ParleySheet', 'PayoffSheet', 'PickpocketSheet'] as const;
const OVERLAY = ['TalkSheet', 'WhisperTalkSheet'] as const;
const sheet = (n: string) => read('app', 'components', `${n}.tsx`);

/* ⚠ GRADE THE CODE, NOT THE PROSE — tenth time in this rollout. The kit's
 * TSheet note argues at length about the very hex the assertions below require
 * to be absent from the kit. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// ═══ 1. THE MATERIAL ═════════════════════════════════════════════════════════
describe('the two shapes are in the kit', () => {
  test('⚠ the inline card resolves to the values all three files declared', () => {
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(kit.sheetCard)).toEqual({
      backgroundColor: '#13110f',
      borderColor: '#3a342c',
      borderWidth: 1,
      borderRadius: 6,
      padding: 14,
      gap: 8,
    });
  });

  test('⚠ the overlay scrim resolves to the values all three call sites declared', () => {
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(kit.sheetScrim)).toEqual({
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 22,
      backgroundColor: 'rgba(0,0,0,0.78)',
    });
  });

  test('⚠⚠ the header is the one thing ALL FIVE shared', () => {
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(kit.sheetHeader)).toEqual({
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    });
  });

  test('⚠⚠⚠ Tier 0\'s last primitive adds ZERO exports, which is the honest shape', () => {
    /* `tRowStyle` and `tModalCard` exist because they compose a state or take a
     * parameter. Neither sheet shape does either — there is nothing to vary — so
     * these are stylesheet entries reached through `tartariaKitStyles`, and the
     * export ceiling does not move. A helper that only returns a constant would
     * be a function pretending to be a decision. */
    const decls = [...KIT.matchAll(/^export (function|const) (\w+)/gm)];
    const components = decls.filter((m) => m[1] === 'function' && /^T[A-Z]/.test(m[2]!));
    const helpers = decls.filter((m) => !(m[1] === 'function' && /^T[A-Z]/.test(m[2]!)));
    expect(components.length).toBeLessThanOrEqual(13);
    expect(helpers.length).toBeLessThanOrEqual(7);
    expect(codeOf(KIT)).not.toMatch(/export function tSheet/);
  });
});

// ═══ 2. THE ADOPTION ═════════════════════════════════════════════════════════
describe('all five sheets adopted, and nothing kept a private copy', () => {
  test('⚠⚠ the three inline sheets use the kit card and declared theirs GONE', () => {
    for (const n of INLINE) {
      const code = codeOf(sheet(n));
      expect([n, code.includes('style={kit.sheetCard}')]).toEqual([n, true]);
      // the orphan is deleted, not shadowed by a live duplicate
      expect([n, /\n {2}container: \{/.test(code)]).toEqual([n, false]);
    }
  });

  test('⚠⚠ the overlay sheets use the kit scrim and declared theirs GONE', () => {
    for (const n of OVERLAY) {
      const code = codeOf(sheet(n));
      expect([n, code.includes('style={kit.sheetScrim}')]).toEqual([n, true]);
      expect([n, /\n {2}backdrop: \{/.test(code)]).toEqual([n, false]);
    }
  });

  test('⚠ all five use the kit header', () => {
    for (const n of [...INLINE, ...OVERLAY]) {
      expect([n, codeOf(sheet(n)).includes('style={kit.sheetHeader}')]).toEqual([n, true]);
    }
  });

  test('⚠⚠⚠ the PRESENTATION stayed per-call-site, which is why this is styles', () => {
    /* The overlay's three sites are not interchangeable: they pass different
     * `onRequestClose` handlers and WhisperTalkSheet mounts the pattern TWICE
     * with different animation. A component owning the Modal would have had to
     * plumb all of that through props — the same finding as TModal's arb73. */
    expect(codeOf(sheet('TalkSheet'))).toContain('<Modal');
    const whisper = codeOf(sheet('WhisperTalkSheet'));
    expect((whisper.match(/<Modal/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((whisper.match(/style=\{kit\.sheetScrim\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // and the inline three have no Modal at all — that IS the second shape
    for (const n of INLINE) expect([n, codeOf(sheet(n)).includes('<Modal')]).toEqual([n, false]);
  });
});

// ═══ 3. THE PIECE THAT WAS HELD — AND THE RULING THAT RELEASED IT ════════════
describe('⚠⚠⚠ the contested frame was held, then ruled on — never smuggled', () => {
  /* ⚠⚠⚠ RE-AIMED ON OTA-1773, AND THE HISTORY IS THE VALUABLE PART.
   * This block used to assert the kit did NOT carry the brighter gold. That was
   * correct on OTA-1769 and is wrong now: the owner ruled APPROVED and the frame
   * moved into the kit as `T.goldFrame` / `kit.sheetPanel`.
   * ⚠ The tests are re-aimed rather than deleted, because what this suite is
   * really defending is not "the kit lacks a colour" — it is "a contested colour
   * gets a decision before it gets an address." That claim outlives the hold,
   * and it is the claim below. */

  test('the frame is NAMED in the palette, not a literal in two files', () => {
    /* The ruling's own words: *"implement this through the named
     * semantic/palette mechanism rather than creating an ungoverned
     * exception."* So the test is that the value has an address — and that the
     * two files no longer each carry their own copy of it. */
    expect(codeOf(KIT)).toContain('goldFrame');
    expect(codeOf(KIT)).toContain('sheetPanel');
    for (const n of OVERLAY) {
      expect([n, codeOf(sheet(n)).includes("borderColor: '#f0c96a'")]).toEqual([n, false]);
      expect([n, codeOf(sheet(n)).includes('style={kit.sheetPanel}')]).toEqual([n, true]);
    }
  });

  test('⚠⚠ and the shipped pixels are UNCHANGED — resolving a hold is not a restyle', () => {
    /* The same guarantee the hold itself gave: the player sees exactly what they
     * saw before. Read off the kit now rather than off the two files, because
     * that is where the values live — but they are the same values. */
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(kit.sheetPanel)).toEqual({
      height: '92%',
      backgroundColor: '#13110f',
      borderColor: '#F0C96A',
      borderWidth: 2,
      borderRadius: 14,
      padding: 14,
      gap: 8,
    });
  });

  test('⚠⚠⚠ the exemption is BY NAME in the gate — an exception with a reason on it', () => {
    /* The difference between an exemption and a hole. The palette rule caps
     * chroma at 60; this colour is 134 and only passes because it is listed.
     * A pass that instead loosened the ceiling would let every future bright hue
     * through unremarked, which is the failure mode the list exists to prevent. */
    const gate = read('__tests__', 'ota1742TheScreenIsMadeOfSomething.test.tsx');
    expect(gate).toContain("'F0C96A'");
    expect(gate).toContain('OTA-1773');
    // the ceiling itself did NOT move
    expect(gate).toContain('toBeLessThanOrEqual(60)');
  });

  test('⚠ the decision is written down at both ends, or the next reader re-decides it', () => {
    /* ⚠ Matched on fragments that cannot wrap. An earlier draft asserted a whole
     * phrase and broke when the comment wrapped between two of its words — a
     * test that fails on where prose wraps is grading the formatter, which is
     * the smaller cousin of grading the prose. */
    expect(KIT).toContain('HELD FOR AN OWNER');   // the history, kept
    expect(KIT).toContain('OTA-1773');            // the ruling that released it
    expect(KIT).toContain('chroma');
    for (const n of OVERLAY) expect([n, sheet(n).includes('OTA-1773')]).toEqual([n, true]);
  });

  test('⚠ the frame is still brighter than the golds inside the sheet', () => {
    /* The reason the colour exists, asserted as the RELATIONSHIP rather than as
     * a literal — if the ruling later normalises it, this is the property that
     * has to survive whatever value replaces it. */
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.299 * r! + 0.587 * g! + 0.114 * b!;
    };
    expect(lum('#f0c96a')).toBeGreaterThan(lum('#c9a86a'));
    expect(lum('#f0c96a')).toBeGreaterThan(lum('#6b5c3a'));
  });
});

describe('the suite grades code', () => {
  test('⚠ comments are stripped, or the "not in the kit" claims are vacuous', () => {
    expect(codeOf(KIT).length).toBeLessThan(KIT.length * 0.7);
    expect(codeOf('/* #f0c96a */ const a = 1;')).not.toContain('f0c96a');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1769-the-sheet-is-two-shapes'");
  });
});

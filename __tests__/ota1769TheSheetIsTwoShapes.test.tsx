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

// ═══ 3. THE HELD PIECE ═══════════════════════════════════════════════════════
describe('⚠⚠⚠ the contested frame is HELD, not smuggled and not deleted', () => {
  test('the kit does NOT carry the brighter gold', () => {
    /* The kit's own palette rule caps chroma at 60 with the brand gold exempt by
     * name. This colour is 134. Admitting it is a ruling about semantic
     * authorities; OTA-1759 refused two off-brand golds in exactly this spot. */
    expect(codeOf(KIT)).not.toContain('#f0c96a');
    expect(codeOf(KIT)).not.toContain('sheetPanel');
  });

  test('⚠⚠ and the shipped pixels are UNCHANGED — a hold is not a rollback', () => {
    /* The whole point of holding rather than guessing: the player sees exactly
     * what they saw before, in both files, until the owner rules. */
    for (const n of OVERLAY) {
      const code = codeOf(sheet(n));
      expect([n, code.includes("borderColor: '#f0c96a'")]).toEqual([n, true]);
      expect([n, code.includes('borderWidth: 2')]).toEqual([n, true]);
      expect([n, code.includes("height: '92%'")]).toEqual([n, true]);
      expect([n, code.includes('borderRadius: 14')]).toEqual([n, true]);
      expect([n, code.includes('style={styles.sheet}')]).toEqual([n, true]);
    }
  });

  test('⚠ the hold is WRITTEN DOWN at both ends, or the next reader re-decides it', () => {
    /* ⚠ Matched on a fragment that cannot wrap. The first draft asserted
     * "HELD FOR AN OWNER RULING" and the comment breaks the line between OWNER
     * and RULING — a test that fails on where the prose wraps is grading the
     * formatter, which is a smaller cousin of grading the prose. */
    expect(KIT).toContain('HELD FOR AN OWNER');
    expect(KIT).toContain('chroma');
    for (const n of OVERLAY) expect([n, sheet(n).includes('PENDING AN OWNER RULING')]).toEqual([n, true]);
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

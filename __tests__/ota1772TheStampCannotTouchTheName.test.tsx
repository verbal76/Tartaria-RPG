/**
 * OTA-1772 — THE STAMP CANNOT TOUCH THE NAME.
 *
 * Reported off the device, verbatim: `MISSConspiracy Archit…`. The outcome
 * stamp welded to a truncated enemy name, no space between them.
 *
 * ⚠⚠⚠ THE DEFECT WAS STRUCTURAL, AND THE ELLIPSIS IS THE PROOF. The result
 * column was pushed to the far end by `marginLeft: 'auto'` and NOTHING ELSE
 * separated it from the name column. An `auto` margin is *whatever space is left
 * over*, so it is zero exactly when the row is full — which is exactly when a
 * long name gets truncated. A short name never collides; a long one always does.
 * That is why the fix is a layout minimum and not a space in a string: the
 * string is fine, the gutter was conditional.
 *
 * ⚠⚠ AND IT HAD TO SURVIVE `row-reverse`, WHICH IS WHAT THE REPORT ACTUALLY
 * SHOWS. Incoming swings lay out right-to-left, which is why MISS appears to the
 * LEFT of the enemy's name in the report rather than after it. A one-sided
 * `marginRight` would have fixed the outgoing row and left the reported one
 * untouched. `who` sits between the spine and the result in BOTH directions, so
 * a direction-agnostic `columnGap` on the row covers both with one number.
 *
 * ⚠ AND THE SUB-ROW HAD THE SAME DEFECT, found by reading rather than by waiting
 * for it: a long weapon name would weld itself to the HP readout on identical
 * terms. Fixed in the same pass.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { outcomeLabel } from '../app/engine/combatEvent';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const STRIP = read('app', 'components', 'CombatStrip.tsx');

/* ⚠ GRADE THE CODE, NOT THE PROSE — thirteenth time in this rollout. The file's
 * new comment block spells out `MISSConspiracy` and quotes the very properties
 * these tests require to be absent. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const CODE = codeOf(STRIP);

/** Pull one StyleSheet entry's body out of the code (comments already gone).
 *
 * ⚠ `[^}]*` rather than a lazy `[\s\S]*?` up to the next `\n  },`. The first
 * draft used the latter and it SWALLOWED FIVE FOLLOWING STYLES on any one-line
 * entry: `spineIn` is a single line, so the scan ran past it to the next
 * multi-line style's closing brace and dragged `result`'s `marginLeft: 'auto'`
 * in with it — a test that failed on a property belonging to a different style.
 * No entry in this file nests a brace, so stopping at the first `}` is both
 * correct and unambiguous. */
const styleBody = (key: string): string =>
  new RegExp(`\\n {2}${key}: \\{([^}]*)\\}`).exec(CODE)?.[1] ?? '';

// ═══ 1. THE GUTTER EXISTS, AND IT IS NOT CONDITIONAL ═════════════════════════
describe('⚠⚠⚠ the two columns cannot touch, however long the name is', () => {
  test('the row declares a real column gap', () => {
    /* ⚠ PIN THE CLAIM, NEVER THE MECHANISM — this rollout's most expensive rule.
     * The claim is "there is an unconditional minimum between the columns", not
     * "the number is 7". A later pass that widens it must not turn this red; a
     * later pass that DELETES it must. So: a positive gap, whatever its size. */
    const gap = /columnGap: (\d+)/.exec(styleBody('row'))?.[1];
    expect(gap).toBeDefined();
    expect(Number(gap)).toBeGreaterThan(0);
  });

  test('⚠⚠ the auto margin is NOT the separation any more — it is only the push', () => {
    /* The `auto` margin stays: it is what puts the result at the far end. What
     * changed is that it is no longer the ONLY thing between the columns. This
     * test exists so nobody "simplifies" by deleting the gap and leaving the
     * auto margin, which is precisely the shipped defect. */
    expect(styleBody('result')).toContain("marginLeft: 'auto'");
    expect(/columnGap/.test(styleBody('row'))).toBe(true);
  });

  test('⚠⚠⚠ the spine no longer carries the gap privately, or the row would double it', () => {
    /* The row's gap applies between EVERY pair, so the spine's own 7px margins
     * had to come off or spine→who would have become 14 while who→result became
     * 7 — a fix that moves a pixel it was not asked to move. */
    expect(styleBody('spine')).not.toContain('marginRight');
    expect(styleBody('spineIn')).not.toContain('marginLeft');
    expect(styleBody('spineIn')).not.toContain('marginRight');
  });

  test('⚠⚠ spine→who is UNCHANGED at the value it always shipped', () => {
    /* The one number this pass is allowed to preserve exactly, because it is the
     * one that was already right. It moved from the spine's margin to the row's
     * gap; if the gap is not 7 then this refactor silently restyled the row. */
    expect(styleBody('row')).toContain('columnGap: 7');
  });
});

// ═══ 2. WHICH SIDE GIVES WAY ═════════════════════════════════════════════════
describe('⚠⚠ the name yields and the stamp does not', () => {
  test('the name column shrinks and can ellipsise', () => {
    /* `minWidth: 0` is the half people forget: without it a flex child will not
     * shrink below its content and the ellipsis never appears. */
    const who = styleBody('who');
    expect(who).toContain('flexShrink: 1');
    expect(who).toContain('minWidth: 0');
  });

  test('⚠ the result column is pinned against shrinking, said out loud', () => {
    /* RN already defaults views to `flexShrink: 0`, so this is documentation
     * rather than behaviour — and it is worth the line, because the instinct on
     * a crowded row is to let both sides give, and half a stamp is worse than an
     * ellipsised name. */
    expect(styleBody('result')).toContain('flexShrink: 0');
  });

  test('⚠ both name Texts still cap at one line — the row must not grow', () => {
    /* The whole density argument (VIS-2) is that an ordinary exchange is a fixed
     * height. A wrapping name would fix the collision by breaking the thing the
     * component exists for. */
    expect(CODE).toContain('<Text style={styles.actor} numberOfLines={1}>');
    expect(CODE).toContain('<Text style={styles.target} numberOfLines={1}>');
  });
});

// ═══ 3. THE FIX IS NOT IN THE STRING ═════════════════════════════════════════
describe('⚠⚠⚠ nothing was padded with literal whitespace', () => {
  test('every outcome label is still a bare word', () => {
    /* The owner named this explicitly: *"Do NOT solve this with literal
     * whitespace inserted into the string."* Exercised against the authority, so
     * a later "quick fix" in `outcomeLabel` fails here rather than shipping. */
    const labels = ['crit', 'hit', 'miss', 'fumble', 'dodged', 'evaded', 'slipped'] as const;
    for (const o of labels) {
      const l = outcomeLabel(o);
      expect([o, l]).toEqual([o, l.trim()]);
      expect([o, /\s/.test(l)]).toEqual([o, false]);
      expect([o, l.length > 0]).toEqual([o, true]);
    }
  });

  test('⚠ and all seven go through the one row that was fixed', () => {
    /* The report named MISS and guessed HIT. Neither is special: `Stamp` renders
     * whatever `outcomeLabel` returns, inside `styles.result`, for every kind.
     * So the fix covers seven labels, not two — asserted by reading the single
     * render path rather than by trusting that claim. */
    expect(CODE).toContain('const label = outcomeLabel(ev.outcome)');
    expect(CODE).toContain('<View style={styles.result}>');
    expect(CODE).toContain('<Stamp ev={ev} />');
    // exactly one Stamp render site, so there is no second unfixed path
    expect((CODE.match(/<Stamp\b/g) ?? []).length).toBe(1);
  });
});

// ═══ 4. THE SECOND ROW, FOUND RATHER THAN REPORTED ═══════════════════════════
describe('⚠⚠ the sub-row had the identical defect and was fixed with it', () => {
  test('weapon name vs HP readout now has the same guaranteed minimum', () => {
    const sub = styleBody('subRow');
    const gap = /columnGap: (\d+)/.exec(sub)?.[1];
    expect(gap).toBeDefined();
    expect(Number(gap)).toBeGreaterThan(0);
    // and the same ingredients that made it vulnerable are still there —
    // a shrinking left side and an auto-pushed right side
    expect(styleBody('sub')).toContain('flexShrink: 1');
    expect(styleBody('hp')).toContain("marginLeft: 'auto'");
  });
});

// ═══ 5. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ the style reader really isolates ONE style, or every claim leaks', () => {
    /* The bug this suite hit in its own first draft: a body regex that ran past
     * a one-line style and asserted against the next one's properties. */
    expect(styleBody('spineIn')).toContain('INCOMING');
    expect(styleBody('spineIn')).not.toContain('marginLeft');
    expect(styleBody('result')).toContain('marginLeft');
    expect(styleBody('row')).not.toContain('backgroundColor');
  });

  test('⚠ comments are stripped, or the "no margin on the spine" claims are vacuous', () => {
    expect(CODE.length).toBeLessThan(STRIP.length * 0.75);
    expect(codeOf('/* marginRight: 7 */ const a = 1;')).not.toContain('marginRight');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1772-the-stamp-cannot-touch-the-name'");
  });
});

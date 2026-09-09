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
 *
 * ⚠⚠⚠ OTA-1790 CLOSED THIS DEFECT CLASS STRUCTURALLY, SO THE TESTS BELOW WERE
 * RE-AIMED AT THE CLAIM RATHER THAN DELETED. The two columns are gone: an
 * exchange is now ONE SENTENCE built by `engine/combatSentence`, its parts are
 * runs inside a single wrapping `<Text>`, and the name is never truncated. A
 * stamp cannot weld itself to a name when there is no stamp column and no
 * ellipsis — so the layout assertions become assertions about the SENTENCE, and
 * they are stronger for it: the collision is now impossible for every name
 * length and every one of the seven outcomes, tested against the builder rather
 * than against a StyleSheet. What must never come back is a presentation where
 * the outcome and the name are separately positioned; that is what these tests
 * now guard.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { outcomeLabel } from '../app/engine/combatEvent';
import { eventLine, eventSentence } from '../app/engine/combatSentence';

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

/** The row's column gap, as a NUMBER, whether it is written inline or through a
 *  named constant. ⚠ OTA-1790 moved it to `ROW_GAP` so the prose indent could be
 *  computed from the same value; a test that only understood a literal digit
 *  would have gone red on a refactor that changed nothing about the claim. */
const rowGap = (): number => {
  const raw = /columnGap: ([A-Za-z_0-9]+)/.exec(styleBody('row'))?.[1] ?? '';
  if (/^\d+$/.test(raw)) return Number(raw);
  const named = new RegExp(`const ${raw} = (\\d+)`).exec(CODE)?.[1];
  return named ? Number(named) : NaN;
};

// ═══ 1. THE GUTTER EXISTS, AND IT IS NOT CONDITIONAL ═════════════════════════
describe('⚠⚠⚠ the two columns cannot touch, however long the name is', () => {
  test('the row declares a real column gap', () => {
    /* ⚠ PIN THE CLAIM, NEVER THE MECHANISM — this rollout's most expensive rule.
     * The claim is "there is an unconditional minimum between the columns", not
     * "the number is 7". A later pass that widens it must not turn this red; a
     * later pass that DELETES it must. So: a positive gap, whatever its size. */
    expect(rowGap()).toBeGreaterThan(0);
  });

  test('⚠⚠ OTA-1790 — there is no auto-pushed column left to collide with', () => {
    /* The shipped defect was an `auto` margin doing double duty as the gutter.
     * The whole column is gone: the outcome is the sentence's VERB and travels
     * with the name in one text run. This asserts the mechanism cannot return —
     * nothing in the row is positioned by leftover space. */
    expect(styleBody('result')).toBe('');
    const exchange = CODE.slice(CODE.indexOf('  row: {'), CODE.indexOf('  math: {'));
    expect(exchange).not.toContain("marginLeft: 'auto'");
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

  test('⚠⚠ OTA-1790 — the gap survived the re-layout, at whatever the row now needs', () => {
    /* This used to pin 7 exactly, on the grounds that the number was already
     * right and a refactor must not restyle the row. OTA-1790 inserted a
     * RESERVED GLYPH COLUMN between the spine and the words — the pack requires
     * one — so the row genuinely has different neighbours than it did, and
     * pinning the old number would be pinning the mechanism. The claim survives:
     * an unconditional, positive minimum between every pair in the row. */
    expect(rowGap()).toBeGreaterThan(0);
    expect(styleBody('markCol')).toContain('width');
  });
});

// ═══ 2. WHICH SIDE GIVES WAY ═════════════════════════════════════════════════
describe('⚠⚠ OTA-1790 — nothing yields, because nothing competes', () => {
  test('the sentence takes the rest of the row and wraps inside it', () => {
    /* There is no name column and no stamp column to trade width between. One
     * text node holds subject, verb, object and damage, and `flex: 1` gives it
     * whatever the spine and the reserved mark column leave. */
    expect(styleBody('line')).toContain('flex: 1');
    expect(styleBody('who')).toBe('');
    expect(styleBody('result')).toBe('');
  });

  test('⚠⚠⚠ the name is allowed a second line, which is what actually kills the defect', () => {
    /* THE ONE CLAIM THIS PASS DELIBERATELY REVERSED, on the reference pack's own
     * instruction: *"Allow long enemy names to wrap/truncate according to a
     * governed rule without scrambling HIT/target/damage order."* VIS-2 clamped
     * both names to one line so an exchange was a fixed height; the ellipsis
     * that produced is precisely what `MISSConspiracy Archit…` was made of. The
     * density argument survives because a one-line exchange is still one row —
     * only a genuinely long name pays for a second. */
    const row = CODE.slice(CODE.indexOf('function ExchangeRow'), CODE.indexOf('function DefeatRow'));
    expect(row).toContain('<Text style={styles.line}>');
    expect(/styles\.line[\s\S]{0,200}numberOfLines/.test(row)).toBe(false);
  });

  test('⚠⚠ and the outcome can no longer touch the name, at ANY length', () => {
    /* Graded against the BUILDER rather than the StyleSheet, so it holds for
     * every name the game can produce. The reported string was `MISSConspiracy
     * Archit…`; the sentence puts a space between every part by construction and
     * has no way to emit two adjacent words without one. */
    const names = ['R', 'Raider', 'Conspiracy Architect 1',
      'Thrice-Bound Architect of the Drowned Cartographic Assembly 11'];
    const outcomes = ['crit', 'hit', 'miss', 'fumble', 'dodged', 'evaded', 'slipped'] as const;
    for (const name of names) {
      for (const o of outcomes) {
        const l = eventLine({ kind: 'damage', side: 'player', target: name, outcome: o, dmg: 7 })!;
        const sentence = eventSentence({ kind: 'damage', side: 'player', target: name, outcome: o, dmg: 7 });
        // every part that exists is separated from its neighbour
        expect([name, o, sentence.includes(`${l.verb}${l.object}`)]).toEqual([name, o, false]);
        expect([name, o, sentence]).toEqual([name, o, sentence.replace(/\s+/g, ' ')]);
        // and nothing is clipped
        expect([name, o, sentence.includes('…')]).toEqual([name, o, false]);
      }
    }
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

  test('⚠ and all seven still go through ONE render path (OTA-1790: the sentence)', () => {
    /* The report named MISS and guessed HIT. Neither was ever special, and that
     * is still the point: every outcome becomes a verb through `eventLine`, and
     * the row draws whatever it returns. One path, so there is no second unfixed
     * one — asserted by reading the render site rather than trusting the claim. */
    expect(CODE).toContain('const line = eventLine(ev);');
    expect(CODE).toContain('<Text style={styles.line}>');
    expect((CODE.match(/eventLine\(/g) ?? []).length).toBe(1);
    for (const o of ['crit', 'hit', 'miss', 'fumble', 'dodged', 'evaded', 'slipped'] as const) {
      const l = eventLine({ kind: 'damage', side: 'player', target: 'Raider', outcome: o, dmg: 5 });
      expect([o, l?.verb]).toEqual([o, l!.verb]);
      expect([o, (l!.verb ?? '').length > 0]).toEqual([o, true]);
    }
  });
});

// ═══ 4. THE SECOND ROW, FOUND RATHER THAN REPORTED ═══════════════════════════
describe('⚠⚠ the sub-row had the identical defect, and OTA-1790 deleted the row', () => {
  test('there is no second two-column row left to collide', () => {
    /* The weapon moved into layer B's prose and the HP readout moved INSIDE the
     * sentence, so the vulnerable shape — a shrinking left side and an
     * auto-pushed right side — no longer exists anywhere in the file. */
    expect(styleBody('subRow')).toBe('');
    expect(styleBody('hp')).toBe('');
    expect(styleBody('sub')).toBe('');
    // and what it carried is still reachable: the standing readout rides the run
    expect(eventLine({ kind: 'damage', side: 'player', target: 'Raider', outcome: 'hit', dmg: 3, hp: { now: 6, max: 24 } })!.standing)
      .toBe(' · 6/24');
  });
});

// ═══ 5. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ the style reader really isolates ONE style, or every claim leaks', () => {
    /* The bug this suite hit in its own first draft: a body regex that ran past
     * a one-line style and asserted against the next one's properties. */
    expect(styleBody('spineIn')).toContain('INCOMING');
    expect(styleBody('spineIn')).not.toContain('marginLeft');
    expect(styleBody('markCol')).toContain('WEAPON_ART_SIZE');
    expect(styleBody('markCol')).not.toContain('backgroundColor');
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

/**
 * OTA-1773 — THE FRAME GETS A NAME. The owner ruling that closes HOLD-2.
 *
 * OTA-1769 measured the conversation overlay's frame gold, found it past the
 * kit's own palette ceiling, and REFUSED to adopt it — leaving the colour local
 * to two files with its pixels untouched and the question in the owner's queue.
 * The ruling landed:
 *
 *     *"OWNER DECISION: APPROVED. Give the deliberately brighter
 *     conversation-overlay frame gold a named palette exemption. Preserve the
 *     reason it exists: the outer frame is deliberately visually louder/brighter
 *     than the gold hierarchy inside the conversation sheet. Do not normalize it
 *     to standard T.gold and destroy that hierarchy. Implement this through the
 *     named semantic/palette mechanism rather than creating an ungoverned
 *     exception."*
 *
 * ⚠⚠⚠ THREE THINGS THAT ARE EASY TO CONFUSE AND ARE NOT THE SAME:
 *   · a LITERAL — two files each carrying `'#f0c96a'`, which is what shipped;
 *   · an UNGOVERNED EXCEPTION — loosening the chroma ceiling so it slips past,
 *     which would admit every future bright hue unremarked;
 *   · a NAMED EXEMPTION — `T.goldFrame`, listed BY NAME in the gate beside the
 *     brand gold, ceiling untouched.
 * All three paint the same pixels. Only the third is what was asked for, and
 * the difference is the whole content of this pass.
 *
 * ⚠⚠ AND NOT ONE PIXEL MOVES. The value below is byte-for-byte what `TalkSheet`
 * and both of `WhisperTalkSheet`'s call sites already drew. What changed is that
 * a second bright gold now has an address and a recorded reason.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { T, tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const OVERLAY = ['TalkSheet', 'WhisperTalkSheet'] as const;
const sheet = (n: string) => read('app', 'components', `${n}.tsx`);

/* ⚠ GRADE THE CODE, NOT THE PROSE — fourteenth time in this rollout. Every file
 * touched here argues at length about the very hex the assertions require to be
 * absent from the two sheets. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// ═══ 1. THE NAME ═════════════════════════════════════════════════════════════
describe('⚠⚠⚠ the colour has an address now', () => {
  test('the palette names it, and the name is not the brand gold', () => {
    expect(T.goldFrame).toBe('#F0C96A');
    expect(T.goldFrame).not.toBe(T.gold);
  });

  test('⚠⚠ it is BRIGHTER than the brand gold — the property the ruling protects', () => {
    /* *"Do not normalize it to standard T.gold and destroy that hierarchy."*
     * Asserted as the RELATIONSHIP rather than as a literal, so if the owner
     * later re-tunes the value this test still defends the reason it exists.
     * ⚠ Both channels, because "brighter" has to mean brighter — a colour can
     * win on luminance while losing on every component and read as a different
     * hue rather than a louder one. */
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.299 * r! + 0.587 * g! + 0.114 * b!;
    };
    expect(lum(T.goldFrame)).toBeGreaterThan(lum(T.gold));
    const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [fr, fg, fb] = chan(T.goldFrame);
    const [br, bg, bb] = chan(T.gold);
    expect([fr! >= br!, fg! >= bg!, fb! >= bb!]).toEqual([true, true, true]);
    // and louder than the golds used INSIDE the sheet, which is the hierarchy
    expect(lum(T.goldFrame)).toBeGreaterThan(lum('#6b5c3a'));
  });
});

// ═══ 2. THE EXEMPTION IS GOVERNED ════════════════════════════════════════════
describe('⚠⚠⚠ a named exemption, not a loosened rule', () => {
  const GATE = read('__tests__', 'ota1742TheScreenIsMadeOfSomething.test.tsx');

  test('the hex is listed BY NAME in the palette gate', () => {
    expect(GATE).toContain("'F0C96A'");
    expect(GATE).toContain('OTA-1773');
  });

  test('⚠⚠ and the CEILING DID NOT MOVE — that is what makes it an exemption', () => {
    /* The failure this test exists to prevent: raising the chroma cap to 134 so
     * the frame passes on arithmetic. That would paint identical pixels today
     * and silently admit every bright hue tomorrow. The rule stays at 60; the
     * frame passes because a person decided it should. */
    expect(GATE).toContain('toBeLessThanOrEqual(60)');
    const chroma = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
    };
    // the arithmetic still fails — which is the point of needing a name
    expect(chroma(T.goldFrame)).toBeGreaterThan(60);
    expect(chroma(T.gold)).toBeGreaterThan(60);
  });

  test('⚠ the exemption list stays SHORT — five names, each with a decision behind it', () => {
    /* A list nobody prunes stops being a list of decisions and becomes a
     * loophole. Asserted as a ceiling so the next addition is a deliberate act
     * that has to come here and raise the number. */
    const block = /const BRAND = new Set\(\[([\s\S]*?)\]\)/.exec(GATE)?.[1] ?? '';
    expect(block).not.toBe('');
    const names = [...block.matchAll(/'([0-9A-F]{6})'/g)].map((m) => m[1]!);
    expect(names).toContain('F0C96A');
    expect(names).toContain('C9A86A');
    expect(names.length).toBeLessThanOrEqual(5);
  });
});

// ═══ 3. THE PANEL CAME IN, AND NOTHING MOVED ═════════════════════════════════
describe('⚠⚠ the panel is the kit\'s, and it is the same panel', () => {
  test('the kit\'s sheetPanel is byte-for-byte what both files drew', () => {
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

  test('⚠⚠ and it reads the NAME, not a second copy of the value', () => {
    /* The difference between naming a colour and having two of it. If the panel
     * carried the literal, `T.goldFrame` would be documentation rather than an
     * authority, and the next re-tune would move one of them. */
    expect(codeOf(KIT)).toMatch(/sheetPanel: \{[\s\S]*?borderColor: T\.goldFrame,/);
  });

  test('⚠⚠⚠ both overlay files adopted it and neither kept a private PANEL', () => {
    for (const n of OVERLAY) {
      const code = codeOf(sheet(n));
      expect([n, code.includes('style={kit.sheetPanel}')]).toEqual([n, true]);
      expect([n, /\n {2}sheet: \{/.test(code)]).toEqual([n, false]);
      // the panel's own frame literal is gone from both files
      expect([n, /borderColor: '#f0c96a'/i.test(code)]).toEqual([n, false]);
    }
  });

  test('⚠⚠⚠ THE FINDING: the same hex has a SECOND, UN-RULED job in one file', () => {
    /* ⚠ MY ASSERTION WAS WRONG BEFORE THE CODE WAS. The first draft of the test
     * above claimed neither file contains the hex AT ALL, and it went red —
     * correctly. `WhisperTalkSheet` also paints `barDeciding` with it, as a
     * FILLED background beside a brighter companion gold, which is a different
     * thing entirely from an outer frame.
     *
     * ⚠⚠ THAT IS A FINDING, NOT A TEST TYPO. The ruling was about *"the outer
     * frame ... louder than the gold hierarchy INSIDE the conversation sheet."*
     * This use is inside the sheet and it is a FILL, not a rim — so it is not
     * covered, and quietly repointing it at `T.goldFrame` would be inventing an
     * authority the owner did not grant. It stays a local literal and stays on
     * the queue. OTA-1759's precedent, a third time: refuse rather than exempt
     * quietly.
     *
     * So this test PINS THE PROBLEM rather than its absence, and the next pass
     * finds it written down instead of rediscovering it. */
    const code = codeOf(sheet('WhisperTalkSheet'));
    expect(code).toMatch(/barDeciding: \{[^}]*backgroundColor: '#f0c96a'/i);
    // ⚠ and it sits beside a THIRD gold, brighter still, that nothing has ruled on
    expect(code).toMatch(/barDeciding: \{[^}]*borderColor: '#f7dc9a'/i);
    // ⚠ TalkSheet has no second use — this is one file's question, not the pair's
    expect(codeOf(sheet('TalkSheet')).toLowerCase()).not.toContain('#f0c96a');
  });

  test('⚠ WhisperTalkSheet mounts it TWICE, and both sites moved', () => {
    /* The file that made this worth extracting: it renders the pattern at two
     * call sites with different animation, so a half-done adoption would leave
     * one of them on a literal and nobody would see it until the colour changed. */
    const code = codeOf(sheet('WhisperTalkSheet'));
    expect((code.match(/style=\{kit\.sheetPanel\}/g) ?? []).length).toBe(2);
  });
});

// ═══ 4. THE HISTORY IS KEPT ══════════════════════════════════════════════════
describe('⚠ the hold is recorded, not erased by its own resolution', () => {
  test('the kit still says it was held, and says what released it', () => {
    /* ⚠ The process is the reusable part. A reader who sees only the finished
     * exemption learns "bright golds are fine here"; a reader who sees that the
     * previous pass REFUSED it and escalated learns the actual rule. Deleting
     * the history to tidy up would delete the lesson. */
    expect(KIT).toContain('HELD FOR AN OWNER');
    expect(KIT).toContain('OTA-1769');
    expect(KIT).toContain('OTA-1773');
    expect(KIT).toContain('chroma');
    for (const n of OVERLAY) expect([n, sheet(n).includes('OTA-1773')]).toEqual([n, true]);
  });

  test('⚠ and no file still claims the question is open', () => {
    for (const n of OVERLAY) {
      expect([n, sheet(n).includes('PENDING AN OWNER RULING')]).toEqual([n, false]);
    }
  });
});

// ═══ 5. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments are stripped, or the "no private copy" claims are vacuous', () => {
    expect(codeOf(KIT).length).toBeLessThan(KIT.length * 0.7);
    expect(codeOf('/* #f0c96a */ const a = 1;')).not.toContain('f0c96a');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1773-the-frame-gets-a-name'");
  });
});

/**
 * OTA-1721 — YOUR NAME WAS THE THREE DOTS.
 *
 * Owner, with a screenshot of his own HUD: *"why does my player health look like
 * that, why are there 3 dots on the top left corner"*.
 *
 * ⚠⚠⚠ THE THREE DOTS WERE HIS CHARACTER'S NAME. The name row is
 * `[name] … [right column]`, and the two sides were given opposite instructions:
 *
 *     name:         { flexShrink: 1 }   → gives up width
 *     nameRowRight: { flexShrink: 0 }   → never gives up width
 *
 * With a compact badge on the right ("◆ 58 PWR", "Rust (16/16)") the name has
 * room and nobody notices. But the DOWNED-DOG COUNTDOWN was stacked into that
 * same column, and it is not a badge, it is a sentence: "Rust ⏳ 24h — feed to
 * save". `numberOfLines={1}` means it cannot wrap, `flexShrink: 0` means it will
 * not yield, so it took the row and the name — the only shrinkable thing left —
 * collapsed to a bare ellipsis. For as long as his dog was bleeding out, his
 * character had no name on his own screen.
 *
 * ⚠⚠ It is visible in the screenshot exactly as the arithmetic predicts: line
 * one reads `...` and `◆ 58 PWR`, line two reads `Rust ⏳ 24h — feed to save`.
 * The warning that shipped to save the dog is what erased the player.
 *
 * ⚠ THE FIX IS THE SHAPE, AND THEN A FLOOR. A sentence gets a row of its own —
 * the same shape the golem line has used since OTA-145 — so the corner holds
 * only badges again. And `minWidth` on the name makes the CLASS unreachable:
 * whatever anyone stacks on the right next, the name keeps enough room to be a
 * truncated name rather than three dots.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const PANEL = readFileSync(join(__dirname, '..', 'app', 'components', 'StatsPanel.tsx'), 'utf8');

/** ⚠ COMMENTS ARE NOT RENDERED TEXT, and both checks below have to know that.
 *  My first cut scanned raw source and failed on my OWN comment — the one
 *  explaining the fix quotes the warning string it moved out — which is the
 *  instrument reporting its own prose as the defect. Same shape as the probe
 *  that read the wrong store field earlier in this session: a scanner that
 *  cannot tell its subject from its notes measures nothing. */
const withoutComments = (src: string): string =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

/** Everything the name row's right-hand badge column actually renders. */
const badgeColumn = (): string => withoutComments(
  PANEL.slice(
    PANEL.indexOf('<View style={styles.nameRowRight}>'),
    PANEL.indexOf('{dogShows && player.dog && dogDowned ? ('),
  ),
);

describe('OTA-1721 — ⚠⚠⚠ the sentence is out of the corner', () => {
  it('the countdown is no longer inside the right-hand badge column', () => {
    const rowRight = badgeColumn();
    expect(rowRight.includes('feed to save')).toBe(false);
    // The corner still holds the things that ARE badges.
    expect(rowRight.includes('PWR')).toBe(true);
  });

  it('⚠⚠ and it has its own full-width row, like the golem line', () => {
    expect(PANEL.includes('{dogShows && player.dog && dogDowned ? (')).toBe(true);
    const row = PANEL.slice(PANEL.indexOf('{dogShows && player.dog && dogDowned ? ('));
    expect(row.slice(0, 400).includes('feed to save')).toBe(true);
    // It sits AFTER the name row closes, not inside it.
    expect(PANEL.indexOf('{dogShows && player.dog && dogDowned ? ('))
      .toBeGreaterThan(PANEL.indexOf('<View style={styles.nameRowRight}>'));
  });

  it('the healthy dog stays a badge — it was never the problem', () => {
    // "Rust (16/16)" is short and belongs beside the power rating. Moving it too
    // would have been a bigger edit answering a smaller question.
    expect(PANEL.includes('{dogShows && player.dog && !dogDowned ? (')).toBe(true);
  });

  it('⚠ the warning is no longer capped at a corner chip\'s width', () => {
    // 200pt was a right-aligned chip's cap. On its own row a 16-character dog
    // name must not be able to clip the words "feed to save" off the one warning
    // in the game with a deadline attached.
    expect(PANEL.includes("dogDown: { color: '#e5484d', fontSize: 12, fontWeight: '700', marginTop: 2 },")).toBe(true);
    // The dogDown style itself carries no width cap any more.
    const st = PANEL.slice(PANEL.indexOf('  dogDown: {'), PANEL.indexOf('  dogDown: {') + 140);
    expect(st.includes('maxWidth')).toBe(false);
  });
});

describe('OTA-1721 — ⚠⚠ the floor, so the class cannot come back', () => {
  it('the name keeps a minimum width whatever is stacked beside it', () => {
    expect(PANEL.includes("name: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', flexShrink: 1, minWidth: 64 },")).toBe(true);
  });

  it('⚠ the asymmetry that caused it is still there, and is now survivable', () => {
    // The right column is still flexShrink: 0 — that is correct for badges, and
    // changing it would make the POWER rating truncate instead, which is a worse
    // trade. The floor is what makes the asymmetry safe.
    expect(PANEL.includes("nameRowRight: { alignItems: 'flex-end', flexShrink: 0 }")).toBe(true);
  });

  it('⚠⚠ THE INSTRUMENT — nothing in the badge column renders a sentence', () => {
    // A "sentence" here means a long-ish literal with spaces: badges are values
    // and short labels. This is what catches the next one before a screenshot
    // does — the countdown sat in that column since OTA-915 and nobody looked.
    const rowRight = badgeColumn();
    const sentences = [...rowRight.matchAll(/>\s*\{?[^<>{}]*?([A-Za-z]+(?:\s+[A-Za-z]+){4,})[^<>{}]*?\}?\s*</g)]
      .map((m) => m[1]!.trim());
    expect(sentences).toEqual([]);
  });
});

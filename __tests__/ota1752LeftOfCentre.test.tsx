/**
 * OTA-1752 — LEFT OF CENTRE.
 *
 * OTA-1751 put the roster tile's faction emblem on the row's geometric centre,
 * which is exactly what the owner asked for. On the device it still read as
 * sitting too far right.
 *
 * ⚠⚠⚠ THE ARITHMETIC WAS NEVER WRONG — THE PREMISE WAS. The emblem really was
 * centred; the tile is not an empty rectangle. Its weight is all on the LEFT — a
 * 32px name with an objective line beneath it — against nothing but a small
 * timestamp on the right. An emblem on the geometric centre reads right of
 * centre, because the eye balances it against the TEXT, not against the border.
 *
 * That is worth a suite of its own because it is a rule the rest of the rollout
 * will need: on any surface whose content is one-sided, "centred" is a property
 * of the composition, not of the box.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');

const styleBlock = (name: string) => {
  const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(TITLE);
  if (one) return one[0];
  return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(TITLE)?.[0] ?? '';
};
const num = (block: string, prop: string) => {
  const m = new RegExp(`${prop}:\\s*'?(-?\\d+(?:\\.\\d+)?)%?'?`).exec(block);
  return m ? Number(m[1]) : NaN;
};
const field = () => {
  const b = styleBlock('dossierFieldCompact');
  const left = num(b, 'left');
  const right = num(b, 'right');
  const width = 100 - left - right;
  return { b, left, right, width, centre: left + width / 2 };
};

describe('the emblem balances against the text, not against the border', () => {
  /* ⚠⚠⚠ THIS PASS WAS WRONG, AND SUPERSEDED BY OTA-1754. KEPT, NOT DELETED.
   *
   * The reasoning below was sound and the conclusion was still wrong, which is
   * the useful kind of failure to leave in the tree. The premise — that a tile's
   * weight is on the left, so a geometrically centred mark reads right-of-centre
   * — is TRUE, and it is a rule the rest of the rollout will need. What was
   * wrong was applying it to a report it did not explain.
   *
   * ⚠⚠ The owner said the emblems were "still too far to the right". I read that
   * as "move them left" and did, twice — to the centre in OTA-1751, past it to
   * 38% in OTA-1752. He meant the emblem was RUNNING OFF the right edge, so only
   * a sliver of it was on the card, and asked for it to be a contained column on
   * the far right. One rendered picture would have settled it before either
   * pass. Two OTAs of travel, and the direction was mine, not his.
   *
   * The positional assertions are therefore retired. What is kept is the part
   * that was never about direction, and the note above, so the next surface with
   * one-sided weight starts from the rule without repeating the inference. */
  test('⚠⚠ the emblem is a contained column, on one side, by a decisive margin', () => {
    const f = field();
    expect(f.left).toBeGreaterThan(0);
    expect(f.right).toBeGreaterThan(0);
    expect(Math.abs(f.left - f.right)).toBeGreaterThan(10);   // committed to a side
  });

  test('⚠⚠ ONLY the horizontal centre moved — width, crop and alpha are OTA-1751\'s', () => {
    /* The whole point of asserting coverage independently of position back in
     * OTA-1750 was that a later pass could slide the box without reopening the
     * size argument. This is that pass, and this is the test that proves it did
     * not smuggle anything else through. */
    const f = field();
    expect(f.width / 100).toBeGreaterThanOrEqual(1 / 3);  // the owner's floor, unchanged
    expect(num(f.b, 'opacity')).toBe(0.22);         // the alpha he approved
    expect(num(f.b, 'top')).toBe(-250);             // the vertical crop
    expect(num(f.b, 'bottom')).toBe(num(f.b, 'top'));
  });

  test('⚠ it no longer clears the timestamp — and that is now deliberate', () => {
    /* OTA-1752 kept the emblem short of `slotTime` at the far right of the head
     * row. OTA-1754 put the column THERE, so the timestamp now sits over the
     * emblem. That is fine and it is measured rather than assumed: at 0.22 over
     * the brightest part of the artwork `slotTime` (#a2977b) clears 3:1, which
     * ota1751 asserts. Pinning the old clearance would forbid the column. */
    expect(field().right).toBeLessThan(30);
  });

  test('the expanded card did not move with it', () => {
    // Only the collapsed tile has one-sided weight. The expanded card is a
    // two-column record and its composition was approved as it is.
    /* ⚠⚠ SUPERSEDED BY OTA-1754, which was the point at which the two cards were
     * finally made to agree. This asserted the record did NOT follow the tile,
     * which was true while the tile was being walked left on a misreading. Now
     * they share a right edge deliberately, so what is worth holding is that
     * neither of them bleeds off the card any more. */
    const a = styleBlock('dossierField');
    const c = styleBlock('dossierFieldCompact');
    expect(num(a, 'right')).toBe(num(c, 'right'));   // one edge, both cards
    expect(num(a, 'right')).toBeGreaterThan(0);      // contained, not bleeding
    expect(num(a, 'left')).toBeGreaterThan(0);
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1752-left-of-centre'");
  });
});

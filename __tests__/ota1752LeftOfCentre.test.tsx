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
  test('⚠⚠⚠ its centre sits left of the tile\'s centre, and decisively so', () => {
    const f = field();
    expect(f.centre).toBeLessThan(45);
    // ...and not merely a nudge — OTA-1751 was at 50 and the owner still called it right
    expect(50 - f.centre).toBeGreaterThanOrEqual(8);
  });

  test('but not shoved against the edge either', () => {
    const f = field();
    expect(f.centre).toBeGreaterThan(25);
    expect(f.left).toBeGreaterThan(0);
    expect(f.right).toBeGreaterThan(0);
  });

  test('⚠⚠ ONLY the horizontal centre moved — width, crop and alpha are OTA-1751\'s', () => {
    /* The whole point of asserting coverage independently of position back in
     * OTA-1750 was that a later pass could slide the box without reopening the
     * size argument. This is that pass, and this is the test that proves it did
     * not smuggle anything else through. */
    const f = field();
    expect(f.width).toBe(42);                       // the owner's ≥1/3 floor, unchanged
    expect(num(f.b, 'opacity')).toBe(0.22);         // the alpha he approved
    expect(num(f.b, 'top')).toBe(-250);             // the vertical crop
    expect(num(f.b, 'bottom')).toBe(num(f.b, 'top'));
  });

  test('it still clears the timestamp on the right', () => {
    // `slotTime` sits at the far right of the head row; the emblem stopping
    // short of it is why moving left costs nothing on that side.
    expect(field().right).toBeGreaterThanOrEqual(30);
  });

  test('the expanded card did not move with it', () => {
    // Only the collapsed tile has one-sided weight. The expanded card is a
    // two-column record and its composition was approved as it is.
    const a = styleBlock('dossierField');
    expect(num(a, 'left')).toBe(32);
    expect(num(a, 'right')).toBe(-8);
    expect(num(a, 'opacity')).toBe(0.13);
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1752-left-of-centre'");
  });
});

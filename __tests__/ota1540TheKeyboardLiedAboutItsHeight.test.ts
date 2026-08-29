/**
 * OTA-1540 — THE KEYBOARD LIED ABOUT ITS HEIGHT.
 *
 * Owner, mid-session: *"no text box right jere"*, then twenty-four seconds
 * later, *"still none, it's too low I can see the very top edge of it"*.
 *
 * ⚠⚠⚠ THE OTA-1535 INSTRUMENT ANSWERED IT ON THE FIRST OUTING. Same device,
 * same 986pt window, two sessions:
 *
 *   23:28  kbbar: mounted bottom=407.79 from=live winH=986      — fine
 *   01:10  kbbar: mounted bottom=359.79 from=live winH=986      — buried
 *
 * Exactly 48.0 apart, and both on the `live` rung. Android reports the
 * keyboard's BASE height in `endCoordinates.height` and draws the Gboard
 * suggestion strip on top of it without a follow-up frame event, so the bar
 * believed 359.79 while the keys occupied 407.79 — burying it with 48px of its
 * top edge showing, which is what the owner described to the pixel.
 *
 * ⚠⚠⚠ AND IT KILLED THE PREVIOUS DIAGNOSIS, WHICH IS WHY THE INSTRUMENT WAS
 * WORTH SHIPPING. OTA-1535's first reading blamed the `estimate` rung
 * (`winH * 0.36` = 355, against a real 407.79). That IS a 52.79pt shortfall and
 * it is real — but every burial in the owner's log fires on `from=live`, so it
 * was never this bug. Three passes had already been spent on the listeners
 * (OTA-215 change-frame, arb71 ghost guard, OTA-1442 Android isVisible re-sync)
 * because the natural assumption is that the event is missing. The event is
 * fine. The NUMBER IT CARRIES IS SHORT.
 *
 * ⚠⚠ SO POSITION FROM THE TOP EDGE, NOT THE HEIGHT. `endCoordinates.screenY` is
 * where the keyboard's top actually sits in window space, so `winH - screenY`
 * measures what it really occupies, strip included. The value was already being
 * read one line away for arb71's ghost-bar guard; it just never drove the
 * position.
 *
 * ⚠ MAX, NOT REPLACE, AND SANITY-BOUNDED. screenY is used only when finite and
 * inside the window, the larger of the two wins, and a frame claiming more than
 * three quarters of the screen is discarded as a bad frame. The failure this
 * fixes is a bar sitting too LOW; it must not be able to manufacture the
 * opposite one. Every entry point is wired the same way — show, change-frame,
 * and both Keyboard.metrics() re-syncs — because a correction applied at three
 * of four doors is a bug that comes back through the fourth.
 *
 * ⚠ THE INSTRUMENT STAYS IN, and now prints `raw=` beside the offset. When
 * `bottom > raw` the correction fired and the gap is the strip. A fix derived
 * from one device's logs is a hypothesis until the next log agrees.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const BAR = src('app', 'components', 'KeyboardInputBar.tsx');
const codeOnly = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** The shipped rule, mirrored so the arithmetic itself is pinned, not just the
 *  source text. Kept in step with occupiedHeight in the component. */
const occupied = (height: number, screenY: number | undefined, winH: number): number => {
  if (typeof screenY !== 'number' || !Number.isFinite(screenY)) return height;
  if (screenY <= 0 || screenY >= winH) return height;
  const fromTop = winH - screenY;
  if (fromTop > winH * 0.75) return height;
  return Math.max(height, fromTop);
};

describe('OTA-1540 — the bar is positioned from the keyboard top edge', () => {
  it('⚠⚠⚠ the owner\'s exact frame: a 359.79 report with a 578.21 top edge yields 407.79', () => {
    // winH 986, keys actually starting at y=578.21. The 48.0 the strip added.
    expect(occupied(359.79, 578.21, 986)).toBeCloseTo(407.79, 2);
    expect(occupied(359.79, 578.21, 986) - 359.79).toBeCloseTo(48.0, 1);
  });

  it('⚠⚠⚠ …and the session that already worked is left exactly where it was', () => {
    // 407.79 reported with a matching top edge must not move — a fix that
    // shifts the working case is a new bug.
    expect(occupied(407.79, 578.21, 986)).toBeCloseTo(407.79, 2);
  });

  it('⚠⚠⚠ it can only ever raise the bar, never lower it', () => {
    // The failure being fixed is "too low". Manufacturing the opposite failure
    // on some other device would be strictly worse than the bug.
    for (const h of [0, 100, 359.79, 407.79, 600]) {
      for (const y of [undefined, -5, 0, 300, 578.21, 985, 986, 2000, NaN]) {
        expect(occupied(h, y as number | undefined, 986)).toBeGreaterThanOrEqual(h);
      }
    }
  });

  it('⚠⚠ a nonsense screenY falls back to the reported height', () => {
    // Off-window, zero, negative and NaN frames all appear in the wild.
    expect(occupied(359.79, 0, 986)).toBe(359.79);
    expect(occupied(359.79, -1, 986)).toBe(359.79);
    expect(occupied(359.79, 986, 986)).toBe(359.79);
    expect(occupied(359.79, 1200, 986)).toBe(359.79);
    expect(occupied(359.79, NaN, 986)).toBe(359.79);
    expect(occupied(359.79, undefined, 986)).toBe(359.79);
  });

  it('⚠⚠ a frame claiming three quarters of the screen is discarded as bad', () => {
    // A keyboard does not take 80% of the window; that is a mid-animation or
    // rotated frame, and trusting it would launch the bar up the screen.
    expect(occupied(359.79, 100, 986)).toBe(359.79); // would imply 886 of 986
    expect(occupied(359.79, 300, 986)).toBeCloseTo(686, 0); // 69.6% — allowed
  });

  it('⚠⚠⚠ EVERY entry point passes screenY — show, change-frame, and both re-syncs', () => {
    // A correction applied at three of four doors is a bug that returns through
    // the fourth. There are exactly four calls and all four carry it.
    const code = codeOnly(BAR);
    const calls = code.match(/applyHeight\([^)]*\)/g) ?? [];
    const definitions = calls.filter((c) => !c.includes('const applyHeight'));
    expect(definitions.length).toBeGreaterThanOrEqual(4);
    for (const c of definitions) expect(c).toMatch(/screenY|m\.screenY/);
  });

  it('⚠⚠ the offset feeding the bar is the corrected one, not the raw report', () => {
    const code = codeOnly(BAR);
    expect(code).toContain('const h = occupiedHeight(height, screenY);');
    expect(code).toContain('lastKeyboardHeight = h; setKeyboardOffset(h);');
  });

  it('⚠⚠ arb71\'s ghost guard still owns the hide path — screenY is read twice, for two jobs', () => {
    // The same field decides "the keyboard slid off-screen" (hide) and "the
    // keyboard is taller than it claims" (position). Losing the first while
    // adding the second would strand the bar mid-screen again.
    const code = codeOnly(BAR);
    expect(code).toContain('const offscreen = typeof screenY === \'number\' && screenY >= winH - 1;');
    expect(code).toContain('if (offscreen) { onHide(); return; }');
  });

  it('⚠ the instrument survives and now prints the raw report beside the offset', () => {
    // bottom > raw is the correction firing. Without raw= the next log cannot
    // tell a fixed bar from a keyboard that happened to report honestly.
    const code = codeOnly(BAR);
    expect(code).toContain('kbbar: mounted bottom=${bottom} raw=${rawForLog}');
    expect(code).toContain('lastReportedHeight = height;');
  });

  it('⚠ nothing about the fallback chain moved — this OTA changes one number', () => {
    // live → cached → estimate is untouched; only what "live" MEANS changed.
    const code = codeOnly(BAR);
    expect(code).toContain("Math.round(Dimensions.get('window').height * 0.36)");
    expect(code).toContain('const bottom = keyboardOffset > 0');
  });
});

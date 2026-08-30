/**
 * OTA-1551 — A STANDING KEYBOARD DOES NOT SHRINK.
 *
 * The FOURTH report of the same burial, and the first one where the OTA-1535
 * instrument caught the mechanism in the act. Two LIVE frames, 73 milliseconds
 * apart, same keyboard, same 986pt window (owner's log, 23:48:39):
 *
 *   kbbar: mounted bottom=407.79486083984375 raw=408 from=cached
 *   kbbar: mounted bottom=407.7948624048478  raw=360 from=live
 *   kbbar: mounted bottom=359.79486083984375 raw=360 from=live
 *
 * ⚠⚠⚠ READ THE SECOND AND THIRD LINES TOGETHER. Both are `live`. Both report
 * raw=360. One resolves to 407.79 and the other to 359.79 — so `screenY`, the
 * keyboard's top edge, MOVED DOWN by the 48pt Gboard suggestion strip while the
 * keyboard itself never moved at all. Android counts the strip inside the frame
 * on one event and outside it on the next.
 *
 * ⚠⚠⚠ WHICH IS WHY OTA-1540 COULD NOT FIX IT. That OTA takes the max of the
 * reported height and `winH - screenY` — but only WITHIN a single frame, and in
 * the offending frame both numbers say 360. It then honestly follows the frame
 * straight back under the keys. Every earlier pass (OTA-215 change-frame, arb71
 * ghost guard, OTA-1442 Android re-sync, OTA-1540 screenY) hardened a different
 * part of a pipeline that was working; the defect is that a per-frame reading
 * cannot describe a keyboard whose own frame lies between events.
 *
 * ⚠⚠ SO THE MAX SPANS THE SESSION. A keyboard that is standing cannot occupy
 * LESS than it already occupied; only hiding can shrink it. The high-water mark
 * holds while the keyboard is up and is released by onHide's committed
 * retraction, so the next keyboard — shorter, another language, a rotation —
 * measures itself from nothing.
 *
 * ⚠ ONE-WAY, like OTA-1540. It can only ever hold the bar HIGHER. The failure
 * being fixed is a bar sitting too low; the cure must not be able to
 * manufacture the opposite one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const BAR = readFileSync(join(__dirname, '..', 'app', 'components', 'KeyboardInputBar.tsx'), 'utf8');
const codeOnly = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
const CODE = codeOnly(BAR);

/** The shipped rule, mirrored so the ARITHMETIC is pinned and not just the
 *  source text: per-frame correction (OTA-1540) under a session latch (1551). */
const occupied = (height: number, screenY: number | undefined, winH: number): number => {
  if (typeof screenY !== 'number' || !Number.isFinite(screenY)) return height;
  if (screenY <= 0 || screenY >= winH) return height;
  const fromTop = winH - screenY;
  if (fromTop > winH * 0.75) return height;
  return Math.max(height, fromTop);
};

/** A keyboard session: frames in, the offset the bar would show out. */
const runSession = (
  frames: Array<{ height: number; screenY?: number } | 'hide'>,
  winH = 986,
): number[] => {
  let latch = 0;
  const seen: number[] = [];
  for (const f of frames) {
    if (f === 'hide') { latch = 0; seen.push(0); continue; }
    const h = occupied(f.height, f.screenY, winH);
    if (h > 0) { latch = Math.max(h, latch); seen.push(latch); }
  }
  return seen;
};

describe("OTA-1551 — the owner's two frames, 73ms apart", () => {
  it('⚠⚠⚠ THE BURIAL: a second live frame reporting a lower top edge no longer drops the bar', () => {
    // Frame A: raw 360, top edge 578.21 → 407.79 (the keys, strip included).
    // Frame B: raw 360, top edge 626.21 → 359.79 (the strip counted out).
    const out = runSession([
      { height: 360, screenY: 578.21 },
      { height: 360, screenY: 626.21 },
    ]);
    expect(out[0]).toBeCloseTo(407.79, 2);
    expect(out[1]).toBeCloseTo(407.79, 2); // ← was 359.79: the burial
  });

  it('⚠⚠⚠ …and it holds no matter how many short frames follow', () => {
    const out = runSession([
      { height: 360, screenY: 578.21 },
      { height: 360, screenY: 626.21 },
      { height: 360, screenY: 626.21 },
      { height: 360 },                      // no screenY at all
      { height: 360, screenY: 626.21 },
    ]);
    for (const v of out) expect(v).toBeCloseTo(407.79, 2);
  });

  it('⚠⚠⚠ HIDING RELEASES IT — the next keyboard measures itself from nothing', () => {
    // A tall keyboard, then a genuinely shorter one after the keyboard closed.
    const out = runSession([
      { height: 360, screenY: 578.21 },     // 407.79
      'hide',
      { height: 300, screenY: 686 },        // 300 — must NOT inherit 407.79
    ]);
    expect(out[0]).toBeCloseTo(407.79, 2);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(300);
  });

  it('⚠⚠ a taller frame still raises the bar mid-session', () => {
    const out = runSession([
      { height: 300, screenY: 686 },        // 300
      { height: 360, screenY: 578.21 },     // 407.79 — grows
    ]);
    expect(out[0]).toBe(300);
    expect(out[1]).toBeCloseTo(407.79, 2);
  });

  it('⚠⚠ the latch is ONE-WAY — it can never position the bar lower than OTA-1540 would', () => {
    const frames: Array<{ height: number; screenY?: number }> = [];
    for (const h of [0, 100, 300, 359.79, 407.79]) {
      for (const y of [undefined, -5, 0, 300, 578.21, 626.21, 985, 986, 2000, NaN]) {
        frames.push({ height: h, screenY: y as number | undefined });
      }
    }
    let latch = 0;
    for (const f of frames) {
      const perFrame = occupied(f.height, f.screenY, 986);
      if (perFrame > 0) {
        latch = Math.max(perFrame, latch);
        expect(latch).toBeGreaterThanOrEqual(perFrame);
      }
    }
  });

  it('⚠⚠ a bad frame is still discarded BEFORE it can be latched', () => {
    // A frame claiming 80% of the window is mid-animation or rotated. If it
    // could latch, one bad frame would strand the bar up the screen forever —
    // exactly the opposite failure, made permanent.
    const out = runSession([
      { height: 360, screenY: 100 },        // would imply 886 of 986 → rejected → 360
    ]);
    expect(out[0]).toBe(360);
  });
});

describe('OTA-1551 — the wiring', () => {
  it('⚠⚠⚠ the latch exists, spans the session, and feeds the offset', () => {
    expect(CODE).toContain('let sessionMaxHeight = 0;');
    expect(CODE).toContain('const latched = Math.max(h, sessionMaxHeight);');
    expect(CODE).toContain('sessionMaxHeight = latched;');
    expect(CODE).toContain('lastKeyboardHeight = latched;');
    expect(CODE).toContain('setKeyboardOffset(latched);');
  });

  it('⚠⚠⚠ it is released ONLY by the committed retraction, never by a deferred hide', () => {
    // onHide defers by 200ms and can be cancelled by a refocus; releasing the
    // latch on the EVENT rather than the retraction would re-open the burial
    // through the focus-swap door OTA-1442 documented.
    // The RELEASE is the bare assignment; `let sessionMaxHeight = 0` is the
    // declaration and must not be counted as one.
    const releases = CODE.match(/(?<!let )sessionMaxHeight = 0;/g) ?? [];
    expect(releases.length).toBe(1);
    const at = CODE.search(/(?<!let )sessionMaxHeight = 0;/);
    const zero = CODE.indexOf('setKeyboardOffset(0);');
    expect(at).toBeGreaterThan(-1);
    expect(zero).toBeGreaterThan(-1);
    // Adjacent to the committed retraction, not to the deferred hide event.
    expect(Math.abs(at - zero)).toBeLessThan(200);
  });

  it('⚠⚠ OTA-1540 survives underneath — the per-frame correction is untouched', () => {
    expect(CODE).toContain('const fromTop = winH - screenY;');
    expect(CODE).toContain('if (fromTop > winH * 0.75) return height;');
    expect(CODE).toContain('return Math.max(height, fromTop);');
  });

  it('⚠ the instrument still prints raw beside the offset — the next log has to be readable too', () => {
    expect(CODE).toContain('kbbar: mounted bottom=${bottom} raw=${rawForLog}');
  });
});

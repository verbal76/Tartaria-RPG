/**
 * OTA-1555 — A SENTENCE IS ALLOWED TO WRAP.
 *
 * ⚠⚠⚠ THE SECOND HALF OF A COMPLAINT WHOSE FIRST HALF WAS A DIFFERENT BUG.
 * Owner: *"text box grows as you type without wrapping."* OTA-1551's session
 * latch answered where the bar SITS — a standing keyboard cannot shrink — and
 * that was a real, separate defect with its own two live frames proving it. It
 * did nothing about what the FIELD does with a sentence, and nobody should
 * expect it to have.
 *
 * ⚠⚠⚠ THE FIELD WAS SINGLE-LINE. Neither TextInput carried `multiline`, so a
 * long action does not wrap: it scrolls sideways inside a fixed-height box and
 * the player can see only the tail of what he typed. In a game whose ENTIRE
 * input is typed English sentences — the parser exists to read them — that is
 * the field being wrong about its own job.
 *
 * ⚠⚠ BOTH FIELDS, BECAUSE THEY SHARE ONE DRAFT. OTA-1270 made the floating bar
 * and the in-flow box two views of a single piece of text. Fixing only the one
 * the owner happened to be looking at would mean the same sentence wraps or does
 * not depending on how he opened the keyboard — a difference with no meaning he
 * could ever learn.
 *
 * ⚠⚠ THE BAR GROWS UPWARD, WHICH IS WHY THIS DOES NOT REOPEN 1551. `styles.bar`
 * is absolutely positioned and anchored by `bottom` with no fixed height, so
 * extra lines push its TOP edge away from the keyboard. The latch is untouched
 * and is re-asserted below, because a wrap fix that quietly undid the burial fix
 * would be a bad trade.
 *
 * ⚠ CAPPED, AND THE CAP IS THE OTHER HALF OF THE FIX. With no ceiling a long
 * paste would grow the bar over the whole screen — the opposite failure, and a
 * worse one, since it would cover the feed the player is typing about.
 *
 * ⚠ AND ENTER STILL MEANS SEND. On Android a multiline field swallows the return
 * key as a newline; `blurOnSubmit` keeps `onSubmitEditing` firing, so the fastest
 * way to act is not quietly removed by a fix to something else.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const BAR = src('app/components/KeyboardInputBar.tsx');
const BOX = src('app/components/InputBox.tsx');

/** The props a field needs to wrap honestly, bounded, with Enter intact. */
const WRAP_PROPS = ['multiline', 'blurOnSubmit', 'scrollEnabled', 'textAlignVertical="top"'];

describe('OTA-1555 — both fields wrap', () => {
  it('⚠⚠⚠ the FLOATING BAR wraps, scrolls when it runs out of room, and keeps Enter', () => {
    for (const p of WRAP_PROPS) expect(BAR).toContain(p);
    expect(BAR).toContain('onSubmitEditing={handleSubmit}');
  });

  it('⚠⚠⚠ the IN-FLOW BOX does too — one draft, one behaviour', () => {
    // They are two views of the same text (OTA-1270). A sentence that wraps in
    // one and not the other is the player learning a rule that isn't one.
    for (const p of WRAP_PROPS) expect(BOX).toContain(p);
    expect(BOX).toContain('onSubmitEditing={handleSubmit}');
  });

  it('⚠⚠⚠ NEITHER can grow without a ceiling, and both stop at the same place', () => {
    // An uncapped field would cover the feed — the opposite failure, and worse.
    for (const file of [BAR, BOX]) {
      expect(file).toContain('minHeight: 38,');
      expect(file).toContain('maxHeight: 96,');
    }
  });

  it('⚠⚠ one line still looks exactly like one line — the resting state does not move', () => {
    // minHeight matches the old single-line box (8pt padding top and bottom
    // around 14pt text plus the border). A fix for long input that changed how
    // the bar looks when empty would be a visual regression for every player who
    // types short commands, which is most of them.
    expect(BAR).toContain('paddingVertical: 8,');
    expect(BAR).toContain('fontSize: 14,');
    expect(BOX).toContain('paddingVertical: 8,');
    expect(BOX).toContain('fontSize: 14,');
  });
});

describe('OTA-1555 — nothing that already worked was traded away', () => {
  it('⚠⚠⚠ the OTA-1551 SESSION LATCH is untouched', () => {
    // The burial fix and this one live in the same file and answer different
    // questions. A wrap fix that re-opened the burial would be a bad trade, and
    // the burial took four passes to find.
    expect(BAR).toContain('let sessionMaxHeight = 0;');
    expect(BAR).toContain('const latched = Math.max(h, sessionMaxHeight);');
    expect(BAR).toContain('setKeyboardOffset(latched);');
  });

  it('⚠⚠⚠ the OTA-1540 per-frame screenY correction is untouched', () => {
    expect(BAR).toContain('const h = occupiedHeight(height, screenY);');
    expect(BAR).toContain('if (fromTop > winH * 0.75) return height;');
  });

  it('⚠⚠ the bar is still anchored by its BOTTOM edge — that is what makes growth safe', () => {
    // If it were anchored by top or given a fixed height, extra lines would push
    // the field DOWN into the keyboard and this OTA would recreate the exact
    // burial 1551 fixed.
    const barStyle = BAR.slice(BAR.indexOf('  bar: {'), BAR.indexOf('  bar: {') + 320);
    expect(barStyle).toContain("position: 'absolute'");
    expect(barStyle).not.toMatch(/\n\s+height: \d/);
    expect(BAR).toContain('style={[styles.bar, { bottom }]}');
  });

  it('⚠ arb71\'s ghost guard and the OTA-1270 shared draft still stand', () => {
    expect(BAR).toContain('if (offscreen) { onHide(); return; }');
    // Retract keeps the draft; only submit clears it.
    expect(BAR).toContain('useGameStore.getState().setExplorationInputActive(false);');
  });
});

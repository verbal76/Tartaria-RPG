/**
 * OTA-1718 — THE KEYBOARD ATE THE SEND BUTTON.
 *
 * Reported on an iPhone 14, with a screenshot: on REPORT A BUG, tapping DESCRIBE
 * THE ISSUE opens the keyboard, the keyboard covers the SEND button, and the form
 * cannot be scrolled far enough to expose it. The owner's framing is the one this
 * OTA is built on:
 *
 *   *"this is not really a 'keyboard won't collapse' bug. The Report Bug screen
 *   is failing to remain actionable when the iOS keyboard is open. The user
 *   shouldn't have to know how to dismiss the keyboard just to submit."*
 *
 * ⚠⚠⚠ THE MECHANISM, and it is exact. The card was
 * `<KeyboardAvoidingView style={{maxHeight:'90%'}}><View card>…</View></KAV>`.
 * `behavior="padding"` shrinks the KAV's OWN content box when the keyboard
 * rises — but the card inside it had no height limit and no scroll, so it kept
 * its natural content height, overflowed the wrapper, and the button row landed
 * under the keyboard with no scroll path to it. Longer descriptions make it
 * worse, which is why the report notes that the failure lands hardest on exactly
 * the bug reports worth writing.
 *
 * ⚠⚠ SO A DONE BUTTON IS NOT THE FIX, and this is the owner's other point:
 * *"don't make 'dismiss keyboard' the primary fix… otherwise you'll eventually
 * find another text field where the same underlying layout problem resurfaces."*
 * The fix is HEADER (fixed) · BODY (scrolls, flexShrink) · FOOTER (pinned),
 * inside a card whose ceiling is the keyboard's MEASURED top edge. DONE and
 * tap-outside-to-dismiss ship too, as courtesies on top.
 *
 * ⚠ AND THE AUDIT WAS THE POINT. *"Audit other text-entry screens for the same
 * keyboard-obscures-primary-action pattern rather than assuming Report Bug is
 * the only occurrence."* It was not the only occurrence. Every text-entry
 * surface in the app is enumerated below, and the instrument fails on a new one.
 *
 * ⚠ WHAT THIS SUITE CANNOT DO, said plainly: it cannot open a keyboard. The
 * failure needs a real OS and a real screen. What it can do is check the
 * DECISION — the same split keyboardPoll.ts made for the input bar. The layout
 * arithmetic lives in engine/keyboardSafeCard.ts, so the acceptance criteria
 * ("on iPhone 14 and iPhone SE 3, with the keyboard open, the player can reach
 * SEND") are run here against every device on the list instead of being asserted
 * in a commit message.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CARD_MARGIN,
  MIN_BODY_HEIGHT,
  DEVICE_PROFILES,
  bodyHeight,
  cardMaxHeight,
  footerIsReachable,
  keyboardInset,
  visibleBottom,
  type CardChrome,
} from '../app/engine/keyboardSafeCard';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** REPORT A BUG's fixed chrome, measured from its own styles: the title row
 *  (title + rule + margin), the button row, and the card's padding + borders.
 *  Generous on every count — if the real chrome is smaller the player has MORE
 *  room, so an over-estimate can only make this test stricter. */
const BUG_REPORT_CHROME: CardChrome = { header: 44, footer: 56, padding: 30 };

describe('OTA-1718 — ⚠⚠⚠ the acceptance test, as arithmetic', () => {
  it('SEND is reachable with the keyboard open on EVERY device on the list', () => {
    const unreachable = Object.entries(DEVICE_PROFILES)
      .filter(([, vp]) => !footerIsReachable(vp, BUG_REPORT_CHROME))
      .map(([name]) => name);
    expect(unreachable).toEqual([]);
  });

  it('⚠⚠ THE 4.7" SE IS THE ONE THAT MATTERS, so its numbers are spelled out', () => {
    // Owner: "Do not solve this only for iPhone 14 dimensions… particularly
    // iPhone SE 3 / 4.7-inch, since that is now a test target." 667pt tall, and
    // a keyboard that takes 260 of them.
    const se = DEVICE_PROFILES['iPhone SE 3']!;
    expect(keyboardInset(se)).toBe(260);
    expect(visibleBottom(se)).toBe(407);
    expect(cardMaxHeight(se)).toBe(407 - CARD_MARGIN * 2);      // 375
    expect(bodyHeight(se, BUG_REPORT_CHROME)).toBe(375 - 130);  // 245
    expect(footerIsReachable(se, BUG_REPORT_CHROME)).toBe(true);
  });

  it('⚠ and the answer does not depend on how much was typed', () => {
    // The body scrolls, so a one-line report and a twelve-line report resolve to
    // the same layout. That is the difference between this and a fix that only
    // works until somebody writes a paragraph — which is the case the report
    // says matters most.
    const se = DEVICE_PROFILES['iPhone SE 3']!;
    for (const bodyContent of [20, 200, 2000]) {
      expect({ bodyContent, reachable: footerIsReachable(se, BUG_REPORT_CHROME) })
        .toEqual({ bodyContent, reachable: true });
    }
  });

  it('the rule is honest: a card with too much chrome is reported UNREACHABLE', () => {
    // An instrument that returns true for everything measures nothing. A footer
    // and header that eat the SE's whole box must fail.
    const se = DEVICE_PROFILES['iPhone SE 3']!;
    expect(footerIsReachable(se, { header: 200, footer: 200, padding: 30 })).toBe(false);
    expect(bodyHeight(se, { header: 200, footer: 200, padding: 30 })).toBeLessThan(MIN_BODY_HEIGHT);
  });

  it('a closed keyboard costs nothing, and nonsense from the OS cannot crash it', () => {
    const closed = { windowHeight: 844, keyboardTop: 844 };
    expect(keyboardInset(closed)).toBe(0);
    expect(cardMaxHeight(closed)).toBe(844 - CARD_MARGIN * 2);
    // A device reporting a top edge off the bottom of the world, or NaN.
    expect(keyboardInset({ windowHeight: 844, keyboardTop: 9999 })).toBe(0);
    expect(keyboardInset({ windowHeight: 844, keyboardTop: -5 })).toBe(844);
    expect(cardMaxHeight({ windowHeight: 844, keyboardTop: Number.NaN })).toBe(844 - CARD_MARGIN * 2);
  });
});

describe('OTA-1718 — ⚠⚠ the shape, in the shell every card now shares', () => {
  const SHELL = src('app', 'components', 'KeyboardSafeCard.tsx');

  it('header fixed, body shrinks, footer pinned', () => {
    // `flexShrink: 1` on the body is the single line that keeps the buttons on
    // screen: the middle gives up height as the keyboard rises, the footer never
    // does. BrandedModal has had this since OTA-1614; it was never generalised,
    // so every other card grew its own layout and had to be reported one at a
    // time before anyone looked.
    expect(SHELL.includes('body: { flexShrink: 1, flexGrow: 0 }')).toBe(true);
    expect(SHELL.includes('maxHeight: cardMaxHeight(vp)')).toBe(true);
    // The footer sits OUTSIDE the ScrollView.
    const render = SHELL.slice(SHELL.indexOf('<ScrollView'), SHELL.indexOf('</Modal>'));
    expect(render.indexOf('</ScrollView>')).toBeLessThan(render.indexOf('{footer}'));
  });

  it('⚠ the keyboard is MEASURED, not assumed', () => {
    // `endCoordinates.screenY` is the keyboard's real top edge and already
    // includes the predictive bar and the home indicator — the "respect
    // safe-area and keyboard insets rather than using a fixed bottom
    // padding/offset" the report asked for.
    expect(SHELL.includes('c.screenY')).toBe(true);
    expect(SHELL.includes('keyboardWillShow')).toBe(true);
    expect(SHELL.includes('keyboardDidChangeFrame')).toBe(true);
    // And it copes with the keyboard already being up when the card mounts.
    expect(SHELL.includes('k.isVisible()')).toBe(true);
    // No magic numbers standing in for the keyboard.
    expect(/paddingBottom:\s*\d{2,}/.test(SHELL)).toBe(false);
  });

  it('⚠⚠⚠ tapping outside closes the KEYBOARD first, not the report', () => {
    // The report asks for tap-outside-to-dismiss "if that fits the existing UI".
    // On this UI it did not, and shipping it naively would have been a worse
    // defect than the one being fixed: the scrim's press handler CANCELS, so on
    // a bug report that had taken a paragraph to write, a stray tap would have
    // thrown the whole thing away. Keyboard first; a second tap closes.
    expect(SHELL.includes('if (inset > 0) { Keyboard.dismiss(); return; }')).toBe(true);
  });

  it('a control in the body works on the first tap while the keyboard is open', () => {
    expect(SHELL.includes('keyboardShouldPersistTaps="handled"')).toBe(true);
  });
});

describe('OTA-1718 — ⚠ REPORT A BUG itself', () => {
  const BUG = src('app', 'components', 'BugReportModal.tsx');

  it('the wrapper that caused it is gone', () => {
    // maxHeight on the wrapper, none on the card, no scroll in between.
    expect(BUG.includes('KeyboardAvoidingView')).toBe(false);
    expect(BUG.includes("maxHeight: '90%'")).toBe(false);
    expect(BUG.includes('<KeyboardSafeCard')).toBe(true);
  });

  it('SEND is in the pinned footer, not at the end of the content', () => {
    // Positional: both buttons sit between the `footer={(` prop and the first
    // line of the scrolling children.
    const footerStart = BUG.indexOf('footer={(');
    const childrenStart = BUG.indexOf('Pick what this is about');
    expect(footerStart).toBeGreaterThan(0);
    for (const needle of ["'SEND LOG' : 'SEND'", '>CANCEL<']) {
      const at = BUG.indexOf(needle);
      expect({ needle, inFooter: at > footerStart && at < childrenStart }).toEqual({ needle, inFooter: true });
    }
  });

  it('⚠ the nested scroll is gone — one scrolling surface, not two', () => {
    // The slot list was its own ScrollView with its own maxHeight, inside a card
    // that could not scroll. Two nested vertical scrolls on a 4.7" screen is a
    // thumb trap even when the layout is right.
    expect(BUG.includes('<ScrollView')).toBe(false);
    expect(BUG.includes('maxHeight: 180')).toBe(false);
  });

  it('and the DONE bar exists — as the courtesy, not the fix', () => {
    expect(BUG.includes('InputAccessoryView')).toBe(true);
    expect(BUG.includes('inputAccessoryViewID={Platform.OS === \'ios\' ? DESCRIBE_ACCESSORY : undefined}')).toBe(true);
    expect(BUG.includes('Done — close the keyboard')).toBe(true);
  });
});

/**
 * ⚠⚠⚠ THE AUDIT, AND THE INSTRUMENT THAT KEEPS IT TRUE.
 *
 * Every file in app/ that renders a `<TextInput` is listed here with the
 * mechanism that keeps its primary action reachable. A file that grows a
 * TextInput and is not on this list fails — which is the whole point: REPORT A
 * BUG was reported because nothing was watching, and the two naming modals had
 * no keyboard handling of ANY kind and had simply never been reported yet.
 */
const KEYBOARD_MECHANISM: Record<string, string> = {
  // — converted to the shared shell (measured ceiling, pinned footer) —
  'components/BugReportModal.tsx': 'KeyboardSafeCard',
  'components/FeedbackModal.tsx': 'KeyboardSafeCard',
  'components/InvitePlaytesterModal.tsx': 'KeyboardSafeCard',
  // — whole card scrolls; given the MEASURED inset so it has somewhere to go —
  'components/DogOnboardingModal.tsx': 'useCardViewport',
  'components/GolemNamingModal.tsx': 'useCardViewport',
  // — already the right shape: OTA-1614 built header/scroll/pinned-buttons here —
  'components/BrandedModal.tsx': 'KeyboardAvoidingView',
  // — already keyboard-aware, each for its own reason —
  'components/ApproachModal.tsx': 'KeyboardAvoidingView',
  'components/SearchModal.tsx': 'KeyboardAvoidingView',
  'components/KeyboardInputBar.tsx': 'Keyboard.addListener',
  'components/InputBox.tsx': 'Keyboard',
  // — screen-level scrolls: iOS's own inset is the correct mechanism outside a
  //   native <Modal>, where it is unreliable —
  'screens/ActionReferenceScreen.tsx': 'automaticallyAdjustKeyboardInsets',
};

/** ⚠ Surfaces with a TextInput and NO primary action beneath it — nothing can be
 *  covered, so there is nothing to fix. Each says why, because "it's fine" with
 *  no reason is how the next one gets waved through. */
const NO_ACTION_BELOW: Record<string, string> = {
  'components/LoreCodexBody.tsx': 'a codex search field; the results are the page, and there is no submit',
  'components/SearchSortBar.tsx': 'a filter bar rendered above its own list, never below one',
  'components/NumberStepper.tsx': 'a bare numeric field; its +/- controls sit beside it, not under it',
};

describe('OTA-1718 — ⚠⚠⚠ the audit: every text-entry surface, accounted for', () => {
  const FILES = [
    ...Object.keys(KEYBOARD_MECHANISM),
    ...Object.keys(NO_ACTION_BELOW),
  ];

  it('THE INSTRUMENT — no surface with a text field is unaccounted for', () => {
    const { readdirSync } = require('fs') as typeof import('fs');
    const found: string[] = [];
    for (const dir of ['components', 'screens']) {
      for (const f of readdirSync(join(__dirname, '..', 'app', dir))) {
        if (!f.endsWith('.tsx')) continue;
        if (src('app', dir, f).includes('<TextInput')) found.push(`${dir}/${f}`);
      }
    }
    // The fixture has to be looking at something.
    expect(found.length).toBeGreaterThanOrEqual(10);
    expect(found.filter((f) => !FILES.includes(f))).toEqual([]);
  });

  it('and every listed mechanism is actually present in the file it claims', () => {
    // A table that drifts from the code is worse than none — it reads as an
    // audit that was done.
    const missing: string[] = [];
    for (const [file, mech] of Object.entries(KEYBOARD_MECHANISM)) {
      const [dir, name] = file.split('/') as [string, string];
      if (!src('app', dir, name).includes(mech)) missing.push(`${file} claims ${mech}`);
    }
    expect(missing).toEqual([]);
  });

  it('⚠⚠ the two naming modals had NO keyboard handling at all until now', () => {
    // Both wrapped the whole card in a ScrollView, which looks like it solves
    // the problem and does not: inside a native <Modal> on iOS a ScrollView gets
    // no keyboard inset, so the content can only scroll until the last element
    // sits at the BOTTOM of the frame — under the keyboard. Naming your dog is
    // the one thing you type on that screen, so the confirm was what got
    // covered. Neither had ever been reported, which is the argument for the
    // audit rather than the patch.
    for (const f of ['DogOnboardingModal.tsx', 'GolemNamingModal.tsx']) {
      const s = src('app', 'components', f);
      expect({ f, measured: s.includes('paddingBottom: 32 + kbInset') }).toEqual({ f, measured: true });
      expect({ f, hook: s.includes('keyboardInset(useCardViewport())') }).toEqual({ f, hook: true });
      // ⚠ And the hook sits ABOVE the `return null` guards. My first cut put it
      // beside the render, which is a conditional hook — a different bug, added
      // while fixing this one. Both files guard on `!ready` before rendering,
      // so it would have fired on the dwell timer every time the card opened.
      expect({ f, order: s.indexOf('const kbInset') < s.indexOf('return null') })
        .toEqual({ f, order: true });
    }
  });

  it('⚠ nobody solved it with a fixed offset', () => {
    // "Respect safe-area and keyboard insets rather than using a fixed bottom
    // padding/offset." A hard-coded lift is the fix that works on the phone it
    // was tuned on and fails on the SE.
    for (const [file] of Object.entries(KEYBOARD_MECHANISM)) {
      const [dir, name] = file.split('/') as [string, string];
      const s = src('app', dir, name);
      expect({ file, fixedOffset: /keyboardVerticalOffset=\{\d+\}/.test(s) }).toEqual({ file, fixedOffset: false });
    }
  });
});

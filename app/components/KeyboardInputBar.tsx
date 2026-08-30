// OTA-190 — Floating input popup that appears above the soft keyboard
// when the player is typing on the Exploration screen. Player ask:
// "when the keyboard opens up it puts a text box popup above it so
// you always see what your typing and can send it from there using
// the keyboard send button. the act button is still needed for text
// copy/paste from other sections so do not get rid of that."
//
// Why a popup instead of lifting the existing InputBox above the
// keyboard:
//   - The ExplorationScreen column has minHeight requirements
//     (StatsPanel 165 + sceneBar + objective chip + vendor banner +
//     feed minimum) that push the in-flow InputBox below the visible
//     bottom edge when the keyboard claims its share of the viewport.
//     A separate floating popup sidesteps the flex-overflow problem
//     entirely — it lives in absolute coords above the keyboard,
//     independent of the screen's column layout.
//   - Mounts OUTSIDE the AppShell's scaled wrapper so positioning
//     math stays in device-pixel space (no need to divide by
//     ui.scale). The scaled wrapper inside which ExplorationScreen
//     renders doesn't extend down here.
//   - Original InputBox + Act button stay completely as-is. Players
//     who paste long text from other apps still tap the original
//     field, long-press → Paste → tap Act, no keyboard needed.
//
// Behavior:
//   - Renders only when the keyboard is open AND the player is on
//     the Exploration screen. Other screens have their own input
//     fields that aren't typically covered by the keyboard.
//   - Autofocuses on mount so focus moves from the underlying
//     InputBox TextInput to this one, and what the player types
//     lands here (visible above the keyboard) instead of in the
//     covered field below.
//   - Keyboard's native "send" / "go" key (returnKeyType="send" +
//     onSubmitEditing) submits. An inline ACT button mirrors the
//     existing layout for parity with the in-flow InputBox.
//   - Vendor-leave warning is intentionally NOT replicated here.
//     Typing "go north" in the popup is a deliberate command (the
//     player typed the verb + direction), whereas the warning was
//     designed to catch fat-fingered taps on the cardinal quick
//     buttons + the in-flow input. Anyone typing in the popup is
//     making a conscious move command.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { useGameStore } from '../state/gameStore';
import { keyboardPollAction } from '../engine/keyboardPoll';

// arb-fix — cache the last real keyboard height ACROSS mounts/opens. The New
// Architecture (Fabric) on Android drops the keyboardDidShow height event ~half
// the time, so a freshly-mounted bar may have no live height yet. We now mount on
// a reliable focus signal (see below) rather than on the height event, and fall
// back to this cached value (then a screen-fraction estimate) so the bar always
// sits just above the keyboard even when the event never arrives.
let lastKeyboardHeight = 0;
// OTA-1540 — the last RAW `endCoordinates.height` the platform reported, kept
// only so the instrument can print it beside the corrected offset. When these
// differ, the screenY path is doing its job and the next log says so outright.
let lastReportedHeight = 0;
// OTA-1535 — dedup key so the instrument writes once per distinct state, not per render.
let bottomLoggedFor = '';

export function KeyboardInputBar() {
  const screen = useGameStore((s) => s.currentScreen);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const inputModalOpen = useGameStore((s) => s.inputModalOpen);
  // arb-fix — the bar's presence is driven by THIS (set when the player taps the
  // in-flow input), not by the flaky keyboard-height event. Height only positions
  // it. That split is the fix for "the keyboard covers the box half the time".
  const active = useGameStore((s) => s.explorationInputActive);
  const setActive = useGameStore((s) => s.setExplorationInputActive);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  // ⚠⚠ OTA-1270 — shared draft (see gameStore.explorationDraft). This bar and
  // the in-flow InputBox render the SAME text; either ACT submits it.
  const text = useGameStore((s) => s.explorationDraft);
  const setText = useGameStore((s) => s.setExplorationDraft);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // OTA-215 — robustness fixes for intermittent "bar doesn't push
    // above the keyboard" reports. Three changes:
    //
    // (a) Listen to keyboardDidChangeFrame in addition to show/hide.
    //     New Architecture (Fabric) on Android sometimes drops the
    //     show event but always fires change-frame. We use the most
    //     recent positive height we see from any listener.
    //
    // (b) Defer the hide-zero-out by 200ms so a quick refocus
    //     (player taps a different TextInput; Android briefly fires
    //     keyboardDidHide → keyboardDidShow during the focus swap)
    //     doesn't cause the bar to flicker out and back in.
    //
    // (c) Initial sync from Keyboard.metrics() if available. Catches
    //     the case where the keyboard is already up when we mount
    //     (came from another screen with keyboard open).
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    // OTA-1551 — the standing keyboard's high-water mark. Held for as long as
    // this keyboard is up; cleared only by the committed retraction in onHide,
    // so the NEXT keyboard measures itself from nothing.
    let sessionMaxHeight = 0;
    // ⚠⚠⚠ OTA-1540 — POSITION FROM THE KEYBOARD'S TOP EDGE, NOT ITS REPORTED
    // HEIGHT. The OTA-1535 instrument caught this on the owner's device:
    //
    //   23:28 session  kbbar: mounted bottom=407.79 from=live winH=986   (fine)
    //   01:10 session  kbbar: mounted bottom=359.79 from=live winH=986   ("no text box")
    //                  [player] still none, it's too low I can see the very top edge of it
    //
    // Same device, same 986pt window, two DIFFERENT live keyboard heights exactly
    // 48.0 apart — a Gboard suggestion strip. Android reports the keyboard's base
    // height in `endCoordinates.height` and draws the strip on top without a
    // follow-up frame event, so the bar believed 359.79 while the keys actually
    // occupied 407.79 and buried it with 48px of its top edge showing.
    //
    // ⚠ THE LISTENERS WERE NEVER THE BUG, which is why three passes missed it.
    // OTA-215 added change-frame, arb71 added the ghost guard, OTA-1442 added the
    // Android isVisible() re-sync — the event fires reliably. The NUMBER it
    // carries is short. `screenY` is the keyboard's top edge in window space, so
    // `winH - screenY` measures what the keyboard actually occupies, strip
    // included, and it is already read below for the ghost-bar guard.
    //
    // ⚠ MAX, NOT REPLACE. screenY is used only when it is present and sane; the
    // larger of the two wins, so a platform that reports screenY oddly can never
    // position the bar LOWER than the old behaviour did. The failure mode this
    // fixes is the bar sitting too low; it must not be able to create the
    // opposite one.
    const occupiedHeight = (height: number, screenY?: number): number => {
      const winH = Dimensions.get('window').height;
      if (typeof screenY !== 'number' || !Number.isFinite(screenY)) return height;
      if (screenY <= 0 || screenY >= winH) return height;
      const fromTop = winH - screenY;
      // A keyboard taking more than three quarters of the window is a bad frame,
      // not a tall keyboard.
      if (fromTop > winH * 0.75) return height;
      return Math.max(height, fromTop);
    };
    // ⚠⚠⚠ OTA-1551 — A STANDING KEYBOARD DOES NOT SHRINK.
    //
    // Fourth report of this burial, and the OTA-1540 instrument finally caught
    // it in the act. Two LIVE frames 73ms apart, same keyboard, same 986pt
    // window (owner's log, 23:48:39):
    //
    //   bottom=407.79  raw=360  from=live   — corrected (screenY said 578.21)
    //   bottom=359.79  raw=360  from=live   — NOT corrected; screenY moved down
    //
    // Android reports the Gboard suggestion strip inside the frame on one
    // event and outside it on the next, so `screenY` genuinely slides by the
    // 48pt strip while the keyboard itself never moves. OTA-1540 reads each
    // frame in isolation and honestly follows the second one — straight back
    // under the keys. Its max() cannot help: it compares the two numbers
    // WITHIN a frame, and in that frame both say 360.
    //
    // ⚠⚠ SO THE MAX SPANS THE SESSION, NOT THE FRAME. A keyboard that is
    // standing cannot occupy less than it already occupied — only HIDING can
    // shrink it. The high-water mark holds while the keyboard is up and is
    // cleared by onHide's committed retraction, so the next keyboard (a
    // shorter one, another language, a rotation) measures itself from nothing.
    //
    // ⚠ Like OTA-1540, this is one-way: it can only ever hold the bar HIGHER.
    // The failure being fixed is a bar sitting too low, and the cure must not
    // be able to manufacture the opposite one.
    const applyHeight = (height: number, screenY?: number) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const h = occupiedHeight(height, screenY);
      if (h > 0) {
        lastReportedHeight = height;
        const latched = Math.max(h, sessionMaxHeight);
        sessionMaxHeight = latched;
        lastKeyboardHeight = latched;
        setKeyboardOffset(latched);
      }
    };
    const onShow = (e: { endCoordinates: { height: number; screenY?: number } }) => {
      applyHeight(e.endCoordinates?.height ?? 0, e.endCoordinates?.screenY);
    };
    const onChangeFrame = (e: { endCoordinates: { height: number; screenY?: number } }) => {
      // On iOS the keyboard can change height mid-flight (predictive
      // suggestions, language bar). On Android Fabric this is often
      // the only event we get. Use it as a secondary trigger.
      const h = e.endCoordinates?.height ?? 0;
      const screenY = e.endCoordinates?.screenY;
      // arb71 — GHOST-BAR fix. On iOS the keyboard keeps a non-zero height
      // even after it slides off-screen; only its top edge (screenY) moves to
      // the window bottom. The old logic cleared the hide timer on any h>0
      // change-frame but never zeroed the offset on the final off-screen
      // frame (h was still >0), so the floating bar got stuck mid-screen.
      // Treat a change-frame whose top edge is at/below the window bottom as a
      // HIDE so the offset always returns to 0 when the keyboard is gone.
      const winH = Dimensions.get('window').height;
      const offscreen = typeof screenY === 'number' && screenY >= winH - 1;
      if (offscreen) { onHide(); return; }
      if (h > 0) applyHeight(h, screenY);
    };
    const onHide = () => {
      // Defer the zero-out so quick refocus events don't flicker.
      // If a show event arrives within 200ms, applyHeight cancels
      // this timer.
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        // ⚠⚠ OTA-1442 — TRUST THE KEYBOARD, NOT THE EVENT. On Android's New
        // Architecture the focus swap (in-flow field → this bar's autoFocus)
        // fires keyboardDidHide and then DROPS the matching didShow ~half the
        // time under JS load — the tutorial's pulse beats were the worst case.
        // The old timer then retracted the bar and WIPED the draft while the
        // keyboard was still standing: the owner typed blind into the covered
        // in-flow field with no ACT button. So before retracting, ask the
        // keyboard itself; if it is still up, this hide was a lie — keep the
        // bar and re-sync the height instead. Android only: iOS reports stale
        // non-zero metrics during the dismiss animation (the arb71 ghost),
        // and its events are reliable anyway.
        if (Platform.OS === 'android') {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const k = Keyboard as any;
            if (typeof k.isVisible === 'function' && k.isVisible()) {
              const m = typeof k.metrics === 'function' ? k.metrics() : null;
              if (m?.height) applyHeight(m.height, m.screenY);
              return;
            }
          } catch { /* metrics unavailable — fall through to the retract */ }
        }
        setKeyboardOffset(0);
        // OTA-1551 — the keyboard is really gone: release the latch.
        sessionMaxHeight = 0;
        setText('');
        // Keyboard is really gone (not a quick refocus) → retract the bar.
        useGameStore.getState().setExplorationInputActive(false);
      }, 200);
    };
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow,
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide,
    );
    // keyboardDidChangeFrame is available on both platforms; it's
    // the most reliable cross-platform "keyboard moved" signal under
    // the New Architecture.
    let changeFrameSub: ReturnType<typeof Keyboard.addListener> | null = null;
    try {
      changeFrameSub = Keyboard.addListener('keyboardDidChangeFrame' as Parameters<typeof Keyboard.addListener>[0], onChangeFrame);
    } catch { /* older RN doesn't support this event — fine */ }

    // Initial sync — if keyboard is already up, grab metrics.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const k = Keyboard as any;
      const visible = typeof k.isVisible === 'function' ? k.isVisible() : false;
      if (visible && typeof k.metrics === 'function') {
        const m = k.metrics();
        if (m?.height) applyHeight(m.height, m.screenY);
      }
    } catch { /* metrics API not available on this RN — fine */ }

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      showSub.remove();
      hideSub.remove();
      changeFrameSub?.remove();
    };
  }, []);

  // OTA-933 — RELIABILITY POLL, reworked from the first cut (which armed it once on MOUNT, so
  // a keyboard opened any later never got the net — "still doesn't always get pushed up").
  // Android-only: Fabric drops the height events ~half the time there, while iOS events
  // are reliable AND iOS metrics() reports a stale non-zero height during the dismiss
  // animation (the arb71 quirk), so polling iOS could strand the bar. Re-armed for EVERY
  // typing session (keyed on `active`), each tick decided by the pure keyboardPollAction
  // helper: a hide in flight stops the poll before it can act; a settled height snaps the
  // bar; silence keeps polling to a ~1s cap. Living OUTSIDE the event effect, this path
  // structurally CANNOT cancel the hide retract (no access to hideTimer) — it only
  // positions the bar, so even a stale read that slips the visibility check is harmless.
  useEffect(() => {
    if (!active || Platform.OS !== 'android') return undefined;
    let polls = 0;
    const pollTimer = setInterval(() => {
      polls += 1;
      let action: ReturnType<typeof keyboardPollAction> = 'continue';
      let height = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const k = Keyboard as any;
        const visible = typeof k.isVisible === 'function' ? k.isVisible() : null;
        const m = typeof k.metrics === 'function' ? k.metrics() : null;
        height = m?.height ?? 0;
        action = keyboardPollAction(visible, height);
      } catch { /* metrics unavailable — keep waiting for the event path */ }
      if (action === 'apply') {
        lastKeyboardHeight = height;
        setKeyboardOffset(height);
        clearInterval(pollTimer);
        return;
      }
      if (action === 'stop' || polls >= 10) clearInterval(pollTimer); // hide won, or ~1s cap
    }, 100);
    return () => clearInterval(pollTimer);
  }, [active]);

  // ⚠⚠ OTA-1228 — NEVER ON DESKTOP. This whole component solves ONE problem:
  // a soft keyboard covering the input field. A PC has no soft keyboard, so on
  // the desktop build it mounted for no reason and rendered as a stray bar
  // stretched edge-to-edge across the middle of a 2259px window, floating over
  // the game with a second copy of the text the player was typing.
  //
  // Owner, on the PC build: *"clicked the text bar and this is how it popped
  // up ... i should just be able to type in the existing text bar, not have it
  // create a new one."* Exactly right — the in-flow InputBox is never covered
  // on desktop, so there is nothing to lift it above.
  //
  // ⚠ It also positions in DEVICE-PIXEL space on purpose (see the header note),
  // deliberately outside the AppShell's scaled/centred wrapper — which is why
  // it ignores CONTENT_MAX_WIDTH and spans the whole window rather than the
  // game column. That is correct for its real job and wrong for every part of
  // this one, so the fix is not to constrain it: it is not to mount it.
  //
  // ⚠ MOBILE IS UNTOUCHED — Platform.OS is 'ios'/'android' there and the bar
  // behaves exactly as OTA-190/215 built it.
  if (Platform.OS === 'web') return null;
  // Only render on the Exploration screen. Other screens have their
  // own input fields that aren't covered by the keyboard, so a
  // floating popup would just clutter them.
  if (screen !== 'exploration') return null;
  // arb-fix — mount when the player has focused the in-flow input (a reliable
  // React focus signal), NOT when a keyboard-height event arrived. On the New
  // Architecture that event is dropped ~half the time, which used to leave this
  // bar unmounted and the field covered. The autoFocus below keeps the keyboard
  // the field already raised, so this can never pop the keyboard unbidden.
  if (!active) return null;
  // A popup with its own text field is open (Ask the Arbiter, Search,
  // Salvage, Approach). That modal renders in its own window on top and
  // is keyboard-avoided; the floating bar would only mount behind it and
  // steal focus from the visible field. Stand down.
  if (inputModalOpen) return null;

  // Position just above the keyboard. Prefer the live height; fall back to the
  // last real height we ever saw (cached across opens), then a screen-fraction
  // estimate for the very first open before any height event lands.
  const bottom = keyboardOffset > 0
    ? keyboardOffset
    : lastKeyboardHeight > 0
      ? lastKeyboardHeight
      : Math.round(Dimensions.get('window').height * 0.36);

  // ⚠⚠⚠ OTA-1535 — AN INSTRUMENT, NOT A FIX, AND DELIBERATELY SO.
  //
  // The owner: *"when you type take rope, the text bar was buried again, this is a
  // huge immersion breaker and confusing"* — and, asked when: *"every time I am in
  // the tutorial at the take rope part, and only rarely in game."*
  //
  // OTA-1075 is the SAME BEAT reported before ("the text bar didn't pop up with
  // the keyboard, i had to back up and hit it again") and its fix — an explicit
  // focus() on press-in — addressed focus not landing. This is a different
  // symptom: the bar exists and is covered. Reading this file cannot settle why.
  // The offset chain has three fallbacks and looks sound; whether the bar is
  // under the keyboard, under the feed, or never mounted at all are three
  // different bugs with three different fixes, and the source distinguishes none
  // of them.
  //
  // So rather than ship a guess at the beat the owner called a huge immersion
  // breaker, this records the three numbers that DO distinguish them — which
  // fallback rung supplied the offset, what the window height was, and which
  // tutorial beat was live — into the log he already sends. One line per mount,
  // no behaviour change. His next log answers it.
  const beatForLog = useGameStore.getState().tutorialStep;
  const rung = keyboardOffset > 0 ? 'live' : lastKeyboardHeight > 0 ? 'cached' : 'estimate';
  // OTA-1540 — `raw=` is the height the platform reported. When bottom > raw the
  // screenY correction fired and the number in between is what used to bury the
  // bar (48.0 on the owner's Gboard). Keeping the instrument in is the point: a
  // fix for a bug measured on one device is a hypothesis until his next log.
  const rawForLog = lastReportedHeight > 0 ? Math.round(lastReportedHeight) : 0;
  if (bottomLoggedFor !== `${rung}:${bottom}:${beatForLog}`) {
    bottomLoggedFor = `${rung}:${bottom}:${beatForLog}`;
    try {
      useGameStore.getState().appendLog(
        'debug',
        `kbbar: mounted bottom=${bottom} raw=${rawForLog} from=${rung} winH=${Math.round(Dimensions.get('window').height)} beat=${beatForLog ?? '-'}`,
      );
    } catch { /* an instrument may never break the bar it measures */ }
  }

  const retract = () => {
    // ⚠ OTA-1270 — retract no longer WIPES the draft. Closing the keyboard
    // without sending used to eat what was typed here while the in-flow box
    // kept its own copy; with one shared draft, backing out keeps the text
    // sitting in the in-flow box, ready for its ACT. Submit clears explicitly.
    useGameStore.getState().setExplorationInputActive(false);
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    submit(trimmed);
    setText('');
    inputRef.current?.clear();
    retract();
    Keyboard.dismiss();
  };

  return (
    <View
      style={[styles.bar, { bottom }]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="What do you do?"
          placeholderTextColor="#c9a86a"
          onSubmitEditing={handleSubmit}
          // arb-fix — when this field loses focus the typing session is over
          // (keyboard dismissed, back button, focus moved away). Retract the bar
          // so it can't linger on-screen after the keyboard closes. Deferred one
          // tick so a same-frame refocus (Android focus-swap) doesn't flicker it.
          onBlur={() => { setTimeout(() => { if (!Keyboard.isVisible?.()) retract(); }, 150); }}
          returnKeyType="send"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
        />
        <TouchableOpacity accessibilityRole="button" style={styles.send} onPress={handleSubmit}>
          <Text style={styles.sendText}>Act</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#0a0908',
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    fontSize: 14,
  },
  send: {
    backgroundColor: '#3a342c',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
  },
  sendText: { color: '#e6d8b3', fontWeight: '700' },
});

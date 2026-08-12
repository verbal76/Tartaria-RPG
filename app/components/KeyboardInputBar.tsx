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
  const [text, setText] = useState('');
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
    const applyHeight = (height: number) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (height > 0) { lastKeyboardHeight = height; setKeyboardOffset(height); }
    };
    const onShow = (e: { endCoordinates: { height: number } }) => {
      applyHeight(e.endCoordinates?.height ?? 0);
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
      if (h > 0) applyHeight(h);
    };
    const onHide = () => {
      // Defer the zero-out so quick refocus events don't flicker.
      // If a show event arrives within 200ms, applyHeight cancels
      // this timer.
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        setKeyboardOffset(0);
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
        if (m?.height) applyHeight(m.height);
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

  const retract = () => {
    setText('');
    useGameStore.getState().setExplorationInputActive(false);
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    submit(trimmed);
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

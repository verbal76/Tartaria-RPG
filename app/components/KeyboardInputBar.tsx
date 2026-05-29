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
} from 'react-native';
import { useGameStore } from '../state/gameStore';

export function KeyboardInputBar() {
  const screen = useGameStore((s) => s.currentScreen);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardOffset(e.endCoordinates.height);
    };
    const onHide = () => {
      setKeyboardOffset(0);
      // Clear stale text so re-opening the keyboard starts fresh.
      setText('');
    };
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow,
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide,
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Only render on the Exploration screen. Other screens have their
  // own input fields that aren't covered by the keyboard, so a
  // floating popup would just clutter them.
  if (screen !== 'exploration') return null;
  if (keyboardOffset <= 0) return null;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    submit(trimmed);
    setText('');
    inputRef.current?.clear();
    Keyboard.dismiss();
  };

  return (
    <View
      style={[styles.bar, { bottom: keyboardOffset }]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="What do you do?"
          placeholderTextColor="#5a5246"
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
        />
        <TouchableOpacity style={styles.send} onPress={handleSubmit}>
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

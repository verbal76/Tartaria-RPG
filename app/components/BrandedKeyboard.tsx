// BrandedKeyboard — Tartaria-themed on-screen keyboard for the
// exploration text input. Replaces the system IME (which covers the
// input line on Android) with a custom panel that puts the text
// preview ABOVE the keys, so the player can always see what they're
// typing. Shift layer for capitals, numbers/symbols layer behind a
// 123 toggle. Backspace + space + return.
//
// The whole panel sits beneath the input row; height ~200px. When
// the player isn't typing the panel is hidden and the screen real
// estate goes back to the feed.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  /** Current text being typed — shown in the preview line at the top
   *  of the panel so the player can see their input. */
  value: string;
  /** Append a character. */
  onKey: (char: string) => void;
  /** Delete one character (backspace). */
  onBackspace: () => void;
  /** Submit / Enter — equivalent to tapping Act. */
  onSubmit: () => void;
  /** Dismiss the keyboard without submitting. */
  onDismiss: () => void;
}

const ROW_LETTERS_1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const ROW_LETTERS_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const ROW_LETTERS_3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

const ROW_NUMBERS_1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const ROW_NUMBERS_2 = ['-', '/', ':', ';', '(', ')', '&', '@', "'"];
const ROW_NUMBERS_3 = ['.', ',', '?', '!', '"'];

export function BrandedKeyboard({ value, onKey, onBackspace, onSubmit, onDismiss }: Props) {
  const [shift, setShift] = useState(false);
  const [numbers, setNumbers] = useState(false);

  const handleKey = (raw: string) => {
    if (numbers) {
      onKey(raw);
      return;
    }
    onKey(shift ? raw.toUpperCase() : raw);
    // Auto-release shift after one keypress (sticky-shift for caps lock
    // would need a long-press; this matches mainstream phone keyboards).
    if (shift) setShift(false);
  };

  const row1 = numbers ? ROW_NUMBERS_1 : ROW_LETTERS_1;
  const row2 = numbers ? ROW_NUMBERS_2 : ROW_LETTERS_2;
  const row3 = numbers ? ROW_NUMBERS_3 : ROW_LETTERS_3;

  return (
    <View style={styles.panel}>
      {/* Preview line — shows the player's typing-in-progress above the
          keys, where the system keyboard normally hides it. Cursor
          indicated by a trailing block character. */}
      <View style={styles.previewRow}>
        <Text style={styles.previewPrompt}>›</Text>
        <Text style={styles.previewText} numberOfLines={1} ellipsizeMode="head">
          {value}
          <Text style={styles.previewCursor}>▍</Text>
        </Text>
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn} hitSlop={8}>
          <Text style={styles.dismissBtnText}>▾</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.keyRow}>
        {row1.map((k) => (
          <KeyBtn key={k} label={shift && !numbers ? k.toUpperCase() : k} onPress={() => handleKey(k)} />
        ))}
      </View>
      <View style={[styles.keyRow, styles.keyRowIndent]}>
        {row2.map((k) => (
          <KeyBtn key={k} label={shift && !numbers ? k.toUpperCase() : k} onPress={() => handleKey(k)} />
        ))}
      </View>
      <View style={styles.keyRow}>
        {!numbers && (
          <KeyBtn
            label={shift ? '⇧' : '⇧'}
            wide
            highlight={shift}
            onPress={() => setShift((s) => !s)}
          />
        )}
        {row3.map((k) => (
          <KeyBtn key={k} label={shift && !numbers ? k.toUpperCase() : k} onPress={() => handleKey(k)} />
        ))}
        <KeyBtn label="⌫" wide onPress={onBackspace} />
      </View>
      <View style={styles.keyRow}>
        <KeyBtn
          label={numbers ? 'abc' : '123'}
          wide
          highlight={numbers}
          onPress={() => setNumbers((n) => !n)}
        />
        <KeyBtn label="space" extraWide onPress={() => onKey(' ')} />
        <KeyBtn label="↵" wide highlight onPress={onSubmit} />
      </View>
    </View>
  );
}

function KeyBtn({
  label,
  onPress,
  wide,
  extraWide,
  highlight,
}: {
  label: string;
  onPress: () => void;
  wide?: boolean;
  extraWide?: boolean;
  highlight?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.key,
        wide && styles.keyWide,
        extraWide && styles.keyExtraWide,
        highlight && styles.keyHighlight,
      ]}
    >
      <Text style={[styles.keyText, highlight && styles.keyTextHighlight]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#0d0c0b',
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 4,
    // Row spacing — previously 4 (rows flush against each other).
    // Playtester (2026-05-21): "Introduce a vertical margin of about
    // 6px to 10px between each row. This visually separates the rows
    // and drastically reduces fat-finger errors."
    gap: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 2,
    gap: 6,
  },
  // Sizing redone 2026-05-21 per playtester. Previous 95px minHeight
  // produced 1:2.5 width-to-height keys that read as "stretched tall
  // rectangles" — every row, including the bottom control row, was
  // ~95px tall. Mobile-standard is fixed 40-50px height, font ~18,
  // with the wide / extra-wide keys deriving their HORIZONTAL
  // dimension from flex (no vertical inflation).
  previewPrompt: { color: '#c9a86a', fontSize: 18, fontWeight: '700' },
  previewText: { color: '#e6d8b3', fontSize: 18, flex: 1 },
  previewCursor: { color: '#c9a86a', fontSize: 18, fontWeight: '700' },
  dismissBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 2,
  },
  dismissBtnText: { color: '#7a705c', fontSize: 18, fontWeight: '700' },
  keyRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  keyRowIndent: { paddingHorizontal: 18 },
  key: {
    flex: 1,
    // 46px fixed height — middle of the 40-50 mobile-standard band.
    // Replaces minHeight: 95 which produced 1:2.5 stretched keys.
    height: 46,
    paddingHorizontal: 6,
    backgroundColor: '#1a1612',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Shift / Backspace / 123 / Return — 1.4x a standard letter key,
  // within the 1.25-1.5x mobile-standard band. Wide enough to be an
  // easy target, narrow enough that letter row keys aren't squeezed.
  keyWide: { flex: 1.4 },
  // Space bar — dominates the bottom row horizontally as expected on
  // a phone keyboard. Vertical height matches every other key now.
  keyExtraWide: { flex: 4 },
  keyHighlight: { backgroundColor: '#2a1f12', borderColor: '#c9a86a' },
  // Font scaled to 18 to read cleanly on the new 46px keys. Multi-
  // letter labels (space / abc / 123 / ⇧ / ⌫ / ↵) still fit.
  keyText: { color: '#e6d8b3', fontSize: 18, fontWeight: '600' },
  keyTextHighlight: { color: '#c9a86a' },
});

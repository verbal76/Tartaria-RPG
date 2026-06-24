import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

interface Props {
  value: number;
  min: number;
  max: number;
  /** Step size for the +/- buttons. */
  step: number;
  /** Number of decimal places for both the display and the text input. */
  decimals?: number;
  /** Optional suffix shown after the number in the display, e.g. "x". */
  suffix?: string;
  onChange: (v: number) => void;
}

// Stepper + editable number box. Tap +/- to nudge by `step`, or tap
// the number itself to type an exact value on the numeric keypad.
// Replaces the slider / dial for voice Rate + Pitch — playtester
// reported both touch widgets were too jittery for precise control
// on a fingertip-sized contact patch.
//
// Display rule: when not editing, show the formatted value
// (e.g. "1.05x"). When the player taps, the text field flips into
// edit mode with the raw number — they can erase, retype, blur, and
// the new value clamps into [min, max] on commit.
export function NumberStepper({
  value,
  min,
  max,
  step,
  decimals = 2,
  suffix = '',
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toFixed(decimals));
  const inputRef = useRef<TextInput>(null);

  // Keep the draft in sync with external changes when the field is
  // not being actively edited (e.g. preset buttons elsewhere bumping
  // the value).
  useEffect(() => {
    if (!editing) setDraft(value.toFixed(decimals));
  }, [value, decimals, editing]);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const round = (v: number) => Number(v.toFixed(decimals));

  const bump = (delta: number) => {
    onChange(round(clamp(value + delta)));
  };

  const commitDraft = () => {
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      onChange(round(clamp(parsed)));
    }
    setEditing(false);
  };

  const onPressNumber = () => {
    setEditing(true);
    setDraft(value.toFixed(decimals));
    // Defer focus so the input is mounted before we grab it.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => bump(-step)}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Text style={styles.btnText}>−</Text>
      </Pressable>

      {editing ? (
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
        />
      ) : (
        <Pressable onPress={onPressNumber} style={styles.display}>
          <Text style={styles.displayText}>
            {value.toFixed(decimals)}{suffix}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => bump(step)}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      >
        <Text style={styles.btnText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btn: {
    width: 38,
    height: 32,
    backgroundColor: '#131c1f',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.6,
  },
  btnText: {
    color: '#6ab0c9',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  display: {
    minWidth: 76,
    height: 32,
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  displayText: {
    color: '#d6e4e8',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minWidth: 76,
    height: 32,
    backgroundColor: '#131c1f',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 3,
    color: '#d6e4e8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
});

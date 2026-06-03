import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';

interface Props {
  visible: boolean;
  /** Names of enemies currently in the scene — surfaced as red-tinted
   *  chips at the top of the picker. Empty when the scene is peaceful. */
  enemyHints?: string[];
  /** Ambient nouns / hook nouns from the scene — neutral chips below
   *  the enemy row. Optional. */
  sceneHints?: string[];
  /** Vendor name in the scene, if any. Lands as a green-tinted chip
   *  alongside the scene hints so the player can hard-target NPCs
   *  by tap. */
  vendorName?: string;
  /** If true, the player taps a target → engine routes through the
   *  stealth intent (sneak-up + skill check) instead of a straight
   *  approach. Win the roll → behind them undetected; lose → fight
   *  starts. Toggle persists across opens in case the player wants
   *  to keep stealth on across multiple targets. */
  onSubmit: (target: string, useStealth: boolean) => void;
  onCancel: () => void;
}

// Approach modal. The player picks a target (or types one) and the
// engine resolves "approach <target>" — in combat, it switches focus
// to that enemy and closes the gap if reachable; out of combat, it
// runs the intra-scene move-toward narration ("you move across the
// ground to the X, close enough now to act on it"). Same UI shape
// as SearchModal so it feels consistent.
export function ApproachModal({
  visible,
  enemyHints,
  sceneHints,
  vendorName,
  onSubmit,
  onCancel,
}: Props) {
  const [text, setText] = useState('');
  const [useStealth, setUseStealth] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
    }
    return undefined;
  }, [visible]);
  // No auto-focus on the TextInput — the keyboard popping up reflows
  // the modal layout and the first tap on a chip lands where the chip
  // used to be (forcing a second tap to actually fire). Player can
  // tap the input field if they want to type.

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    onSubmit(trimmed, useStealth);
  };

  const tapToApproach = (target: string) => {
    Keyboard.dismiss();
    onSubmit(target, useStealth);
  };

  // Common things players approach when no scene-specific target
  // jumps out. Mix of combat-y and exploration-y so the button works
  // in both peace and combat modes.
  const commonHints = [
    'the guard',
    'the door',
    'the entrance',
    'the wall',
    'the figure',
  ];

  const enemies = enemyHints ?? [];
  const scene = sceneHints ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <KeyboardAvoidingView style={styles.scrim} behavior="padding">
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>APPROACH</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Name a person, enemy, door, or feature to close on. In combat
                this switches focus and moves you in; outside combat it walks
                you up to the thing without burning a full travel turn.
              </Text>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder='e.g. "the guard", "the dragon", "the door"'
                placeholderTextColor="#5a5246"
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                autoCorrect={false}
                autoCapitalize="none"
              />

              {/* Stealth toggle. When ON, target taps + the typed-
                  input path route through the stealth intent: skill
                  check (DEX-based) decides whether the player slips
                  in unnoticed or trips the encounter. Toggle stays
                  visible at the top of the modal so it's clearly
                  optional, not the default. */}
              <Pressable
                style={({ pressed }) => [
                  styles.stealthToggle,
                  useStealth && styles.stealthToggleActive,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => setUseStealth((s) => !s)}
              >
                <Text style={[styles.stealthToggleText, useStealth && styles.stealthToggleTextActive]}>
                  {useStealth ? '✓ USE STEALTH (DEX roll)' : 'USE STEALTH (off)'}
                </Text>
              </Pressable>

              {enemies.length > 0 && (
                <>
                  <Text style={styles.chipLabel}>Enemies present</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScrollRow}
                  >
                    {enemies.map((e) => (
                      <Pressable
                        key={`enemy-${e}`}
                        style={({ pressed }) => [styles.chip, styles.chipEnemy, pressed && styles.btnPressed]}
                        onPress={() => tapToApproach(e)}
                      >
                        <Text style={styles.chipTextEnemy} numberOfLines={1}>{e}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {(scene.length > 0 || vendorName) && (
                <>
                  <Text style={styles.chipLabel}>In this scene</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScrollRow}
                  >
                    {vendorName && (
                      <Pressable
                        key={`vendor-${vendorName}`}
                        style={({ pressed }) => [styles.chip, styles.chipScene, pressed && styles.btnPressed]}
                        onPress={() => tapToApproach(vendorName)}
                      >
                        <Text style={styles.chipTextScene} numberOfLines={1}>{vendorName}</Text>
                      </Pressable>
                    )}
                    {scene.map((h) => (
                      <Pressable
                        key={`scene-${h}`}
                        style={({ pressed }) => [styles.chip, styles.chipScene, pressed && styles.btnPressed]}
                        onPress={() => tapToApproach(h)}
                      >
                        <Text style={styles.chipTextScene} numberOfLines={1}>{h}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.chipLabel}>Common</Text>
              <View style={styles.chipRow}>
                {commonHints.map((h) => (
                  <Pressable
                    key={`common-${h}`}
                    style={({ pressed }) => [styles.chip, pressed && styles.btnPressed]}
                    onPress={() => tapToApproach(h)}
                  >
                    <Text style={styles.chipText} numberOfLines={1}>{h}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onCancel}
                >
                  <Text style={styles.btnTextNeutral}>CANCEL</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnPrimary,
                    !text.trim() && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={handleSubmit}
                  disabled={!text.trim()}
                >
                  <Text style={styles.btnTextPrimary}>APPROACH</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#13110f', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, padding: 14 },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  input: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, color: '#e6d8b3', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 3, fontSize: 14 },
  chipLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipScrollRow: { flexDirection: 'row', gap: 6, paddingLeft: 2, paddingRight: 8 },
  chip: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 6 },
  chipScene: { borderColor: '#9ec96a' },
  chipEnemy: { borderColor: '#e07a5f' },
  chipText: { color: '#cdbf99', fontSize: 12 },
  chipTextScene: { color: '#9ec96a', fontSize: 12 },
  chipTextEnemy: { color: '#e07a5f', fontSize: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 3, borderWidth: 1, minWidth: 80, alignItems: 'center' },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  stealthToggle: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    alignItems: 'center',
  },
  stealthToggleActive: { borderColor: '#6a9bbf', backgroundColor: '#1c2a35' },
  stealthToggleText: { color: '#7a705c', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  stealthToggleTextActive: { color: '#6a9bbf' },
});

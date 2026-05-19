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
} from 'react-native';

interface Props {
  visible: boolean;
  /** Hints surfaced to the player as suggested search targets. Optional. */
  hints?: string[];
  onSubmit: (target: string) => void;
  onCancel: () => void;
}

// Branded modal that prompts the player to type what they're searching
// for. The submitted text is routed to the investigate intent with the
// target — letting the engine try hook, ambient noun, item, then
// re-prompt if nothing matches.
export function SearchModal({ visible, hints, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
    }
    return undefined;
  }, [visible]);
  // NOTE: previously auto-focused the TextInput on open. That popped
  // the keyboard up, which reflowed the modal layout — and the first
  // tap on a chip landed where the chip USED to be, requiring a
  // second tap to actually fire. Don't auto-focus; the player can
  // tap the input field if they want to type. Chip-tap is the
  // primary interaction.

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    onSubmit(trimmed);
  };

  // One-tap search targets. Playtest feedback: "I'm not typing the
  // ground or the hall or the wall over and over again." Chip taps
  // submit directly so the player doesn't fight the keyboard.
  // Keyboard.dismiss() before submit so if the player DID focus the
  // input first, the keyboard collapses cleanly before the modal
  // closes.
  const tapToSearch = (target: string) => {
    Keyboard.dismiss();
    onSubmit(target);
  };
  const sceneHints = (hints ?? []).slice(0, 5);
  const commonHints = ['the ground', 'the wall', 'the rubble', 'the silt', 'the doorway'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>SEARCH</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Name an area or thing to search. Be specific with your words —
                "the mud", "the rubble", "the doorway", "the area to my left",
                "the wagon", "behind the column". The Arbiter will try to read
                your meaning, but vague rolls find vague things.
              </Text>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder='e.g. "the mud", "the doorway", "left side"'
                placeholderTextColor="#5a5246"
                onSubmitEditing={handleSubmit}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />

              {sceneHints.length > 0 && (
                <>
                  <Text style={styles.chipLabel}>In this scene</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScrollRow}
                  >
                    {sceneHints.map((h) => (
                      <Pressable
                        key={`scene-${h}`}
                        style={({ pressed }) => [styles.chip, styles.chipScene, pressed && styles.btnPressed]}
                        onPress={() => tapToSearch(h)}
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
                    onPress={() => tapToSearch(h)}
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
                  <Text style={styles.btnTextPrimary}>SEARCH</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 3,
    fontSize: 14,
  },
  hints: { color: '#7a705c', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  examples: { color: '#9ec96a', fontSize: 11, marginTop: 8, lineHeight: 16, letterSpacing: 0.5 },
  chipLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipScrollRow: { flexDirection: 'row', gap: 6, paddingLeft: 2, paddingRight: 8 },
  chip: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipScene: { borderColor: '#9ec96a' },
  chipText: { color: '#cdbf99', fontSize: 12 },
  chipTextScene: { color: '#9ec96a', fontSize: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

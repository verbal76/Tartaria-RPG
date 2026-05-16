import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableWithoutFeedback,
  Pressable,
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
      // Wait for the modal to mount before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visible]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

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
                Name what you are searching for. Be specific — a handprint, a marking,
                a sound, an object you noticed.
              </Text>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="e.g. handprints, traps, the obelisk"
                placeholderTextColor="#5a5246"
                onSubmitEditing={handleSubmit}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />

              {hints && hints.length > 0 ? (
                <Text style={styles.hints}>
                  Visible here: {hints.slice(0, 4).join(', ')}
                </Text>
              ) : null}

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

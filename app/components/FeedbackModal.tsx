// FeedbackModal — designer-note input that bypasses the action
// parser. Born from a playtest where typing observations like
// "search isn't working" into the game's text input parsed them
// as game commands (and accidentally cleared the player's hands).
// This modal writes straight to the `feedback` log channel via
// gameStore.appendFeedback, so notes always survive into the
// COPY-LOG-out pipeline without being interpreted.
//
// Brief on purpose — one text field, two buttons. The store
// action strips empty/whitespace input, so an accidental tap +
// SAVE on an empty field is a no-op.

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';

interface Props {
  visible: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function FeedbackModal({ visible, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      // Focus on open — designer wants to type immediately, no
      // chip-tap interaction to fight over (the SearchModal
      // disables auto-focus for that reason; this modal has only
      // the text field, so focus is correct).
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  const handleSave = () => {
    Keyboard.dismiss();
    onSubmit(text);
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
              <Text style={styles.title}>DESIGNER NOTE</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                This text drops straight into the game log on the
                `feedback` channel. It does NOT go through the action
                parser, so typing "search isn't working" here won't
                fire a search verb. Use for bug reports, design notes,
                playtest observations.
              </Text>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder='e.g. "Pulse Scanner chip stayed in the popup after I searched the vent"'
                placeholderTextColor="#5a5246"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoCorrect={false}
                autoCapitalize="sentences"
              />

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
                  onPress={handleSave}
                  disabled={!text.trim()}
                >
                  <Text style={styles.btnTextPrimary}>SAVE NOTE</Text>
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
  body: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 10, fontStyle: 'italic' },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 3,
    fontSize: 14,
    minHeight: 90,
  },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 90,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

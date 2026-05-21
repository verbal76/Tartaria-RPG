// FeedbackModal — designer-note input that bypasses the action
// parser. Born from a playtest where typing observations like
// "search isn't working" into the game's text input parsed them
// as game commands (and accidentally cleared the player's hands).
// This modal writes straight to the `feedback` log channel via
// gameStore.appendFeedback, so notes always survive into the
// COPY-LOG-out pipeline without being interpreted.
//
// OTA 222 — voice-first capture. Playtester: "when I hit the
// add a note button always assume that I want auto text capture
// but if I tap then I'll type." On open we kick off STT
// immediately; transcript streams into the text field as it
// arrives. Tapping the field flips into manual-typing mode and
// stops the mic, so the player can correct or extend what was
// transcribed.

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
import { startListening, stopListening, isListening } from '../voice/STTManager';

interface Props {
  visible: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function FeedbackModal({ visible, onSubmit, onCancel }: Props) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  // Once the user taps the text field we lock out the auto-STT
  // restart logic so re-renders don't fight the mic back on.
  const manualMode = useRef(false);

  useEffect(() => {
    if (!visible) {
      // Modal closing — make sure we don't leave the mic hot.
      if (isListening()) {
        void stopListening().catch(() => { /* ignore */ });
      }
      setListening(false);
      return;
    }
    // Modal opening — reset state and kick off voice capture.
    setText('');
    setMicError(null);
    manualMode.current = false;
    void (async () => {
      try {
        await startListening(
          (r) => {
            // Drop the transcript into the text field. We always
            // overwrite (rather than append) — the recognizer
            // sends the accumulating partial each tick, so simple
            // assignment gives a clean live preview.
            if (manualMode.current) return;
            try { setText(r.text); } catch { /* ignore */ }
          },
          (msg) => {
            setMicError(msg.slice(0, 80));
            setListening(false);
          },
        );
        setListening(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMicError(msg.slice(0, 80));
        setListening(false);
      }
    })();
    return undefined;
  }, [visible]);

  const switchToManual = () => {
    manualMode.current = true;
    if (isListening()) {
      void stopListening().catch(() => { /* ignore */ });
    }
    setListening(false);
    inputRef.current?.focus();
  };

  const handleSave = () => {
    if (isListening()) {
      void stopListening().catch(() => { /* ignore */ });
    }
    setListening(false);
    Keyboard.dismiss();
    onSubmit(text);
  };

  const handleCancel = () => {
    if (isListening()) {
      void stopListening().catch(() => { /* ignore */ });
    }
    setListening(false);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleCancel}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>DESIGNER NOTE</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Drops straight into the game log on the `feedback`
                channel — bypasses the action parser. Speak now;
                tap the field if you'd rather type.
              </Text>

              {/* Live status row — green pulse while listening, amber
                  if the mic failed, neutral once the player has tapped
                  in to type. */}
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    listening
                      ? styles.statusDotLive
                      : micError
                        ? styles.statusDotError
                        : styles.statusDotIdle,
                  ]}
                />
                <Text style={styles.statusText}>
                  {listening
                    ? 'Listening — speak your note'
                    : micError
                      ? `Mic: ${micError}`
                      : manualMode.current
                        ? 'Typing — mic stopped'
                        : 'Mic idle'}
                </Text>
              </View>

              <Pressable onPress={switchToManual}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  onFocus={switchToManual}
                  placeholder='Tap to type, or just speak. e.g. "vendor chips disappeared after I purchased"'
                  placeholderTextColor="#5a5246"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  autoCorrect={false}
                  autoCapitalize="sentences"
                />
              </Pressable>

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={handleCancel}
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
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDotLive: { backgroundColor: '#9ec96a' },
  statusDotIdle: { backgroundColor: '#3a342c' },
  statusDotError: { backgroundColor: '#c97a5f' },
  statusText: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
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

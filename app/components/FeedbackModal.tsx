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
//
// OTA 226 — continuous capture + zero auto-save.
// Playtester: "voice auto detect glitches and tries to save
// multiple times when it thinks I am done. when I am adding a
// note it shouldn't save the note until I press the button."
//
// Fixes:
//   1. STT runs continuous=false on this device, so each speech-
//      pause ends the recognition session. The modal now tracks
//      a `committedRef` of all FINALIZED text from prior sessions
//      and re-arms startListening as soon as one closes. The
//      visible text is committed + current partial — so when the
//      player pauses, the displayed text never shrinks back to
//      just the new fragment.
//   2. onSubmit ONLY fires from the SAVE NOTE button press. There
//      is no isFinal=true→submit path here; STT finals just commit
//      to the buffer. Belt-and-suspenders: a `savingRef` guard
//      blocks rapid double-taps on SAVE from firing onSubmit twice.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Keyboard,
  InputAccessoryView,
  Platform,
} from 'react-native';
import { KeyboardSafeCard } from './KeyboardSafeCard';
import { startListening, stopListening, isListening } from '../voice/STTManager';

// ⚠ OTA-1718 — the DONE bar's id for the multiline note field. iOS only.
const NOTE_ACCESSORY = 'designerNoteAccessory';

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
  // Text from past finalized STT sessions. Re-armed startListening
  // sessions append to this so pauses don't lose prior content.
  const committedRef = useRef('');
  // True while we're in the middle of restarting STT — used to
  // suppress the spurious "Mic: no speech" error the engine emits
  // on a clean session end before we re-arm.
  const restartingRef = useRef(false);
  // Guard against double-tap saving — once a save is in flight the
  // button is locked until the modal closes.
  const savingRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      // Modal closing — make sure we don't leave the mic hot.
      if (isListening()) {
        void stopListening().catch(() => { /* ignore */ });
      }
      setListening(false);
      committedRef.current = '';
      restartingRef.current = false;
      savingRef.current = false;
      return;
    }
    // 2026-05-25 [INPUT-1] — modal opening no longer auto-arms the
    // mic. User reported the auto voice capture was unwanted; they'd
    // open the note modal to type and find the mic already listening,
    // capturing ambient room noise into the text. Now the modal opens
    // text-only and the mic is opt-in via the manual TAP-TO-DICTATE
    // button (visible in the modal UI below). All the continuous-
    // capture re-arm logic stays intact for when the user explicitly
    // enables voice; it just doesn't fire at mount time anymore.
    setText('');
    setMicError(null);
    manualMode.current = true; // Default to text-only mode; user opts into mic.
    committedRef.current = '';
    savingRef.current = false;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Arm a fresh STT session. Called on modal open and again every
  // time a session finalizes (continuous-capture loop).
  const armSTT = async () => {
    if (manualMode.current || !visible) return;
    restartingRef.current = false;
    try {
      await startListening(
        (r) => {
          if (manualMode.current) return;
          // Render committed + current-session partial. When
          // committed is empty (first session) we just show the
          // partial directly; otherwise join with a space so the
          // sentence boundaries read naturally.
          const live = r.text.trim();
          const display = committedRef.current
            ? (live ? `${committedRef.current} ${live}` : committedRef.current)
            : live;
          try { setText(display); } catch { /* ignore */ }

          if (r.isFinal) {
            // Commit and re-arm. We do NOT submit on isFinal — only
            // the SAVE NOTE button submits.
            committedRef.current = display;
            restartingRef.current = true;
            // Small delay so the underlying recognition module has
            // a clean handoff between sessions; without this the
            // re-arm sometimes lands while the prior session's
            // teardown is still in flight and the new one errors
            // immediately.
            setTimeout(() => {
              if (visible && !manualMode.current) {
                // OTA 013 — wrap in catch so a failed re-arm doesn't
                // leave the modal "Listening" forever with a dead
                // mic. If startListening throws here, surface the
                // error to the user and unlock the modal so they
                // can switch to manual typing.
                void armSTT().catch((err) => {
                  const msg = err instanceof Error ? err.message : String(err);
                  setMicError(msg.slice(0, 80));
                  setListening(false);
                  restartingRef.current = false;
                });
              }
            }, 150);
          }
        },
        (msg) => {
          // Swallow the "no speech detected" / clean-end errors
          // that fire between sessions during continuous capture.
          if (restartingRef.current) return;
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
  };

  const switchToManual = () => {
    manualMode.current = true;
    if (isListening()) {
      void stopListening().catch(() => { /* ignore */ });
    }
    setListening(false);
    inputRef.current?.focus();
  };

  const handleSave = () => {
    if (savingRef.current) return;
    savingRef.current = true;
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
    // ⚠⚠ OTA-1718 — WAS `KeyboardAvoidingView behavior="padding"` AROUND A CARD
    // WITH NO HEIGHT LIMIT. That view shrinks its own content box; a card sized
    // by its content simply overflows it, so SAVE NOTE went under the keyboard
    // exactly as SEND did on REPORT A BUG. Same shell, same fix: measured
    // keyboard top, scrolling middle, pinned buttons.
    <KeyboardSafeCard
      visible={visible}
      onRequestClose={handleCancel}
      maxWidth={380}
      testID="designer-note-card"
      header={(
        <>
          <Text style={styles.title} accessibilityRole="header">DESIGNER NOTE</Text>
          <View style={styles.rule} />
        </>
      )}
      footer={(
        <View style={styles.btnRow}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
            onPress={handleCancel}
            accessibilityRole="button"
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
            accessibilityRole="button"
            accessibilityState={{ disabled: !text.trim() }}
          >
            <Text style={styles.btnTextPrimary}>SAVE NOTE</Text>
          </Pressable>
        </View>
      )}
    >
      <Text style={styles.body}>
        Drops straight into the game log on the `feedback`
        channel — bypasses the action parser. Speak now;
        tap the field if you&apos;d rather type. Nothing saves
        until you press SAVE NOTE.
      </Text>

      {/* Live status row — green pulse while listening, amber if the mic
          failed, neutral once the player has tapped in to type. */}
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
            ? 'Listening — speak; pauses are fine'
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
          placeholder='Type your note. e.g. "vendor chips disappeared after I purchased"'
          placeholderTextColor="#c9a86a"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          autoCorrect={false}
          autoCapitalize="sentences"
          inputAccessoryViewID={Platform.OS === 'ios' ? NOTE_ACCESSORY : undefined}
        />
      </Pressable>
      {/* ⚠ The courtesy, not the fix — a multiline field has no return key. */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={NOTE_ACCESSORY}>
          <View style={styles.accessoryBar}>
            <Pressable
              onPress={() => Keyboard.dismiss()}
              accessibilityRole="button"
              accessibilityLabel="Done — close the keyboard"
              style={({ pressed }) => [styles.accessoryBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.accessoryText}>DONE</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardSafeCard>
  );
}

const styles = StyleSheet.create({
  // ⚠ OTA-1718 — scrim / card are KeyboardSafeCard's job now.
  accessoryBar: {
    backgroundColor: '#1a1714',
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  accessoryText: { color: '#c9a86a', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 10, fontStyle: 'italic' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDotLive: { backgroundColor: '#9ec96a' },
  statusDotIdle: { backgroundColor: '#3a342c' },
  statusDotError: { backgroundColor: '#c97a5f' },
  statusText: { color: '#a2977b', fontSize: 11, letterSpacing: 1 },
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

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TouchableWithoutFeedback } from 'react-native';

// OTA-259 — CONTINUE popup for multi-stage investigation hooks.
//
// Player feedback: *"when you are investigating and there is a
// multipart story thread, instead of going back into investigate,
// you should get a continue button popup in between stages."*
//
// Triggered by `pendingHookContinue !== null` in gameStore (set inside
// resolveHookOneStep whenever a non-terminal hook stage fires). The
// CONTINUE button calls `continueHook()` which resolves the next
// stage in-place — if that stage is ALSO non-terminal, the modal
// re-opens for the stage after. The LATER button calls
// `dismissHookContinue()` which clears the pending state; the hook
// itself stays mid-thread in currentScene.hooks so the player can
// resume by re-investigating the noun later.
//
// The previous stage's narration appears in the world feed BEFORE
// this modal pops, so the player reads the beat first (via the log)
// then chooses to advance. Modal is transparent + dim-overlay so the
// world feed stays partly visible behind it.

interface Props {
  visible: boolean;
  /** Noun the player tapped to start the thread — used for the
   *  "more to follow at the {noun}" line so the player knows
   *  which thread is asking for a continuation. */
  noun: string;
  onContinue: () => void;
  onLater: () => void;
}

export function HookContinueModal({ visible, noun, onContinue, onLater }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onLater}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onLater}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>★ STORY THREAD</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                There's more at <Text style={styles.bodyAccent}>{noun}</Text>. Follow the thread?
              </Text>
              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                  onPress={onContinue}
                >
                  <Text style={styles.btnTextPrimary}>CONTINUE →</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onLater}
                >
                  <Text style={styles.btnTextNeutral}>LATER</Text>
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
    // Lighter dim than other modals — the player wants to glance at
    // the world feed behind the popup to re-read the stage line if
    // needed before tapping continue.
    backgroundColor: 'rgba(0,0,0,0.55)',
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
  body: { color: '#e6d8b3', fontSize: 14, lineHeight: 20, marginBottom: 14 },
  bodyAccent: { color: '#c9a86a', fontWeight: '700' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 96,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

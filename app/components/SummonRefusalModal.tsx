// ⚠⚠ OTA-1495 — "FINISH YOUR CURRENT BATTLE BEFORE YOU STRIVE FOR MORE
// PUNISHMENT." The owner's words, and his call.
//
// The engine has refused a mid-fight summon since OTA-1480 (a Guardian
// encounter assumes it is THE fight, not a second one bolted onto a first),
// and it has always said why — in the FEED. But a feed line printed during a
// fight scrolls under the player's thumb within a beat or two, so the refusal
// read as a button that did nothing: OTA-220's lit-button-that-refuses defect,
// in the one place the game can least afford it.
//
// ⚠ THE BODY IS THE ENGINE'S OWN NARRATION, passed in, not re-worded here.
// Two writers for one refusal is how the popup and the log end up disagreeing
// about why (the two-derivations defect this project keeps retiring). The
// modal owns the FRAME — heading, tone, the one button — and nothing else.
import React from 'react';
import { Modal, View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  /** The engine's refusal narration, or null when nothing is owed. */
  message: string | null;
  onDismiss: () => void;
}

export function SummonRefusalModal({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
        <View style={styles.card}>
          <Text style={styles.kicker}>NOT WHILE THIS ONE STANDS</Text>
          <View style={styles.rule} />
          <Text style={styles.body}>{message}</Text>
          <Text style={styles.aside}>
            Finish the fight in front of you before you call down more punishment. The seat keeps.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={onDismiss}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to the fight"
          >
            <Text style={styles.btnText}>BACK TO THE FIGHT</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(4, 6, 8, 0.92)',
    justifyContent: 'center', paddingHorizontal: 22,
  },
  card: {
    borderWidth: 1, borderColor: '#5a4a36', borderRadius: 4,
    backgroundColor: '#14110e', padding: 18,
  },
  kicker: {
    color: '#d8923c', fontSize: 13, letterSpacing: 3,
    fontWeight: '800', textAlign: 'center',
  },
  rule: { height: 1, backgroundColor: '#3a342c', marginVertical: 14 },
  body: { color: '#d8cfc0', fontSize: 15, lineHeight: 23 },
  aside: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginTop: 10, fontStyle: 'italic' },
  btn: {
    marginTop: 18, backgroundColor: '#c9a86a', borderRadius: 3,
    paddingVertical: 11, alignItems: 'center',
  },
  btnText: { color: '#13110f', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});

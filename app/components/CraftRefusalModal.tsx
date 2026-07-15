import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';

// OTA-833 — Craft-REFUSAL popup. Player feedback: "when you craft and it completes
// it asks 'continue crafting' so you know something happened. But a gated craft did
// a SILENT fail — I didn't even know my touch registered until I left the menu and
// saw two tries had gone through. We need a popup like continue-crafting, but one
// that says 'not yet' (non-Star-Wars-y)."
//
// Mirrors CraftResultModal so the feel is consistent, but reads as a soft "hold" —
// amber caution accent, the engine's own refusal narration as the body (which is
// already in-character: "…war-forging from before the flood — bring more home."),
// and the same two-button layout (KEEP CRAFTING stays on the menu, CLOSE MENU exits).

interface Props {
  visible: boolean;
  /** The engine's refusal narration (why the craft didn't take). */
  message: string;
  /** Dismiss the popup, keep the crafting menu open (try another recipe). */
  onContinue: () => void;
  /** Dismiss the popup AND close the crafting menu. */
  onClose: () => void;
}

const BODY_SCROLL_MAX_HEIGHT = Math.max(
  120,
  Math.floor(Dimensions.get('window').height - 380),
);

export function CraftRefusalModal({ visible, message, onContinue, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onContinue}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onContinue}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>◆ NOT YET</Text>
              <View style={styles.rule} />
              <ScrollView
                style={[styles.bodyScroll, { maxHeight: BODY_SCROLL_MAX_HEIGHT }]}
                contentContainerStyle={styles.bodyWrap}
              >
                <Text style={styles.body}>{message}</Text>
              </ScrollView>

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                  onPress={onContinue}
                >
                  <Text style={styles.btnTextPrimary}>KEEP CRAFTING</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onClose}
                >
                  <Text style={styles.btnTextNeutral}>CLOSE MENU</Text>
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
    maxWidth: 400,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#e0b45f', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  bodyScroll: {},
  bodyWrap: { paddingVertical: 2 },
  body: { color: '#cdbf99', fontSize: 14, lineHeight: 20 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
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
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 1.5, fontSize: 11 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 1.5, fontSize: 11 },
});

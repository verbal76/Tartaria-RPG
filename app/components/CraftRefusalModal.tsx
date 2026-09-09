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
import { tModalCard, tartariaKitStyles as kit } from '../ui/tartariaKit';

// ⚠ OTA-1771 — the modal sweep. This is the sweep's only NON-380 card: it ships
// at 400 and keeps it, because `tModalCard` takes the width as a parameter for
// exactly this reason. Nothing about the card changes but its address.
const CARD = tModalCard(400);

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
        <View style={kit.modalScrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={CARD}>
              <Text style={styles.title} accessibilityRole="header">◆ NOT YET</Text>
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
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextPrimary}>KEEP CRAFTING</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onClose}
                  accessibilityRole="button"
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
  // ⚠ OTA-1771 — `scrim` and `card` moved to the kit (`modalScrim` /
  // `tModalCard(400)`). Same values, one source; the 400 is preserved.
  title: { color: '#e0c179', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  // ⚠⚠ OTA-1771 — `flexShrink` for the same reason as the other adopters. Here
  // it is belt-and-braces rather than a fix: `BODY_SCROLL_MAX_HEIGHT` already
  // reserves 380dp for the rest of the card, so the card cannot reach the kit's
  // 85% ceiling on any screen shorter than 1827dp. It is written anyway because
  // the NEXT person to change that constant should not have to re-derive this.
  bodyScroll: { flexShrink: 1, flexGrow: 0 },
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

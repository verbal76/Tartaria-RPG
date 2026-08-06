import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Pressable,
} from 'react-native';

export interface TorchLead {
  id: string;
  noun: string;
}

interface Props {
  visible: boolean;
  /** The room's open, un-charged leads (stage-0 hooks). Each row is
   *  tap-to-aim; picking one charges it with the torch. */
  leads: TorchLead[];
  onSubmit: (hookId: string) => void;
  onCancel: () => void;
}

// OTA-776 — the Aetheric Torch is an aimed tool. When a room holds more than
// one open lead, tapping the 🔦 chip opens this chooser so the player decides
// WHICH lead to reveal + take over. Picking one charges it: when the player
// then works that lead, it pays out an upgraded Rare/Legendary drop. Cloned
// from ClimbModal's list-picker shape.
export function TorchProbeModal({ visible, leads, onSubmit, onCancel }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">AIM THE TORCH</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Fix the torch&apos;s light on one lead. It reveals and takes that
                lead over — when you work it, it gives up something rare. One
                charge, one lead.
              </Text>

              {leads.length === 0 ? (
                <Text style={styles.empty}>
                  No open lead here to aim at. Save the torch for a room that holds one.
                </Text>
              ) : (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                  {leads.map((lead, i) => (
                    <Pressable
                      key={`lead-${lead.id}-${i}`}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      onPress={() => onSubmit(lead.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.rowName} numberOfLines={1}>{lead.noun}</Text>
                      <Text style={styles.rowTag}>AIM ›</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onCancel}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextNeutral}>CANCEL</Text>
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
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#13110f', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, padding: 14 },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  empty: { color: '#a2977b', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20, fontSize: 13 },
  scroll: { maxHeight: 280 },
  scrollContent: { paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  rowPressed: { borderColor: '#c9a86a', opacity: 0.85 },
  rowName: { color: '#e6d8b3', fontSize: 14, flex: 1, marginRight: 8 },
  rowTag: { color: '#e0c179', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 3, borderWidth: 1, minWidth: 80, alignItems: 'center' },
  btnPressed: { opacity: 0.7 },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

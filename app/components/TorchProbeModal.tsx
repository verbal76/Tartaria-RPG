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
import { tModalCard, tartariaKitStyles as kit } from '../ui/tartariaKit';

// ⚠ OTA-1771 — the modal sweep. Cloned from ClimbModal's shape, so it carried
// ClimbModal's hand-copied scrim and card too; both are the kit's now.
const CARD = tModalCard(380);

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
/* ⚠⚠ PHASE 3 — THE SIBLING ESCAPE. This row's PRIMARY reached `tFilledGold`
 * in an earlier pass and its SECONDARY did not, so on the device a constructed
 * key sat beside a flat outline IN THE SAME ROW. Every key-level instrument
 * scored `btn` as migrated, because one of its two call sites had adopted the
 * kit. Construction is what the object IS; "secondary" is what it is FOR. */
/** ⚠⚠⚠ OTA-1806 — THE PLANES ARE A FUNCTION OF THE FINGER NOW.
 *  Pressed, the sidewall collapses and crosses to the TOP, the light catches
 *  BELOW the face, and the contact band is not drawn — a key pushed home is not
 *  standing on anything. Frozen at their resting heights, as these were, a key
 *  could travel 3dp and never lose height, which is most of a depression. */
const ctlPlanes = (pressed: boolean) => (
  <>
    <View style={pressed ? kit.controlPlaneTopPressed : kit.controlPlaneTop} pointerEvents="none" />
    <View style={pressed ? kit.controlPlaneBottomPressed : kit.controlPlaneBottom} pointerEvents="none" />
    {pressed ? null : <View style={kit.controlPlaneContact} pointerEvents="none" />}
  </>
);
/** The resting planes, for a surface that has no press to report. */
const CTL_PLANES = ctlPlanes(false);

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
        <View style={kit.modalScrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={CARD}>
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
                      style={({ pressed }) => [kit.ctl, styles.row, pressed && styles.rowPressed]}
                      onPress={() => onSubmit(lead.id)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.rowName} numberOfLines={1}>{lead.noun}</Text>
                      <Text style={styles.rowTag}>AIM ›</Text>
                      {CTL_PLANES}
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, kit.ctl, pressed && kit.controlPressed]}
                  onPress={onCancel}
                  accessibilityRole="button"
                >
{({ pressed }) => (<>
                  <Text style={styles.btnTextNeutral}>CANCEL</Text>
                  {ctlPlanes(pressed)}
                </>)}
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
  // `tModalCard(380)`). Same values, one source.
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  empty: { color: '#a2977b', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20, fontSize: 13 },
  // ⚠⚠ OTA-1771 — the card now caps at 85% (OTA-1614), and an RN view holds its
  // height unless told to yield. Without `flexShrink` a long lead list would push
  // CANCEL out of the bottom rather than scroll.
  scroll: { maxHeight: 280, flexShrink: 1, flexGrow: 0 },
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
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

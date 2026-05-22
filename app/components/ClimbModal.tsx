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

interface Props {
  visible: boolean;
  /** Climbable nouns in the current scene — filtered against
   *  isClimbable() upstream so every entry resolves. May be empty
   *  if the scene has nothing climbable, in which case we render
   *  a refusal line. */
  climbables: string[];
  /** Per-noun tier counts so the player sees commitment up-front
   *  (wall=2, tower=4, cliff=5). Aligned by index to climbables. */
  heights: number[];
  onSubmit: (target: string) => void;
  onCancel: () => void;
}

// OTA 031 — CLIMB modal. Listed climbable nouns from the scene as
// tap-to-climb chips. Pairs with the climb handler's variable-height
// tier system: tapping a noun fires `climb <noun>` which resolves one
// tier. Player taps again to clear the next tier. The button HUD in
// the parent ExplorationScreen flips to CLIMB DOWN once any tier has
// been cleared in the current scene.
export function ClimbModal({
  visible,
  climbables,
  heights,
  onSubmit,
  onCancel,
}: Props) {
  const tapTo = (target: string) => onSubmit(target);

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
              <Text style={styles.title}>CLIMB</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Pick something to climb. Each tap clears one tier; bigger
                things take more taps. Reach the top and anything stashed
                up there comes home in your pack automatically.
              </Text>

              {climbables.length === 0 ? (
                <Text style={styles.empty}>
                  Nothing here takes a climb. Walls, ladders, towers, vines, cliffs — find one of those.
                </Text>
              ) : (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                  {climbables.map((noun, i) => {
                    const h = heights[i] ?? 2;
                    return (
                      <Pressable
                        key={`climb-${noun}-${i}`}
                        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                        onPress={() => tapTo(noun)}
                      >
                        <Text style={styles.rowName} numberOfLines={1}>{noun}</Text>
                        <Text style={styles.rowHeight}>
                          {h === 1 ? '1 tier' : `${h} tiers`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onCancel}
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
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20, fontSize: 13 },
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
  rowHeight: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 3, borderWidth: 1, minWidth: 80, alignItems: 'center' },
  btnPressed: { opacity: 0.7 },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

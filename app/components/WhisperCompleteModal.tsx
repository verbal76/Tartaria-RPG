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

// arb120 — completion popup for a finished side-contract (whisper). Player
// report: a whisper paid out at the end of a long auto-travel run, but the
// reward scrolled straight off behind the next narration beat — "I didn't even
// know I'd completed the task." This surfaces the close-out + reward in a modal
// the player dismisses on their own, mirroring the HookContinueModal styling.

interface Props {
  visible: boolean;
  title: string;
  lines: string[];
  rewards: string[];
  onClose: () => void;
}

const BODY_SCROLL_MAX_HEIGHT = Math.max(
  220,
  Math.floor(Dimensions.get('window').height - 340),
);

export function WhisperCompleteModal({ visible, title, lines, rewards, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">✦✦ CONTRACT COMPLETE</Text>
              <Text style={styles.subtitle}>{title}</Text>
              <View style={styles.rule} />

              <ScrollView
                style={{ maxHeight: BODY_SCROLL_MAX_HEIGHT }}
                contentContainerStyle={styles.body}
              >
                {lines.map((line, i) => (
                  <Text key={`line-${i}`} style={styles.line}>{line}</Text>
                ))}
                {rewards.length > 0 ? (
                  <View style={styles.rewardBlock}>
                    {rewards.map((r, i) => (
                      <Text key={`reward-${i}`} style={styles.reward}>{r}</Text>
                    ))}
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                  onPress={onClose}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextPrimary}>CLOSE</Text>
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
    maxWidth: 420,
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#9ec96a', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  subtitle: { color: '#6ab0c9', fontSize: 12, marginTop: 3, fontStyle: 'italic', letterSpacing: 1 },
  rule: { height: 1, backgroundColor: '#2b3a3e', marginTop: 8, marginBottom: 8 },
  body: { gap: 10, paddingVertical: 4 },
  line: { color: '#d6e4e8', fontSize: 13, lineHeight: 19 },
  rewardBlock: {
    backgroundColor: '#131c1f',
    borderLeftColor: '#9ec96a',
    borderLeftWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  reward: { color: '#9ec96a', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 96,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#6ab0c9', borderColor: '#6ab0c9' },
  btnTextPrimary: { color: '#0e1618', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

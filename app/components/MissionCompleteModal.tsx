// OTA — YOU FINISHED SOMETHING. SAY SO. Owner: "there needs to be a pop-up that
// hangs for a second to let you read that says that you completed a mission and
// give the name and the reward. I didn't even realize I completed the mission
// except for that the name of my escort was off the screen."
//
// Every completion — bounty, faction contract, hunt, mystery, storyline, story
// thread — announced itself as a LOG LINE and nothing else. The feed keeps
// moving, so the one line that says "you did the thing, here is the pay" scrolls
// off behind ambient chatter. The player's only clue that a job had ended was
// their escort's name vanishing from the HUD.
import React, { useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';

/** Safety valve only. The modal is meant to be DISMISSED, not waited out — the
 *  owner asked for it to hang so it can actually be read. This exists so a
 *  notice can never wedge the screen if a dismiss is somehow missed. */
const AUTO_CLOSE_MS = 12000;

export function MissionCompleteModal() {
  const notice = useGameStore((s) => s.missionCompleteNotice);
  const clear = useGameStore((s) => s.clearMissionCompleteNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => clear(), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [notice, clear]);

  if (!notice) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={clear}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>{notice.kind.toUpperCase()} COMPLETE</Text>
          <Text style={styles.title} accessibilityRole="header">{notice.title}</Text>
          <View style={styles.rule} />
          <ScrollView style={styles.bodyWrap} contentContainerStyle={styles.bodyPad}>
            {notice.rewards.map((r, i) => (
              <Text key={i} style={styles.reward}>✦ {r}</Text>
            ))}
          </ScrollView>
          <Pressable
            onPress={clear}
            style={styles.btn}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss. ${notice.kind} complete: ${notice.title}`}
          >
            <Text style={styles.btnText}>GOOD</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 440, backgroundColor: '#17150f',
    borderWidth: 1, borderColor: '#9ec96a', borderRadius: 6, padding: 20,
  },
  kicker: { color: '#9ec96a', fontSize: 11, letterSpacing: 2 },
  title: { color: '#f0e6cc', fontSize: 17, marginTop: 8, lineHeight: 23 },
  rule: { height: 1, backgroundColor: '#6b5c3a', marginVertical: 14 },
  bodyWrap: { maxHeight: 260 },
  bodyPad: { paddingBottom: 2 },
  reward: { color: '#e0c179', fontSize: 13, lineHeight: 20, marginBottom: 6 },
  btn: {
    alignSelf: 'flex-end', marginTop: 18, paddingVertical: 10, paddingHorizontal: 22,
    borderWidth: 1, borderColor: '#9ec96a', borderRadius: 4,
  },
  btnText: { color: '#9ec96a', fontSize: 12, letterSpacing: 1.5 },
});

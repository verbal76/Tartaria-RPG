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
/** OTA-1035 — a VICTORY card carries the fight's story as well as its take, and
 *  the whole point of moving that story out of the feed was that it was being
 *  read past. Twelve seconds is not enough for several paragraphs, so the valve
 *  opens much later on those. It is still only a valve — dismissal is the way
 *  out, and the timer never runs shorter than the mission-notice one. */
const AUTO_CLOSE_FLAVOR_MS = 60000;

export function MissionCompleteModal() {
  const notice = useGameStore((s) => s.missionCompleteNotice);
  const clear = useGameStore((s) => s.clearMissionCompleteNotice);

  const hasFlavor = !!notice?.flavor?.length;
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => clear(), hasFlavor ? AUTO_CLOSE_FLAVOR_MS : AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [notice, clear, hasFlavor]);

  if (!notice) return null;

  // OTA-1035 — a VICTORY card leads with the STORY and pays out underneath it.
  // Owner, on the faction beat that followed a Core Guardian kill: "it needs to
  // be last so it will be read, it gets pushed up screen and missed… the battle
  // follow up should have the flavor text, and the rewards on it."
  const flavor = notice.flavor ?? [];
  const heading = notice.heading ?? `${notice.kind.toUpperCase()} COMPLETE`;
  const victory = !!notice.heading;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={clear}>
      <View style={styles.backdrop}>
        <View style={[styles.card, victory && styles.cardVictory]}>
          <Text style={[styles.kicker, victory && styles.kickerVictory]}>{heading}</Text>
          <Text style={styles.title} accessibilityRole="header">{notice.title}</Text>
          <View style={[styles.rule, victory && styles.ruleVictory]} />
          <ScrollView style={styles.bodyWrap} contentContainerStyle={styles.bodyPad}>
            {flavor.map((f, i) => (
              <Text key={`f${i}`} style={styles.flavor}>{f}</Text>
            ))}
            {flavor.length > 0 && notice.rewards.length > 0 ? (
              <Text style={styles.takeLabel}>THE TAKE</Text>
            ) : null}
            {notice.rewards.map((r, i) => (
              <Text key={`r${i}`} style={styles.reward}>✦ {r}</Text>
            ))}
          </ScrollView>
          <Pressable
            onPress={clear}
            style={[styles.btn, victory && styles.btnVictory]}
            accessibilityRole="button"
            accessibilityLabel={victory
              ? `Dismiss. Victory: ${notice.title} defeated.`
              : `Dismiss. ${notice.kind} complete: ${notice.title}`}
          >
            <Text style={[styles.btnText, victory && styles.btnTextVictory]}>GOOD</Text>
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
  bodyWrap: { maxHeight: 380 },
  bodyPad: { paddingBottom: 2 },
  reward: { color: '#e0c179', fontSize: 13, lineHeight: 20, marginBottom: 6 },
  flavor: { color: '#cfc6b2', fontSize: 13, lineHeight: 21, marginBottom: 12 },
  takeLabel: {
    color: '#8aa0a4', fontSize: 10, letterSpacing: 2, marginTop: 4, marginBottom: 10,
  },
  btn: {
    alignSelf: 'flex-end', marginTop: 18, paddingVertical: 10, paddingHorizontal: 22,
    borderWidth: 1, borderColor: '#9ec96a', borderRadius: 4,
  },
  btnText: { color: '#9ec96a', fontSize: 12, letterSpacing: 1.5 },
  // A boss kill is gold, not the mission green — the two cards share a component
  // but should never be mistaken for each other at a glance.
  cardVictory: { borderColor: '#c9a86a' },
  kickerVictory: { color: '#c9a86a' },
  ruleVictory: { backgroundColor: '#7a6640' },
  btnVictory: { borderColor: '#c9a86a' },
  btnTextVictory: { color: '#c9a86a' },
});

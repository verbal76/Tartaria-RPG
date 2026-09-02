// ⚠⚠⚠ OTA-1600 — THE STINGER: a text cutscene for the moment the mission's
// fight stands up.
//
// Owner: *"should the big boss of the mission have a line of dialogue on a pop
// up to pull your attention back into the mission. like the ambush could have
// had a pop up with the mission title up top and something like the ambush
// leader yells there he is, make short work of him or something? not a talk
// card, just a popup to focus your attention? a text cutscenes?"*
//
// His own log made the case for him: the raider pack and the Reaver's arrival
// were single lines scrolling past in combat noise, and he typed "still didn't
// progress" while standing in the middle of the mission's own fight.
//
// ⚠ NOT a talk card — no choices, no NPC memory, one button, then the fight.
// Raised from `pendingMissionStinger`, which the ONE writer (advanceHunt) sets
// only when bodies actually stood up; the authored line also lands in the log,
// so the record keeps what the popup said. No tips opt-out here: this is story
// content, not a tutorial — silencing tips must not silence the missions.
//
// House palette per OTA-1043: a popup off the MissionCompleteModal palette
// reads as a different game.
//
// ⚠⚠ OTA-1602 — THE BEAT CARD wears the same curtain. Owner: *"multistage
// missions like the market heists either need a cutscene pop-up like the
// fight announcements or a conversation card pop up in between stages to
// separate and progress the mission."* A stage that closes on its own tile
// has no travel leg, no arrival, no stinger — so the closing prose and the
// next objective come up on this card with a CONTINUE button instead of
// FIGHT (the `cta` prop), and the optional `next` line says where the story
// goes. Same component, same palette: one curtain for the missions.
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

// ⚠⚠⚠ OTA-1622 — EVERY CLOSE COMES THROUGH HERE NOW, and the card carries what
// the close handed over (`granted`) above the next line. Owner: *"I spent so
// much time on that scaled never even knowing that I had it."*
export function MissionStingerModal({
  stinger, onClose, cta = 'FIGHT',
}: {
  stinger: { title: string; line: string; next?: string | null; granted?: string[] } | null;
  onClose: () => void;
  cta?: string;
}) {
  return (
    <Modal visible={!!stinger} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop} accessibilityViewIsModal={true}>
        <View style={styles.card}>
          <Text style={styles.kicker} accessibilityRole="header">
            {(stinger?.title ?? '').toUpperCase()}
          </Text>
          <View style={styles.rule} />
          <Text style={styles.line}>{stinger?.line ?? ''}</Text>
          {stinger?.granted?.length
            ? stinger.granted.map((g) => <Text key={g} style={styles.granted}>✦ {g} — in your pack.</Text>)
            : null}
          {stinger?.next ? <Text style={styles.next}>{stinger.next}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={cta === 'FIGHT' ? 'Close and fight' : 'Continue the mission'}
          >
            <Text style={styles.btnText}>{cta}</Text>
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
    borderWidth: 1, borderColor: '#c9a86a', borderRadius: 6, padding: 20,
  },
  kicker: { color: '#c9a86a', fontSize: 11, letterSpacing: 2 },
  rule: { height: 1, backgroundColor: '#6b5c3a', marginVertical: 14 },
  // The shout is the whole card — set large, with air, like a title card.
  line: { color: '#f0e6cc', fontSize: 18, lineHeight: 27 },
  // OTA-1602 — the "what's next" footnote under a beat, quieter than the prose.
  next: { color: '#c9a86a', fontSize: 13, lineHeight: 19, marginTop: 14 },
  // OTA-1622 — the receipt: what this close put in the pack.
  granted: { color: '#e6d7a8', fontSize: 14, lineHeight: 20, marginTop: 12 },
  btn: {
    alignSelf: 'flex-end', marginTop: 22, paddingVertical: 10, paddingHorizontal: 22,
    borderWidth: 1, borderColor: '#c9a86a', borderRadius: 4,
  },
  btnPressed: { backgroundColor: '#1f1b12' },
  btnText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.5 },
});

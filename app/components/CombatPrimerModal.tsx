// ⚠⚠ OTA-1321 — THE FIRST FIGHT EXPLAINS ITSELF, ONCE.
//
// Owner: *"let's add a first time pop-up for the first fight explaining briefly,
// how to heal, what Dodge and stealth do, and where to go to change armor and
// weapons and the approach button."*
//
// ⚠ RAISED FROM ONE DERIVED CONDITION, NOT FROM THE SPAWN SITES. An enemy can
// enter a scene from at least three places — the wilderness roll, the indoor
// rest-ambush (OTA-1032), and a climb-top overlay (OTA-089) — and wiring a
// "first fight" latch into each is how the third one gets forgotten. The screen
// asks one question instead: is there a live enemy in front of me, and has this
// character seen the card? So the primer fires on whichever fight is genuinely
// first, including a rest-ambush the player never chose to start.
//
// ⚠ EVERY LINE NAMES A CONTROL THAT EXISTS, AND A RULE THE ENGINE ACTUALLY
// RUNS. The labels are read off InputBox's own QuickBtns (dodge 612, stealth
// 617, approach 636, inventory 640, flee 619); the mechanics are read off the
// handlers, not off memory. Two drafts of this card were wrong before it
// shipped: it claimed healing costs your turn (it does not — OTA-619 made
// eating a free action, locked by `combatHealNoCounter`) and that an
// out-of-range weapon is "greyed out" (QuickBtn's `outOfRange` path buzzes and
// silently returns — no Arbiter line at all, which is precisely why the player
// needs telling). A card that misdescribes the game teaches distrust of the
// next one.
//
// ⚠ IT REPLACES the OTA-860 `combat_first_fight` FirstTimeHint rather than
// stacking on top of it. That hint fired on the same condition and taught a
// strict subset (type what you do / STEALTH / talk them down); its one unique
// idea is folded into the NOT EVERY FIGHT line here. Two cards on the same beat
// is the noise that gets tips switched off.
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';

export function CombatPrimerModal({
  visible, enemyName, onClose,
}: {
  visible: boolean;
  enemyName: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop} accessibilityViewIsModal={true}>
        <View style={styles.card}>
          <Text style={styles.kicker} accessibilityRole="header">YOUR FIRST FIGHT</Text>
          <Text style={styles.title}>
            {enemyName ? `${enemyName} is on you.` : 'Something is on you.'} Here is what the buttons do.
          </Text>
          <View style={styles.rule} />
          <ScrollView style={styles.bodyWrap} contentContainerStyle={styles.bodyPad}>
            <Text style={styles.row}>
              <Text style={styles.term}>HEALING — </Text>
              open <Text style={styles.btnRef}>inventory</Text> mid-fight and use a First Aid Kit,
              a ration, or anything else you can eat. Patching yourself up is free — nothing
              swings back for it — so heal early rather than at the edge.
            </Text>
            <Text style={styles.row}>
              <Text style={styles.term}>DODGE — </Text>
              read the incoming swing. Slip it and your next strike lands double;
              read it wrong and you take the hit like any other. It needs a moment
              to reset between uses.
            </Text>
            <Text style={styles.row}>
              <Text style={styles.term}>STEALTH — </Text>
              gets you out of their line. Used before you have closed, it is a free
              opening drop; used once they are on you, it costs your turn and they
              get to answer. Win it and your next strike lands +5; lose it and you
              are caught exposed. Daylight and open ground count against you.
            </Text>
            <Text style={styles.row}>
              <Text style={styles.term}>APPROACH — </Text>
              picks who you are fighting and closes the gap. Every weapon works at its
              own range: if a weapon button just buzzes and nothing happens, you are
              standing too far out — not swinging too weak. <Text style={styles.btnRef}>approach</Text>
              {' '}lights up whenever you are not yet in close. Moving costs you a beat,
              and anything already in reach gets a swing at you.
            </Text>
            <Text style={styles.row}>
              <Text style={styles.term}>WEAPONS &amp; ARMOR — </Text>
              also <Text style={styles.btnRef}>inventory</Text>: tap a piece to equip it.
              You can swap mid-fight, and what you wear changes what gets through.
            </Text>
            <Text style={styles.row}>
              <Text style={styles.term}>NOT EVERY FIGHT — </Text>
              you can also type what you want instead of tapping it, and some foes can be
              talked down, scared off, or simply outrun. <Text style={styles.btnRef}>flee</Text> is
              always there.
            </Text>
            <Text style={styles.footnote}>
              You can lose. Losing is part of it — the buried world keeps a roll of
              the fallen, and a Resurrection Gem brings one back.
            </Text>
          </ScrollView>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close the combat guide and fight"
          >
            <Text style={styles.btnText}>FIGHT</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// House palette, matching MissionCompleteModal (the reference card): warm
// #17150f body, gold border and accents, #f0e6cc title, translucent black
// backdrop. OTA-1043 established that a popup off this palette reads as a
// different game.
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
  title: { color: '#f0e6cc', fontSize: 16, marginTop: 8, lineHeight: 22 },
  rule: { height: 1, backgroundColor: '#6b5c3a', marginVertical: 14 },
  bodyWrap: { maxHeight: 360 },
  bodyPad: { paddingBottom: 2 },
  row: { color: '#cfc6b2', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  term: { color: '#e0c179', fontSize: 13, letterSpacing: 1 },
  btnRef: { color: '#e0c179' },
  footnote: { color: '#a2977b', fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginTop: 2 },
  btn: {
    alignSelf: 'flex-end', marginTop: 18, paddingVertical: 10, paddingHorizontal: 22,
    borderWidth: 1, borderColor: '#c9a86a', borderRadius: 4,
  },
  btnPressed: { backgroundColor: '#1f1b12' },
  btnText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.5 },
});

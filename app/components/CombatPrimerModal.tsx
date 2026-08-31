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
// ⚠⚠⚠ OTA-1524 — THIS CARD IGNORED THE GLOBAL TIPS SWITCH ENTIRELY. `setHintsDisabled`
// has existed since OTA-860 and every FirstTimeHint honours it and offers it; the two
// dedicated primers did neither, so a player who turned tips off still got this modal
// in their face and had no way to say no from inside it. An opt-out that some cards
// ignore is not an opt-out.
import { setHintsDisabled } from './useFirstTimeHint';

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
              own range: an amber weapon button buzzes when tapped and the Arbiter says
              why it cannot land from here — too far out, or the wrong tool for this
              ground — not that you swing too weak. <Text style={styles.btnRef}>approach</Text>
              {' '}lights up whenever you are not yet in close. Moving costs you a beat,
              and anything already in reach gets a swing at you.
            </Text>
            <Text style={styles.row}>
              <Text style={styles.term}>WEAPONS &amp; ARMOR — </Text>
              also <Text style={styles.btnRef}>inventory</Text>: tap a piece to equip it.
              You can swap mid-fight, and what you wear changes what gets through.
            </Text>
            {/* ⚠⚠ OTA-1523 — THE ROW IS NOT FIXED, AND NOBODY EVER SAID SO. Three
                controls added after this card shipped appear only when your kit
                earns them: BLOCK and SHIELD BASH with a shield on the off arm
                (OTA-1510), THROW SPEAR with a spare long shaft (OTA-1511). This
                line teaches the RULE — new buttons mean new gear — and leaves the
                mechanics to the hints that fire when each one actually lights, so
                two cards never land on the same beat. */}
            <Text style={styles.row}>
              <Text style={styles.term}>THE ROW GROWS — </Text>
              some buttons only appear once you are carrying the thing that earns them.
              Put a shield on your off arm and <Text style={styles.btnRef}>block</Text> and
              {' '}<Text style={styles.btnRef}>shield bash</Text> turn up; keep a spare spear
              and <Text style={styles.btnRef}>throw spear</Text> does. Each is explained the
              first time it appears — so check the row again after you change kit.
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
          {/* ⚠⚠ OTA-1524 — the same escape hatch every FirstTimeHint offers, in the
              same words, writing the same global flag. A player meeting their first
              fight is exactly the player most likely to want the tips to stop. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Turn off all tips and close this guide"
            onPress={() => { void setHintsDisabled(true); onClose(); }}
            hitSlop={8}
            style={styles.turnOffBtn}
          >
            <Text style={styles.turnOffText}>Turn off tips</Text>
          </Pressable>
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
  turnOffBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 4 },
  turnOffText: { color: '#8aa0a4', fontSize: 12, letterSpacing: 0.6, textDecorationLine: 'underline' },
  btn: {
    alignSelf: 'flex-end', marginTop: 18, paddingVertical: 10, paddingHorizontal: 22,
    borderWidth: 1, borderColor: '#c9a86a', borderRadius: 4,
  },
  btnPressed: { backgroundColor: '#1f1b12' },
  btnText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.5 },
});

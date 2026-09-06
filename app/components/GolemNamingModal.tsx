// OTA-1027 — GOLEM NAMING POPUP. Same treatment as the dog onboarding: the
// old flow captured the NEXT TYPED INPUT as the golem's name (or "skip"),
// which read as just another feed line and could swallow a combat command.
// Raised whenever pendingGolemNaming is set and a golem stands; a flag left
// over from a golem that died/dismissed before naming self-clears.
//
// OTA-1044 — brought in line with the dog card (OTA-1043). This card carried
// the same three faults, found by reading it rather than by a device report,
// so the owner never had to hit them twice:
//
//  (1) INSTANT RENDER. It opened the moment pendingGolemNaming flipped, which
//      is the same tick that logs "Aetherstone lifts out of the ground…
//      (HP x/y, NdM type)". That summon line is the only place the golem's
//      stats are stated, and the card covered it. Now holds while any
//      mission-complete / VICTORY card is up, then a dwell.
//  (2) WRONG PALETTE. Cold #8aa0a4 / #3a4448 on a near-opaque #040608
//      backdrop, full-bleed with no card body, against a game built on warm
//      #17150f + gold #c9a86a. Restyled to MissionCompleteModal, the house
//      reference.
//  (3) NO ROLL. The dog card has one; this had nothing but a placeholder. A
//      player who reached for the same affordance found empty space.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useCardViewport } from './KeyboardSafeCard';
import { keyboardInset } from '../engine/keyboardSafeCard';
import { useGameStore } from '../state/gameStore';
import { suggestGolemName } from '../engine/golems';

/** Beat the summon line gets to itself before the card lands. Shorter than the
 *  dog card's: a summon is player-initiated and the line is one sentence, not
 *  a fight result the player is still piecing together. */
export const GOLEM_CARD_DWELL_MS = 2500;

export function GolemNamingModal() {
  const pending = useGameStore((s) => s.pendingGolemNaming);
  const golem = useGameStore((s) => s.player?.golem);
  const notice = useGameStore((s) => s.missionCompleteNotice);
  const confirm = useGameStore((s) => s.confirmGolemName);
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false);

  // Heal a stale flag: golem vanished (dismissed / died) before naming.
  useEffect(() => {
    if (pending && !golem) confirm(null);
  }, [pending, golem, confirm]);

  // OTA-1044 — let the summon line be read first.
  const armed = !!pending && !!golem;
  const blocked = !!notice;
  useEffect(() => {
    if (!armed || blocked) {
      setReady(false);
      return;
    }
    const t = setTimeout(() => setReady(true), GOLEM_CARD_DWELL_MS);
    return () => clearTimeout(t);
  }, [armed, blocked]);

  // ⚠⚠ OTA-1718 — THIS MODAL HAD NO KEYBOARD AWARENESS AT ALL. The whole card
  // sits in a ScrollView, which looks like it solves the problem and does not:
  // a ScrollView inside a native <Modal> gets no keyboard inset on iOS, so its
  // content can only ever scroll until the last element sits at the BOTTOM of
  // the frame — which is under the keyboard. The name field is the one thing you
  // type here, so the confirm button was what got covered.
  // ⚠ Measured ABOVE the early returns below: a hook called after a `return
  // null` guard is a conditional hook, which is a different bug from the one
  // being fixed.
  const kbInset = keyboardInset(useCardViewport());

  if (!pending || !golem) return null;
  if (!ready) return null;
  const seal = () => {
    if (!name.trim()) return;
    confirm(name);
    setName('');
    setReady(false);
  };
  const keep = () => {
    confirm(null);
    setName('');
    setReady(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={keep}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 32 + kbInset }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.kicker}>THE CONSTRUCT WAKES</Text>
            <Text style={styles.title} accessibilityRole="header">Name your golem</Text>
            <View style={styles.rule} />
            <Text style={styles.sub}>
              You gave it life. It answers to its making — {golem.name} — until you seal
              something better into the Aetherstone.
            </Text>

            <Text style={styles.fieldLabel}>A NAME, IF YOU HAVE ONE</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                value={name}
                onChangeText={setName}
                placeholder={golem.name}
                placeholderTextColor="#6b5c3a"
                maxLength={16}
                accessibilityLabel="Golem name"
              />
              <Pressable
                onPress={() => setName(suggestGolemName())}
                style={styles.rollBtn}
                accessibilityRole="button"
                accessibilityLabel="Roll a name"
              >
                <Text style={styles.rollText}>⚄ ROLL</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={seal}
              style={[styles.confirmBtn, !name.trim() && styles.confirmBtnDisabled]}
              disabled={!name.trim()}
              accessibilityRole="button"
              accessibilityLabel="Seal the name"
            >
              <Text style={[styles.confirmText, !name.trim() && styles.confirmTextDisabled]}>SEAL THE NAME</Text>
            </Pressable>
            <Pressable onPress={keep} style={styles.keepBtn} accessibilityRole="button" accessibilityLabel="Keep its making">
              <Text style={styles.keepText}>KEEP ITS MAKING</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// OTA-1044 — palette matched to MissionCompleteModal / DogOnboardingModal.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 20, paddingVertical: 32, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#17150f',
    borderWidth: 1,
    borderColor: '#c9a86a',
    borderRadius: 6,
    padding: 20,
  },
  kicker: { color: '#c9a86a', fontSize: 11, letterSpacing: 2 },
  title: { color: '#f0e6cc', fontSize: 17, marginTop: 8, lineHeight: 23 },
  rule: { height: 1, backgroundColor: '#7a6640', marginVertical: 14 },
  sub: { color: '#cfc6b2', fontSize: 13, lineHeight: 21 },
  fieldLabel: {
    color: '#8aa0a4', fontSize: 10, letterSpacing: 2, marginTop: 16, marginBottom: 6,
  },
  input: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#e0c179',
    fontSize: 15,
    backgroundColor: '#0f0d09',
  },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1 },
  rollBtn: {
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#241d10',
  },
  rollText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.5 },
  confirmBtn: {
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
    backgroundColor: '#2a1f12',
  },
  confirmBtnDisabled: { borderColor: '#4a412c', backgroundColor: '#15130d' },
  confirmText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.5 },
  confirmTextDisabled: { color: '#6b5c3a' },
  keepBtn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#0f0d09',
  },
  keepText: { color: '#8aa0a4', fontSize: 12, letterSpacing: 1.5 },
});

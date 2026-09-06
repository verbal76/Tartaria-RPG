// OTA-1027 — DOG ONBOARDING POPUP. A playtester at the rescue moment typed
// "rest", thought the naming beat was another fight, and the old in-feed
// takeover silently stored "rest" as the breed. The three asks (breed, name,
// sex) now land together on one blocking card in the house style — answers
// you can see and change before committing. Raised whenever
// worldMemory.pendingDogOnboarding is non-null, so a save wedged partway
// through the old typed flow heals here too (its part-answers pre-fill).
// No dismiss-without-answering: the dog is already rescued; it needs a name.
//
// OTA-1043 — two owner reports against this card:
//
//  (1) "fired too fast — I hadn't seen the results of the fight and that I had
//      won before that popped on the screen." completeRescueScenario sets
//      pendingDogOnboarding inside resolveEnemyDefeat, in the SAME tick that
//      appends the victory lines, so the card covered the feed before the
//      player could read that they'd won. It now waits: nothing renders while
//      a mission-complete / VICTORY card is still up, and once the screen is
//      clear a dwell timer gives the fight result time to be read.
//
//  (2) "it's in the wrong color scheme — not the same as the rest of the
//      game." True: this card was built on a cold slate/cyan palette
//      (#8aa0a4 labels, #3a4448 borders, near-opaque #040608 backdrop) over a
//      full-bleed scroll, while every other popup in the game is a BOUNDED
//      warm card — #17150f body, gold #c9a86a border and accents, #f0e6cc
//      titles — floating on a translucent black backdrop. Restyled to match
//      MissionCompleteModal, which is the house reference.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useCardViewport } from './KeyboardSafeCard';
import { keyboardInset } from '../engine/keyboardSafeCard';
import { useGameStore } from '../state/gameStore';
import { defaultDogName } from '../engine/dogCompanion';
// ⚠⚠⚠ OTA-1525 — THE OWNER WANTED THE SWITCH HERE TOO: "push the dog card tips
// button too." OTA-1524 had exempted this card because it ASKS rather than tells
// — its own contract is "No dismiss-without-answering: the dog is already
// rescued; it needs a name" — and a plain dismiss would leave the save wedged
// exactly where OTA-1027 found it.
// ⚠⚠ SO THE BUTTON IS HERE AND IT DOES NOT DISMISS. It silences every FUTURE tip
// — the thing the player is actually asking for when they reach for it — and
// leaves this one question standing, because the dog still needs an answer. A
// switch that silences tips must not also silence a question the game needs
// answered; honouring the request and protecting the save are not in conflict
// once the button stops meaning "close this".
import { setHintsDisabled, getHintsDisabled } from './useFirstTimeHint';

/** How long the fight result gets the screen to itself once any competing
 *  card is gone. Long enough to read "you won" and the spoils; short enough
 *  that the pause reads as a beat rather than a hang. */
// OTA-1075 — 4000 → 3200 at the owner's direction ("just a hair" shorter):
// still long enough to read the purple victory beat, no longer long enough
// to start typing into the feed before the card lands.
export const DOG_CARD_DWELL_MS = 3200;

export function DogOnboardingModal() {
  const pending = useGameStore((s) => s.worldMemory.pendingDogOnboarding);
  const player = useGameStore((s) => s.player);
  const notice = useGameStore((s) => s.missionCompleteNotice);
  const confirm = useGameStore((s) => s.confirmDogOnboarding);
  // null = untouched (falls back to any part-answer a wedged save carried).
  // ⚠ Local echo so the tap has visible feedback: the link is the only control
  // on this card that does not change the screen, and a control that appears to
  // do nothing reads as broken.
  const [tipsOff, setTipsOff] = useState(false);
  const [breed, setBreed] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [sex, setSex] = useState<'boy' | 'girl' | null>(null);
  // OTA-1043 — the read-the-fight-first gate.
  const [ready, setReady] = useState(false);

  const armed = !!pending;
  const blocked = !!notice;
  useEffect(() => {
    // Not armed, or another card owns the screen: stay closed and keep the
    // dwell un-started. When the competing card is dismissed this re-runs and
    // the timer begins from THAT moment, not from the kill.
    if (!armed || blocked) {
      setReady(false);
      return;
    }
    const t = setTimeout(() => setReady(true), DOG_CARD_DWELL_MS);
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

  if (!pending || !player) return null;
  if (!ready) return null;
  const breedVal = breed ?? pending.breed ?? '';
  const nameVal = name ?? pending.name ?? '';
  const commit = () => {
    if (!sex) return;
    confirm(breedVal, nameVal, sex);
    // Reset local state so the NEXT dog (a fresh save) starts blank.
    setBreed(null);
    setName(null);
    setSex(null);
    setReady(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={commit}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 32 + kbInset }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.kicker}>THE RESCUE IS DONE</Text>
            <Text style={styles.title} accessibilityRole="header">The dog is yours</Text>
            <View style={styles.rule} />
            <Text style={styles.sub}>
              The Arbiter waits with the ledger open. Three answers and the road is open.
            </Text>

            <Text style={styles.fieldLabel}>WHAT KIND OF DOG IS IT?</Text>
            <TextInput
              style={styles.input}
              value={breedVal}
              onChangeText={setBreed}
              placeholder="mutt, pitbull, shepherd…"
              placeholderTextColor="#6b5c3a"
              maxLength={24}
              accessibilityLabel="Dog breed"
            />

            <Text style={styles.fieldLabel}>WHAT WILL YOU NAME THEM?</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                value={nameVal}
                onChangeText={setName}
                placeholder="a name for the road"
                placeholderTextColor="#6b5c3a"
                maxLength={16}
                accessibilityLabel="Dog name"
              />
              <Pressable
                onPress={() => setName(defaultDogName())}
                style={styles.rollBtn}
                accessibilityRole="button"
                accessibilityLabel="Roll a name"
              >
                <Text style={styles.rollText}>⚄ ROLL</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>BOY OR GIRL?</Text>
            <View style={styles.pillRow}>
              {(['boy', 'girl'] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSex(s)}
                  style={[styles.pill, sex === s && styles.pillSel]}
                  accessibilityRole="button"
                  accessibilityLabel={s === 'boy' ? 'Boy' : 'Girl'}
                >
                  <Text style={[styles.pillText, sex === s && styles.pillTextSel]}>{s.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={commit}
              style={[styles.confirmBtn, !sex && styles.confirmBtnDisabled]}
              disabled={!sex}
              accessibilityRole="button"
              accessibilityLabel="Take them with you"
            >
              <Text style={[styles.confirmText, !sex && styles.confirmTextDisabled]}>TAKE THEM WITH YOU</Text>
            </Pressable>
            <Text style={styles.hint}>
              A blank breed or name is fine — the mud fills in. Boy or girl needs an answer.
            </Text>
            {/* ⚠⚠ OTA-1525 — the same escape hatch every other card offers, in the
                same words and writing the same global flag — but WITHOUT the
                dismiss. Tapping it turns off every future tip and leaves this
                card up, because the dog is already rescued and still needs a
                name. The label latches so the tap is visibly acknowledged. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tipsOff || getHintsDisabled()
                ? 'Tips are off. This card still needs an answer.'
                : 'Turn off all future tips. This card stays until the dog is named.'}
              onPress={() => { void setHintsDisabled(true); setTipsOff(true); }}
              disabled={tipsOff || getHintsDisabled()}
              hitSlop={8}
              style={styles.turnOffBtn}
            >
              <Text style={styles.turnOffText}>
                {tipsOff || getHintsDisabled() ? 'Tips off — the dog still needs a name' : 'Turn off tips'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// OTA-1043 — palette matched to MissionCompleteModal, the house reference for
// a blocking card. Warm body over a translucent backdrop (you can still see
// the game behind it, which is the point — the fight result stays visible),
// gold border and accents, cream title. The previous cold slate/cyan scheme
// belonged to no other screen in the game.
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
  sub: { color: '#cfc6b2', fontSize: 13, lineHeight: 21, marginBottom: 4 },
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
  pillRow: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0f0d09',
  },
  pillSel: { borderColor: '#c9a86a', backgroundColor: '#2a1f12' },
  pillText: { color: '#8aa0a4', fontSize: 13, letterSpacing: 2 },
  pillTextSel: { color: '#c9a86a' },
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
  turnOffBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 6 },
  turnOffText: { color: '#8aa0a4', fontSize: 11, letterSpacing: 0.6, textDecorationLine: 'underline', textAlign: 'center' },
  hint: { color: '#8aa0a4', fontSize: 10, letterSpacing: 1, textAlign: 'center', marginTop: 12 },
});

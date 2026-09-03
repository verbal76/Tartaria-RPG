// ⚠⚠⚠ OTA-1530 — MEETING A PERSON ON THE ROAD IS AN EVENT, NOT A LOG LINE.
//
// The owner, on his first wanderer in many characters' worth of play: *"the
// encounter came off kind of weird, I never saw an opening statement or setup for
// them … shouldn't we have a popup when we encounter them, so it's a solo
// instance? and it could have an explanation so the player knows what's
// happening."*
//
// ⚠⚠ THE GREETING WAS NEVER MISSING. It fired, on time, exactly as OTA-807 wrote
// it. His log, 02:21:38.996:
//
//   "A scavenger crouches over a picked-clean carcass of machinery, stuffing bolts
//    into a sack. They half-rise, eyeing your hands and your pack in equal
//    measure. This is Tolen, a twitchy scavenger. (Try "talk to Tolen" — a fair
//    word carries.)"
//
// And then, in the SAME MILLISECOND and the four after it: the ash-storm weather
// block, the full location description, the compass line, and the Arbiter. Six
// world lines at .996–.001. The introduction to the only person you have met on
// the open road in thirty days was line one of a six-line dump fired by walking
// out of an outpost door. It was not unexplained; it was buried.
//
// So the fix is not more words, it is a place to put the ones already written.
// This card takes the greeting out of the feed and gives it the screen — the
// same trade OTA-1043 made for the dog card after the owner reported the same
// class of complaint ("fired too fast — I hadn't seen the results of the fight").
//
// ⚠ WHAT IT DOES NOT DO. It does not decide for you: PERSUADE and INTIMIDATE stay
// on the parley modal where they have always lived, because that screen already
// reads the temperament and prices each verb. This card answers "who is this and
// why are they on my screen", then hands off. Anything else would be two screens
// competing to own one exchange.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { setHintsDisabled, useHintsDisabled } from './useFirstTimeHint';

/** How long the card waits after arrival. The wanderer greeting lands in the same
 *  breath as the location description and the weather; opening on top of that
 *  would cover the thing the player is still reading — OTA-1043's lesson, applied
 *  to the beat that taught it. */
export const WANDERER_CARD_DWELL_MS = 1200;

export function WandererEncounterModal() {
  const wanderer = useGameStore((s) => s.currentScene?.wanderer);
  const enemies = useGameStore((s) => s.currentScene?.enemies?.length ?? 0);
  const notice = useGameStore((s) => s.missionCompleteNotice);
  // ⚠ OTA-1635 — THE CARD WAITS ITS TURN. Owner, 00:07: *"I hit investigate and
  // right after that the pop-up for Nix came up. so then I had to do my
  // investigate and then when that closed then the next conversation came up.
  // they kind of overlapped each other."* His log: arrival 00:07:17.97, TAKE /
  // SALVAGE picker open at :19.39, this card (1200 ms dwell) at ~:19.2 on top of
  // it, "talk to Nix" at :22 while the picker was still up, the salvage haul
  // printing at :25 under the parley. So: not while a picker is up, and not on
  // any screen but the one the stranger is standing on. When the picker closes
  // the dwell starts fresh and the card arrives after the haul has printed.
  const pickerOpen = useGameStore((s) => s.explorationPickerOpen);
  const screen = useGameStore((s) => s.currentScreen);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const hintsOff = useHintsDisabled();
  // Per-wanderer acknowledgement. Keyed on the id, so the card is offered once
  // per PERSON — walking off a tile and back does not re-raise it, and the next
  // stranger down the road still gets their own introduction.
  const [seenId, setSeenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const armed = !!wanderer && wanderer.id !== seenId && enemies === 0 && !notice
    && !pickerOpen && screen === 'exploration';
  useEffect(() => {
    if (!armed) {
      setReady(false);
      return;
    }
    const t = setTimeout(() => setReady(true), WANDERER_CARD_DWELL_MS);
    return () => clearTimeout(t);
  }, [armed]);

  if (!wanderer || !armed || !ready) return null;

  const dismiss = () => setSeenId(wanderer.id);
  const speak = () => {
    setSeenId(wanderer.id);
    submit(`talk to ${wanderer.name}`);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.kicker}>SOMEONE ON THE ROAD</Text>
            <Text style={styles.title} accessibilityRole="header">
              {wanderer.name}, {wanderer.role}
            </Text>
            <View style={styles.rule} />

            {/* The archetype's own arrival narration, given the screen instead of
                the fourth line of a six-line arrival dump. */}
            <Text style={styles.body}>{wanderer.greeting}</Text>

            {/* ⚠ The explanation the owner asked for, and the only part gated on
                the tips switch. Who this person is stays; what the system is
                goes quiet once you know it. */}
            {!hintsOff && (
              <>
                <View style={styles.rule} />
                <Text style={styles.explain}>
                  Travellers, refugees, tinkers and scavengers cross the waste the same as you do.
                  They are not vendors and they carry no stall — what they have is what is on them
                  and what they know.
                </Text>
                <Text style={styles.explain}>
                  Speak with them and it turns on how you ask. A fair word can buy a tip, a few
                  coins, or a lead worth following. Pressure works too, on the ones who only
                  answer to it — but word travels, and their people hear about it.
                </Text>
              </>
            )}

            <Pressable
              onPress={speak}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel={`Speak with ${wanderer.name}`}
            >
              <Text style={styles.primaryText}>SPEAK WITH THEM</Text>
            </Pressable>
            <Pressable
              onPress={dismiss}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Walk on without speaking"
            >
              <Text style={styles.secondaryText}>WALK ON</Text>
            </Pressable>
            {/* ⚠ The same escape hatch every other card offers (OTA-1524), in the
                same words and writing the same global flag. It silences the
                explanation above, not the encounter — a switch that turned off
                tips must not also turn off the people you meet. */}
            {!hintsOff && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Turn off all future tips. You will still meet people on the road."
                onPress={() => { void setHintsDisabled(true); }}
                hitSlop={8}
                style={styles.turnOffBtn}
              >
                <Text style={styles.turnOffText}>Turn off tips</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// House palette, matched to MissionCompleteModal / DogOnboardingModal: warm body
// on a translucent backdrop, gold border and accents, cream title.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center' },
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
  body: { color: '#cfc6b2', fontSize: 14, lineHeight: 22 },
  explain: { color: '#8aa0a4', fontSize: 12, lineHeight: 19, marginBottom: 8 },
  primaryBtn: {
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
    backgroundColor: '#2a1f12',
  },
  primaryText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.5 },
  secondaryBtn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#15130d',
  },
  secondaryText: { color: '#8aa0a4', fontSize: 12, letterSpacing: 1.5 },
  turnOffBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 6 },
  turnOffText: {
    color: '#8aa0a4', fontSize: 11, letterSpacing: 0.6,
    textDecorationLine: 'underline', textAlign: 'center',
  },
});

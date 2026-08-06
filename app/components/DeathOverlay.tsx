// OTA-1133 — THE DEATH SCREEN. Owner: "The second my HP hits 0 for whatever
// reason there should be a crossfade between the game screen and a new screen
// like the intro screen that gives a brief description of my death lore style
// and how it ties to my reason for entering the mud world and after a few
// seconds to read it, it should go to the character collection screen. This
// should add immersion and a clean character death, and stop anything else
// from happening after I hit 0."
//
// Deliberately the SIBLING of StoryIntroOverlay, not a new visual language:
// the same near-black backdrop, the same centered serif-weight body at the
// same measure, the same quiet letterspaced hint at the bottom. The opening
// crawl asked why you came down; this answers it, and it should look like the
// same book closing.
//
// Three differences from the intro, all deliberate:
//   1. THE CROSSFADE IS SLOW (1.6s). The intro drifts up because you are
//      arriving. This one just darkens in, because you are not.
//   2. THERE IS NO SKIP. You can tap to leave EARLY once the text has settled,
//      but there is no button offering to spare you the reading. A death you
//      can dismiss before it renders is not an ending.
//   3. IT LEAVES ON ITS OWN. After DWELL_MS the overlay hands over to the
//      character collection without being touched, so a player who put the
//      phone down still gets a clean close instead of a stuck modal.

import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';

/** Fade from the game screen into the dark. */
const FADE_IN_MS = 1600;
/** Body text settles in after the dark has taken hold — the fall, then the words. */
const TEXT_IN_MS = 1400;
const TEXT_DELAY_MS = 900;
/** How long the screen holds before handing over on its own.
 *  OTA-1142 — 11s → 16s on the owner's call: *"increase the delay on death
 *  before it goes to the character collection screen by 5 seconds. they can
 *  always tap to close if they want."* The tap-to-leave escape is what makes a
 *  long hold safe — the floor is how long a player who wants to read gets, and
 *  the ceiling is their thumb. Erring long costs an impatient player one tap;
 *  erring short costs a reading player their character's ending. */
const DWELL_MS = 16000;
/** Tapping is ignored until the text is actually legible — otherwise a player
 *  mid-tap when they died would skip their own ending without seeing it. */
const TAP_ARMS_AT_MS = TEXT_DELAY_MS + TEXT_IN_MS;

export function DeathOverlay() {
  const scene = useGameStore((s) => s.pendingDeath);
  const dismiss = useGameStore((s) => s.dismissDeath);
  const dark = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!scene) return undefined;
    setArmed(false);
    dark.setValue(0);
    words.setValue(0);
    Animated.timing(dark, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
    Animated.timing(words, {
      toValue: 1,
      delay: TEXT_DELAY_MS,
      duration: TEXT_IN_MS,
      useNativeDriver: true,
    }).start();
    const arm = setTimeout(() => setArmed(true), TAP_ARMS_AT_MS);
    // The overlay closes itself. A player who set the phone down mid-fight
    // must never come back to a modal waiting on a tap it never told them to
    // make.
    const leave = setTimeout(() => dismiss(), DWELL_MS);
    return () => {
      clearTimeout(arm);
      clearTimeout(leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene ? scene.title + scene.closing : null]);

  if (!scene) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => { if (armed) dismiss(); }}>
      <Animated.View style={[styles.backdrop, { opacity: dark }]}>
        <Pressable
          style={styles.tapTarget}
          onPress={() => { if (armed) dismiss(); }}
          accessibilityRole="button"
          accessibilityLabel={`${scene.title} has fallen. ${scene.paragraphs.join(' ')} ${scene.closing}. Tap to continue.`}
        >
          <Animated.View style={[styles.body, { opacity: words }]}>
            <Text style={styles.kicker}>THE BURIED WORLD KEEPS</Text>
            <Text style={styles.name} numberOfLines={2}>{scene.title}</Text>
            <View style={styles.rule} />
            <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
              {scene.paragraphs.map((p, i) => (
                <Text key={i} style={i === scene.paragraphs.length - 1 ? styles.ledger : styles.para}>
                  {p}
                </Text>
              ))}
              <Text style={styles.closing}>{scene.closing}</Text>
            </ScrollView>
          </Animated.View>
          <View style={styles.bottomRow}>
            {armed ? <Text style={styles.hint}>TAP TO CONTINUE</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Fractionally darker than the intro's backdrop and fully opaque — the intro
  // sits OVER a world you are about to enter; there is nothing behind this one
  // worth seeing.
  backdrop: { flex: 1, backgroundColor: '#020304' },
  tapTarget: { flex: 1, justifyContent: 'center' },
  body: { paddingHorizontal: 28, maxHeight: '82%' },
  kicker: {
    color: '#4d5a5e',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 10,
  },
  name: {
    color: '#c9a86a',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  rule: {
    height: 1,
    backgroundColor: '#3a342c',
    alignSelf: 'center',
    width: 88,
    marginTop: 16,
    marginBottom: 22,
  },
  pad: { paddingBottom: 8 },
  para: {
    color: '#d8cfc0',
    fontSize: 16,
    lineHeight: 27,
    textAlign: 'center',
    marginBottom: 18,
  },
  // The ledger is the factual one — dimmer and smaller, so the numbers read as
  // a record rather than as more prose.
  ledger: {
    color: '#8d8674',
    fontSize: 13,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 18,
  },
  closing: {
    color: '#7c8f6a',
    fontSize: 14,
    lineHeight: 23,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  bottomRow: { position: 'absolute', bottom: 46, left: 0, right: 0, alignItems: 'center' },
  hint: { color: '#5a6a6e', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
});

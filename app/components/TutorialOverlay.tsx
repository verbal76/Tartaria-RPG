import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { TUTORIAL_STEPS } from './tutorialSteps';

// Tungsten Spire rewrite: the welcome-card overlay is gone. Tutorial
// dialogue lives inline in the world feed (Arbiter channel) and the
// pulsing UI element below tells the player what to act on. The
// overlay's only remaining job is the SKIP TUTORIAL pill, anchored
// to the top-right of the screen.
//
// arb108 — the pill is the player's escape hatch from the OUTPOST tutorial
// LOCKDOWN, so it shows for exactly as long as the lock holds: from the name
// beat through the stay/leave choice. It disappears the moment the player
// taps SKIP (tutorialStep → null) OR makes the stay/leave choice
// (tutorialExploreChosen, or the beat advances past explore_or_leave to
// main_quest / pick_city, which are post-choice and not locked).
const TUT_LOCK_BEATS = ['name', 'cudgel', 'rope', 'scrap', 'climb', 'investigate', 'explore_or_leave'];
//
// ⚠⚠⚠ OTA-1531 — AND NOT WHILE THE OPENING IS STILL TALKING. The owner, starting
// a new character: *"first thing I notice is the skip tutorial button is
// immediately visible. it shouldn't show until the player story cards are done
// and you are in the tutorial screen."*
//
// He is right, and the reason it happened is that the pill's visibility was
// derived from the TUTORIAL alone. `tutorialStep` reaches the `name` beat while
// the opening crawl (OTA-1018), the chapter card (OTA-1020), the motive picker
// (OTA-1022) and the dedication card are still ahead of the player — so by the
// pill's own rule it was due on screen, and the only thing standing between it
// and the player was z-order.
//
// ⚠⚠ WHICH IS NOT A GUARANTEE. Those cards are RN Modals and this is a plain
// absolutely-positioned View mounted OUTSIDE SafeAreaView (see App.tsx) carrying
// `elevation: 6` — and OTA-234 already established, on this codebase, that the
// stacking relationship between a Modal and a raised sibling view is not a thing
// to reason about from the source. The owner watched it lose. So the fix is
// state, not layering: an escape hatch from a lockdown the player has not been
// put in yet has nothing to escape, and it is not rendered.
//
// ⚠ The pill's ORIGINAL contract (arb108) is untouched: it still shows for
// exactly as long as the outpost lockdown holds, and still vanishes on SKIP or on
// the stay/leave choice. All that changes is that the lockdown's escape hatch
// waits for the player to actually arrive in the lockdown.
export function TutorialOverlay() {
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const tutorialExploreChosen = useGameStore((s) => s.tutorialExploreChosen);
  const skipTutorial = useGameStore((s) => s.skipTutorial);
  // The opening's own cards, in the order a new character meets them.
  const storyIntro = useGameStore((s) => s.storyIntro);
  const chapterCard = useGameStore((s) => s.chapterCard);
  const dedicationCard = useGameStore((s) => s.dedicationCard);
  const motivePickerPending = useGameStore((s) => s.motivePickerPending);
  const pendingFork = useGameStore((s) => s.pendingFork);

  if (tutorialStep === null) return null;
  // ⚠ Same set the store already treats as "the screen is busy" (announceTide and
  // its neighbours), so one idea of an interrupted opening, not two.
  if (storyIntro || chapterCard || dedicationCard || motivePickerPending || pendingFork) return null;
  const beatId = TUTORIAL_STEPS[tutorialStep]?.id ?? null;
  const locked = beatId !== null && TUT_LOCK_BEATS.includes(beatId) && !tutorialExploreChosen;
  if (!locked) return null;

  return (
    <View style={styles.root} pointerEvents="box-none" accessibilityViewIsModal={true}>
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        onPress={skipTutorial}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Text style={styles.pillText}>SKIP TUTORIAL ▸</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    paddingHorizontal: 12,
    paddingTop: 8,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  pill: {
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  pillPressed: { opacity: 0.7 },
  pillText: { color: '#c9a86a', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
});

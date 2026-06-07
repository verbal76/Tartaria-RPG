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
export function TutorialOverlay() {
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const tutorialExploreChosen = useGameStore((s) => s.tutorialExploreChosen);
  const skipTutorial = useGameStore((s) => s.skipTutorial);

  if (tutorialStep === null) return null;
  const beatId = TUTORIAL_STEPS[tutorialStep]?.id ?? null;
  const locked = beatId !== null && TUT_LOCK_BEATS.includes(beatId) && !tutorialExploreChosen;
  if (!locked) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        onPress={skipTutorial}
        hitSlop={8}
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

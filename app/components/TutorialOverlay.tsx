import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useGameStore } from '../state/gameStore';

// Tungsten Spire rewrite: the welcome-card overlay is gone. Tutorial
// dialogue lives inline in the world feed (Arbiter channel) and the
// pulsing UI element below tells the player what to act on. The
// overlay's only remaining job is the SKIP TUTORIAL pill, anchored
// to the top-right of the screen and visible whenever the tutorial
// is active.
export function TutorialOverlay() {
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const skipTutorial = useGameStore((s) => s.skipTutorial);

  if (tutorialStep === null) return null;

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

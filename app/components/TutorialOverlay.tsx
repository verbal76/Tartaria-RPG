import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { TUTORIAL_STEPS, type HighlightArea } from './tutorialSteps';

// Card position: keep the popup away from the area it's describing so
// the player can see what's being highlighted. Top-row regions push the
// card down; bottom-row regions push it up; mid-screen + screens that
// have their OWN content (inventory / vendor) get a compact top card so
// the screen below stays visible.
function cardPositionFor(area: HighlightArea): 'top' | 'bottom' {
  switch (area) {
    case 'top-left-stats':
    case 'top-right-enemy':
    case 'scene-bar':
      return 'bottom';
    case 'travel-row':
    case 'quick-row':
    case 'input-row':
      return 'top';
    case 'feed':
    case 'fullscreen':
    default:
      // Push to bottom for feed (so the feed itself is unobscured) and
      // for inventory / vendor (so the screen behind the card reads).
      return 'bottom';
  }
}

export function TutorialOverlay() {
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const advanceTutorial = useGameStore((s) => s.advanceTutorial);
  const skipTutorial = useGameStore((s) => s.skipTutorial);
  const setScreen = useGameStore((s) => s.setScreen);
  const currentScreen = useGameStore((s) => s.currentScreen);

  const step = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] ?? null : null;

  // Drive screen navigation as the tutorial advances. If the current
  // step's screen doesn't match what's rendered, dispatch a switch.
  useEffect(() => {
    if (!step) return;
    if (step.screen !== currentScreen) {
      setScreen(step.screen);
    }
  }, [step, currentScreen, setScreen]);

  if (!step) return null;

  const isWelcome = step.welcome === true;
  const isLast = tutorialStep === TUTORIAL_STEPS.length - 1;
  const pos = cardPositionFor(step.area);

  return (
    // No backdrop. The targeted component glows itself (via TutorialTarget)
    // so the screen stays fully readable. Card is anchored to one edge.
    <View
      style={[styles.root, pos === 'top' ? styles.rootTop : styles.rootBottom]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        <Text style={styles.title}>{step.title.toUpperCase()}</Text>
        <View style={styles.rule} />
        <Text style={styles.body}>{step.body}</Text>
        <View style={styles.bottomRow}>
          <Text style={styles.stepIndicator}>
            Step {(tutorialStep ?? 0) + 1} of {TUTORIAL_STEPS.length}
          </Text>
          <View style={styles.btnRow}>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
              onPress={skipTutorial}
            >
              <Text style={styles.btnTextNeutral}>SKIP</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
              onPress={advanceTutorial}
            >
              <Text style={styles.btnTextPrimary}>
                {isWelcome ? 'CONTINUE' : isLast ? 'BEGIN' : 'NEXT →'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    paddingHorizontal: 12,
  },
  rootTop: { justifyContent: 'flex-start', paddingTop: 60, alignItems: 'center' },
  rootBottom: { justifyContent: 'flex-end', paddingBottom: 60, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    // Drop shadow so the card reads on top of whatever screen is below.
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: { color: '#c9a86a', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 8 },
  body: { color: '#e6d8b3', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepIndicator: { color: '#7a705c', fontSize: 10, letterSpacing: 1 },
  btnRow: { flexDirection: 'row', gap: 6 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 11 },
});

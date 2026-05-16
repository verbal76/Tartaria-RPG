import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { TUTORIAL_STEPS, type HighlightArea } from './tutorialSteps';

// Highlight regions as fractional positions of the viewport. Imperfect
// but no native deps — close enough that the player understands which
// area the popup is talking about.
function regionFor(area: HighlightArea, vw: number, vh: number) {
  switch (area) {
    case 'top-left-stats':   return { top: vh * 0.04, left: vw * 0.02, width: vw * 0.58, height: vh * 0.22 };
    case 'top-right-enemy':  return { top: vh * 0.04, left: vw * 0.60, width: vw * 0.38, height: vh * 0.22 };
    case 'scene-bar':        return { top: vh * 0.27, left: vw * 0.02, width: vw * 0.96, height: vh * 0.05 };
    case 'feed':             return { top: vh * 0.33, left: vw * 0.02, width: vw * 0.96, height: vh * 0.42 };
    case 'quick-row':        return { top: vh * 0.77, left: vw * 0.02, width: vw * 0.96, height: vh * 0.06 };
    case 'input-row':        return { top: vh * 0.84, left: vw * 0.02, width: vw * 0.96, height: vh * 0.07 };
    case 'bottom-menu':      return { top: vh * 0.92, left: vw * 0.02, width: vw * 0.96, height: vh * 0.05 };
    case 'fullscreen':
    default:                 return null;
  }
}

// Decide whether the info card sits above or below the highlight, so it
// doesn't cover the thing it's describing.
function cardPositionFor(area: HighlightArea): 'top' | 'bottom' | 'center' {
  switch (area) {
    case 'top-left-stats':
    case 'top-right-enemy':
    case 'scene-bar':
      return 'bottom';
    case 'feed':
    case 'fullscreen':
      return 'center';
    case 'quick-row':
    case 'input-row':
    case 'bottom-menu':
      return 'top';
    default:
      return 'center';
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

  const { width: vw, height: vh } = Dimensions.get('window');
  const region = useMemo(() => (step ? regionFor(step.area, vw, vh) : null), [step, vw, vh]);
  const cardPos = step ? cardPositionFor(step.area) : 'center';

  if (!step) return null;

  // Build the four dim rectangles around the highlighted region. When
  // region is null (fullscreen), one big dim covers everything.
  const dims: { top: number; left: number; width: number; height: number }[] = [];
  if (region) {
    // Above
    dims.push({ top: 0, left: 0, width: vw, height: region.top });
    // Below
    dims.push({ top: region.top + region.height, left: 0, width: vw, height: vh - (region.top + region.height) });
    // Left
    dims.push({ top: region.top, left: 0, width: region.left, height: region.height });
    // Right
    dims.push({ top: region.top, left: region.left + region.width, width: vw - (region.left + region.width), height: region.height });
  } else {
    dims.push({ top: 0, left: 0, width: vw, height: vh });
  }

  const isWelcome = step.welcome === true;
  const isLast = tutorialStep === TUTORIAL_STEPS.length - 1;

  // Card position: top half / bottom half / centered.
  const cardWrapStyle =
    cardPos === 'top' ? styles.cardWrapTop
    : cardPos === 'bottom' ? styles.cardWrapBottom
    : styles.cardWrapCenter;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Dim layers — pointerEvents 'auto' so they block taps on the
          underlying UI while the tutorial is active. */}
      {dims.map((d, i) => (
        <View
          key={i}
          style={[styles.dim, { top: d.top, left: d.left, width: d.width, height: d.height }]}
          pointerEvents="auto"
        />
      ))}
      {/* Amber highlight border around the focused region. */}
      {region && (
        <View
          pointerEvents="none"
          style={[styles.highlight, region]}
        />
      )}
      {/* Info card. */}
      <View style={cardWrapStyle} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{step.title.toUpperCase()}</Text>
          <View style={styles.rule} />
          <Text style={styles.body}>{step.body}</Text>
          <Text style={styles.stepIndicator}>
            Step {(tutorialStep ?? 0) + 1} of {TUTORIAL_STEPS.length}
          </Text>
          <View style={styles.btnRow}>
            {isWelcome ? (
              <>
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
                  <Text style={styles.btnTextPrimary}>CONTINUE</Text>
                </Pressable>
              </>
            ) : (
              <>
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
                  <Text style={styles.btnTextPrimary}>{isLast ? 'BEGIN' : 'NEXT →'}</Text>
                </Pressable>
              </>
            )}
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
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  highlight: {
    position: 'absolute',
    borderColor: '#c9a86a',
    borderWidth: 2,
    borderRadius: 6,
    // Subtle glow effect via shadow on iOS, default on Android.
    shadowColor: '#c9a86a',
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  cardWrapTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cardWrapBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 60,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cardWrapCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 16,
  },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 8, marginBottom: 12 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  stepIndicator: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginBottom: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 100,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

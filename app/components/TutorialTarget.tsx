import React, { useEffect, useRef } from 'react';
import { Animated, type ViewProps } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { useReduceMotion } from '../state/accessibility';
import { TUTORIAL_STEPS, type HighlightArea } from './tutorialSteps';

interface Props extends ViewProps {
  area: HighlightArea;
  children: React.ReactNode;
}

// Wraps a screen region. When the tutorial's current step targets this
// area, the wrapper applies an amber glow directly to the rendered
// component — no overlay coordinate math, no measurement, no drift.
// Tungsten Spire — when the current step has `pulse: true` the glow
// animates between dim and bright to draw the eye.
//
// ⚠⚠ OTA-1442 — the pulse moved to the NATIVE driver. The old loop animated
// borderColor/shadowOpacity on the JS driver ("short and cheap enough that
// off-native is fine" — it was not): a style write across the bridge every
// frame for the whole beat, and on the rope beat it ran ALONGSIDE the input
// box's own JS pulse. That sustained JS load is when Android starts dropping
// the tap→focus→keyboard event chain — the owner typed blind behind the
// keyboard because the floating input bar's mount signal lost that race.
// borderColor cannot run native, so the glow is now two layers: a static DIM
// border+shadow on the wrapper, and a BRIGHT border+shadow on an absolute
// overlay whose opacity crossfades natively. Same look, zero per-frame JS.
export function TutorialTarget({ area, children, style, ...rest }: Props) {
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const step = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] ?? null : null;
  const isActive = !!step && step.area === area;
  // OTA-898 (SA-6) — reduce-motion holds the highlight as a static glow (the
  // ring still marks the target; only the looping pulse is dropped).
  const reduceMotion = useReduceMotion();
  const shouldPulse = isActive && step?.pulse === true && !reduceMotion;

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!shouldPulse) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [shouldPulse, pulse]);

  if (!isActive) {
    return <Animated.View style={style} {...rest}>{children}</Animated.View>;
  }

  // The wrapper carries the STATIC glow: the dim end of the pulse when
  // animating, the full-bright glow when not (non-pulse beats, reduce-motion).
  const baseStyle = {
    borderColor: '#c9a86a',
    borderWidth: 2,
    borderRadius: 6,
    // arb-fix — NO translucent fill. The amber fill (rgba(201,168,106,0.08))
    // tinted the whole wrapped region a different shade than the player's tuned
    // background, reading as a "weird 2-tone box behind the buttons" whenever a
    // step targeted a large area (e.g. quick-row wraps the entire bottom button
    // cluster). The 2px pulsing border + glow already spotlight the target, so
    // the fill is pure cost. Keep the region's own background (transparent).
    backgroundColor: 'transparent',
    shadowColor: '#c9a86a',
    shadowOpacity: shouldPulse ? 0.35 : 0.95,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Animated.View style={[style as any, baseStyle as any]} {...rest}>
      {/* OTA-1442 — the bright half of the pulse, opacity-crossfaded on the
          native driver over the static dim border above. Offset -2 sits it
          exactly on the wrapper's own 2px border. */}
      {shouldPulse ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -2, left: -2, right: -2, bottom: -2,
            borderColor: '#ffe28a',
            borderWidth: 2,
            borderRadius: 6,
            shadowColor: '#c9a86a',
            shadowOpacity: 0.95,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            opacity: pulse,
          }}
        />
      ) : null}
      {children}
    </Animated.View>
  );
}

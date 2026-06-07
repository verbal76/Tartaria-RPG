import React, { useEffect, useRef } from 'react';
import { Animated, type ViewProps } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { TUTORIAL_STEPS, type HighlightArea } from './tutorialSteps';

interface Props extends ViewProps {
  area: HighlightArea;
  children: React.ReactNode;
}

// Wraps a screen region. When the tutorial's current step targets this
// area, the wrapper applies an amber glow directly to the rendered
// component — no overlay coordinate math, no measurement, no drift.
// Tungsten Spire — when the current step has `pulse: true` the glow
// animates between dim and bright to draw the eye. Animation runs on
// the JS driver because borderColor isn't native-animatable; pulse is
// short and cheap enough that off-native is fine.
export function TutorialTarget({ area, children, style, ...rest }: Props) {
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const step = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] ?? null : null;
  const isActive = !!step && step.area === area;
  const shouldPulse = isActive && step?.pulse === true;

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!shouldPulse) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: false }),
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

  // Static glow for non-pulse beats; pulse-interpolated glow for the
  // ones the player should act on right now.
  const borderColor = shouldPulse
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: ['#c9a86a', '#ffe28a'] })
    : '#c9a86a';
  const shadowOpacity = shouldPulse
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.95] })
    : 0.95;

  const animatedStyle = {
    borderColor,
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
    shadowOpacity,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  };

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Animated.View style={[style as any, animatedStyle as any]} {...rest}>
      {children}
    </Animated.View>
  );
}

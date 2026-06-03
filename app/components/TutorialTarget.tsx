import React from 'react';
import { View, type ViewProps, type ViewStyle, type StyleProp } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { TUTORIAL_STEPS, type HighlightArea } from './tutorialSteps';

interface Props extends ViewProps {
  area: HighlightArea;
  children: React.ReactNode;
}

// Wraps a screen region. When the tutorial's current step targets this
// area, the wrapper applies an amber-glow style directly to the rendered
// component — no overlay coordinate math, no measurement, no drift.
// Glow comes off the moment the step advances.
export function TutorialTarget({ area, children, style, ...rest }: Props) {
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const isActive =
    tutorialStep !== null && TUTORIAL_STEPS[tutorialStep]?.area === area;

  const composed: StyleProp<ViewStyle> = isActive
    ? [style, glowStyles.glow]
    : style;

  return (
    <View style={composed} {...rest}>
      {children}
    </View>
  );
}

const glowStyles = {
  glow: {
    borderColor: '#c9a86a',
    borderWidth: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(201, 168, 106, 0.08)',
    shadowColor: '#c9a86a',
    shadowOpacity: 0.95,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    // Android requires elevation for shadows. Bumped high so the glow reads.
    elevation: 16,
  } satisfies ViewStyle,
};

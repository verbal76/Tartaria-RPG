import React, { useRef, useCallback } from 'react';
import { View, type ViewProps } from 'react-native';
import { useGameStore } from '../state/gameStore';
import type { HighlightArea } from './tutorialSteps';

interface Props extends ViewProps {
  area: HighlightArea;
  children: React.ReactNode;
}

// Wraps a screen region with a measurement layer that reports its
// absolute screen position to the store. The TutorialOverlay reads from
// tutorialTargets to draw the highlight border on the exact component
// rather than guessing with fractional viewport math.
//
// Idempotent — re-measures on layout changes, dispatches only when
// position actually moves.
export function TutorialTarget({ area, children, ...rest }: Props) {
  const ref = useRef<View>(null);
  const setTutorialTarget = useGameStore((s) => s.setTutorialTarget);

  const onLayout = useCallback(() => {
    // measureInWindow gives screen-absolute coords, which matches the
    // overlay's positioning since it's rendered outside SafeAreaView.
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        setTutorialTarget(area, { x, y, width, height });
      });
    });
  }, [area, setTutorialTarget]);

  return (
    <View ref={ref} onLayout={onLayout} {...rest}>
      {children}
    </View>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';

interface Props {
  value: number; // 0..1
  onChange: (v: number) => void;
  /** Optional explicit color override for the centerline + active ticks. */
  tint?: string;
}

// Wheel-of-fortune style dial. Drag horizontally to spin the wheel —
// ticks scroll past a fixed centerline. Value tracks the drag's
// accumulated delta (not absolute touch X) so a finger placed anywhere
// on the strip works, and a fingertip wider than a slider thumb no
// longer makes the value twitch. Replaces SimpleSlider for the voice
// Rate / Pitch sliders, where pinpoint precision is needed and the
// previous positional-jump behavior was unworkable.
//
// Caller still drives the numeric readout (e.g. "1.05x") next to the
// dial — the dial doesn't render the number itself.

// Pixels of finger travel to cover the full 0..1 range. Bigger = less
// twitchy, more drag required. 480px is roughly two screen-widths of
// drag on a typical phone — fine because PanResponder doesn't release
// on edge-overflow.
const PIXELS_PER_UNIT = 480;

interface Tick {
  v: number;
  major: boolean;
}

const TICKS: Tick[] = (() => {
  const arr: Tick[] = [];
  // 21 minor ticks at 0.00, 0.05, 0.10 ... 1.00
  // Major every 0.25 (0.00, 0.25, 0.50, 0.75, 1.00)
  for (let i = 0; i <= 20; i++) {
    const v = i / 20;
    arr.push({ v, major: i % 5 === 0 });
  }
  return arr;
})();

export function ScrollDial({ value, onChange, tint = '#c9a86a' }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  // Ref mirror so the PanResponder closure (created once) can read
  // the current value at gesture start.
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const startValueRef = useRef(value);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthRef.current = w;
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startValueRef.current = valueRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          // Drag RIGHT raises the value (more); drag LEFT lowers it.
          // Matches the visual: ticks scroll LEFT as value rises, so
          // higher numbers come from the right — pulling the wheel
          // right "winds it forward".
          const dv = gesture.dx / PIXELS_PER_UNIT;
          onChange(clamp01(startValueRef.current + dv));
        },
      }),
    [onChange],
  );

  return (
    <View style={styles.wrap} onLayout={onLayout} {...responder.panHandlers}>
      <View style={styles.track} />
      {width > 0 && TICKS.map(({ v, major }) => {
        const x = (v - value) * PIXELS_PER_UNIT + width / 2;
        if (x < -2 || x > width + 2) return null;
        return (
          <View
            key={v}
            style={[
              styles.tick,
              major ? styles.tickMajor : styles.tickMinor,
              { left: x - (major ? 1 : 0.5) },
            ]}
          />
        );
      })}
      <View
        style={[
          styles.pointer,
          {
            left: width > 0 ? width / 2 - 1 : 0,
            borderColor: tint,
            backgroundColor: tint,
          },
        ]}
      />
    </View>
  );
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

const styles = StyleSheet.create({
  wrap: {
    height: 32,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  tick: {
    position: 'absolute',
    backgroundColor: '#5a5246',
  },
  tickMinor: {
    width: 1,
    height: 8,
    top: 12,
  },
  tickMajor: {
    width: 2,
    height: 16,
    top: 8,
    backgroundColor: '#7a705c',
  },
  pointer: {
    position: 'absolute',
    width: 2,
    top: 2,
    bottom: 2,
    borderRadius: 1,
  },
});

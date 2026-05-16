import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';

interface Props {
  value: number; // 0..1
  onChange: (v: number) => void;
  /** Optional explicit color override for the filled portion. */
  tint?: string;
}

// Lightweight slider — touch + drag on a horizontal track. No native deps.
// Used by the audio settings panel for the music volume control.
export function SimpleSlider({ value, onChange, tint = '#c9a86a' }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthRef.current = w;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (widthRef.current === 0) return;
        const x = evt.nativeEvent.locationX;
        onChange(clamp01(x / widthRef.current));
      },
      onPanResponderMove: (evt, gesture) => {
        if (widthRef.current === 0) return;
        // gesture.moveX is screen-relative; locationX is view-relative —
        // prefer locationX if it falls inside.
        const lx = evt.nativeEvent.locationX;
        const x = Number.isFinite(lx) ? lx : gesture.moveX;
        onChange(clamp01(x / widthRef.current));
      },
    }),
  ).current;

  const filledPx = width > 0 ? Math.max(0, Math.min(width, value * width)) : 0;

  return (
    <View style={styles.wrap} onLayout={onLayout} {...responder.panHandlers}>
      <View style={styles.track} />
      <View style={[styles.fill, { width: filledPx, backgroundColor: tint }]} />
      <View style={[styles.thumb, { left: filledPx - 8, borderColor: tint }]} />
    </View>
  );
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

const styles = StyleSheet.create({
  wrap: {
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    top: 11,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 6,
    top: 11,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    top: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#13110f',
    borderWidth: 2,
  },
});

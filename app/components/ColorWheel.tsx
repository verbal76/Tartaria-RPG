// arb85 — custom hue/saturation color wheel for the DISPLAY settings tab.
// Replaces the old "Hue" + "Color richness" sliders. Pure-JS / OTA-safe: a
// procedurally generated disc (assets/textures/colorwheel.png — angle=hue,
// radius=saturation) + a PanResponder for touch. No native color-picker lib
// (none installed; adding one would force a native build).
//
// Convention (shared with the PNG generator so the thumb lands on the colour
// under the finger): screen y is DOWN, angle = atan2(dy, dx) in degrees,
// hue = (angle + 360) % 360, saturation = clamp(dist / radius, 0, 1).
import React, { useRef } from 'react';
import { View, Image, PanResponder, StyleSheet, type GestureResponderEvent } from 'react-native';

interface Props {
  size: number;           // diameter in pt
  hue: number;            // 0..360
  sat: number;            // 0..1
  light?: number;         // 0..1 — drives the thumb's fill so it previews the actual base tone
  onChange: (hue: number, sat: number) => void;
}

// Local HSL→rgb for the thumb preview fill (kept here so the component is
// self-contained; matches displaySettings.hslToHex math).
function hslCss(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function ColorWheel({ size, hue, sat, light = 0.5, onChange }: Props) {
  const R = size / 2;
  // Keep the latest onChange without re-creating the PanResponder each render.
  const cb = useRef(onChange);
  cb.current = onChange;

  const handle = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const dx = locationX - R;
    const dy = locationY - R;
    const dist = Math.hypot(dx, dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const h = (ang + 360) % 360;
    const s = Math.max(0, Math.min(1, dist / R));
    cb.current(h, s);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: handle,
      onPanResponderMove: handle,
    })
  ).current;

  // Thumb position from current hue/sat (same convention as the wheel art).
  const ang = (hue * Math.PI) / 180;
  const r = Math.max(0, Math.min(1, sat)) * R;
  const thumbX = R + r * Math.cos(ang);
  const thumbY = R + r * Math.sin(ang);
  const THUMB = 22;

  return (
    <View
      style={{ width: size, height: size }}
      {...responder.panHandlers}
    >
      <Image
        source={require('../../assets/textures/colorwheel.png')}
        accessibilityLabel="Color wheel"
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      {/* subtle ring so the disc reads as interactive against any bg */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
        style={[styles.ring, { width: size, height: size, borderRadius: R }]}
      />
      <View
        pointerEvents="none"
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.thumb,
          {
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            left: thumbX - THUMB / 2,
            top: thumbY - THUMB / 2,
            backgroundColor: hslCss(hue, sat, light),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  thumb: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    // a faint dark halo so the white ring reads on light hues too
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});

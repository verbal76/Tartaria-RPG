import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { baseColorOf, useDisplaySettings } from '../ui/displaySettings';

interface Props {
  onDelete: () => void;
  children: React.ReactNode;
  deleteLabel?: string;
}

const DELETE_WIDTH = 90;
const SWIPE_THRESHOLD = -DELETE_WIDTH / 2;
const SWIPE_DISMISS_THRESHOLD = -DELETE_WIDTH * 1.6;

export function SwipeableRow({ onDelete, children, deleteLabel = 'Delete' }: Props) {
  /* OTA-1827 — the sliding surface takes the player's chosen background; see the
   * note on `surface` below for why it was a hardcoded near-black before. */
  const display = useDisplaySettings();
  const translateX = useRef(new Animated.Value(0)).current;
  // Tracks the resting open/closed position so a pan starts from where the
  // row currently sits rather than from 0.
  const restValue = useRef(0);

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        translateX.stopAnimation((v) => {
          restValue.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const next = Math.min(0, restValue.current + g.dx);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const final = restValue.current + g.dx;
        if (final < SWIPE_DISMISS_THRESHOLD) {
          onDelete();
          return;
        }
        const open = final < SWIPE_THRESHOLD;
        Animated.spring(translateX, {
          toValue: open ? -DELETE_WIDTH : 0,
          useNativeDriver: true,
          friction: 7,
          tension: 80,
        }).start(() => {
          restValue.current = open ? -DELETE_WIDTH : 0;
        });
      },
    }),
  ).current;

  function close() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 80 }).start(
      () => {
        restValue.current = 0;
      },
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.deleteLayer}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            close();
            onDelete();
          }}
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteText}>{deleteLabel}</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.surface, { backgroundColor: baseColorOf(display) }, { transform: [{ translateX }] }]}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden', marginBottom: 8 },
  deleteLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: DELETE_WIDTH,
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: '#5a2a26',
    borderRadius: 4,
  },
  deleteBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#e6d8b3', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  /* ⚠⚠⚠ OTA-1827 — THIS IS THE BLACK RECTANGLE, AND IT WAS A HARDCODED COLOUR.
   *
   * `surface` is opaque for one reason: it slides sideways over `deleteLayer`,
   * so it must hide it completely. It does NOT need to be near-black, and
   * `#0a0908` — which is what it was — is the black bar the owner photographed
   * on the character choice screen. A pressed record's rim travels 3dp down
   * (kit.controlPressed) and uncovers 3dp of whatever sits behind it; behind it
   * is THIS view.
   *
   * ⚠ The colour now comes from the PLAYER'S OWN BACKGROUND SLIDERS
   * (`baseColorOf` → hslToHex of bgHue/bgSat/bgLight, the Display settings), so
   * the strip a press uncovers is the background they chose — continuous with
   * the screen instead of a slab of near-black over it. Owner ruling 2026-09-16:
   * "it should be the same color as whatever they chose for the background".
   *
   * ⚠ This keeps a fallback fill so a failed settings read can never leave the
   * delete layer showing through; the inline colour overrides it in practice. */
  surface: { backgroundColor: '#0a0908' },
});

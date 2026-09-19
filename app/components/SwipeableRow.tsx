import React, { useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { baseColorOf, useDisplaySettings } from '../ui/displaySettings';
import { T, tartariaKitStyles as kit, tControlDepth } from '../ui/tartariaKit';

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
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            close();
            onDelete();
          }}
          /* ⚠⚠⚠ OTA-1851 — DELETE IS A BUTTON, AND IT NOW PRESSES LIKE ONE.
           *
           * Until now this was a bare `TouchableOpacity` over `deleteBtn`, which
           * was nothing but `flex: 1` plus centring: NO border, NO rim, NO face
           * of its own. It was the red well itself with a word on it, and the
           * only thing a press did was fade the whole thing. Every other control
           * in Tartaria rests raised and TRAVELS 3dp on press (`kit.controlPressed`).
           * The one destructive control the player reaches most often was the one
           * that did not.
           *
           * ⚠ THE REPAIR IS THE SHARED PRIMITIVE, NOT A BESPOKE ANIMATION.
           * `kit.ctl` supplies the material (rim, radius, raised pair) exactly as
           * it does for the other 167 controls; `kit.btnFaceDestructive` supplies
           * the face the kit already uses for TButton's destructive variant; and
           * `tControlDepth(pressed)` — the one depth authority — supplies both the
           * rim inversion and the travel. Nothing here is local to this file.
           *
           * ⚠ THE RED IDENTITY IS UNTOUCHED. `deleteLayer` keeps `T.rustRim` as
           * the well behind, `deleteBtn` takes `T.rustRim` for its side rims, and
           * the label keeps its own colour and its word. The button's resting top
           * edge is the GENERIC lit rim, not an accent, so OTA-1828's "an accent
           * control keeps its family on press" rule does not apply and no rust
           * pressed-tone override is needed — the standard pair is correct here. */
          style={({ pressed }) => [kit.ctl, kit.btnFaceDestructive, styles.deleteBtn, tControlDepth(pressed)]}
        >
          <Text style={styles.deleteText}>{deleteLabel}</Text>
        </Pressable>
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
  /* ⚠ OTA-1851 — GEOMETRY AND THE SIDE RIMS ONLY. The face comes from
   * `kit.btnFaceDestructive`, the rim pair and the travel from
   * `tControlDepth(pressed)`; this entry must not name either, or the key
   * would be independently styled again. The 3dp margin is what gives the
   * travel somewhere to go: pressed, the button drops into the red well and
   * 3dp more of it shows above — the depth cue is the WELL, which is why the
   * well is the destructive colour and the key is not. */
  deleteBtn: {
    flex: 1,
    margin: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: T.rustRim,
  },
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

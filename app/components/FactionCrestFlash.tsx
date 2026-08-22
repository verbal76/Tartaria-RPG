// ⚠⚠ OTA-1431 — THE EMBLEM, WHEN YOU PICK THE FACTION.
//
// Owner: *"wire them in now, as you choose your faction, the emblem should show
// for a few seconds as a popup."*
//
// ⚠ AND IT MUST NEVER BE IN THE WAY. That is the whole design problem here. The
// faction step is a LIST the player reads down and compares — nine of them, each
// with a subtitle, a goal and a flavor line. A popup that lands on every tap and
// holds the screen for three seconds turns comparing two factions into a chore,
// and the player who taps through all nine to read them sits through nine
// unskippable animations. So:
//
//   · TAP ANYWHERE DISMISSES IT, instantly, no animation to wait out. The
//     backdrop is the button. This is the release valve that makes the hold
//     duration safe to pick at all.
//   · IT DOES NOT RE-FIRE for the faction already selected — re-tapping your own
//     choice is a no-op, not another three seconds.
//   · The hold is 2.4s, not "a few". Long enough to register the emblem, short
//     enough that sitting through it is never the fastest way to leave.
//
// ⚠ resizeMode="contain", AND IT IS NOT COSMETIC. The nine emblems are not
// square and not a shared size — 1145x1374 through 1254x1254, artwork running to
// the frame edge (see assets/crests/README.md, where that is signed off as
// do-not-fix). `cover` would crop a different amount off each one, and a fixed
// aspect would squash them. `contain` inside a box measured off the SHORT screen
// edge is the only treatment that shows all nine whole, on any handset, in
// either orientation.

import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Image, Pressable, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { factionCrest } from '../engine/factionCrests';

/** How long the emblem holds before it leaves on its own. */
const HOLD_MS = 2400;
const FADE_IN_MS = 220;
const FADE_OUT_MS = 260;

export function FactionCrestFlash({
  factionId,
  factionName,
  subtitle,
  onDone,
}: {
  /** The faction to show, or null when nothing should be showing. */
  factionId: string | null;
  factionName?: string;
  subtitle?: string;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  // ⚠ Held in a ref and cleared on EVERY path out — unmount, re-trigger, and the
  // tap-to-dismiss below. A timer that outlives its popup calls onDone() after
  // the next emblem has already opened, closing it a beat after it appeared.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const art = factionCrest(factionId);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // ⚠ `dismiss` is a ref, not a useCallback in the dep array. The effect below
  // must re-run when the FACTION changes and at no other time; threading a
  // callback identity through its deps is how this kind of effect ends up
  // re-firing the animation on an unrelated re-render.
  const dismiss = useRef(onDone);
  dismiss.current = onDone;

  useEffect(() => {
    if (!art) return;
    clearTimer();
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true })
        .start(() => dismiss.current());
    }, HOLD_MS);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factionId, art]);

  if (!art || !factionId) return null;

  // The emblem box is measured off the SHORT edge, so it fills a phone held
  // upright and does not overflow one held sideways.
  const box = Math.min(width, height) * 0.72;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => { clearTimer(); onDone(); }}>
      {/* ⚠ The backdrop IS the dismiss button, and it takes the tap instantly
          without waiting for the fade — a player skipping this wants it gone
          now, not in another quarter second. */}
      <Pressable
        style={styles.backdrop}
        onPress={() => { clearTimer(); onDone(); }}
        accessibilityRole="button"
        accessibilityLabel={`${factionName ?? 'Faction'} emblem. Tap to dismiss.`}
      >
        <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
          <Image
            source={art}
            style={{ width: box, height: box }}
            resizeMode="contain"
            accessible
            accessibilityLabel={`${factionName ?? ''} emblem`}
          />
          {factionName ? <Text style={styles.name}>{factionName.toUpperCase()}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,5,4,0.93)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  name: {
    color: '#e8dcc0',
    fontSize: 20,
    letterSpacing: 3,
    marginTop: 14,
    textAlign: 'center',
  },
  subtitle: {
    color: '#9a8c6e',
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 6,
    textAlign: 'center',
  },
});

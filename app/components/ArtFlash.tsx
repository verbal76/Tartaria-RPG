// ⚠⚠ OTA-1433 — ONE FLASH, FOR EVERY CHOICE THAT DESERVES ONE.
//
// Owner, on the race portraits, having seen the faction emblem land: *"same
// thing, show the popup at selection."*
//
// This was `FactionCrestFlash` and it took a faction id. "Same thing" for a
// second kind of art is exactly the moment a component gets copied — and a copy
// is how this session's most-repeated bug arrives: two implementations, one bug
// fixed in one of them. So it takes a SOURCE and a KEY instead of an id, and
// knows nothing about factions or races. Both call sites are the same component,
// so the timer handling, the skip behaviour and the sizing can never diverge.
//
// ⚠ AND IT MUST NEVER BE IN THE WAY. It plays on the COMMIT — the NEXT button —
// not on a row tap, because tapping rows is browsing (OTA-1432, after the owner
// looked for the emblem on a tap and correctly said "when we pick the faction
// isn't when we click on it, but when we hit next"). One NEXT per step means the
// flash cannot interrupt a comparison. Tapping anywhere still dismisses it
// instantly, which is the release valve that makes any hold duration safe.
//
// ⚠ resizeMode="contain", AND IT IS LOAD-BEARING. Nothing here is one shape. The
// crests run 1145x1374 to 1254x1254 with artwork to the frame edge; the race
// portraits run 0.667 to 1.250, one of them landscape among six portraits. A
// fixed aspect would squash something and `cover` would crop a different amount
// off every single one. `contain`, in a box measured off the screen, is the only
// treatment that shows all sixteen images whole on any handset either way up.

import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Image, Pressable, StyleSheet, Animated, useWindowDimensions } from 'react-native';

/** How long the art holds before it leaves on its own. */
const HOLD_MS = 2400;
const FADE_IN_MS = 220;
const FADE_OUT_MS = 260;

export function ArtFlash({
  artKey,
  source,
  title,
  subtitle,
  onDone,
}: {
  /** Identity of what is showing, or null when nothing should be. Drives the
   *  animation restart — NOT the source, which is an opaque module number. */
  artKey: string | null;
  /** The image. Undefined means there is nothing to show. */
  source: number | undefined;
  title?: string;
  subtitle?: string;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  // ⚠ Held in a ref and cleared on EVERY path out — unmount, re-trigger, and the
  // tap-to-dismiss below. A timer that outlives its own flash calls onDone()
  // after the next one has already opened, closing it a beat after it appeared.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // ⚠ `onDone` is held in a ref rather than listed in the effect's deps. The
  // effect must re-run when the ART changes and at no other time; threading a
  // callback identity through its deps is how this kind of effect ends up
  // replaying its animation on an unrelated re-render.
  const dismiss = useRef(onDone);
  dismiss.current = onDone;

  useEffect(() => {
    if (!source || !artKey) return;
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
  }, [artKey, source]);

  if (!source || !artKey) return null;

  // ⚠ ONE BOX FOR EVERY SHAPE. Generous on both axes and `contain` does the
  // rest: a tall portrait comes out height-limited, a near-square crest and the
  // one landscape painting come out width-limited, and none of them overflows a
  // handset held sideways.
  const boxW = width * 0.9;
  const boxH = height * 0.62;

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => { clearTimer(); onDone(); }}>
      {/* ⚠ The backdrop IS the dismiss button, and it takes the tap instantly
          rather than waiting out the fade — someone skipping this wants it gone
          now, not in another quarter second. */}
      <Pressable
        style={styles.backdrop}
        onPress={() => { clearTimer(); onDone(); }}
        accessibilityRole="button"
        accessibilityLabel={`${title ?? 'Artwork'}. Tap to dismiss.`}
      >
        <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
          <Image
            source={source}
            style={{ width: boxW, height: boxH }}
            resizeMode="contain"
            accessible
            accessibilityLabel={title ?? ''}
          />
          {title ? <Text style={styles.title}>{title.toUpperCase()}</Text> : null}
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
  title: {
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

// The Hot Attic Games studio card — the first intentional branded screen of a
// genuine launch, BEFORE Tartaria's own opening splash.
//
//   native bootstrap (dark) → HOT ATTIC GAMES → Tartaria splash → title → game
//
// ADDITIVE. It does not replace, restyle or shorten SplashOverlay or the title;
// <LaunchSplashes/> mounts the existing splash only after this card is done, so
// the Tartaria splash still gets its whole designed window.
//
// Appearance (the owner's spec): solid black ground; the canonical artwork
// centred both ways; `contain` — the whole composition, aspect preserved, never
// cropped, stretched, zoomed or recoloured; ~1.5 s; SILENT (no audio is touched).
//
// Offline-safe by construction: the artwork is a bundled asset and the timer is
// local; nothing here waits on a network, on hydration, on the OTA check or on
// the models. Boot work proceeds underneath the card, so it adds the card's own
// 1.5 s and no second delay. It also cannot strand the player: the dismissal
// timer starts at mount (not at image load), and an image error dismisses at once.
//
// Once per genuine launch: the shown-flag is module-scoped, so it survives
// remounts inside one JS process (navigation, Settings, returning to title,
// modals, foreground/resume) and resets only when the process or JS context is
// replaced — i.e. on a real launch, which includes an OTA activation reload.
//
// ⚠ While STUDIO_SPLASH_SOURCE is null (the canonical asset has not been
// committed — see app/ui/studioSplashArt.ts) this renders nothing at all.

import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import { STUDIO_SPLASH_SOURCE } from '../ui/studioSplashArt';
import { SplashOverlay } from './SplashOverlay';

export const STUDIO_SPLASH_MS = 1500;

let studioShownThisLaunch = false;

/** Test seam — a new JS process starts with the card unshown. */
export function resetStudioSplashForTest(): void { studioShownThisLaunch = false; }

export function studioSplashWillShow(source: ImageSourcePropType | null = STUDIO_SPLASH_SOURCE): boolean {
  return source != null && !studioShownThisLaunch;
}

export function StudioSplash({
  source = STUDIO_SPLASH_SOURCE,
  durationMs = STUDIO_SPLASH_MS,
  onDone,
}: {
  source?: ImageSourcePropType | null;
  durationMs?: number;
  onDone?: () => void;
}) {
  const [show, setShow] = useState(() => studioSplashWillShow(source));
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    studioShownThisLaunch = true;
    setShow(false);
    onDone?.();
  };
  useEffect(() => {
    if (!show) { if (!done.current) { done.current = true; onDone?.(); } return; }
    const t = setTimeout(finish, durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!show || !source) return null;
  return (
    <View
      style={styles.card}
      pointerEvents="auto"
      accessibilityViewIsModal={true}
      accessibilityLabel="Hot Attic Games"
      testID="studio-splash"
    >
      <Image
        source={source}
        style={styles.art}
        resizeMode="contain"
        onError={finish}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

/** The launch sequence: studio card first, then Tartaria's existing splash. */
export function LaunchSplashes() {
  const [studioDone, setStudioDone] = useState(() => !studioSplashWillShow());
  return (
    <>
      <StudioSplash onDone={() => setStudioDone(true)} />
      {studioDone ? <SplashOverlay /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  // Above the Tartaria splash (1000), below the applying-update overlay (2000).
  card: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
    elevation: 1500,
  },
  art: { width: '100%', height: '100%' },
});

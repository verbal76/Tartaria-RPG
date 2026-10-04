// The Hot Attic Games studio card — the first intentional branded screen of a
// genuine launch, BEFORE Tartaria's own opening splash.
//
//   native window (#0a0908) → HOT ATTIC GAMES → Tartaria splash → title → game
//
// Studio-wide product requirement (CLAUDE.md, "Studio splash"): every Hot Attic Games
// application opens with this card. The artwork is Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png
// (see app/ui/studioSplashArt.ts), shown whole — `contain`, aspect preserved, never cropped,
// stretched or recoloured — on the app's own window colour so the native window, this card and
// the loading view are one continuous ground (no black/white flash between them).
//
// ADDITIVE. It does not replace, restyle or shorten SplashOverlay or the title;
// <LaunchSplashes/> mounts the existing splash only after this card is done.
//
// ~2.5 s in total: a short fade in, a hold, a fade out. SILENT. Boot work (hydration, the OTA
// check, the models) proceeds underneath it, so it masks startup rather than adding to it, and it
// is mounted from the FIRST JS render — in the pre-hydration loading view as well as the main
// tree — so the loading spinner is never what a cold launch opens on. The clock is module-scoped:
// the pre-hydration → hydrated swap remounts the card, and the remount resumes the same 2.5 s
// instead of starting another.
//
// It cannot strand the player: the dismissal timers start at mount (not at image load, not at
// hydration), an image error dismisses at once, and a stalled animation callback is backed by a
// hard timer. If boot fails and the trouble screen takes over, the card simply unmounts.
//
// Once per genuine launch: the shown-flag is module-scoped, so it survives remounts inside one JS
// process (navigation, Settings, returning to title, modals, foreground/resume) and resets only when
// the process or JS context is replaced — a cold launch, or an OTA activation reload.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import { STUDIO_SPLASH_SOURCE } from '../ui/studioSplashArt';
import { SplashOverlay } from './SplashOverlay';

/** Total on-screen time, fades included. The owner's window is 2–3 s. */
export const STUDIO_SPLASH_MS = 2500;
export const STUDIO_FADE_IN_MS = 350;
export const STUDIO_FADE_OUT_MS = 450;
// A stalled animation callback may not hold the card past this.
const HARD_STOP_SLACK_MS = 250;

let studioShownThisLaunch = false;
let studioStartedAt: number | null = null;

/** Test seam — a new JS process starts with the card unshown. */
export function resetStudioSplashForTest(): void { studioShownThisLaunch = false; studioStartedAt = null; }

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
  // How much of the card's life has already passed (a remount across hydration resumes it).
  const elapsed = useRef(0);
  if (show && studioStartedAt == null) studioStartedAt = Date.now();
  if (show && studioStartedAt != null && elapsed.current === 0) elapsed.current = Math.max(0, Date.now() - studioStartedAt);
  const opacity = useRef(new Animated.Value(elapsed.current === 0 ? 0 : 1)).current;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    studioShownThisLaunch = true;
    setShow(false);
    onDone?.();
  };
  useEffect(() => {
    if (!show) { if (!done.current) { done.current = true; onDone?.(); } return; }
    const remaining = Math.max(0, durationMs - elapsed.current);
    if (remaining === 0) { finish(); return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const running: Animated.CompositeAnimation[] = [];
    if (elapsed.current === 0) {
      const fadeIn = Animated.timing(opacity, { toValue: 1, duration: STUDIO_FADE_IN_MS, useNativeDriver: true });
      running.push(fadeIn);
      fadeIn.start();
    }
    timers.push(setTimeout(() => {
      const fadeOut = Animated.timing(opacity, { toValue: 0, duration: STUDIO_FADE_OUT_MS, useNativeDriver: true });
      running.push(fadeOut);
      fadeOut.start(() => finish());
    }, Math.max(0, remaining - STUDIO_FADE_OUT_MS)));
    timers.push(setTimeout(finish, remaining + HARD_STOP_SLACK_MS));
    return () => { timers.forEach(clearTimeout); running.forEach((r) => r.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!show || !source) return null;
  return (
    <Animated.View
      style={[styles.card, { opacity }]}
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
    </Animated.View>
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
    // The app's own window colour (app.json backgroundColor, styles.loading in App.tsx).
    backgroundColor: '#0a0908',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
    elevation: 1500,
  },
  art: { width: '100%', height: '100%' },
});

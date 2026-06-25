// OTA-471 — opening splash overlay. Rendered at the AppShell ROOT (outside the
// safe-area padding + the UI scale transform) so it's truly full-bleed — edge to
// edge, under the status/nav bars, with no parchment-coloured margins. Shows once
// per app LAUNCH for ~2s while the voice warms, then unmounts to reveal the menu.
// Self-contained: owns its timer + Kokoro subscription, returns null when done.

import React, { useEffect, useState } from 'react';
import { View, Image, Text, StyleSheet, useWindowDimensions, StatusBar, Platform } from 'react-native';
import { getKokoroState, onKokoroStateChange, type KokoroState } from '../voice/PiperTTSManager';

// Splash art native dimensions (assets/splash-art.jpg). engine_Dev — new "Text RPG Engine" poster
// (glowing d20 over an open book, cosmic teal-gold). Portrait; rendered `contain` + inset with the
// loading bar below.
const SPLASH_W = 900;
const SPLASH_H = 1599;

// Module-scoped so it survives remounts within the same JS process; resets on a
// fresh process / OTA reload.
let splashShownThisLaunch = false;

export function SplashOverlay() {
  const [kokoro, setKokoro] = useState<KokoroState>(() => getKokoroState());
  useEffect(() => onKokoroStateChange(setKokoro), []);
  // Reactive to the live screen resolution: re-runs on rotation / split-screen /
  // any device size. Insets are PROPORTIONAL to the screen (not fixed px) so the
  // framed poster keeps the same relative breathing room on a small phone and a
  // tablet alike, plus the Android status-bar height so the top frame clears it.
  const { width: winW, height: winH } = useWindowDimensions();
  const statusTop = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  // engine_Dev — explicit, clamped, CENTERED poster box (not a near-edge inset-fit, which made the
  // art ~90% of screen width = "too big"). Cap to a fraction of BOTH width and height, keep the
  // poster's aspect, and centre it slightly above middle so the loading bar sits clearly below it.
  const aspect = SPLASH_H / SPLASH_W; // height / width
  const maxW = winW * 0.966; // +50% (→0.84) then +15% (→0.966)
  const maxH = winH * 0.932; // +50% (→0.81) then +15% (→0.932)
  let posterW = maxW;
  let posterH = maxW * aspect;
  if (posterH > maxH) { posterH = maxH; posterW = maxH / aspect; }
  const posterInset = {
    width: Math.round(posterW),
    height: Math.round(posterH),
    left: Math.round((winW - posterW) / 2),
    top: Math.round((winH - posterH) / 2 - winH * 0.04) + statusTop,
  };
  const [minElapsed, setMinElapsed] = useState(false);
  const [capReached, setCapReached] = useState(false);
  const [skip] = useState(() => splashShownThisLaunch);
  useEffect(() => {
    if (splashShownThisLaunch) return;
    const a = setTimeout(() => setMinElapsed(true), 2000);
    const b = setTimeout(() => setCapReached(true), 6000); // hard cap for slow first-install downloads
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const settled = kokoro.phase === 'ready' || kokoro.phase === 'error' || kokoro.phase === 'idle';
  const show = !skip && !(capReached || (minElapsed && settled));
  useEffect(() => { if (!show) splashShownThisLaunch = true; }, [show]);
  if (!show) return null;

  // Voice-weighted fill so the bar reads ~full at the moment we dismiss.
  const progress =
    settled ? 1
    : kokoro.phase === 'downloading' ? Math.max(0.08, Math.min(0.95, kokoro.fraction))
    : kokoro.phase === 'loading' ? 0.92
    : 0.12;

  // Full poster — the splash art is a complete portrait design with its OWN
  // decorative border + corner brackets running to the art's edges. Rendered with
  // `contain` (whole poster, aspect preserved, nothing zoomed) AND inset from the
  // screen edges so that framed border can't sit flush against — and be clipped by
  // — the phone's rounded corners / curved glass / status + nav bars. Previously
  // the image was absoluteFill, so `contain` fit it to WIDTH (flush left/right) and
  // the frame's edges + corner brackets got eaten by the rounded display corners —
  // which read as "too big / edges cut off". The inset gives the whole poster
  // breathing room; the near-black overlay behind it hides the margin.
  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Image
        source={require('../../assets/splash-art.jpg')}
        style={[styles.poster, posterInset]}
        resizeMode="contain"
      />
      <View style={styles.barWrap}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.barLabel}>
          {settled ? 'Entering your world…' : 'Warming up — keep the app open'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a1012', zIndex: 1000, elevation: 1000 },
  // Position only; the actual top/bottom/left/right insets are computed live from
  // the screen size in the component (posterInset) so the poster is reactive to
  // the device's real resolution. `contain` then fits the framed art inside that
  // proportional box — no zoom, no clipped edges, on any screen.
  poster: { position: 'absolute' },
  barWrap: { position: 'absolute', left: 28, right: 28, bottom: 56, alignItems: 'center' },
  barTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: '#6ab0c9' },
  barLabel: { marginTop: 10, color: '#e6dcc2', fontSize: 11, letterSpacing: 1.5, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4 },
});

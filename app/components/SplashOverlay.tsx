// OTA-471 — opening splash overlay. Rendered at the AppShell ROOT (outside the
// safe-area padding + the UI scale transform) so it's truly full-bleed — edge to
// edge, under the status/nav bars, with no parchment-coloured margins. Shows once
// per app LAUNCH for ~2s while the voice warms, then unmounts to reveal the menu.
// Self-contained: owns its timer + Kokoro subscription, returns null when done.

import React, { useEffect, useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { getKokoroState, onKokoroStateChange, type KokoroState } from '../voice/PiperTTSManager';

// Splash art native dimensions (assets/splash-art.jpg). The RPG Engine splash is a
// complete full-screen portrait poster (gear + terminal + book + d20 emblem, title,
// tagline, feature row), so it's rendered full-bleed with cover — not the old
// top-left-anchored emblem treatment.
const SPLASH_W = 853;
const SPLASH_H = 1844;

// Module-scoped so it survives remounts within the same JS process; resets on a
// fresh process / OTA reload.
let splashShownThisLaunch = false;

export function SplashOverlay() {
  const [kokoro, setKokoro] = useState<KokoroState>(() => getKokoroState());
  useEffect(() => onKokoroStateChange(setKokoro), []);
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

  // Full-bleed poster — the splash art is a complete portrait design, so it fills
  // the whole overlay with cover (centred, aspect preserved, edges cropped to fit
  // whatever the device aspect ratio is). SPLASH_W/H document the source aspect.
  return (
    <View style={styles.overlay} pointerEvents="auto">
      <Image
        source={require('../../assets/splash-art.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b0a09', zIndex: 1000, elevation: 1000 },
  barWrap: { position: 'absolute', left: 28, right: 28, bottom: 56, alignItems: 'center' },
  barTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: '#c9a86a' },
  barLabel: { marginTop: 10, color: '#e6dcc2', fontSize: 11, letterSpacing: 1.5, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4 },
});

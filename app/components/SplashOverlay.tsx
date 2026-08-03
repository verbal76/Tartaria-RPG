// OTA-471 — opening splash overlay. Rendered at the AppShell ROOT (outside the
// safe-area padding + the UI scale transform) so it's truly full-bleed — edge to
// edge, under the status/nav bars, with no parchment-coloured margins. Shows once
// per app LAUNCH for ~2s while the voice warms, then unmounts to reveal the menu.
// Self-contained: owns its timer + Kokoro subscription, returns null when done.

import React, { useEffect, useState } from 'react';
import { View, Image, Text, StyleSheet, Dimensions } from 'react-native';
import { getKokoroState, onKokoroStateChange, type KokoroState } from '../voice/PiperTTSManager';

// Splash art native dimensions (assets/splash-art.jpg).
const SPLASH_W = 941;
const SPLASH_H = 1672;
// OTA-475/476 — top-left-anchored splash scale (fraction of screen width). Full
// "too big", 2/3 "too far", 0.85 "getting there", 0.92 "just a touch more" → 0.97.
// OTA-484 — REVERTS OTA-483. The 483 offset (top/left = 40dp) read as the art moving
// DOWN-AND-LEFT — it just exposed a black top/left margin, not what the player wanted.
// The image is anchored by its TOP-LEFT corner, so enlarging ALONE grows it down-right
// from that corner; no offset is needed. Re-anchored at (0,0) and enlarged ~15% over
// the 0.97 baseline → 1.12. Width grows, height follows the same ratio (aspect
// preserved — no stretch).
const SPLASH_SCALE = 1.12;

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

  // OTA-473/474 — top-left anchored, scaled to SPLASH_SCALE of full-width. Explicit
  // pixel dimensions from the screen width — deterministic, no aspectRatio guesswork.
  const screenW = Dimensions.get('window').width;
  const imgW = Math.round(screenW * SPLASH_SCALE);
  const imgH = Math.round((imgW * SPLASH_H) / SPLASH_W);

  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityViewIsModal={true}>
      <Image
        source={require('../../assets/splash-art.jpg')}
        style={{ position: 'absolute', top: 0, left: 0, width: imgW, height: imgH }}
        resizeMode="cover"
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.barWrap}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.barLabel}>
          {settled ? 'Entering the buried world…' : 'Waking the Arbiter — keep the app open'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a0908', zIndex: 1000, elevation: 1000 },
  barWrap: { position: 'absolute', left: 28, right: 28, bottom: 56, alignItems: 'center' },
  barTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: '#c9a86a' },
  barLabel: { marginTop: 10, color: '#e6d8b3', fontSize: 11, letterSpacing: 1.5, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4 },
});

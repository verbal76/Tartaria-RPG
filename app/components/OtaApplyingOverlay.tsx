// "Please wait, applying update" — the full-bleed card shown for the real
// apply/activate transition (see app/updates/otaApplyingState.ts).
//
// Rendered at the ROOT, outside the safe-area padding and the UI scale
// transform, exactly like SplashOverlay — and for the same reason: it has to be
// edge to edge and above everything. It is deliberately NOT an RN <Modal>: a
// Modal is its own native window, which the app-root capture cannot see (Class
// H), and it cannot exist on the pre-hydration render where the boot-front apply
// actually happens.
//
// It owns the touch surface (pointerEvents="auto" on a full-screen view above
// the splash's zIndex), so no gameplay input, second apply tap, or navigation
// can land while the bundle is being swapped. There is no dismiss control on
// purpose: dismissing mid-activation could only interfere with it. If control
// returns to this runtime the state clears and the overlay unmounts itself.
//
// Shell: the kit's modal scrim and card (OTA-1765's census forbids a hand-copied
// one). Text colours are the ones the original UPDATING modal used.

import React, { useSyncExternalStore } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { tModalCard, tartariaKitStyles as kit } from '../ui/tartariaKit';
import { isOtaApplying, subscribeOtaApplying } from '../updates/otaApplyingState';

const CARD = tModalCard(360);

export const OTA_APPLYING_MESSAGE = 'Please wait, applying update';

export function OtaApplyingOverlay() {
  const applying = useSyncExternalStore(subscribeOtaApplying, isOtaApplying, isOtaApplying);
  if (!applying) return null;
  return (
    <View
      style={[kit.modalScrim, styles.layer]}
      pointerEvents="auto"
      accessibilityViewIsModal={true}
      accessibilityLiveRegion="polite"
      testID="ota-applying-overlay"
    >
      <View style={CARD}>
        <Text style={styles.title}>UPDATING</Text>
        <View style={styles.rule} />
        <View style={styles.spinnerRow}>
          <ActivityIndicator color="#c9a86a" size="large" />
        </View>
        <Text style={styles.message} accessibilityRole="alert">{OTA_APPLYING_MESSAGE}</Text>
        <Text style={styles.hint}>
          Tartaria is replacing its bones. Your characters and saves are untouched.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The shell itself (scrim + card) is the kit's, shared with every other dialog;
  // only what is specific to a root-mounted blocking layer lives here. Above
  // SplashOverlay (zIndex/elevation 1000) so a launch-time apply is not hidden
  // behind the opening splash, and deeper than the standard dim so the game
  // underneath reads as paused.
  layer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 2000,
    elevation: 2000,
  },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, alignSelf: 'stretch', backgroundColor: '#3a342c', marginTop: 8, marginBottom: 14 },
  spinnerRow: { paddingVertical: 6, marginBottom: 8 },
  message: { color: '#e6d8b3', fontSize: 14, letterSpacing: 1, marginBottom: 10, textAlign: 'center' },
  hint: { color: '#9a8f78', fontSize: 11, lineHeight: 16, textAlign: 'center', fontStyle: 'italic' },
});

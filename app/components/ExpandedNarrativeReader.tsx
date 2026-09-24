// OTA — THE TRANSCRIPT GETS A ROOM OF ITS OWN WHEN THE SCREEN WILL NOT GIVE IT ONE.
//
// ⚠⚠⚠ PRESENTATION ONLY, AND THAT IS THE WHOLE CONTRACT. This component reads
// `gameLog` and draws it larger. It does not append, consume, advance, travel,
// equip, spend or route. Opening and closing it are not game actions and must
// never become game actions: the entire reason the player is here is that they
// could not READ something, and a reader that changes the thing being read
// would be worse than the collapsed feed it replaces.
//
// ⚠⚠ IT RENDERS `AdventureFeed` ITSELF RATHER THAN A SECOND INTERPRETATION OF
// `GameLogEntry`. Two renderers for one log is how a transcript starts
// disagreeing with itself — one of them learns about combat strips or story
// rules and the other does not. Reusing the component makes "the expanded view
// shows the same thing" true by construction instead of by inspection, and it
// inherits the feed's own scroll-to-end semantics for free, so the reader opens
// where the player was already looking.
//
// ⚠ THE ACTION CHIPS ARE DELIBERATELY NOT PASSED. `AdventureFeed`'s trailing
// take/pack chips DO dispatch (takeAndWear / takeDirect). Handing them to a
// second mounted copy would put two live tap targets on one offer, which is the
// OTA-1860 class of defect — a payment bound to something other than the card
// the player pressed. Omitting the props renders no chips at all, and the
// inline feed keeps the one true copy of them.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdventureFeed } from './AdventureFeed';
import type { GameLogEntry } from '../engine/types';
import { T, tartariaKitStyles as kit } from '../ui/tartariaKit';

interface Props {
  entries: GameLogEntry[];
  enemyNames?: string[];
  onClose: () => void;
}

export function ExpandedNarrativeReader({ entries, enemyNames, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    /* ⚠⚠⚠ THE RESPONDER TOPOLOGY IS THE LOAD-BEARING PART — OTA-1875.
       The scrim is a SIBLING that sits BEHIND the card, never an ancestor of it.
       A Touchable/Pressable attaches its responder handlers to its one child, so
       a scrim WRAPPING the card would put `onStartShouldSetResponder` on an
       ancestor of the ScrollView below — and a descendant cannot take the
       responder back from an ancestor. That is exactly how the Fusing Crucible
       list lost its scroll on the owner's Pixel: the surface looked alive, the
       buttons outside it worked, and the list inside could not be dragged.
       Order is the z-order here: scrim first, card second, so the card paints on
       top while the scrim still catches everything around it. */
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the expanded narrative"
        testID="narrative-reader-scrim"
      />
      <View
        style={[
          styles.card,
          { marginTop: Math.max(insets.top, 8), marginBottom: Math.max(insets.bottom, 8) },
        ]}
        accessibilityViewIsModal={true}
      >
        <View style={styles.header}>
          <Text style={styles.title}>NARRATIVE</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [kit.ctl, styles.closeBtn, pressed && kit.controlPressed]}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="narrative-reader-close"
          >
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
        {/* The feed fills the rest of the card and owns its own scrolling. */}
        <AdventureFeed entries={entries} enemyNames={enemyNames} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ⚠ Absolutely filling the screen area rather than a native <Modal>: the app
  // renders inside AppShell's `transform: scale` wrapper, which a native modal
  // escapes (uiScale's own header says so), and OTA-234 established that the
  // in-tree overlay layer is the one that composites predictably with the rest
  // of this screen. `box-none` so the overlay box itself never eats a touch —
  // only the scrim and the card do.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  card: {
    flex: 1,
    marginHorizontal: 10,
    backgroundColor: T.face,
    borderWidth: 1,
    borderColor: T.panelRim,
    borderRadius: 3,
    padding: 8,
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    flex: 1,
    color: '#e6d8b3',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  closeBtn: {
    backgroundColor: 'rgba(6,7,8,0.94)',
    borderWidth: 1,
    borderColor: '#242829',
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  closeText: { color: T.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
});

// TakeModal — chip-only quick-action for picking up scene items.
// Bypasses the parser entirely. The chip list is pre-filtered to
// nouns that resolve via findCatalogItem (with alias layer), so
// every chip is GUARANTEED to grant a real item when tapped.
//
// No text input: text input was the original problem — 'take it'
// stripped the pronoun, parser couldn't resolve, "ground is bare"
// fired. By offering only chips for catalog-resolvable nouns, the
// player gets 100% certainty their tap lands the thing in their
// pack.

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Pressable,
} from 'react-native';

// Re-export the shared chip type so existing imports continue to
// resolve. The InteractableChip rules drive the take modal's
// hide-vs-grey behaviour now.
export type { InteractableChip as TakeableChip } from './InteractableChip';

interface Props {
  visible: boolean;
  /** Pre-filtered list of takeable ambient nouns — catalog-resolvable
   *  and not over-sized. Per OTA 191, the modal HIDES chips marked
   *  consumed (rather than greying them) unless alwaysShow=true on
   *  the chip. Take chips never use alwaysShow, so a successful take
   *  removes the noun from the list. The previous grey-out behaviour
   *  was confusing per playtester ("once successful, it should
   *  disappear from the noun list on all actions"). */
  takeable: import('./InteractableChip').InteractableChip[];
  /** Open take (no roll, always succeeds). */
  onTake: (noun: string) => void;
  /** Stealth take — DEX vs DC 10 sleight check. Routes to
   *  stealFromVendor when a vendor is present in the scene. */
  onStealthTake: (noun: string) => void;
  /** OTA 222 — batch open-take. Fires onTake for every visible
   *  non-consumed chip in sequence, then closes. Only surfaced when
   *  there are 2+ visible items and stealth is OFF (batch DEX rolls
   *  with cascading rep loss would be hostile UX). Playtester:
   *  "we need a take all button so we don't tap each chip
   *  individually." */
  onTakeAll: (nouns: string[]) => void;
  onCancel: () => void;
}

export function TakeModal({ visible, takeable, onTake, onStealthTake, onTakeAll, onCancel }: Props) {
  const [useStealth, setUseStealth] = useState(false);
  // Reset the toggle each time the modal opens so the player has to
  // re-arm the sneaky path on purpose — no surprise pickpockets.
  useEffect(() => {
    if (visible) setUseStealth(false);
  }, [visible]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">TAKE</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Items in the scene you can pick up. Tap one — it goes straight
                in your pack with full stats. No re-tapping needed.
              </Text>

              {/* USE STEALTH toggle. When on, taps route through the
                  stealth handler — DEX vs DC 10 sleight check, vendor
                  theft when a vendor is in the scene. Defaults to OFF
                  on every modal open so casual takes don't accidentally
                  cost the player their faction standing. */}
              <Pressable
                style={({ pressed }) => [
                  styles.stealthToggle,
                  useStealth && styles.stealthToggleActive,
                  pressed && styles.chipPressed,
                ]}
                onPress={() => setUseStealth((s) => !s)}
                accessibilityRole="button"
                accessibilityState={{ selected: useStealth }}
              >
                <Text style={[styles.stealthToggleText, useStealth && styles.stealthToggleTextActive]}>
                  {useStealth ? '✓ USE STEALTH (DEX roll)' : 'USE STEALTH (off)'}
                </Text>
              </Pressable>

              {(() => {
                // Per OTA 191: hide consumed chips unless alwaysShow.
                // Take chips never use alwaysShow → consumed chips
                // disappear entirely once grabbed. This matches the
                // playtester spec ("once successful, it is removed
                // from that locations noun list on all actions").
                const visible = takeable.filter((c) => !c.consumed || c.alwaysShow);
                return visible.length === 0 ? (
                <Text style={styles.empty}>
                  Nothing here you can pocket. Scene features (pillars, walls,
                  arches) can't be taken — try SALVAGE for parts instead.
                </Text>
              ) : (
                <ScrollView style={styles.chipScroll} contentContainerStyle={styles.chipList}>
                  {visible.map(({ noun, consumed }) => (
                    <Pressable
                      key={noun}
                      style={({ pressed }) => [
                        styles.chip,
                        consumed && styles.chipConsumed,
                        pressed && !consumed && styles.chipPressed,
                      ]}
                      disabled={consumed}
                      onPress={() => (useStealth ? onStealthTake(noun) : onTake(noun))}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: consumed }}
                    >
                      <Text style={[styles.chipText, consumed && styles.chipTextConsumed]}>
                        {noun}
                      </Text>
                      <Text
                        style={[
                          useStealth ? styles.chipArrowStealth : styles.chipArrow,
                          consumed && styles.chipArrowConsumed,
                        ]}
                      >
                        {consumed
                          ? '✓ taken'
                          : useStealth
                            ? '→ lift quietly'
                            : '→ pack'}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              );
              })()}

              {/* OTA 222 — TAKE ALL surfaces only when there are
                  multiple grabbable items and stealth is off. Batch
                  DEX rolls with cascading rep loss aren't a UX we
                  want to offer. The button fires onTakeAll with the
                  visible non-consumed nouns; parent iterates the
                  takes and closes. */}
              {(() => {
                const grabbable = takeable
                  .filter((c) => !c.consumed || c.alwaysShow)
                  .filter((c) => !c.consumed)
                  .map((c) => c.noun);
                if (grabbable.length < 2 || useStealth) return null;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.takeAllBtn, pressed && styles.btnPressed]}
                    onPress={() => onTakeAll(grabbable)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.takeAllText}>
                      TAKE ALL ({grabbable.length})
                    </Text>
                  </Pressable>
                );
              })()}

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
                  onPress={onCancel}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnText}>CLOSE</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  empty: { color: '#a2977b', fontSize: 12, fontStyle: 'italic', lineHeight: 17, marginVertical: 14 },
  chipScroll: { maxHeight: 280 },
  chipList: { gap: 6, paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1714',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { color: '#e6d8b3', fontSize: 14, fontWeight: '600' },
  chipArrow: { color: '#9ec96a', fontSize: 11, letterSpacing: 1 },
  chipArrowStealth: { color: '#6a9bbf', fontSize: 11, letterSpacing: 1 },
  // Consumed (already-taken) state — chip stays in the list so the
  // player can see what was here, but its border drops to a muted
  // gray and the text and arrow lose color so it reads as
  // "exhausted" rather than "actionable". disabled=true on the
  // Pressable suppresses taps.
  chipConsumed: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    opacity: 0.55,
  },
  chipTextConsumed: { color: '#a2977b', fontStyle: 'italic' },
  chipArrowConsumed: { color: '#5e5547' },
  stealthToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    alignItems: 'center',
    marginBottom: 8,
  },
  stealthToggleActive: { borderColor: '#6a9bbf', backgroundColor: '#1c2a35' },
  stealthToggleText: { color: '#a2977b', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  stealthToggleTextActive: { color: '#6a9bbf' },
  takeAllBtn: {
    marginTop: 10,
    backgroundColor: '#9ec96a',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: 'center',
  },
  takeAllText: { color: '#0a0908', fontWeight: '800', letterSpacing: 2, fontSize: 13 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
    borderColor: '#3a342c',
  },
  btnPressed: { opacity: 0.7 },
  btnText: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

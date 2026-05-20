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

interface Props {
  visible: boolean;
  /** Pre-filtered list of takeable ambient nouns — catalog-resolvable
   *  and not already consumed in this room. */
  takeable: string[];
  /** Open take (no roll, always succeeds). */
  onTake: (noun: string) => void;
  /** Stealth take — DEX vs DC 10 sleight check. Routes to
   *  stealFromVendor when a vendor is present in the scene. */
  onStealthTake: (noun: string) => void;
  onCancel: () => void;
}

export function TakeModal({ visible, takeable, onTake, onStealthTake, onCancel }: Props) {
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
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>TAKE</Text>
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
              >
                <Text style={[styles.stealthToggleText, useStealth && styles.stealthToggleTextActive]}>
                  {useStealth ? '✓ USE STEALTH (DEX roll)' : 'USE STEALTH (off)'}
                </Text>
              </Pressable>

              {takeable.length === 0 ? (
                <Text style={styles.empty}>
                  Nothing here you can pocket. Scene features (pillars, walls,
                  arches) can't be taken — try SALVAGE for parts instead.
                </Text>
              ) : (
                <ScrollView style={styles.chipScroll} contentContainerStyle={styles.chipList}>
                  {takeable.map((n) => (
                    <Pressable
                      key={n}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                      onPress={() => (useStealth ? onStealthTake(n) : onTake(n))}
                    >
                      <Text style={styles.chipText}>{n}</Text>
                      <Text style={useStealth ? styles.chipArrowStealth : styles.chipArrow}>
                        {useStealth ? '→ lift quietly' : '→ pack'}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
                  onPress={onCancel}
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
  empty: { color: '#7a705c', fontSize: 12, fontStyle: 'italic', lineHeight: 17, marginVertical: 14 },
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
  stealthToggleText: { color: '#7a705c', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  stealthToggleTextActive: { color: '#6a9bbf' },
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

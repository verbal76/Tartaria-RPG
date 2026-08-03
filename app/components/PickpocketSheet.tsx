// OTA-847 (STEALTH SYSTEM) — the PICKPOCKET picker. Replaces the old
// out-of-combat APPROACH picker (whose walk-up-to-a-noun job is retired).
// Vendor offers become lift targets; ambient nouns become opportunistic
// grabs. Rolls Stealth vs the mark's awareness — pickpocket IS the stealth
// action, so there's no toggle.
//
// OTA-1100 — rebuilt as a BOTTOM SHEET, same slot and skin as the DiceRoller
// and the talk sheets, at the owner's direction ("can we have it do a bottom
// cover as well when we pick the item"). The feed stays readable while you
// choose the mark — and the roll line + outcome land there, right where
// you're already looking. Picking a target attempts the lift and closes the
// sheet; CANCEL hands the slot back untouched.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Keyboard,
} from 'react-native';

interface Props {
  /** Vendor name in the scene, if any — the header names who you're lifting
   *  from. */
  vendorName?: string;
  /** The vendor's offer item names, surfaced as green chips — tap one to
   *  attempt to lift THAT item. */
  vendorOffers?: string[];
  /** Ambient / NPC nouns you can pickpocket when there's no vendor (opportunistic
   *  sleight-of-hand grabs). */
  npcHints?: string[];
  /** The player picks a mark/item (or types one) and the engine runs the
   *  Stealth check. Success → it's yours, quiet and clean. Failure → if your
   *  Stealth is high you withdraw unseen; if it's low against a vendor, you're
   *  caught and the fight is real. */
  onSubmit: (target: string) => void;
  onCancel: () => void;
}

export function PickpocketSheet({
  vendorName,
  vendorOffers,
  npcHints,
  onSubmit,
  onCancel,
}: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  // The sheet mounts fresh each open (it's conditionally rendered in the
  // controls slot), but clear anyway in case a parent ever keeps it mounted.
  useEffect(() => { setText(''); }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    onSubmit(trimmed);
  };

  const tapTarget = (target: string) => {
    Keyboard.dismiss();
    onSubmit(target);
  };

  const offers = vendorOffers ?? [];
  const npcs = npcHints ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>PICKPOCKET</Text>
        <Text style={styles.hint}>the roll lands in the feed above</Text>
      </View>
      <Text style={styles.body}>
        {vendorName
          ? `Lift something off ${vendorName} without them noticing. Rolls STEALTH — a clean hand takes it quiet; a clumsy one gets caught, and the steel comes out.`
          : 'Palm something off a mark or out of the open without being seen. Rolls STEALTH.'}
      </Text>

      <TextInput
        ref={inputRef}
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder='e.g. "the coin pouch", "the amulet"'
        placeholderTextColor="#a2977b"
        onSubmitEditing={handleSubmit}
        returnKeyType="go"
        autoCorrect={false}
        autoCapitalize="none"
      />

      {offers.length > 0 && (
        <>
          <Text style={styles.chipLabel}>{vendorName ? `${vendorName}'s goods` : 'On offer'}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScrollRow}
          >
            {offers.map((o) => (
              <Pressable
                key={`offer-${o}`}
                style={({ pressed }) => [styles.chip, styles.chipScene, pressed && styles.btnPressed]}
                onPress={() => tapTarget(o)}
                accessibilityRole="button"
              >
                <Text style={styles.chipTextScene} numberOfLines={1}>{o}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {npcs.length > 0 && (
        <>
          <Text style={styles.chipLabel}>Within reach</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScrollRow}
          >
            {npcs.map((h) => (
              <Pressable
                key={`npc-${h}`}
                style={({ pressed }) => [styles.chip, pressed && styles.btnPressed]}
                onPress={() => tapTarget(h)}
                accessibilityRole="button"
              >
                <Text style={styles.chipText} numberOfLines={1}>{h}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      <View style={styles.btnRow}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
          onPress={onCancel}
          accessibilityRole="button"
        >
          <Text style={styles.btnTextNeutral}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            styles.btnPrimary,
            !text.trim() && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
          onPress={handleSubmit}
          disabled={!text.trim()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !text.trim() }}
        >
          <Text style={styles.btnTextPrimary}>LIFT</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Same skin as the DiceRoller/TalkSheet slot-mates — house tokens only.
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    color: '#c9a86a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  hint: {
    color: '#a2977b',
    fontSize: 10,
    fontStyle: 'italic',
  },
  body: {
    color: '#a2977b',
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 3,
    fontSize: 14,
  },
  chipLabel: {
    color: '#a2977b',
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  chipScrollRow: { flexDirection: 'row', gap: 6, paddingLeft: 2, paddingRight: 8 },
  chip: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipScene: { borderColor: '#9ec96a' },
  chipText: { color: '#cdbf99', fontSize: 12 },
  chipTextScene: { color: '#9ec96a', fontSize: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 3, borderWidth: 1, minWidth: 80, alignItems: 'center' },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#0a0908', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

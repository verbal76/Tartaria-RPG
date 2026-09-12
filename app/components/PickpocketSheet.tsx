// OTA-847 (STEALTH SYSTEM) — the PICKPOCKET picker. Rolls Stealth vs the
// mark's awareness — pickpocket IS the stealth action, so there's no toggle.
//
// OTA-1077 — rebuilt as a BOTTOM SHEET, same slot and skin as the DiceRoller
// and the talk sheets ("can we have it do a bottom cover as well" — owner).
// The feed stays readable while you choose — the Stealth roll line and the
// outcome land there.
//
// OTA-1078 — the sheet shows MARKS, not merchandise. Owner: "only show what
// you can pickpocket. Stealing is for items, pickpocket is for what would be
// in their clothing or on them." So no vendor-goods chips, no ambient nouns,
// no free-typed target: one chip per PERSON in reach, and what's in their
// pocket stays hidden until your hand is in it (engine/pocketLoot.ts rolls
// the payout). Items on tables and the ground stay with the steal/take
// verbs. Picking a mark attempts the lift and closes the sheet.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { tControlDepth, tartariaKitStyles as kit } from '../ui/tartariaKit';

/* ⚠⚠ PHASE 3 — migrated off the deprecated control dialect. Handler, role,
 * label, hitSlop and geometry unchanged; only the material moved to the kit. */
const ctlPlanes = (pressed: boolean) => (
  <>
    <View style={pressed ? kit.controlPlaneTopPressed : kit.controlPlaneTop} pointerEvents="none" />
    <View style={pressed ? kit.controlPlaneBottomPressed : kit.controlPlaneBottom} pointerEvents="none" />
    {pressed ? null : <View style={kit.controlPlaneContact} pointerEvents="none" />}
  </>
);

interface Props {
  /** People in the scene with pockets worth trying — vendor and/or wanderer
   *  names. Empty means no marks in reach; the sheet says so. */
  marks: string[];
  /** The player picks a mark and the engine runs the Stealth check against
   *  THEM. Success → whatever they were carrying close. Failure → a high-
   *  Stealth hand withdraws unseen; a clumsy one against a vendor starts a
   *  real fight. */
  onPick: (markName: string) => void;
  onCancel: () => void;
}

export function PickpocketSheet({ marks, onPick, onCancel }: Props) {
  return (
    <View style={kit.sheetCard}>
      <View style={kit.sheetHeader}>
        <Text style={styles.kicker}>PICKPOCKET</Text>
        <Text style={styles.hint}>the roll lands in the feed above</Text>
      </View>
      <Text style={styles.body}>
        {marks.length > 0
          ? 'Slip a hand into someone’s pocket. Rolls STEALTH — what they keep on them stays hidden until it’s in your hand. A clean lift goes unfelt; a clumsy one gets caught.'
          : 'No one in reach worth the risk. Pockets belong to people — find a trader or a traveler.'}
      </Text>

      {marks.map((m) => (
        <Pressable
          key={m}
          style={({ pressed }) => [kit.ctl, styles.markBtn, tControlDepth(pressed)]}
          onPress={() => onPick(m)}
          accessibilityRole="button"
          accessibilityLabel={`Pickpocket ${m}`}
        >
          <Text style={styles.markText} numberOfLines={1}>{m}</Text>
          <Text style={styles.markHint}>what's on them, not what's on the table</Text>
        </Pressable>
      ))}

      <Pressable
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel pickpocket"
      >
        <Text style={styles.cancelText}>CANCEL</Text>
      </Pressable>
    </View>
  );
}

// Same skin as the DiceRoller/TalkSheet slot-mates — house tokens only.
const styles = StyleSheet.create({
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
  // ⚠ GEOMETRY ONLY — `kit.ctl` owns the material; no box moved.
  markBtn: { paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  markText: {
    color: '#e6d8b3',
    fontSize: 14,
    fontWeight: '700',
  },
  markHint: {
    color: '#a2977b',
    fontSize: 11,
    fontStyle: 'italic',
  },
  btnPressed: { opacity: 0.7 },
  cancelBtn: {
    backgroundColor: '#3a342c',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#c9a86a',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

// OTA-1104 — THE SHAKEDOWN. Caught with your hand in a vendor's pocket while
// holding enough TC to matter, the vendor names a price for their silence.
// Owner: "let's do the pay them off option when caught; if you don't have the
// TC you fight" — a player who can't cover the price never sees this sheet;
// the fight comes straight on.
//
// Bottom sheet in the DiceRoller's controls slot, same as every other
// decision surface. PAY buys quiet — no fight, no word to their faction —
// but THEY remember (the ledger takes the wrong either way). FIGHT is the
// old caught path: steel, rep loss, and a vendor-shaped enemy.
//
// There is deliberately no cancel and no tap-away: your wrist is in their
// grip. The store refuses every other action until this resolves.

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useGameStore } from '../state/gameStore';

export function PayoffSheet() {
  const ctx = useGameStore((s) => s.pendingPayoff);
  const resolve = useGameStore((s) => s.resolvePayoff);
  const tc = useGameStore((s) => s.player?.tc ?? 0);

  if (!ctx) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>CAUGHT</Text>
        <Text style={styles.hint}>your pouch holds {tc} TC</Text>
      </View>
      <Text style={styles.vendorName}>{ctx.vendorName}</Text>
      <Text style={styles.body}>
        Their grip is iron and their voice is low: {ctx.amount} TC and nobody hears about this. Refuse, and it goes loud — steel, and everything that follows being named a thief.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.payBtn, pressed && styles.btnPressed]}
        onPress={() => resolve(true)}
        accessibilityRole="button"
        accessibilityLabel={`Pay ${ctx.amount} TC`}
      >
        <Text style={styles.payText}>PAY {ctx.amount} TC</Text>
        <Text style={styles.payHint}>They keep quiet. They never forget.</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.fightBtn, pressed && styles.btnPressed]}
        onPress={() => resolve(false)}
        accessibilityRole="button"
        accessibilityLabel="Refuse and fight"
      >
        <Text style={styles.fightText}>FIGHT</Text>
        <Text style={styles.fightHint}>"Thief!" — steel comes out, and the factions hear of it.</Text>
      </Pressable>
    </View>
  );
}

// Same skin as the other controls-slot sheets — house tokens only; the fight
// row borrows the ember accent the dice use for a failed verdict.
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
  vendorName: {
    color: '#cdbf99',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  body: {
    color: '#a2977b',
    fontSize: 12,
    lineHeight: 17,
  },
  payBtn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#2a1f12',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  payText: {
    color: '#e0c179',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  payHint: {
    color: '#a2977b',
    fontSize: 11,
    fontStyle: 'italic',
  },
  fightBtn: {
    borderColor: '#a85a3a',
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#17150f',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  fightText: {
    color: '#e07a5f',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  fightHint: {
    color: '#a2977b',
    fontSize: 11,
    fontStyle: 'italic',
  },
  btnPressed: { opacity: 0.7 },
});

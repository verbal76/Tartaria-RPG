// OTA-808 — the parley chooser. Surfaced when the player opens a social
// encounter with a GENERIC opener ("talk to / greet") against a wild NPC or an
// animal they're fighting. Presents the contextual choices with their stakes
// spelled out, so a risky commit (intimidate → fail = a fight / a vicious hit)
// is a deliberate tap, never a mis-parsed verb. A player who typed a specific
// verb never sees this — they committed already. See engine/parley.ts +
// gameStore.resolveParley.
//
// OTA-1099 — rebuilt as a BOTTOM SHEET, same slot and skin as the DiceRoller
// and the TalkSheet ("I think all talking should be like this" — owner). The
// temperament read and the stakes sit above tappable choices; the feed stays
// readable the whole time. "Just talk" swaps this sheet for the TalkSheet in
// place — the conversation continues at the bottom of the screen.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { choicesFor, temperamentReadout, temperamentTell } from '../engine/parley';

export function ParleySheet() {
  const ctx = useGameStore((s) => s.pendingParley);
  const resolve = useGameStore((s) => s.resolveParley);
  const close = useGameStore((s) => s.closeParley);
  const intoTalk = useGameStore((s) => s.parleyIntoTalk);

  if (!ctx) return null;
  const [safe, hard] = choicesFor(ctx.kind); // [calm|persuade, intimidate]
  const read = ctx.wisRevealed ? temperamentReadout(ctx.temperament) : temperamentTell(ctx.temperament);

  const safeLabel = ctx.kind === 'animal' ? 'Calm it' : 'Persuade them';
  const safeHint = ctx.kind === 'animal'
    ? 'Ease off — if it doesn\'t take, the fight simply goes on.'
    : 'Reason with them — if it fails, they clam up and you lose the lead.';
  const hardHint = ctx.kind === 'animal'
    ? 'Dominate it — if it fails, it lands a vicious hit.'
    : 'Lean on them for what they carry — if it fails, they turn on you.';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>PARLEY</Text>
        <Text style={styles.hint}>how do you play it?</Text>
      </View>
      <Text style={styles.targetName}>{ctx.targetName}</Text>
      <Text style={styles.read}>{read}</Text>

      <TouchableOpacity
        style={styles.choiceBtn}
        onPress={() => resolve(safe)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={safeLabel}
      >
        <Text style={styles.choiceLabel}>{safeLabel}</Text>
        <Text style={styles.choiceHint}>{safeHint}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.choiceBtn, styles.hardBtn]}
        onPress={() => resolve(hard)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Intimidate"
      >
        <Text style={[styles.choiceLabel, styles.hardLabel]}>Intimidate</Text>
        <Text style={styles.choiceHint}>{hardHint}</Text>
      </TouchableOpacity>

      {/* OTA-1087 — THE THIRD OPTION, and the only door the seven wanderer
          archetypes have. This CLOSES the parley without rolling, the wanderer
          stays in the scene, and walking out of the conversation gets this
          sheet back. Talking to somebody must never spend the chance to deal
          with them. */}
      {ctx.topicsNpcId ? (
        <TouchableOpacity
          style={styles.choiceBtn}
          onPress={intoTalk}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Just talk"
        >
          <Text style={styles.choiceLabel}>Just talk</Text>
          <Text style={styles.choiceHint}>Ask them about the road. Costs nothing, forfeits nothing.</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={styles.backOffBtn}
        onPress={close}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back off"
      >
        <Text style={styles.backOffText}>BACK OFF</Text>
      </TouchableOpacity>
    </View>
  );
}

// Same skin as the DiceRoller/TalkSheet slot-mates — house tokens only. The
// intimidate row borrows the ember accent the dice use for a failed verdict:
// it marks risk, not decoration.
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
  targetName: {
    color: '#cdbf99',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  read: {
    color: '#a2977b',
    fontSize: 12,
    marginBottom: 2,
  },
  choiceBtn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#17150f',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  hardBtn: {
    borderColor: '#a85a3a',
  },
  choiceLabel: {
    color: '#e6d8b3',
    fontSize: 14,
    fontWeight: '700',
  },
  hardLabel: {
    color: '#e07a5f',
  },
  choiceHint: {
    color: '#a2977b',
    fontSize: 12,
  },
  backOffBtn: {
    backgroundColor: '#3a342c',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  backOffText: {
    color: '#c9a86a',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

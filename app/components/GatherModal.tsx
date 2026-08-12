// ⚠⚠ OTA-1233 — ONE POPUP. Owner: *"what if we combined both and the popup had
// three buttons... you can still take individual items by tapping them."*
//
// TAKE and SALVAGE were two pickers over ONE list of scene nouns, each with its
// own idea of what counted as used up. That seam is where OTA-1231's bugs lived —
// investigate greying a take chip the engine would have honoured, a bulk salvage
// scrapping items the player could have pocketed. Merging is not tidying: it
// deletes the seam. One list, one consumed-state, one place to be wrong.
//
// ⚠ IT ALSO MATCHES WHAT A PLAYER IS DOING. Nobody thinks "I shall now perform
// the salvage verb." They think CLEAR THIS ROOM. The old flow was TAKE → tap →
// close → SALVAGE → tap → close: two modals for one intention.
//
// ⚠⚠ THE ROW MARKS ARE DELIBERATELY LOUD THIS TIME. OTA-1232 shipped these same
// marks at 13px in #a2977b — the muted tan already used by the text beside them —
// and the owner played a full session without noticing they existed. That was not
// him missing it; it was a signal built and then hidden. The mark now carries its
// own size, its own weight, and on an upgrade its own colour AND a tinted row, so
// it reads at arm's length instead of rewarding a hunt.
//
// ⚠ SALVAGE ALL IS SUBORDINATE ON PURPOSE. Take is reversible — drop it. Salvage
// is a one-way door. Two buttons of equal weight side by side would make a
// mis-tap cost the room, so SALVAGE ALL is quieter, and it COUNTS what it will
// destroy rather than saying "all".
import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TouchableWithoutFeedback, Pressable,
} from 'react-native';
import {
  classifyGatherNoun, isUpgradeOverEquipped, sortGatherRows, gatherIcon,
  type GatherRow,
} from '../engine/gatherSort';
import type { PlayerCharacter } from '../engine/types';

export interface GatherChip {
  noun: string;
  consumed?: boolean;
  alwaysShow?: boolean;
}

interface Props {
  visible: boolean;
  /** Every scene noun the player can reach — takeables AND scenery. ONE list,
   *  which is the entire point of the merge. */
  chips: GatherChip[];
  player: PlayerCharacter | null;
  /** Take a single takeable noun. */
  onTake: (noun: string) => void;
  /** Salvage a single scenery noun (or a takeable one, if deliberately tapped —
   *  see the ⚒ affordance below). */
  onSalvage: (noun: string) => void;
  /** Bulk take every takeable row. */
  onTakeAll: (nouns: string[]) => void;
  /** Bulk salvage every scenery row. ⚠ Never the takeables — that guard lives in
   *  the store (OTA-1231) and this list mirrors it so the button and the engine
   *  agree about what is about to happen. */
  onSalvageAll: (nouns: string[]) => void;
  /** Stealth take — only meaningful with a vendor present, where it is a THEFT. */
  onStealthTake: (noun: string) => void;
  stealthMeaningful: boolean;
  onCancel: () => void;
}

export function GatherModal({
  visible, chips, player, onTake, onSalvage, onTakeAll, onSalvageAll,
  onStealthTake, stealthMeaningful, onCancel,
}: Props) {
  const [useStealth, setUseStealth] = useState(false);
  useEffect(() => { if (visible) setUseStealth(false); }, [visible]);

  const rows: GatherRow[] = sortGatherRows(
    chips
      .filter((c) => !c.consumed || c.alwaysShow)
      .map((c) => ({
        noun: c.noun,
        kind: classifyGatherNoun(c.noun),
        upgrade: isUpgradeOverEquipped(player, c.noun),
        consumed: !!c.consumed,
      })),
  );

  const takeables = rows.filter((r) => r.kind !== 'scenery' && !r.consumed);
  const scenery = rows.filter((r) => r.kind === 'scenery' && !r.consumed);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">THIS ROOM</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Tap anything to take it. Scrap is marked ⚒ — tap to pry it apart.
              </Text>

              {stealthMeaningful && (
                <Pressable
                  style={({ pressed }) => [
                    styles.stealthToggle,
                    useStealth && styles.stealthToggleActive,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => setUseStealth((s) => !s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: useStealth }}
                >
                  <Text style={[styles.stealthToggleText, useStealth && styles.stealthToggleTextActive]}>
                    {useStealth ? '✓ POCKET IT QUIETLY (STE roll — theft)' : 'POCKET IT QUIETLY (off)'}
                  </Text>
                </Pressable>
              )}

              {rows.length === 0 ? (
                <Text style={styles.empty}>
                  Nothing here to take or pry apart. The room is picked clean.
                </Text>
              ) : (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
                  {rows.map(({ noun, kind, upgrade, consumed }) => {
                    const isScrap = kind === 'scenery';
                    return (
                      <Pressable
                        key={noun}
                        style={({ pressed }) => [
                          styles.row,
                          isScrap && styles.rowScrap,
                          // ⚠ The upgrade row is tinted, not just marked. A glyph
                          // alone is what shipped in OTA-1232 and went unseen for
                          // a whole session.
                          upgrade && styles.rowUpgrade,
                          consumed && styles.rowConsumed,
                          pressed && !consumed && styles.rowPressed,
                        ]}
                        disabled={consumed}
                        onPress={() => {
                          if (isScrap) { onSalvage(noun); return; }
                          if (useStealth) { onStealthTake(noun); return; }
                          onTake(noun);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: consumed }}
                        accessibilityLabel={
                          `${upgrade ? 'Upgrade. ' : ''}${noun}. ${isScrap ? 'Tap to salvage' : 'Tap to take'}`
                        }
                      >
                        <Text style={[
                          styles.icon,
                          upgrade && styles.iconUpgrade,
                          isScrap && styles.iconScrap,
                        ]}>
                          {gatherIcon({ kind, upgrade })}
                        </Text>
                        <Text
                          style={[styles.rowText, consumed && styles.rowTextConsumed]}
                          numberOfLines={1}
                        >
                          {noun}
                        </Text>
                        <Text style={[styles.rowTail, upgrade && styles.rowTailUpgrade]}>
                          {upgrade ? 'UPGRADE' : isScrap ? 'scrap' : '→ pack'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* ⚠⚠ THE TWO BULK BUTTONS ARE NOT PEERS. Take is reversible;
                  salvage is not. Both are counted, because a bulk action whose
                  size you learn only after committing is one players stop
                  trusting — and the count is what catches a mis-tap. */}
              {takeables.length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.takeAll, pressed && styles.rowPressed]}
                  onPress={() => onTakeAll(takeables.map((r) => r.noun))}
                  accessibilityRole="button"
                >
                  <Text style={styles.takeAllText}>TAKE ALL ({takeables.length})</Text>
                </Pressable>
              )}
              {scenery.length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.salvageAll, pressed && styles.rowPressed]}
                  onPress={() => onSalvageAll(scenery.map((r) => r.noun))}
                  accessibilityRole="button"
                  accessibilityLabel={`Salvage ${scenery.length} fixtures. This destroys them.`}
                >
                  <Text style={styles.salvageAllText}>
                    ⚒ SALVAGE {scenery.length} {scenery.length === 1 ? 'FIXTURE' : 'FIXTURES'}
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [styles.close, pressed && styles.rowPressed]}
                onPress={onCancel}
                accessibilityRole="button"
              >
                <Text style={styles.closeText}>CLOSE</Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 18 },
  card: {
    backgroundColor: '#13110f', borderWidth: 1, borderColor: '#3a342c',
    borderRadius: 4, padding: 16, maxHeight: '86%',
  },
  title: { color: '#e6d8b3', fontSize: 15, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  rule: { height: 1, backgroundColor: '#3a342c', marginVertical: 10 },
  body: { color: '#a2977b', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  empty: { color: '#a2977b', fontSize: 12, lineHeight: 17, marginVertical: 12, textAlign: 'center' },
  scroll: { maxHeight: 300 },
  list: { paddingBottom: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#3a342c', borderRadius: 3,
    paddingVertical: 10, paddingHorizontal: 10, marginBottom: 6,
    backgroundColor: '#1a1611',
  },
  // ⚠ Scrap rows sit visually below the loot without being disabled-looking —
  // they are still tappable, they are just not the reason you opened this.
  rowScrap: { backgroundColor: '#151310', borderColor: '#2e2921' },
  // ⚠⚠ THE UPGRADE ROW IS TINTED. This is the fix for OTA-1232 shipping a mark
  // nobody saw: colour the ROW, not just the glyph.
  rowUpgrade: { borderColor: '#9ec96a', backgroundColor: '#18201a' },
  rowConsumed: { opacity: 0.4 },
  rowPressed: { opacity: 0.7 },

  // ⚠ 18px and bold. The OTA-1232 version was 13px in the same tan as the text
  // beside it, which is how a whole session went by without it registering.
  icon: { fontSize: 18, width: 26, color: '#cdbf99', fontWeight: '700' },
  iconUpgrade: { color: '#9ec96a' },
  iconScrap: { color: '#7d7361' },

  rowText: { flex: 1, color: '#e6d8b3', fontSize: 14, fontWeight: '600' },
  rowTextConsumed: { color: '#6f6759', textDecorationLine: 'line-through' },
  rowTail: { color: '#7d7361', fontSize: 10, letterSpacing: 0.5 },
  rowTailUpgrade: { color: '#9ec96a', fontWeight: '700' },

  takeAll: {
    borderWidth: 1, borderColor: '#c9a86a', backgroundColor: '#241d13',
    borderRadius: 3, paddingVertical: 11, alignItems: 'center', marginTop: 4,
  },
  takeAllText: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  // ⚠ Quieter than TAKE ALL, deliberately. Same reason it names a count.
  salvageAll: {
    borderWidth: 1, borderColor: '#4a4235', backgroundColor: '#17140f',
    borderRadius: 3, paddingVertical: 10, alignItems: 'center', marginTop: 6,
  },
  salvageAllText: { color: '#a2977b', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  close: { paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  closeText: { color: '#a2977b', fontSize: 12, letterSpacing: 1.5 },

  stealthToggle: {
    borderWidth: 1, borderColor: '#3a342c', borderRadius: 3,
    paddingVertical: 8, alignItems: 'center', marginBottom: 10,
  },
  stealthToggleActive: { borderColor: '#c9a86a', backgroundColor: '#241d13' },
  stealthToggleText: { color: '#7d7361', fontSize: 11, letterSpacing: 0.5 },
  stealthToggleTextActive: { color: '#e6d8b3', fontWeight: '700' },
});

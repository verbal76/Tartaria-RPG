// ⚠⚠ OTA-1233 — ONE POPUP. Owner: *"what if we combined both and the popup had
// three buttons... you can still take individual items by tapping them."*
//
// TAKE and SALVAGE were two pickers over ONE list of scene nouns, each with its
// own idea of what counted as used up. That seam is where OTA-1231's bugs lived —
// investigate greying a take chip the engine would have honoured, a bulk salvage
// scrapping items the player could have pocketed. Merging is not tidying: it
// deletes the seam. One list, one consumed-state, one place to be wrong.
//
// ⚠⚠ OTA-1235 — AND THEN THE MERGED VERSION STILL READ AS A GATED FLOW.
//
// Owner, after playing it: *"not quite there yet, it acts like a progressive
// filter and 1 gates the other. I tried to salvage all then take, it acted like
// the salvage items were gone."* Then the fix, in his words: *"it shouldn't be
// gated it should be a layout like here is everything, what do you want to do. we
// could make the items blocks color coded like orange squares for gear with a
// matching orange button for take all gear, green for takable items with a
// matching button, and yellow for salvageable items with a matching color button
// for all but if you tap a single item it takes just that, then have a red ignore
// button for when your done to dismiss the rest."*
//
// ⚠⚠ NOTHING WAS ACTUALLY GATED — AND THAT IS THE POINT. One scrolling list with
// two differently-worded buttons underneath makes the player deduce which button
// owns which row, and a wrong deduction is indistinguishable from a broken
// button. THE COLOUR REMOVES THE DEDUCTION: the block you are looking at is the
// colour of the button that will sweep it. Three lanes, three colours, three
// buttons, all visible at once. There is no order to do them in.
//
// ⚠ BLOCKS, NOT ROWS. A grid says "here is everything, pick"; a vertical list of
// full-width rows says "work down me". The owner asked for squares and the shape
// carries the meaning.
//
// ⚠⚠ THE MARKS ARE DELIBERATELY LOUD. OTA-1232 shipped its marks at 13px in
// #a2977b — the muted tan already used by the text beside them — and the owner
// played a full session without noticing they existed. That was not him missing
// it; it was a signal built and then hidden. Every lane now carries its own hue
// at full strength on the block border AND on its button face.
//
// ⚠ IGNORE IS RED AND IT IS NOT "CLOSE". Red because leaving loot behind is a
// real decision with a real cost, and the word is the owner's: you are dismissing
// what is left, not closing a window you opened by accident.
import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TouchableWithoutFeedback, Pressable,
} from 'react-native';
import {
  classifyGatherNoun, isUpgradeOverEquipped, sortGatherRows, gatherIcon,
  isActionableGatherKind, laneForKind, type GatherRow, type GatherLane,
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
  /** Salvage a single scenery noun. */
  onSalvage: (noun: string) => void;
  /** Bulk take — called with ONE lane's nouns, gear or items, never both. */
  onTakeAll: (nouns: string[]) => void;
  /** Bulk salvage every scrap block. ⚠ Never the takeables — that guard lives in
   *  the store (OTA-1231) and this lane mirrors it so the button and the engine
   *  agree about what is about to happen. */
  onSalvageAll: (nouns: string[]) => void;
  /** Stealth take — only meaningful with a vendor present, where it is a THEFT. */
  onStealthTake: (noun: string) => void;
  stealthMeaningful: boolean;
  onCancel: () => void;
}

/** ⚠ One place per lane for its colour, its heading and its button copy, so a
 *  block and the button that sweeps it can never drift apart. */
const LANE_HEADING: Record<GatherLane, string> = {
  gear: 'GEAR',
  items: 'ITEMS',
  scrap: 'SCRAP',
};

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
      }))
      // ⚠⚠ OTA-1234 — DROP THE INERT BLOCKS. A noun that is neither takeable nor
      // salvageable (firepit, signpost, tent) has no verb in this picker, and
      // OTA-1233 listed them as scrap: the button read "⚒ SALVAGE 4 FIXTURES",
      // the sweep found no pool, nothing was consumed, and the count never
      // dropped — so it could be tapped forever, promising every time. Measured
      // in the owner's log, five taps in a row. INVESTIGATE is their verb and it
      // has its own picker; a block you cannot act on is an invitation to the tap
      // that fails — and in a colour-coded layout it would also need a colour
      // that means nothing.
      .filter((r) => isActionableGatherKind(r.kind)),
  );

  const inLane = (lane: GatherLane): GatherRow[] =>
    rows.filter((r) => laneForKind(r.kind) === lane);
  const gear = inLane('gear');
  const items = inLane('items');
  const scrap = inLane('scrap');
  const sweepable = (lane: GatherRow[]): string[] =>
    lane.filter((r) => !r.consumed).map((r) => r.noun);

  const renderBlock = (row: GatherRow, lane: GatherLane) => {
    const { noun, kind, upgrade, consumed } = row;
    return (
      <Pressable
        key={noun}
        style={({ pressed }) => [
          styles.block,
          lane === 'gear' && styles.blockGear,
          lane === 'items' && styles.blockItems,
          lane === 'scrap' && styles.blockScrap,
          // ⚠ An upgrade brightens its block WITHIN the gear hue rather than
          // borrowing another lane's colour — the colour has one job here and
          // stealing it for a second meaning is how the code stops being read.
          upgrade && styles.rowUpgrade,
          consumed && styles.blockConsumed,
          pressed && !consumed && styles.rowPressed,
        ]}
        disabled={consumed}
        onPress={() => {
          if (lane === 'scrap') { onSalvage(noun); return; }
          if (useStealth) { onStealthTake(noun); return; }
          onTake(noun);
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: consumed }}
        accessibilityLabel={
          `${upgrade ? 'Upgrade. ' : ''}${noun}. ${lane === 'scrap' ? 'Tap to salvage' : 'Tap to take'}`
        }
      >
        <Text style={[
          styles.icon,
          lane === 'gear' && styles.iconGear,
          lane === 'items' && styles.iconItems,
          lane === 'scrap' && styles.iconScrap,
          upgrade && styles.iconUpgrade,
        ]}>
          {gatherIcon({ kind, upgrade })}
        </Text>
        <Text
          style={[styles.blockText, consumed && styles.rowTextConsumed]}
          numberOfLines={2}
        >
          {noun}
        </Text>
        {upgrade && <Text style={styles.upgradeTag}>BETTER</Text>}
      </Pressable>
    );
  };

  /** ⚠⚠ A LANE IS A HEADING, ITS BLOCKS, AND ITS BUTTON — rendered together and
   *  in the same colour, because the whole redesign is that you should not have
   *  to work out which button owns which block. */
  const renderLane = (
    lane: GatherLane,
    laneRows: GatherRow[],
    buttonLabel: (n: number) => string,
    onSweep: (nouns: string[]) => void,
  ) => {
    if (laneRows.length === 0) return null;
    const nouns = sweepable(laneRows);
    return (
      <View style={styles.lane} key={lane}>
        <Text style={[
          styles.laneHeading,
          lane === 'gear' && styles.textGear,
          lane === 'items' && styles.textItems,
          lane === 'scrap' && styles.textScrap,
        ]}>
          {LANE_HEADING[lane]}
        </Text>
        <View style={styles.grid}>{laneRows.map((r) => renderBlock(r, lane))}</View>
        {nouns.length > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.sweep,
              lane === 'gear' && styles.sweepGear,
              lane === 'items' && styles.sweepItems,
              lane === 'scrap' && styles.sweepScrap,
              pressed && styles.rowPressed,
            ]}
            onPress={() => onSweep(nouns)}
            accessibilityRole="button"
            accessibilityLabel={buttonLabel(nouns.length)}
          >
            <Text style={[
              // ⚠ SCRAP'S BUTTON FACE IS SMALLER THAN THE TAKE ONES, ON PURPOSE.
              // Take is reversible — drop it. Salvage is a one-way door. Yellow
              // already reads as caution; the size keeps it from looking like a
              // peer of the two buttons a mis-tap costs nothing on.
              lane === 'scrap' ? styles.salvageAllText : styles.takeAllText,
              lane === 'gear' && styles.textGear,
              lane === 'items' && styles.textItems,
              lane === 'scrap' && styles.textScrap,
            ]}>
              {buttonLabel(nouns.length)}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">THIS ROOM</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Tap one block to take it. Or sweep a whole colour with its button.
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
                  {/* ⚠⚠ ALL THREE LANES RENDER AT ONCE. Nothing waits on anything
                      — that was the complaint this redesign answers. */}
                  {renderLane('gear', gear, (n) => `TAKE ALL GEAR (${n})`, onTakeAll)}
                  {renderLane('items', items, (n) => `TAKE ALL ITEMS (${n})`, onTakeAll)}
                  {renderLane(
                    'scrap', scrap,
                    // ⚠ It COUNTS what it will destroy rather than saying "all" —
                    // a bulk action whose size you learn only after committing is
                    // one players stop trusting.
                    (n) => `⚒ SALVAGE ALL (${n})`,
                    onSalvageAll,
                  )}
                </ScrollView>
              )}

              <Pressable
                style={({ pressed }) => [styles.ignore, pressed && styles.rowPressed]}
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Ignore the rest and leave"
              >
                <Text style={styles.ignoreText}>IGNORE THE REST</Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ⚠⚠ THE THREE HUES ARE THE INTERFACE. Orange gear, green items, yellow scrap,
// red ignore — each used on the block border, the heading, the icon and the
// button face, and used for NOTHING ELSE in this modal. The moment a hue means
// two things the player is back to reading tail text.
const GEAR = '#e08a3c';
const ITEMS = '#7fbf5f';
const SCRAP = '#d8c04a';
const IGNORE = '#b5533f';

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
  scroll: { maxHeight: 380 },
  list: { paddingBottom: 4 },

  lane: { marginBottom: 12 },
  laneHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  textGear: { color: GEAR },
  textItems: { color: ITEMS },
  textScrap: { color: SCRAP },

  // ⚠ A WRAPPED GRID, NOT A COLUMN. `flexBasis` at 30% with a minWidth floor
  // gives three squares across on a phone and lets a long noun claim a wider
  // block instead of truncating to nonsense.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  block: {
    borderWidth: 2, borderRadius: 4,
    paddingVertical: 10, paddingHorizontal: 8,
    marginHorizontal: 3, marginBottom: 6,
    flexGrow: 1, flexBasis: '30%', minWidth: 96,
    alignItems: 'center', justifyContent: 'center',
  },
  blockGear: { borderColor: GEAR, backgroundColor: '#2a1a0e' },
  blockItems: { borderColor: ITEMS, backgroundColor: '#16210f' },
  blockScrap: { borderColor: SCRAP, backgroundColor: '#221e0c' },
  // ⚠⚠ THE UPGRADE BLOCK IS BRIGHTER GEAR, not a fourth colour.
  rowUpgrade: { borderColor: '#ffb066', backgroundColor: '#3a2410' },
  blockConsumed: { opacity: 0.35 },
  rowPressed: { opacity: 0.7 },

  // ⚠ 20px and bold. The OTA-1232 version was 13px in the same tan as the text
  // beside it, which is how a whole session went by without it registering.
  icon: { fontSize: 20, fontWeight: '700', marginBottom: 3 },
  iconGear: { color: GEAR },
  iconItems: { color: ITEMS },
  iconScrap: { color: SCRAP },
  iconUpgrade: { color: '#ffb066' },

  blockText: { color: '#e6d8b3', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  rowTextConsumed: { color: '#6f6759', textDecorationLine: 'line-through' },
  upgradeTag: { color: '#ffb066', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 3 },

  sweep: {
    borderWidth: 1, borderRadius: 3, paddingVertical: 10,
    alignItems: 'center', marginTop: 2,
  },
  sweepGear: { borderColor: GEAR, backgroundColor: '#241705' },
  sweepItems: { borderColor: ITEMS, backgroundColor: '#131c0e' },
  sweepScrap: { borderColor: SCRAP, backgroundColor: '#1e1a09' },
  takeAllText: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  salvageAllText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },

  ignore: {
    borderWidth: 1, borderColor: IGNORE, backgroundColor: '#241210',
    borderRadius: 3, paddingVertical: 11, alignItems: 'center', marginTop: 6,
  },
  ignoreText: { color: IGNORE, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },

  stealthToggle: {
    borderWidth: 1, borderColor: '#3a342c', borderRadius: 3,
    paddingVertical: 8, alignItems: 'center', marginBottom: 10,
  },
  stealthToggleActive: { borderColor: '#c9a86a', backgroundColor: '#241d13' },
  stealthToggleText: { color: '#7d7361', fontSize: 11, letterSpacing: 0.5 },
  stealthToggleTextActive: { color: '#e6d8b3', fontWeight: '700' },
});

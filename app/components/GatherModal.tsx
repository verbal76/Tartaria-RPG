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
//
// ⚠⚠ OTA-1239 — NO STEALTH TOGGLE. THE OWNER ASKED THIS TWICE AND I ONLY HALF
// ANSWERED THE FIRST TIME. In OTA-1229, typed into the game: *"why do we still
// have use stealth in the take popup? thats not how stealth works anymore."* I
// narrowed it (vendor-only) and relabelled it (STE, not DEX) instead of removing
// it. He asked again: *"why did you add a stealth option to it, that's not how
// the stealth is used anymore."* **Asking twice IS the answer — the first reply
// was negotiating with the request instead of doing it.**
//
// ⚠⚠ AND THE CODEBASE ALREADY HAD THE RULE WRITTEN DOWN, in PickpocketSheet's own
// header from OTA-847: *"pickpocket IS the stealth action, so there's no toggle."*
// A toggle on a system whose design note says it has no toggle. OTA-1078 drew the
// rest of the line — pickpocket is what is ON A PERSON, and *"items on tables and
// the ground stay with the steal/take verbs"* — and `steal` is a live verb with
// nine synonyms routing to the same `stealFromVendor`. So the toggle was a second
// door onto an action that already had two better ones, in the picker that exists
// to DELETE second doors.
//
// ⚠ HOW IT SURVIVED THE MERGE: it was carried over wholesale from TakeModal, and
// **the OTA-1229 test that guarded it stayed pinned to TakeModal.tsx — a file
// nothing has rendered since OTA-1233.** The pin kept passing against a corpse.
// A source pin proves a line exists; it cannot prove anything renders it.
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, TouchableWithoutFeedback, Pressable,
} from 'react-native';
import {
  classifyGatherNoun, isUpgradeOverEquipped, sortGatherRows, gatherIcon,
  equipVerdict, equipSlotWord,
  isActionableGatherKind, laneForKind, upgradeEquipSlot,
  type GatherRow, type GatherLane,
} from '../engine/gatherSort';
import type { PlayerCharacter } from '../engine/types';
import { findCatalogItem } from '../engine/crafting';
import { rarityHexColor } from './InventoryCategorize';

/** ⚠⚠ OTA-1317 — the row's rarity edge, or nothing.
 *
 *  A row here is an ambient NOUN, not an inventory item — "cart", "rubble", a
 *  lead. Only the ones that resolve to a catalog entry have a rarity at all, and
 *  those are exactly the rows a TAKE turns into a real item. Anything else keeps
 *  the neutral edge: the lane hues were colour without a fact behind it, and
 *  replacing them with a different colour-without-a-fact would miss the point.
 *
 *  ⚠ Aliases on, because the picker shows the noun the room wrote ("rope coil")
 *  while the catalog knows the canonical name — the shop resolves the same way. */
function rowRarityEdge(noun: string): { borderLeftColor: string; borderLeftWidth: number } | null {
  const cat = findCatalogItem(noun, { aliases: true });
  if (!cat) return null;
  return { borderLeftColor: rarityHexColor(cat.rarity), borderLeftWidth: 4 };
}

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
  /** ⚠⚠ OTA-1236 — INVESTIGATE a lead. The lead lane's single tap does NOT take and
   *  does NOT salvage: investigate is the verb that fires the dog rescue and opens
   *  a story hook, and it is the only verb that can. */
  onInvestigate: (noun: string) => void;
  /** ⚠⚠ OTA-1236 — nouns in this room that carry a next step (a scene story hook,
   *  or a live dog-rescue hook). Computed by the screen, which is the layer that
   *  knows the scene's hooks and whether the player already has a dog — this
   *  component stays a renderer. They get their own lane, LAST, and no bulk button
   *  will ever touch them. */
  leadNouns?: readonly string[];
  /** ⚠⚠ OTA-1250 — THE ONE NOUN THE TUTORIAL PERMITS RIGHT NOW, or null for free
   *  play. Owner, from a device run: *"I broke it by just grabbing stuff, you
   *  should only be able to do what it says, the other button touches should
   *  buzz."* The outpost lockdown dimmed the quick row and stopped at the modal's
   *  edge, so the beat that says "tap the cudgel" opened a board where every row
   *  and every sweep button was live. He took an axe, a bow, a torch, a second
   *  vest, and swept six nouns of scenery — mid-tutorial, in four taps. */
  lockedNoun?: string | null;
  /** Fired when a locked control is tapped. Buzz + the Arbiter's nudge, the same
   *  feedback the quick row gives — a control that refuses in silence is the
   *  OTA-1164 bug. */
  onBlocked?: () => void;
  onCancel: () => void;
}

/** ⚠ One place per lane for its colour, its heading and its button copy, so a
 *  block and the button that sweeps it can never drift apart. */
// ⚠⚠ OTA-1243 — ONE WORD: SALVAGE. Owner: *"in my mind salvage and scrap are kind
// of the right same thing"* — and this card was the worst offender, a lane headed
// SCRAP with a button reading SALVAGE ALL. Two words for one concept inside a
// single card is the place a player first learns to distrust the vocabulary. The
// internal lane id stays `scrap` (code names are not player-facing); every string
// a player reads says SALVAGE. "Scrap" survives only as ITEM names (Scrap Metal,
// Cloth Scrap) and the inventory's breakdown verb copy, which OTA-1243 also
// renames — see InventoryScreen.
const LANE_HEADING: Record<GatherLane, string> = {
  gear: 'GEAR',
  items: 'ITEMS',
  scrap: 'SALVAGE',
  lead: 'WORTH A LOOK',
};

export function GatherModal({
  visible, chips, player, onTake, onSalvage, onTakeAll, onSalvageAll,
  onInvestigate, leadNouns, lockedNoun, onBlocked, onCancel,
}: Props) {
  // ⚠⚠ OTA-1250 — THE LOCK. Exactly one noun is actionable; everything else in
  // the card refuses. ⚠ A REFUSED CONTROL IS STILL RENDERED AND STILL TAPPABLE —
  // it dims and buzzes rather than disappearing or going inert, because the whole
  // point of the fully-populated tutorial picker (OTA-1248) is that the player
  // SEES the whole room. Hiding the rest would teach the layout by removing it,
  // and `disabled` would make a wrong tap indistinguishable from a dead app.
  const lockKey = lockedNoun ? lockedNoun.toLowerCase().trim() : null;
  const isLocked = (noun: string): boolean =>
    lockKey !== null && noun.toLowerCase().trim() !== lockKey;
  // ⚠⚠ OTA-1405 — THE REFUSAL IS SAID IN HERE, WHERE THE PLAYER IS LOOKING.
  //
  // It was already being said. `onBlocked` calls `nudgeTutorialBlocked`, which
  // appends an Arbiter line naming the exact thing to tap — and that line lands
  // in the FEED, which is behind this modal's scrim. So the player taps a dimmed
  // row, gets a buzz and nothing else, and taps again. The owner's 2026-08-20 log
  // has seven refusals in 2.6 seconds on the vest beat; the answer to all seven
  // was on screen the whole time, underneath this card.
  //
  // ⚠⚠ THIS IS OTA-1402 AGAIN, IN A DIFFERENT ROOM. That one found a contract
  // refusal rendered above a scrolling list the player had scrolled past. Same
  // shape, same cost: the game answers, and the answer is somewhere the player
  // is not. Twice in one session is a pattern worth naming — **a refusal has to
  // be rendered by whatever is on top, not by whatever raised it.**
  const [refusal, setRefusal] = useState<string | null>(null);
  const refuseSeq = useRef(0);
  const refuse = (): void => {
    onBlocked?.();
    // The card's own copy of the answer, in the card. Deliberately the SAME
    // sentence the header already carries — the player is not being told
    // something new, they are being told it where the tap happened.
    setRefusal(lockedNoun
      ? `Not that one — tap the ${lockedNoun}.`
      : 'Not that one.');
    const mine = ++refuseSeq.current;
    setTimeout(() => { if (refuseSeq.current === mine) setRefusal(null); }, 2600);
  };
  // A fresh open starts clean — a stale refusal from the last beat would be a
  // second wrong answer.
  useEffect(() => { if (!visible) { refuseSeq.current += 1; setRefusal(null); } }, [visible]);
  // ⚠ Matched on the same case-insensitive substring rule the engine's rescue
  // dispatch uses, so a noun the engine treats as the dog hook is a noun this
  // picker treats as a lead. A protector matching a different set from the firer
  // is the same bug as no protector.
  const leadSet = (leadNouns ?? []).map((n) => n.toLowerCase());
  const isLead = (noun: string): boolean => {
    const t = noun.toLowerCase();
    return leadSet.some((l) => t.includes(l) || l.includes(t));
  };
  const rows: GatherRow[] = sortGatherRows(
    chips
      .filter((c) => !c.consumed || c.alwaysShow)
      .map((c) => ({
        noun: c.noun,
        // ⚠⚠ OTA-1236 — THE LEAD CLASSIFICATION WINS OVER THE CATALOG ONE. Ten of
        // the twenty dog-rescue nouns match a salvage pool, so without this the
        // chain the dog is on renders as a yellow SCRAP block with a one-tap
        // sweep button over it.
        kind: isLead(c.noun) ? ('lead' as const) : classifyGatherNoun(c.noun),
        upgrade: isUpgradeOverEquipped(player, c.noun),
        // OTA-1499 — the three-state mark: ★ bare slot / ▲ beats worn / ▼ loses.
        verdict: equipVerdict(player, c.noun),
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

  // ⚠⚠ OTA-1240 — AN EMPTY ROOM CLOSES ITSELF. Owner: *"if there is nothing left,
  // it doesn't need to wait for the ignore button."* Right — OTA-1238 made the
  // picker survive a selection so clearing a room is one visit instead of ten, and
  // the last step of that visit was still a mandatory tap on a card showing
  // nothing. IGNORE means *leave the rest*; when there is no rest, there is
  // nothing to decide.
  //
  // ⚠⚠ AND IT CLOSES ON THE FRAME THE LIST EMPTIES — THE 800ms HOLD IS GONE.
  // Owner, from a device run: *"whenever I hit the three all buttons and there's
  // nothing left in the screen, it still says ignore all, that red button, for
  // about 2 and 1/2 seconds... the minute the last item is gone from the screen
  // that pop-up should close."*
  //
  // ⚠ The hold was borrowed from the investigate picker on the theory that a card
  // vanishing on the same frame as the tap reads as a crash. That reasoning does
  // not survive contact with the SWEEP buttons: the player taps TAKE ALL GEAR and
  // WATCHES a whole lane empty, so there is no ambiguity left about whether the
  // tap landed — and after three sweeps in a row the hold stacks on top of the
  // re-renders and reads as the popup being stuck. The tap that emptied the room
  // is its own confirmation.
  //
  // ⚠⚠ AND IT ONLY FIRES IF THE PICKER HAD SOMETHING TO BEGIN WITH. Opening onto
  // an empty list and closing instantly is indistinguishable from a button that
  // did nothing — the exact complaint this whole run of OTAs has been chasing. If
  // it opens empty, it SAYS the room is picked clean and waits, because that is a
  // player who needs an explanation, not a dismissal.
  const hadRowsThisOpen = useRef(false);
  // ⚠ The callback lives in a ref, and the timer effect does NOT depend on it.
  // `onCancel` is an inline arrow at the call site, so its identity changes on
  // every parent render — depending on it would tear down and restart the 800ms
  // timer on each one, and a picker whose close timer keeps resetting never
  // closes. The ref keeps the LIVE closure without making it a dependency.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const rowCount = rows.length;
  useEffect(() => {
    if (!visible) { hadRowsThisOpen.current = false; return undefined; }
    if (rowCount > 0) { hadRowsThisOpen.current = true; return undefined; }
    // Opened onto an empty room: explain, do not dismiss.
    if (!hadRowsThisOpen.current) return undefined;
    cancelRef.current();
    return undefined;
  }, [visible, rowCount]);
  // Reading the ref during render is fine — it was last written by the PREVIOUS
  // render's effect, so by the time the count reaches zero it already knows
  // whether this picker ever had anything in it.
  const emptiedByPlayer = visible && rowCount === 0 && hadRowsThisOpen.current;

  const inLane = (lane: GatherLane): GatherRow[] =>
    rows.filter((r) => laneForKind(r.kind) === lane);
  const gear = inLane('gear');
  const items = inLane('items');
  const scrap = inLane('scrap');
  const leads = inLane('lead');
  const sweepable = (lane: GatherRow[]): string[] =>
    lane.filter((r) => !r.consumed).map((r) => r.noun);

  // ⚠⚠ OTA-1237 — A LINE RECTANGLE, NOT A FILLED TILE. Owner: *"we don't need the
  // item boxes to have internal glow just a colored border will work. also not
  // actual boxes, line rectangles like before are still fine."* Both notes point
  // the same way: the COLOUR is the signal, and a tinted fill behind it competes
  // with the text sitting on top of it instead of adding anything. The row goes
  // back to the full-width shape it had before OTA-1235 — only now its outline
  // carries the lane hue, which is the part that was actually worth adding.
  const renderRow = (row: GatherRow, lane: GatherLane) => {
    const { noun, kind, upgrade, consumed, verdict } = row;
    const locked = isLocked(noun);
    // ⚠⚠ OTA-1251 — THE TAIL SAYS WHAT THE TAP DOES, AND FOR A ★ THAT IS NO LONGER
    // "→ pack". Owner: *"it was supposed to highlight the fact you can select and
    // equip the vest from the popup, not from inventory."* An upgrade row now takes
    // AND wears in one tap, so the old tail — `BETTER`, which describes the ITEM —
    // was the one row in this card whose tail did not name its own action. That is
    // exactly the deduction the colour layout exists to delete. The ★, the brighter
    // outline and the gold all still carry "better"; the tail carries "worn".
    // ⚠⚠ OTA-1252 — AND IT NAMES THE HAND. Owner: *"isn't there an option to equip a
    // picked up weapon to any empty hand?"* There is now, so `→ worn` would be the
    // same vagueness one step smaller: a weapon that fills a bare off hand and one
    // that displaces your main are different decisions, and the row is where the
    // player decides. Armor keeps `worn` — it has exactly one slot and the name of
    // it (chest / head / feet) is already obvious from the item.
    const wear = upgrade ? upgradeEquipSlot(player, noun) : null;
    // ⚠⚠ OTA-1499 — THE OWNER'S VOCABULARY: *"what if star was for a slot that
    // isn't filled, and we put a green up or red down arrow on an item and the
    // slot's name so we can compare it."* Three states, each naming its slot:
    //   ★ → off hand   the slot is BARE — taking it displaces nothing
    //   ▲ → main hand  it BEATS what is worn there — one tap swaps it in
    //   ▼ main hand · → pack   it LOSES to what is worn — the tap only pockets it
    // The tail still names the tap's ACTION (the OTA-1251 rule): ★ and ▲ rows
    // take-and-equip, ▼ rows go to the pack like any plain take.
    const tail =
      lane === 'lead' ? 'INVESTIGATE'
        : verdict?.state === 'empty' ? `★ → ${equipSlotWord(verdict.slot)}`
          : verdict?.state === 'up' ? `▲ → ${equipSlotWord(verdict.slot)}`
            : verdict?.state === 'down' ? `▼ ${equipSlotWord(verdict.slot)} · → pack`
              : upgrade ? '★ → worn'
                : lane === 'scrap' ? 'salvage'
                  : '→ pack';
    return (
      <Pressable
        key={noun}
        style={({ pressed }) => [
          styles.row,
          // ⚠⚠ OTA-1317 — RARITY LIVES ON THE LEFT EDGE, like the shop's rows.
          // Only a row that resolves to a real catalog item has a rarity to
          // show; scenery and leads keep the neutral edge, because inventing a
          // colour for a thing with no rarity is what the lane hues were doing.
          rowRarityEdge(noun),
          lane === 'gear' && styles.rowGear,
          lane === 'items' && styles.rowItems,
          lane === 'scrap' && styles.rowScrap,
          lane === 'lead' && styles.rowLead,
          // ⚠ An upgrade brightens its outline WITHIN the gear hue rather than
          // borrowing another lane's colour — the colour has one job here and
          // stealing it for a second meaning is how the code stops being read.
          upgrade && lane !== 'lead' && styles.rowUpgrade,
          consumed && styles.rowConsumed,
          locked && styles.rowLocked,
          pressed && !consumed && styles.rowPressed,
        ]}
        disabled={consumed}
        onPress={() => {
          // ⚠ The refusal comes FIRST and returns. Falling through to the verb
          // after buzzing would be a lock that complains and then complies.
          if (locked) { refuse(); return; }
          if (lane === 'lead') { onInvestigate(noun); return; }
          if (lane === 'scrap') { onSalvage(noun); return; }
          onTake(noun);
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: consumed || locked }}
        accessibilityLabel={
          locked
            ? `${noun}. Not yet — the Arbiter has asked for something else first.`
            : lane === 'lead'
              ? `${noun}. Worth a look. Tap to investigate. No bulk action will touch this.`
              : wear
                ? `${verdict?.state === 'empty' ? `Your ${equipSlotWord(wear.slot)} is bare` : 'Upgrade'}. ${noun}. Tap to take it and ${wear.slot === 'main' || wear.slot === 'off' ? `ready it in your ${wear.slot === 'main' ? 'main' : 'off'} hand` : 'put it on'}.`
                : verdict?.state === 'down'
                  ? `${noun}. Weaker than what is in your ${equipSlotWord(verdict.slot)}. Tap to take it into your pack.`
                  : `${noun}. ${lane === 'scrap' ? 'Tap to salvage' : 'Tap to take'}`
        }
      >
        <Text style={[
          styles.icon,
          lane === 'gear' && styles.iconGear,
          lane === 'items' && styles.iconItems,
          lane === 'scrap' && styles.iconScrap,
          lane === 'lead' && styles.iconLead,
          upgrade && lane !== 'lead' && styles.iconUpgrade,
          verdict?.state === 'up' && lane !== 'lead' && styles.iconBetter,
          verdict?.state === 'down' && lane !== 'lead' && styles.iconWorse,
        ]}>
          {gatherIcon({ kind, upgrade, verdict })}
        </Text>
        <Text
          style={[styles.rowText, consumed && styles.rowTextConsumed]}
          numberOfLines={1}
        >
          {noun}
        </Text>
        <Text style={[
          styles.rowTail,
          lane === 'gear' && styles.textGear,
          lane === 'items' && styles.textItems,
          lane === 'scrap' && styles.textScrap,
          lane === 'lead' && styles.textLead,
          upgrade && lane !== 'lead' && styles.tailUpgrade,
          verdict?.state === 'up' && lane !== 'lead' && styles.tailBetter,
          verdict?.state === 'down' && lane !== 'lead' && styles.tailWorse,
        ]}>
          {tail}
        </Text>
      </Pressable>
    );
  };

  /** ⚠⚠ A LANE IS A HEADING, ITS BLOCKS, AND ITS BUTTON — rendered together and
   *  in the same colour, because the whole redesign is that you should not have
   *  to work out which button owns which block. */
  const renderLane = (
    lane: GatherLane,
    laneRows: GatherRow[],
    buttonLabel: ((n: number) => string) | null,
    onSweep: ((nouns: string[]) => void) | null,
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
          lane === 'lead' && styles.textLead,
        ]}>
          {LANE_HEADING[lane]}
        </Text>
        <View>{laneRows.map((r) => renderRow(r, lane))}</View>
        {/* ⚠⚠ OTA-1236 — THE LEAD LANE HAS NO BUTTON, and its absence is the
            message. Every other colour here promises a matching button will
            clear it; this colour promises nothing bulk will touch it. */}
        {buttonLabel && onSweep && nouns.length > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.sweep,
              lane === 'gear' && styles.sweepGear,
              lane === 'items' && styles.sweepItems,
              lane === 'scrap' && styles.sweepScrap,
              // ⚠⚠ OTA-1250 — A SWEEP IS NEVER THE BEAT'S ANSWER. Even a lane
              // whose only row IS the locked noun: the beat teaches a single tap
              // on a single line, and letting the bulk button stand in for it
              // teaches the opposite. All three dim under a lock.
              lockKey !== null && styles.sweepLocked,
              pressed && styles.rowPressed,
            ]}
            onPress={() => { if (lockKey !== null) { refuse(); return; } onSweep(nouns); }}
            accessibilityRole="button"
            accessibilityState={{ disabled: lockKey !== null }}
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
              {/* ⚠ Under a lock the card says what the one live line IS, rather
                  than describing freedoms the player does not have this beat. */}
              <Text style={styles.body}>
                {lockedNoun
                  ? `Tap the ${lockedNoun}. The rest of the room keeps.`
                  : 'Tap a line to act on it. Or clear a whole colour with its button.'}
              </Text>
              {/* ⚠ OTA-1405 — the refusal strip. Rendered inside the card and
                  above the list, so it cannot be scrolled away from (the mistake
                  OTA-1014 made and OTA-1402 paid for) and cannot be hidden behind
                  anything (the mistake this OTA is fixing). */}
              {refusal !== null && (
                <View style={styles.refusalStrip}>
                  <Text style={styles.refusalText} accessibilityLiveRegion="polite">{refusal}</Text>
                </View>
              )}

              {rows.length === 0 ? (
                <Text style={styles.empty}>
                  {emptiedByPlayer
                    ? 'That is everything. The room is picked clean.'
                    : 'Nothing here to take or pry apart. The room is picked clean.'}
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
                  {/* ⚠⚠ LAST, ALWAYS. Owner: *"if it is there it should always be
                      the last thing listed so the next step is right there to
                      see."* The buttons sit at the bottom of the card, so the
                      last block is the one his thumb is already next to. */}
                  {renderLane('lead', leads, null, null)}
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
// ⚠⚠ OTA-1238 — DIMMED. Owner: *"dim the selections a bit, they glow when they
// shouldn't."* He is describing a real effect, not a preference: a fully saturated
// hue on a near-black card (#13110f) blooms on an OLED panel, and the outline-only
// rework made it worse rather than better — with the fill gone, the border is the
// only place the colour lives, so all of that saturation ended up on a 1px edge.
// Each hue drops roughly a fifth of its lightness AND some saturation; the second
// half is what actually kills the bloom. The lane is still readable at a glance,
// which is the only job the colour has.
// ⚠⚠ OTA-1317 — THE LANES GO AMBER. Owner: *"the colors are the only thing i
// dont like… just make all of the colors amber and leave it sorted like it is,
// add the rarity color line on the left edge like if you were buying it."*
//
// The four lanes were four hues doing one job — telling you which BUTTON clears
// this block — while the row order already says the same thing, and the buttons
// name their own lane in words. So the hue was a third copy of a fact the card
// states twice. It goes house amber; the grouping and the sort are untouched,
// and the sweep buttons still read TAKE ALL GEAR / TAKE ALL ITEMS / SALVAGE ALL.
//
// ⚠ What colour DOES carry now is rarity, on the left edge, in the same palette
// the pack and the shop use — see `rowRarityEdge` below.
const LANE = '#c9a86a';
const GEAR = LANE;
const ITEMS = LANE;
const SCRAP = LANE;
// ⚠ IGNORE STAYS RED. It is not a lane — it is the one control here that walks
// away from loot, and OTA-1236 chose red for exactly that. Amber would file it
// with the three buttons that take things.
const IGNORE = '#94533f';
// ⚠ The lead's hue is the ONE cool colour in a warm card, so it does not read as
// a fourth thing you can sweep — and it is the same pale violet the Aetheric
// Torch's ✦ already uses for "worth a look", so the player has met it before.
const LEAD = LANE;

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
  // ⚠⚠ OTA-1237 — THE CARD GROWS WITH THE ROOM. Owner: *"we will have to make the
  // layout popup taller when there are more items."* The scroll used to be pinned
  // at 380px, so a four-noun room and a fourteen-noun room got the same window and
  // the big one scrolled inside a box with empty space beneath it. `flexShrink`
  // instead of a fixed height lets the list take what it needs and the card's own
  // 86% ceiling do the bounding — small rooms sit compact, big rooms fill the
  // screen, and only a genuinely oversized room scrolls.
  scroll: { flexShrink: 1 },
  list: { paddingBottom: 4 },

  lane: { marginBottom: 12 },
  laneHeading: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  textGear: { color: GEAR },
  textItems: { color: ITEMS },
  textScrap: { color: SCRAP },
  textLead: { color: LEAD },

  // ⚠⚠ OUTLINE ONLY — NO FILL. Owner: *"we don't need the item boxes to have
  // internal glow just a colored border will work."* Right call: the tint sat
  // behind the noun and fought it for contrast while adding nothing the border was
  // not already saying. The hue lives on the edge, the text keeps the card's own
  // background, and the lane still reads at a glance.
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 3,
    paddingVertical: 10, paddingHorizontal: 10, marginBottom: 6,
    backgroundColor: 'transparent',
  },
  rowGear: { borderColor: GEAR },
  rowItems: { borderColor: ITEMS },
  rowScrap: { borderColor: SCRAP },
  rowLead: { borderColor: LEAD },
  // ⚠ Brighter gear, and a heavier edge — still one hue, still no fill.
  rowUpgrade: { borderColor: '#d09a63', borderWidth: 2 },
  rowConsumed: { opacity: 0.35 },
  // ⚠⚠ OTA-1250 — LOCKED, NOT SPENT. Deliberately a LIGHTER dim than
  // ⚠ OTA-1405 — the refusal strip. Red enough to read as a "no", quiet enough
  // that it does not compete with the lane colours the card exists to teach.
  refusalStrip: {
    borderWidth: 1,
    borderColor: '#a8412f',
    backgroundColor: 'rgba(168,65,47,0.14)',
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  refusalText: {
    color: '#e8a294',
    fontSize: 13,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  // `rowConsumed` (0.35): a consumed row is finished forever and a locked one is
  // coming back in a moment, and rendering them identically would tell the player
  // the room had emptied. Still unmistakably not-now at a glance.
  rowLocked: { opacity: 0.5 },
  rowPressed: { opacity: 0.7 },

  // ⚠ 20px and bold. The OTA-1232 version was 13px in the same tan as the text
  // beside it, which is how a whole session went by without it registering.
  icon: { fontSize: 20, fontWeight: '700', width: 28 },
  iconGear: { color: GEAR },
  iconItems: { color: ITEMS },
  iconScrap: { color: SCRAP },
  iconLead: { color: LEAD },
  iconUpgrade: { color: '#d09a63' },
  // OTA-1499 — the verdict tones: green for a ▲ that beats what is worn, the
  // feed's combat red for a ▼ that loses to it. The ★ keeps the gold above.
  iconBetter: { color: '#9ec96a' },
  iconWorse: { color: '#e07a5f' },

  rowText: { flex: 1, color: '#e6d8b3', fontSize: 14, fontWeight: '600' },
  rowTextConsumed: { color: '#6f6759', textDecorationLine: 'line-through' },
  rowTail: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tailUpgrade: { color: '#d09a63' },
  tailBetter: { color: '#9ec96a' },
  tailWorse: { color: '#e07a5f' },

  // ⚠ The sweep buttons keep a faint face — they are the one thing here that is
  // pressed rather than read, and a bare outline at the bottom of a list of bare
  // outlines stops reading as a button at all.
  sweep: {
    borderWidth: 1, borderRadius: 3, paddingVertical: 10,
    alignItems: 'center', marginTop: 2,
  },
  sweepGear: { borderColor: GEAR, backgroundColor: '#1a1208' },
  sweepItems: { borderColor: ITEMS, backgroundColor: '#121808' },
  sweepScrap: { borderColor: SCRAP, backgroundColor: '#181507' },
  sweepLocked: { opacity: 0.4 },
  takeAllText: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  salvageAllText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },

  ignore: {
    borderWidth: 1, borderColor: IGNORE, backgroundColor: '#241210',
    borderRadius: 3, paddingVertical: 11, alignItems: 'center', marginTop: 6,
  },
  ignoreText: { color: IGNORE, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },

});

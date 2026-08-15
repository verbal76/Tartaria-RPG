import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import type { InteractableChip } from './InteractableChip';

interface Props {
  visible: boolean;
  /** Per-room searchable chips. Each entry carries a `consumed`
   *  flag so the modal can drop the chip from the list once the
   *  noun has been worked over (rule shared across Search /
   *  Salvage / Take modals as of OTA 191). One chip — 'the
   *  ground' — sets alwaysShow:true so it persists in the list
   *  greyed after a dig, since the ground is a permanent
   *  affordance per room. ExplorationScreen builds this list. */
  chips?: InteractableChip[];
  onSubmit: (target: string) => void;
  onCancel: () => void;
  /** ⚠ OTA-1183 — INVESTIGATE ALL, on the owner's instruction (2026-08-09): *"it should
   *  add an investigate all button like the take all and salvage all."*
   *
   *  Fires once per ACTIONABLE chip — not consumed, and not locked behind an unmet
   *  requirement. Passing a locked noun would spend the tap on a refusal line the player
   *  can already see greyed with a 🔒, which is the exact "the button didn't do anything"
   *  complaint SALVAGE ALL collected in OTA-037. Hidden below 2 targets: with one chip
   *  the button is just a second way to press the chip. */
  onInvestigateAll?: (nouns: string[]) => void;
  /** ⚠⚠ OTA-1236 — nouns in this room that carry a next step: a scene story hook,
   *  or a live dog-rescue hook. They sort LAST in the list AND last in the sweep.
   *  Owner: *"investigate all skips the dead ends, shows what was found on
   *  investigate or does a story hook pop-up, then does the dog quest."* Computed
   *  by the screen, which is the layer that knows the scene's hooks and whether the
   *  player already has a dog. */
  leadNouns?: readonly string[];
}

// Branded modal that prompts the player to type what they're searching
// for. The submitted text is routed to the investigate intent with the
// target — letting the engine try hook, ambient noun, item, then
// re-prompt if nothing matches.
export function SearchModal({ visible, chips, onSubmit, onCancel, onInvestigateAll, leadNouns }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
    }
    return undefined;
  }, [visible]);
  // NOTE: previously auto-focused the TextInput on open. That popped
  // the keyboard up, which reflowed the modal layout — and the first
  // tap on a chip landed where the chip USED to be, requiring a
  // second tap to actually fire. Don't auto-focus; the player can
  // tap the input field if they want to type. Chip-tap is the
  // primary interaction.

  // OTA-257 — auto-close when there's nothing left to investigate.
  // Once every chip is consumed (productive or flavor-exhausted),
  // the modal holds 800ms so the player can see the final chip flip
  // to its ✓ done state, then closes itself. Avoids the empty-window
  // limbo where the player taps the last active chip, the result
  // lands, and the modal still sits there showing only greyed chips
  // and the type-it-yourself field. The hold gives clean closure;
  // the player can also reopen the modal manually if they want to
  // see the history of what they've worked.
  useEffect(() => {
    if (!visible) return undefined;
    const list = chips ?? [];
    if (list.length === 0) return undefined;
    const allConsumed = list.every((c) => c.consumed);
    if (!allConsumed) return undefined;
    const timer = setTimeout(onCancel, 800);
    return () => clearTimeout(timer);
  }, [visible, chips, onCancel]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    onSubmit(trimmed);
  };

  // One-tap search targets. Playtest feedback: "I'm not typing the
  // ground or the hall or the wall over and over again." Chip taps
  // submit directly so the player doesn't fight the keyboard.
  // Keyboard.dismiss() before submit so if the player DID focus the
  // input first, the keyboard collapses cleanly before the modal
  // closes.
  const tapToSearch = (target: string) => {
    Keyboard.dismiss();
    onSubmit(target);
  };
  // OTA-747 — a CONSUMED chip always leaves the list, INCLUDING the pinned surface
  // chip ('the ground' / 'floor' / 'mud'). Player ask: every other investigated noun
  // vanishes, so the surface shouldn't linger as a disabled greyed ✓ either (a consumed
  // chip is `disabled`, so keeping it was a dead, space-taking row). It still stays
  // PINNED while it's actionable — alwaysShow keeps it in the pool until investigating
  // it marks it consumed, and only THEN does it disappear, exactly like a one-shot prop.
  // LOCKED chips (unmetRequirement, not yet consumed) still remain so the player sees
  // what needs a scanner / climb-down.
  // ⚠⚠ OTA-1236 — THE LEAD GOES LAST, IN THE LIST AND IN THE SWEEP, AND IT IS THE
  // SAME ORDER FOR BOTH. Owner: *"if it is there it should always be the last thing
  // listed so the next step is right there to see... then does the dog quest."*
  //
  // ⚠ IT IS NOT COSMETIC. The dog rescue SPAWNS A CAPTOR AND STARTS A FIGHT. If
  // INVESTIGATE ALL reaches it mid-sweep, every remaining `investigate` in the loop
  // lands during combat and is refused — *"Not while the Reclaimer Deserter is on
  // you."* A story hook is the milder version of the same thing: it opens a popup
  // that the lines queued behind it push straight out of sight. Last means the
  // sweep has nothing left to bury it with.
  const leadLowers = (leadNouns ?? []).map((n) => n.toLowerCase());
  const isLeadChip = (noun: string): boolean => {
    const t = noun.toLowerCase();
    return leadLowers.some((l) => t.includes(l) || l.includes(t));
  };
  // ⚠ A stable partition, not a comparator — chips keep their incoming order
  // inside each tier, so the list the player read is the order the sweep runs.
  const notConsumed = (chips ?? []).filter((c) => !c.consumed);
  const visibleChips = [
    ...notConsumed.filter((c) => !isLeadChip(c.noun)),
    ...notConsumed.filter((c) => isLeadChip(c.noun)),
  ];
  // OTA-1183 — what INVESTIGATE ALL will actually act on. Locked chips are visible (so the
  // player learns what they need) but are NOT swept.
  const actionableChips = visibleChips.filter((c) => !c.unmetRequirement);
  // 2026-05-25 — Common-hints section removed. Per playtester:
  // the canned chips ("the wall" / "the rubble" / "the silt" /
  // "the doorway") cluttered the modal without adding value once
  // scene chips matured. The pinned surface chip (mud / ground /
  // floor, set by ExplorationScreen) covers the "investigate the
  // floor of this place" need that Common used to fill.

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
        <KeyboardAvoidingView
          style={styles.scrim}
          accessibilityViewIsModal={true}
          // OTA 022 — see ExplorationScreen comment. 'height' on
          // Android double-shrinks; 'padding' keeps the scrim full
          // size and only pushes the card up to avoid the keyboard.
          behavior="padding"
        >
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">INVESTIGATE</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Name a thing in the scene to examine. Be specific —
                "the mud", "the rubble", "the doorway", "the area to my left",
                "the wagon", "behind the column". The Arbiter will try to
                read your meaning, but vague targets find vague things.
              </Text>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder='e.g. "the mud", "the doorway", "left side"'
                placeholderTextColor="#c9a86a"
                onSubmitEditing={handleSubmit}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />

              {visibleChips.length > 0 && (
                <>
                  <Text style={styles.chipLabel}>In this scene</Text>
                  {/* 2026-05-25 — stacked vertical layout matching
                      TakeModal / ClimbModal so all four ambient-noun
                      modals read the same. Bounded by maxHeight so
                      a scene with 20 nouns scrolls instead of
                      blowing past the screen; content shorter than
                      maxHeight fits naturally. */}
                  <ScrollView
                    style={styles.chipScroll}
                    contentContainerStyle={styles.chipList}
                    keyboardShouldPersistTaps="handled"
                  >
                    {visibleChips.map((c) => {
                      // OTA 195 — chip state machine:
                      //   consumed         → grayed + ✓ (only ever
                      //                      "the ground" since the
                      //                      hide-on-consume rule
                      //                      removes others entirely)
                      //   unmetRequirement → grayed + "requires X"
                      //                      subtext, still tappable
                      //                      (tap fires the engine's
                      //                      refusal which tells the
                      //                      player what to equip)
                      //   default          → green, normal tap
                      const grayed = c.consumed || !!c.unmetRequirement;
                      return (
                        <Pressable
                          key={`scene-${c.noun}`}
                          style={({ pressed }) => [
                            styles.chipFull,
                            styles.chipFullScene,
                            grayed && styles.chipFullConsumed,
                            pressed && !c.consumed && styles.btnPressed,
                          ]}
                          disabled={c.consumed}
                          onPress={() => tapToSearch(c.noun)}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: c.consumed }}
                        >
                          <Text
                            style={[
                              styles.chipFullText,
                              grayed && styles.chipFullTextConsumed,
                            ]}
                            numberOfLines={1}
                          >
                            {/* OTA-1206 — ✦ = the torch marked this noun as actually
                                worth the look (scene.arbiterEye). Suppressed once
                                consumed: a spent noun's mark is history, not signal. */}
                            {(c.marked || isLeadChip(c.noun)) && !c.consumed ? '✦ ' : ''}{c.noun}{c.consumed ? ' ✓' : c.unmetRequirement ? ' 🔒' : ''}
                          </Text>
                          {c.unmetRequirement && !c.consumed ? (
                            <Text style={styles.chipFullHint} numberOfLines={1}>
                              {c.unmetRequirement}
                            </Text>
                          ) : (
                            <Text style={[styles.chipFullArrow, grayed && styles.chipFullArrowConsumed]}>
                              {c.consumed ? '✓ done' : '→ investigate'}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {/* ⚠ OTA-1183 — INVESTIGATE ALL. Mirrors SALVAGE ALL (SalvageModal:342)
                      and TAKE ALL (TakeModal:149), including the 2+ threshold. Counts and
                      sweeps only ACTIONABLE chips, so the number on the button is the
                      number of things that will actually happen. */}
                  {onInvestigateAll && actionableChips.length >= 2 && (
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed, { marginTop: 8 }]}
                      onPress={() => onInvestigateAll(actionableChips.map((c) => c.noun))}
                      accessibilityRole="button"
                      accessibilityLabel={`Investigate all ${actionableChips.length} surfaces`}
                    >
                      <Text style={styles.btnTextPrimary}>INVESTIGATE ALL ({actionableChips.length})</Text>
                    </Pressable>
                  )}
                </>
              )}
              {/* 2026-05-25 — Common-hints section removed. The
                  pinned surface chip ("the mud" / "the ground" /
                  "the floor") is now part of the scene chip row
                  above, set per-location by ExplorationScreen. */}

              {/* 2026-05-25 OTA-038 — button row matches SalvageModal /
                  BrandedModal convention: primary action on the LEFT,
                  CANCEL on the right. Was reversed; playtester flagged
                  the inconsistency. The primary button also flips to
                  the ghost / neutral style when the text input is
                  empty so the disabled state doesn't read as a washed-
                  out tan rectangle — it reads as "not yet ready". */}
              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    text.trim() ? styles.btnPrimary : styles.btnNeutral,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={handleSubmit}
                  disabled={!text.trim()}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !text.trim() }}
                >
                  <Text style={text.trim() ? styles.btnTextPrimary : styles.btnTextNeutral}>
                    INVESTIGATE
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onCancel}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextNeutral}>CANCEL</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
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
  // 2026-05-25 — removed dead style keys after the chip layout
  // migrated to the stacked chipFull pattern:
  //   hints, examples, chipRow, chipScrollRow, chip, chipScene,
  //   chipText, chipTextScene, chipConsumed, chipTextConsumed,
  //   chipRequiresText — all unreferenced after the rewrite.
  chipLabel: { color: '#a2977b', fontSize: 10, letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  // 2026-05-25 — stacked-list styles matching TakeModal so the
  // four ambient-noun modals share one visual pattern. Bounded
  // scroll height keeps long lists from blowing past the screen
  // while short lists collapse to fit.
  chipScroll: { maxHeight: 280 },
  chipList: { gap: 6, paddingVertical: 4 },
  chipFull: {
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
  chipFullScene: { borderColor: '#9ec96a' },
  // OTA-275 — flex:1 + flexShrink:1 lets long nouns ellipsize at the
  // right edge instead of pushing the action suffix off-screen. iOS
  // measures text wider than Android with the same font, so the same
  // chip row that fit on Android was overflowing on iPhone (long names
  // like "half-buried royal vault pedestal" got "→ investigate" cut to
  // "→ inv"). The suffix Text gets flexShrink:0 + marginLeft:8 so it
  // always renders in full at its natural width.
  chipFullText: { color: '#e6d8b3', fontSize: 14, fontWeight: '600', flex: 1, flexShrink: 1 },
  chipFullArrow: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, flexShrink: 0, marginLeft: 8 },
  // arb-fix — the scanner-requirement label on a locked chip ("requires Mud
  // Scanner") used #bf9b6a, an off-tone amber the player flagged. Match the
  // inventory "EQUIPPED" amber (#c9a86a) so the palette is consistent.
  chipFullHint: { color: '#c9a86a', fontSize: 11, letterSpacing: 0.5, flexShrink: 0, marginLeft: 8 },
  chipFullConsumed: {
    backgroundColor: '#13110f',
    borderColor: '#2a2622',
  },
  // arb115 — a finished investigation now reads in the SAME completed-gold as a
  // cleared climb (ClimbModal rowNameCleared/rowHeightCleared, #c9a86a italic),
  // instead of the old dim grey, so "done" looks consistent across the game.
  chipFullTextConsumed: { color: '#c9a86a', fontStyle: 'italic' },
  chipFullArrowConsumed: { color: '#c9a86a' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});

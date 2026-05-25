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
}

// Branded modal that prompts the player to type what they're searching
// for. The submitted text is routed to the investigate intent with the
// target — letting the engine try hook, ambient noun, item, then
// re-prompt if nothing matches.
export function SearchModal({ visible, chips, onSubmit, onCancel }: Props) {
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
  // 2026-05-25 [POLISH-3] — show consumed chips at the FAR RIGHT
  // instead of hiding them. User wanted a visible record of what's
  // already been investigated/taken/salvaged, while keeping the
  // actionable items on the left so the longer slidable list reads
  // "things to do" → "things tried" left-to-right. Consumed chips
  // already render greyed + ✓ via the existing styling below; only
  // the sort order needed to change. alwaysShow chips (like 'the
  // ground') keep their inherent ordering — they were never in the
  // filtered-out bucket anyway.
  const visibleChips = [...(chips ?? [])].sort((a, b) => {
    const aDone = a.consumed ? 1 : 0;
    const bDone = b.consumed ? 1 : 0;
    return aDone - bDone;
  });
  // Keep a short Common row for fallback verbs the scene might not
  // explicitly surface. 'the ground' moved out of this row into the
  // pinned scene chips so it lives alongside the visible nouns
  // instead of buried below.
  const commonHints = ['the wall', 'the rubble', 'the silt', 'the doorway'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <KeyboardAvoidingView
          style={styles.scrim}
          // OTA 022 — see ExplorationScreen comment. 'height' on
          // Android double-shrinks; 'padding' keeps the scrim full
          // size and only pushes the card up to avoid the keyboard.
          behavior="padding"
        >
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>INVESTIGATE</Text>
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
                placeholderTextColor="#5a5246"
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
                        >
                          <Text
                            style={[
                              styles.chipFullText,
                              grayed && styles.chipFullTextConsumed,
                            ]}
                            numberOfLines={1}
                          >
                            {c.noun}{c.consumed ? ' ✓' : c.unmetRequirement ? ' 🔒' : ''}
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
                </>
              )}
              <Text style={styles.chipLabel}>Common</Text>
              {/* 2026-05-25 — Common-hints section stacked (was a
                  flex-wrap row of compact chips) so the whole modal
                  reads consistently with the scene chips above and
                  with TakeModal / ClimbModal. */}
              <View style={styles.chipList}>
                {commonHints.map((h) => (
                  <Pressable
                    key={`common-${h}`}
                    style={({ pressed }) => [styles.chipFull, pressed && styles.btnPressed]}
                    onPress={() => tapToSearch(h)}
                  >
                    <Text style={styles.chipFullText} numberOfLines={1}>{h}</Text>
                    <Text style={styles.chipFullArrow}>→ investigate</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onCancel}
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
                >
                  <Text style={styles.btnTextPrimary}>INVESTIGATE</Text>
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
  hints: { color: '#7a705c', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  examples: { color: '#9ec96a', fontSize: 11, marginTop: 8, lineHeight: 16, letterSpacing: 0.5 },
  chipLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipScrollRow: { flexDirection: 'row', gap: 6, paddingLeft: 2, paddingRight: 8 },
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
  chipFullText: { color: '#e6d8b3', fontSize: 14, fontWeight: '600' },
  chipFullArrow: { color: '#9ec96a', fontSize: 11, letterSpacing: 1 },
  chipFullHint: { color: '#bf9b6a', fontSize: 11, letterSpacing: 0.5 },
  chipFullConsumed: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    opacity: 0.55,
  },
  chipFullTextConsumed: { color: '#7a705c', fontStyle: 'italic' },
  chipFullArrowConsumed: { color: '#5e5547' },
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
  // Consumed chip — used by 'the ground' after a dig (alwaysShow
  // keeps it in the list). Muted border + reduced opacity so it
  // reads as exhausted but still visible.
  chipConsumed: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    opacity: 0.55,
  },
  chipTextConsumed: { color: '#7a705c', fontStyle: 'italic' },
  // Subtext under a gated noun — "requires Aether scanner" etc.
  // Sits below the noun text inside the same chip, smaller font so
  // the chip stays roughly the same height.
  chipRequiresText: {
    color: '#7a705c',
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 1,
  },
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

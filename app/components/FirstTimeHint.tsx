// FirstTimeHint — small dismissable popup that fires once per id.
// Use at the entry point of any system the player needs context for:
// inventory, crafting, combat, the Crucible, etc. Pairs with
// useFirstTimeHint() for AsyncStorage persistence.
//
// Authoring rule (OTA-229): keep body to ~25 words, 2 sentences max.
// If a system needs more, the Tutorial Replay screen (Phase 2)
// carries the long version.
//
// OTA-234 — rewritten WITHOUT react-native Modal. Playtest crash on
// Android: when InventoryScreen or CraftingScreen rendered a hint
// (Modal) and the player then tapped an item that opened
// BrandedModal (another Modal), the stacked-Modals path crashed the
// JS thread on Android. RN Modal-on-Modal is a known Android
// crasher. Replaced with an absolute-positioned overlay View that
// renders inline above its parent screen — no Modal, no stacking,
// no crash. Scrim + card + dismiss button identical to the prior
// behavior; player-facing UX unchanged.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useFirstTimeHint } from './useFirstTimeHint';

interface Props {
  /** Stable id — never reuse across hints. AsyncStorage key uses it. */
  id: string;
  /** Short title (3-5 words). */
  title: string;
  /** Body copy. CAP THIS AT ~25 WORDS. If you need more, link to
   *  Tutorial Replay instead. */
  body: string;
}

export function FirstTimeHint({ id, title, body }: Props) {
  const { shouldShow, dismiss } = useFirstTimeHint(id);
  if (shouldShow !== true) return null;
  return (
    // Absolute overlay anchored to the screen, not a Modal. zIndex
    // 1000 puts it above scene content but BELOW any concurrent
    // BrandedModal (which RN Modal renders as a separate native
    // window above all React content). That ordering is intentional:
    // if the player triggers a real modal while the hint is up, the
    // modal wins focus and the hint waits underneath, then becomes
    // dismissable again when the modal closes.
    <Pressable style={styles.scrim} onPress={dismiss}>
      <View style={styles.card} onStartShouldSetResponder={() => true}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <TouchableOpacity onPress={dismiss} style={styles.btn} activeOpacity={0.7}>
          <Text style={styles.btnText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    backgroundColor: '#131c1f',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 6,
    padding: 18,
    maxWidth: 340,
    width: '100%',
  },
  title: {
    color: '#6ab0c9',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  body: {
    color: '#d8cfc1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  btn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
  },
  btnText: {
    color: '#6ab0c9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

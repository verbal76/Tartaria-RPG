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
import { useFirstTimeHint, setHintsDisabled } from './useFirstTimeHint';

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
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.footerRow}>
          {/* OTA-860 — one-tap escape hatch: kill every future tip and close this one.
              Mirrors the Settings toggle (both write the same global flag). */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => { void setHintsDisabled(true); dismiss(); }}
            style={styles.linkBtn}
            activeOpacity={0.6}
            hitSlop={8}
          >
            <Text style={styles.linkText}>Turn off tips</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity accessibilityRole="button" onPress={dismiss} style={styles.btn} activeOpacity={0.7}>
            <Text style={styles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
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
    backgroundColor: '#1a1612',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 6,
    padding: 18,
    maxWidth: 340,
    width: '100%',
  },
  title: {
    color: '#c9a86a',
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
  },
  btnText: {
    color: '#c9a86a',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // OTA-860 — quiet secondary link; reads as a toggle-off, not a primary action.
  linkBtn: {
    paddingVertical: 8,
    paddingRight: 10,
  },
  linkText: {
    color: '#8a7f6c',
    fontSize: 11,
    textDecorationLine: 'underline',
    letterSpacing: 0.3,
  },
});

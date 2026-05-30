// FirstTimeHint — small dismissable popup that fires once per id.
// Use at the entry point of any system the player needs context for:
// inventory, crafting, combat, the Crucible, etc. Pairs with
// useFirstTimeHint() for AsyncStorage persistence.
//
// Authoring rule (OTA-229): keep body to ~25 words, 2 sentences max.
// If a system needs more, the Tutorial Replay screen (Phase 2)
// carries the long version.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
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
    <Modal transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <TouchableOpacity onPress={dismiss} style={styles.btn} activeOpacity={0.7}>
            <Text style={styles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  btn: {
    alignSelf: 'flex-end',
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
});

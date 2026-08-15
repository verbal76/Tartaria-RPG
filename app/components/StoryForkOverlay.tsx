// OTA-1065 — THE DECISION. Full-screen, and the only overlay in the game that
// will not let you tap past it.
//
// ⚠ NO BACKDROP DISMISS AND NO CLOSE BUTTON, unlike every other modal here.
// A chapter card is a marker and holds nothing a fast tap could lose
// (OTA-1020); this holds a choice, and a choice a player can dismiss by
// accident is a chapter of their story deleted by a stray thumb. There is no
// "decide later" because there is nowhere for a later decision to live — the
// question is derived from the save (storyForks.dueFork), so backing out would
// simply raise it again on the next arrival and teach the player their taps do
// not count.
//
// Every option shows its HINT under the label. A fork where the player cannot
// see what they are trading is a coin flip wearing a decision's clothes, and
// the whole point of Phase 3 is that consequence is the product.

import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';

const CARD_IN_MS = 900;

export function StoryForkOverlay() {
  const fork = useGameStore((s) => s.pendingFork);
  const answer = useGameStore((s) => s.answerFork);
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!fork) return;
    drift.setValue(0);
    Animated.timing(drift, { toValue: 1, duration: CARD_IN_MS, useNativeDriver: true }).start();
  }, [fork, drift]);

  if (!fork) return null;

  return (
    // onRequestClose is required by RN for the Android back button; it is a
    // no-op here on purpose — back must not answer the question for you.
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.cardWrap,
            {
              opacity: drift,
              transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
            <Text style={styles.kicker}>{fork.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">{fork.title}</Text>
            <View style={styles.rule} />
            <Text style={styles.body}>{fork.body}</Text>
            <Text style={styles.question}>{fork.question}</Text>
            {fork.options.map((o) => (
              <Pressable
                key={o.id}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                onPress={() => answer(o.id)}
                accessibilityRole="button"
                accessibilityLabel={`${o.label}. ${o.hint}`}
              >
                <Text style={styles.optionLabel}>{o.label}</Text>
                <Text style={styles.optionHint}>{o.hint}</Text>
              </Pressable>
            ))}
            <Text style={styles.footnote}>There is no going back from this one.</Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// OTA-1072 — RESTYLED ONTO THE HOUSE TOKENS. The owner's style audit found
// this overlay wearing nine colors that appear NOWHERE else in the app — an
// invented palette in the same earthy family as the base game but sharing not
// one token with it. Every value below is now a color the game already owns:
// #c9a86a gold (the signature accent, 340 uses), #f0e6cc / #e6d8b3 / #a2977b
// text ranks, #3a342c the app-wide rule, #6b5c3a the modal border, and the
// #0a0908 / #17150f / #2a1f12 ground family. Layout, weights and the
// no-dismiss solemnity are untouched — this is a change of clothes, not bones.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,9,8,0.97)', justifyContent: 'center' },
  cardWrap: { paddingHorizontal: 18, maxHeight: '92%' },
  pad: { paddingVertical: 26 },
  kicker: { color: '#c9a86a', fontSize: 11, letterSpacing: 3, textAlign: 'center', fontWeight: '700' },
  title: { color: '#f0e6cc', fontSize: 24, letterSpacing: 2, textAlign: 'center', marginTop: 8, fontWeight: '700' },
  rule: { height: 1, backgroundColor: '#3a342c', marginVertical: 16, marginHorizontal: 30 },
  body: { color: '#a2977b', fontSize: 14, lineHeight: 22 },
  question: { color: '#e6d8b3', fontSize: 15, lineHeight: 22, marginTop: 18, marginBottom: 12, fontWeight: '700' },
  option: {
    borderWidth: 1, borderColor: '#6b5c3a', borderRadius: 4,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
    backgroundColor: 'rgba(23,21,15,0.85)',
  },
  optionPressed: { backgroundColor: 'rgba(42,31,18,0.9)', borderColor: '#c9a86a' },
  optionLabel: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  optionHint: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginTop: 5 },
  footnote: { color: '#6b5c3a', fontSize: 11, letterSpacing: 1, textAlign: 'center', marginTop: 6 },
});

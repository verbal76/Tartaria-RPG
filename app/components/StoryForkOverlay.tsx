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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,7,9,0.97)', justifyContent: 'center' },
  cardWrap: { paddingHorizontal: 18, maxHeight: '92%' },
  pad: { paddingVertical: 26 },
  kicker: { color: '#8a7a55', fontSize: 11, letterSpacing: 3, textAlign: 'center', fontWeight: '700' },
  title: { color: '#e8dcc0', fontSize: 24, letterSpacing: 2, textAlign: 'center', marginTop: 8, fontWeight: '700' },
  rule: { height: 1, backgroundColor: '#3a3527', marginVertical: 16, marginHorizontal: 30 },
  body: { color: '#b8ae97', fontSize: 14, lineHeight: 22 },
  question: { color: '#e8dcc0', fontSize: 15, lineHeight: 22, marginTop: 18, marginBottom: 12, fontWeight: '700' },
  option: {
    borderWidth: 1, borderColor: '#4a4432', borderRadius: 4,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10,
    backgroundColor: 'rgba(30,28,22,0.7)',
  },
  optionPressed: { backgroundColor: 'rgba(60,55,40,0.9)', borderColor: '#7a6f4e' },
  optionLabel: { color: '#e2d7b8', fontSize: 14, fontWeight: '700' },
  optionHint: { color: '#8f8672', fontSize: 12, lineHeight: 18, marginTop: 5 },
  footnote: { color: '#6d6552', fontSize: 11, letterSpacing: 1, textAlign: 'center', marginTop: 6 },
});

// OTA-1020 — THE CHAPTER CARD. Full-screen title beat raised at every
// main-quest phase transition (see engine/chapters.ts for which). One tap
// anywhere dismisses; the feed narration for the transition is already
// waiting underneath, so the card is a marker, not a gate — it holds no
// state a player could lose by tapping through fast.
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';

const CARD_IN_MS = 1200;

export function ChapterCardOverlay() {
  const card = useGameStore((s) => s.chapterCard);
  const dismiss = useGameStore((s) => s.dismissChapterCard);
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!card) return;
    drift.setValue(0);
    Animated.timing(drift, {
      toValue: 1,
      duration: CARD_IN_MS,
      useNativeDriver: true,
    }).start();
  }, [card, drift]);

  if (!card) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Continue">
        <Animated.View
          style={[
            styles.cardWrap,
            {
              opacity: drift,
              transform: [{
                translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [38, 0] }),
              }],
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.cardPad} showsVerticalScrollIndicator={false}>
            <Text style={styles.kicker}>{card.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">{card.title}</Text>
            <View style={styles.rule} />
            <Text style={styles.body}>{card.body}</Text>
            <View style={styles.motiveBlock}>
              <Text style={styles.motiveTag}>{card.motiveTitle.toUpperCase()}</Text>
              <Text style={styles.motiveLine}>{card.motiveLine}</Text>
            </View>
          </ScrollView>
        </Animated.View>
        <View style={styles.bottomRow}>
          <Text style={styles.hint}>TAP TO CONTINUE</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 8, 0.97)',
    justifyContent: 'center',
  },
  cardWrap: { maxHeight: '78%' },
  cardPad: { paddingHorizontal: 28, paddingVertical: 12 },
  kicker: {
    color: '#8aa0a4',
    fontSize: 12,
    letterSpacing: 6,
    fontWeight: '700',
    textAlign: 'center',
  },
  title: {
    color: '#d8cfc0',
    fontSize: 26,
    letterSpacing: 3,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 10,
  },
  rule: {
    height: 1,
    backgroundColor: '#3a4448',
    marginVertical: 18,
    marginHorizontal: 40,
  },
  body: {
    color: '#d8cfc0',
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
  },
  motiveBlock: { marginTop: 22 },
  motiveTag: {
    color: '#7c8f6a',
    fontSize: 10,
    letterSpacing: 4,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  motiveLine: {
    color: '#c9bfa4',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  bottomRow: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hint: { color: '#7c8f6a', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
});

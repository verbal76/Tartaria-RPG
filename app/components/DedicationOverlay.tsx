// THE DEDICATION CARD. A personal full-screen message raised the moment a
// character is created with the name it was written for (see the name beat in
// gameStore). Same register as the chapter card — one tap anywhere closes it,
// and it holds no state a fast tap could lose. Kept deliberately free of any
// game chrome: no phase, no motive, no OTA plumbing. It is a letter.
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useGameStore } from '../state/gameStore';

const CARD_IN_MS = 1200;

export function DedicationOverlay() {
  const card = useGameStore((s) => s.dedicationCard);
  const dismiss = useGameStore((s) => s.dismissDedication);
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
          <Text style={styles.kicker}>{card.kicker}</Text>
          <View style={styles.rule} />
          <Text style={styles.body}>{card.body}</Text>
          <Text style={styles.signoff}>{card.signoff}</Text>
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
  cardWrap: { paddingHorizontal: 28 },
  kicker: {
    color: '#e8c766',
    fontSize: 15,
    letterSpacing: 5,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(232, 199, 102, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  rule: {
    height: 1,
    backgroundColor: '#3a4448',
    marginVertical: 18,
    marginHorizontal: 40,
  },
  body: {
    color: '#d8cfc0',
    fontSize: 18,
    lineHeight: 30,
    textAlign: 'center',
  },
  signoff: {
    color: '#c9bfa4',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 22,
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

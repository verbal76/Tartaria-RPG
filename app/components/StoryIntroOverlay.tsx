// OTA-1041 — THE OPENING CRAWL. Owner: "we need a scrolling text intro akin to
// the Skyrim criminal-in-a-cart intro to describe why you are there, why you
// are doing this and what you want to happen."
//
// Full-screen paged crawl shown over the first scene of a new game (and on
// demand via REPLAY OPENING in About). Each page drifts up out of the dark as
// it fades in — slow enough to read as a title crawl, fast enough not to fight
// the reader. Tap anywhere advances; SKIP is always available (the owner
// replays constantly); the last page's button hands over the first step.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';

const PAGE_IN_MS = 1400;

export function StoryIntroOverlay() {
  const pages = useGameStore((s) => s.storyIntro);
  const dismiss = useGameStore((s) => s.dismissStoryIntro);
  const [page, setPage] = useState(0);
  const drift = useRef(new Animated.Value(0)).current;

  // Restart the drift-and-fade whenever the page changes (or the crawl opens).
  useEffect(() => {
    if (!pages) return;
    drift.setValue(0);
    Animated.timing(drift, {
      toValue: 1,
      duration: PAGE_IN_MS,
      useNativeDriver: true,
    }).start();
  }, [pages, page, drift]);

  // A replay after a finished read must start from page 0, not the old index.
  useEffect(() => {
    if (pages) setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages ? 1 : 0]);

  if (!pages || pages.length === 0) return null;

  const last = page >= pages.length - 1;
  const advance = () => {
    if (last) {
      dismiss();
    } else {
      setPage((p) => p + 1);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={advance} accessibilityRole="button" accessibilityLabel="Continue">
        <View style={styles.topRow}>
          <Text style={styles.pageCount}>{page + 1} / {pages.length}</Text>
          <Pressable onPress={dismiss} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="Skip opening">
            <Text style={styles.skipText}>SKIP</Text>
          </Pressable>
        </View>
        <Animated.View
          style={[
            styles.pageWrap,
            {
              opacity: drift,
              transform: [{
                translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [46, 0] }),
              }],
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.pagePad} showsVerticalScrollIndicator={false}>
            <Text style={styles.pageText}>{pages[page]}</Text>
          </ScrollView>
        </Animated.View>
        <View style={styles.bottomRow}>
          <Text style={styles.hint}>{last ? 'TAP — TAKE YOUR FIRST STEP' : 'TAP TO CONTINUE'}</Text>
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
  topRow: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 2,
  },
  pageCount: { color: '#5a6a6e', fontSize: 11, letterSpacing: 2 },
  skipBtn: {
    borderColor: '#5a6a6e',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  skipText: { color: '#8aa0a4', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  pageWrap: { maxHeight: '68%' },
  pagePad: { paddingHorizontal: 28, paddingVertical: 12 },
  pageText: {
    color: '#d8cfc0',
    fontSize: 17,
    lineHeight: 28,
    textAlign: 'center',
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

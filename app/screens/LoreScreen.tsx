// v2.4.1 (OTA 046) — LoreScreen is now a thin wrapper around the
// shared LoreCodexBody component. The body moved out so the same
// content can render in the gear-icon AboutScreen tab (player ask:
// "always accessible from the gear icon"). The standalone screen
// stays for any external navigation path that lands on 'lore'.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TScreenHeader } from '../ui/tartariaKit';
import { useGameStore } from '../state/gameStore';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { TEACHINGS as TEACH } from '../components/teachingRegistry'; // OTA-1738
import { LoreCodexBody } from '../components/LoreCodexBody';

export function LoreScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  // ⚠⚠ OTA-1292 — BACK GOES WHERE YOU CAME FROM. This screen was built as a
  // title-menu destination and its BACK was hard-wired setScreen('title') —
  // then the exploration crest nav (◈ LORE) started linking here MID-GAME, and
  // reading the bestiary ended with the player dumped onto the character
  // select. Owner, after clearing the beginner outpost: "I hit the back button
  // and it dropped me to the character selection screen." With a live
  // character, BACK returns to the game; only the true title-menu path leaves.
  const inSession = useGameStore((s) => s.player !== null);

  return (
    <View style={styles.container}>
      <FirstTimeHint id={TEACH.lore_first_open.id} title={TEACH.lore_first_open.title} body={TEACH.lore_first_open.body} />
      <TScreenHeader
        title="LORE CODEX"
        onBack={() => setScreen(inSession ? 'exploration' : 'title')}
          accessibilityLabel="Back"
      />

      <LoreCodexBody />
    </View>
  );
}

const styles = StyleSheet.create({
  // ⚠⚠ OTA-1780 — `header`, `backBtn`, `backText` and `title` moved to the kit
  // (`TScreenHeader`). Cover was written FIRST, in OTA-1776, so the diff below
  // is measured rather than hoped: see that suite for exactly which of these
  // four values already matched the kit and which move.
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
});

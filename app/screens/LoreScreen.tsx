// v2.4.1 (OTA 046) — LoreScreen is now a thin wrapper around the
// shared LoreCodexBody component. The body moved out so the same
// content can render in the gear-icon AboutScreen tab (player ask:
// "always accessible from the gear icon"). The standalone screen
// stays for any external navigation path that lands on 'lore'.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { LoreCodexBody } from '../components/LoreCodexBody';

export function LoreScreen() {
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <View style={styles.container}>
      <FirstTimeHint
        id="lore_first_open"
        title="The codex"
        body="Your reference for Tartaria's factions, races, and history. New entries unlock here as you discover them in play."
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('title')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>LORE CODEX</Text>
        <View style={{ width: 80 }} />
      </View>

      <LoreCodexBody />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#e6d8b3', letterSpacing: 4, fontSize: 14 },
});

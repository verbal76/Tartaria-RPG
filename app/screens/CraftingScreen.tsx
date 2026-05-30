import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { RecipesView } from '../components/RecipesView';

// 2026-05-30 OTA-064 — two tabs. CRAFT shows every gear/relic
// blueprint with craftable ones highlighted; RECIPES (formerly an
// Inventory tab) shows every food / tonic / elixir blueprint with the
// same craftable-highlight rule. The REPAIR tab from OTA-059 is gone —
// field-repair now lives in the pack item modal (red row → tap → Repair).
type Tab = 'craft' | 'recipes';

export function CraftingScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const [tab, setTab] = useState<Tab>('craft');

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No expedition is underway.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{tab === 'craft' ? 'CRAFTING' : 'RECIPES'}</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          onPress={() => setTab('craft')}
          style={[styles.tabBtn, tab === 'craft' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'craft' && styles.tabBtnTextActive]}>CRAFT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('recipes')}
          style={[styles.tabBtn, tab === 'recipes' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'recipes' && styles.tabBtnTextActive]}>RECIPES</Text>
        </TouchableOpacity>
      </View>

      <RecipesView
        kindFilter={tab === 'craft' ? 'non-consumable' : 'consumable'}
        onAfterCraft={() => setScreen('exploration')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
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
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
  },
  tabBtnActive: { borderColor: '#c9a86a' },
  tabBtnText: { color: '#7a705c', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  tabBtnTextActive: { color: '#c9a86a' },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
});

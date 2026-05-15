import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import { useGameStore } from '../state/gameStore';
import { SwipeableRow } from '../components/SwipeableRow';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';
import type { SlotSummary } from '../engine/saveSystem';

const races = racesData as { id: string; name: string }[];
const locations = locationsData as { id: string; name: string }[];

function raceLabel(id: string): string {
  return races.find((r) => r.id === id)?.name ?? id;
}
function locationLabel(id: string): string {
  return locations.find((l) => l.id === id)?.name ?? id;
}
function timeAgo(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

export function TitleScreen() {
  const slots = useGameStore((s) => s.slots);
  const setScreen = useGameStore((s) => s.setScreen);
  const refreshSlots = useGameStore((s) => s.refreshSlots);
  const loadSlotIntoGame = useGameStore((s) => s.loadSlotIntoGame);
  const deleteSlotById = useGameStore((s) => s.deleteSlotById);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSlots();
    } finally {
      setRefreshing(false);
    }
  }, [refreshSlots]);

  const confirmDelete = (slot: SlotSummary) => {
    Alert.alert(
      'Delete Tartarian',
      `${slot.playerName} will be lost to the buried world. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteSlotById(slot.slotId) },
      ],
    );
  };

  const renderItem = ({ item }: { item: SlotSummary }) => (
    <SwipeableRow onDelete={() => confirmDelete(item)}>
      <TouchableOpacity style={styles.slot} onPress={() => void loadSlotIntoGame(item.slotId)} activeOpacity={0.7}>
        <View style={styles.slotHead}>
          <Text style={styles.slotName}>{item.playerName}</Text>
          <Text style={styles.slotTime}>{timeAgo(item.savedAt)}</Text>
        </View>
        <Text style={styles.slotMeta}>
          {raceLabel(item.raceId)} · {locationLabel(item.locationId)}
        </Text>
        <Text style={styles.slotMeta}>
          HP {item.hp}/{item.hpMax}
        </Text>
      </TouchableOpacity>
    </SwipeableRow>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TARTARIA</Text>
      <Text style={styles.subtitle}>REALMS</Text>
      <Text style={styles.flavor}>A procedural narrative of the buried world.</Text>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={slots}
        keyExtractor={(s) => s.slotId}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c9a86a" />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No Tartarians yet. Swipe down to refresh — pull a New Expedition below.
          </Text>
        }
        ListHeaderComponent={
          slots.length > 0 ? <Text style={styles.listLabel}>YOUR TARTARIANS  ·  swipe left to delete</Text> : null
        }
      />

      <View style={styles.menu}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setScreen('character_creation')}>
          <Text style={styles.primaryBtnText}>New Tartarian</Text>
        </TouchableOpacity>
        <View style={styles.subRow}>
          <TouchableOpacity style={styles.subBtn} onPress={() => setScreen('log')}>
            <Text style={styles.subBtnText}>Game Log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.subBtn} onPress={() => setScreen('lore')}>
            <Text style={styles.subBtnText}>Lore Codex</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.subBtn} onPress={() => setScreen('about')}>
            <Text style={styles.subBtnText}>About</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.footer}>v0.1.0  /  2148</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 16, paddingTop: 32 },
  title: { fontSize: 36, color: '#e6d8b3', letterSpacing: 8, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#c9a86a', letterSpacing: 14, marginTop: -4, textAlign: 'center' },
  flavor: { color: '#7a705c', fontSize: 12, marginTop: 10, fontStyle: 'italic', textAlign: 'center', marginBottom: 14 },
  list: { flex: 1 },
  listContent: { paddingVertical: 4 },
  listLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  empty: { color: '#7a705c', fontStyle: 'italic', fontSize: 12, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  slot: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },
  slotHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  slotName: { color: '#e6d8b3', fontSize: 16, fontWeight: '700' },
  slotTime: { color: '#7a705c', fontSize: 11 },
  slotMeta: { color: '#7a705c', fontSize: 12, marginTop: 2 },
  menu: { gap: 8, marginTop: 8 },
  primaryBtn: {
    backgroundColor: '#3a342c',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 4,
    borderColor: '#c9a86a',
    borderWidth: 1,
  },
  primaryBtnText: { color: '#e6d8b3', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  subRow: { flexDirection: 'row', gap: 6 },
  subBtn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 4,
  },
  subBtnText: { color: '#cdbf99', fontSize: 11, letterSpacing: 1 },
  footer: { color: '#3a342c', fontSize: 10, textAlign: 'center', marginTop: 8 },
});

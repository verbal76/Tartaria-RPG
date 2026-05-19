import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import { SwipeableRow } from '../components/SwipeableRow';
import { BrandedModal } from '../components/BrandedModal';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';
import { readSlotLog, type SlotSummary } from '../engine/saveSystem';
import { OTA_BUILD_ID } from '../buildInfo';

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
  const slotLoadError = useGameStore((s) => s.slotLoadError);
  const clearSlotLoadError = useGameStore((s) => s.clearSlotLoadError);
  const deleteSlotById = useGameStore((s) => s.deleteSlotById);
  const resurrectSlot = useGameStore((s) => s.resurrectSlot);
  const resurrectionGems = useGameStore((s) => s.resurrectionGems);
  const justUpdatedFromBuild = useGameStore((s) => s.justUpdatedFromBuild);
  const dismissJustUpdated = useGameStore((s) => s.dismissJustUpdated);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'delete'; slot: SlotSummary }
    | { kind: 'resurrect'; slot: SlotSummary }
    | { kind: 'fallen'; slot: SlotSummary }
    | null
  >(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSlots();
    } finally {
      setRefreshing(false);
    }
  }, [refreshSlots]);

  const confirmDelete = (slot: SlotSummary) => {
    setPendingAction({ kind: 'delete', slot });
  };

  const [lastTappedSlot, setLastTappedSlot] = useState<SlotSummary | null>(null);

  const onSlotTap = (slot: SlotSummary) => {
    if (slot.dead) {
      if (resurrectionGems > 0) {
        setPendingAction({ kind: 'resurrect', slot });
      } else {
        setPendingAction({ kind: 'fallen', slot });
      }
      return;
    }
    setLastTappedSlot(slot);
    void loadSlotIntoGame(slot.slotId);
  };

  const retryLoad = () => {
    if (!lastTappedSlot) return;
    clearSlotLoadError();
    void loadSlotIntoGame(lastTappedSlot.slotId);
  };
  const refreshAndCancel = () => {
    clearSlotLoadError();
    void refreshSlots();
  };
  const deleteAfterError = () => {
    if (!lastTappedSlot) return;
    const id = lastTappedSlot.slotId;
    clearSlotLoadError();
    void deleteSlotById(id);
  };

  const closeModal = () => setPendingAction(null);

  // Per-slot transient "COPIED" flash so the button confirms the action
  // visually for ~1.5s without needing a modal. Keyed by slotId.
  const [copiedSlotId, setCopiedSlotId] = useState<string | null>(null);
  const copyDeadLog = async (slot: SlotSummary) => {
    try {
      const log = await readSlotLog(slot.slotId);
      await Clipboard.setStringAsync(log || `(no log captured for ${slot.playerName})`);
      setCopiedSlotId(slot.slotId);
      setTimeout(() => setCopiedSlotId((cur) => (cur === slot.slotId ? null : cur)), 1500);
    } catch {
      // Silent — clipboard rarely fails on Android; if it does, the
      // player can still try LogScreen via the active session.
    }
  };

  const renderItem = ({ item }: { item: SlotSummary }) => (
    <SwipeableRow onDelete={() => confirmDelete(item)}>
      <TouchableOpacity
        style={[styles.slot, item.dead && styles.slotDead]}
        onPress={() => onSlotTap(item)}
        activeOpacity={0.7}
      >
        <View style={styles.slotHead}>
          <View style={styles.slotNameRow}>
            <Text style={[styles.slotName, item.dead && styles.slotNameDead]}>{item.playerName}</Text>
            {item.dead && <Text style={styles.deadBadge}>DEAD</Text>}
          </View>
          <Text style={styles.slotTime}>{timeAgo(item.savedAt)}</Text>
        </View>
        <Text style={styles.slotMeta}>
          {raceLabel(item.raceId)} · {locationLabel(item.locationId)}
        </Text>
        <Text style={styles.slotMeta}>
          HP {item.hp}/{item.hpMax}
        </Text>
        {item.dead && (
          // Dead characters can't be loaded into a live session, so the
          // LogScreen path is closed to the player. This row-local button
          // reads the slot's persisted log straight off disk and drops
          // the full text on the clipboard so the player can keep the
          // record of how the run ended.
          <TouchableOpacity
            style={styles.copyLogBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              void copyDeadLog(item);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.copyLogText}>
              {copiedSlotId === item.slotId ? '✓ COPIED' : 'COPY LOG'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </SwipeableRow>
  );

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.crest}
        resizeMode="contain"
      />
      <Text style={styles.title}>TARTARIA</Text>
      <Text style={styles.subtitle}>REALMS</Text>
      <Text style={styles.flavor}>A procedural narrative of the buried world.</Text>
      {resurrectionGems > 0 && (
        <Text style={styles.gems}>✦ {resurrectionGems} Resurrection Gem{resurrectionGems === 1 ? '' : 's'} held</Text>
      )}

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
            No Tartarians yet. Swipe down to refresh — or pull a New Expedition below.
          </Text>
        }
        ListHeaderComponent={
          slots.length > 0 ? <Text style={styles.listLabel}>YOUR TARTARIANS  ·  swipe left to delete</Text> : null
        }
        ListFooterComponent={
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setScreen('character_creation')}
              activeOpacity={0.7}
            >
              <Text style={styles.primaryBtnText}>New Tartarian</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setScreen('lore')}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>Lore Codex</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.bottomBar}>
        <Text style={styles.footer}>v2.0.1  /  2148</Text>
        <TouchableOpacity
          style={styles.gearBtn}
          onPress={() => setScreen('about')}
          activeOpacity={0.7}
          hitSlop={10}
        >
          <Text style={styles.gear}>⚙</Text>
        </TouchableOpacity>
      </View>

      <BrandedModal
        visible={pendingAction !== null}
        title={
          pendingAction?.kind === 'delete' ? 'Delete Tartarian'
          : pendingAction?.kind === 'resurrect' ? 'Resurrect Tartarian'
          : pendingAction?.kind === 'fallen' ? 'Fallen'
          : ''
        }
        body={
          pendingAction?.kind === 'delete'
            ? `${pendingAction.slot.playerName} will be lost to the buried world. This cannot be undone.`
          : pendingAction?.kind === 'resurrect'
            ? `${pendingAction.slot.playerName} has fallen. Spend 1 Resurrection Gem (you hold ${resurrectionGems}) to bring them back?`
          : pendingAction?.kind === 'fallen'
            ? `${pendingAction.slot.playerName} has fallen and you hold no Resurrection Gems. The buried world keeps them for now.`
          : undefined
        }
        buttons={
          pendingAction?.kind === 'delete'
            ? [
                { label: 'Cancel', onPress: closeModal, tone: 'neutral' },
                { label: 'Delete', onPress: () => { void deleteSlotById(pendingAction.slot.slotId); closeModal(); }, tone: 'destructive' },
              ]
          : pendingAction?.kind === 'resurrect'
            ? [
                { label: 'Cancel', onPress: closeModal, tone: 'neutral' },
                { label: 'Resurrect', onPress: () => { void resurrectSlot(pendingAction.slot.slotId); closeModal(); }, tone: 'primary' },
              ]
          : [{ label: 'OK', onPress: closeModal, tone: 'neutral' }]
        }
        onRequestClose={closeModal}
      />

      {/* Just-updated popup. checkAndApplyOTA → Updates.reloadAsync
          can swap the JS bundle without warning; the auto-reload
          looks like a glitch to the player. hydrate compares the
          current OTA_BUILD_ID against the previous value stashed
          in AsyncStorage and surfaces this modal once when they
          differ. Dismiss clears justUpdatedFromBuild so it doesn't
          reappear on subsequent title-screen visits this session. */}
      <BrandedModal
        visible={!!justUpdatedFromBuild}
        title="Just updated"
        body={
          justUpdatedFromBuild
            ? `Tartaria Realms refreshed itself in the background.\n\nPrevious build: ${justUpdatedFromBuild}\nNow running: ${OTA_BUILD_ID}\n\nYour characters and saves are untouched — the sudden reload was the new bundle taking over.`
            : undefined
        }
        buttons={[
          { label: 'OK', onPress: dismissJustUpdated, tone: 'primary' },
        ]}
        onRequestClose={dismissJustUpdated}
      />

      <BrandedModal
        visible={!!slotLoadError}
        title="Could not open character"
        body={
          slotLoadError
            ? `${slotLoadError}\n\nThis usually means a save was interrupted. Retry — if it still fails, refresh the list or delete the slot.`
            : undefined
        }
        buttons={[
          { label: 'Refresh', onPress: refreshAndCancel, tone: 'neutral' },
          { label: 'Delete', onPress: deleteAfterError, tone: 'destructive' },
          { label: 'Retry', onPress: retryLoad, tone: 'primary' },
        ]}
        onRequestClose={clearSlotLoadError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 16, paddingTop: 24 },
  crest: { width: 180, height: 180, alignSelf: 'center', marginBottom: 8 },
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
  slotDead: { borderColor: '#5a2a26', opacity: 0.75 },
  slotHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  slotNameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexShrink: 1 },
  slotName: { color: '#e6d8b3', fontSize: 16, fontWeight: '700' },
  slotNameDead: { color: '#a89a7a' },
  deadBadge: {
    color: '#e07a5f',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    borderColor: '#5a2a26',
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  slotTime: { color: '#7a705c', fontSize: 11 },
  slotMeta: { color: '#7a705c', fontSize: 12, marginTop: 2 },
  copyLogBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#1a1714',
    borderColor: '#5a2a26',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyLogText: {
    color: '#e07a5f',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  gems: { color: '#c9a86a', fontSize: 12, textAlign: 'center', marginBottom: 8, letterSpacing: 1 },
  footerActions: { gap: 8, marginTop: 12 },
  primaryBtn: {
    backgroundColor: '#3a342c',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 4,
    borderColor: '#c9a86a',
    borderWidth: 1,
  },
  primaryBtnText: { color: '#e6d8b3', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 4,
  },
  secondaryBtnText: { color: '#cdbf99', fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  gearBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  gear: { color: '#c9a86a', fontSize: 18, lineHeight: 18, textAlign: 'center' },
  footer: { color: '#3a342c', fontSize: 10, marginLeft: 2 },
});

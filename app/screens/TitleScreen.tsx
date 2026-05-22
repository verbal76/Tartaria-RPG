import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
  Share,
  Modal,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  isApkOutdated,
  getLatestApkUrl,
  getLatestApkHighlights,
  getLatestApkBuild,
  hydrateApkPointer,
  refreshFromGitHub,
} from '../updates/apkRelease';
// OTA 198 — in-app installer removed from the Title screen APK
// banner per playtester: "the download button doesn't work, the
// go-to-url does work. Make the URL the main way to update the
// APK." The apkInstaller module is intentionally NOT imported
// here anymore; the release-page link via Linking.openURL is now
// the sole update path. apkInstaller still lives in the repo in
// case a future build wants to try it again, but the Title screen
// no longer surfaces it.
import { useGameStore } from '../state/gameStore';
import { SwipeableRow } from '../components/SwipeableRow';
import { BrandedModal } from '../components/BrandedModal';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';
import { readSlotLog, type SlotSummary } from '../engine/saveSystem';
import { OTA_BUILD_ID } from '../buildInfo';
import { getKokoroState, onKokoroStateChange, type KokoroState } from '../voice/PiperTTSManager';
import { checkAndApplyOTA } from '../updates/checkAndApplyOTA';

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
  const pendingOTAUpdate = useGameStore((s) => s.pendingOTAUpdate);
  const [applyingOTA, setApplyingOTA] = useState<string | null>(null);
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

  // Tick counter so the APK banner re-renders when the live pointer
  // updates after the GitHub fetch returns. Without this, the banner
  // reads the stale module-level state on first paint and never
  // re-runs the gate. Boot flow: load cached pointer (sync paint with
  // last-known build), then fire network fetch, then bump the tick.
  const [apkPointerTick, setApkPointerTick] = useState(0);
  const [apkUrlCopied, setApkUrlCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateApkPointer();
      if (cancelled) return;
      setApkPointerTick((t) => t + 1);
      await refreshFromGitHub();
      if (cancelled) return;
      setApkPointerTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, []);

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
  // OTA 006 — separate latch for the SHARE action so the COPIED
  // and SHARED flashes don't fight each other on the same row.
  const [sharedSlotId, setSharedSlotId] = useState<string | null>(null);
  // OTA 007 — OTA-update state. Moved from AboutScreen so the
  // player can pull updates without diving into settings every
  // time. checkAndApplyOTA streams status into setUpdateStatus,
  // the modal overlay shows it while busy.
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('Idle');
  const [updateError, setUpdateError] = useState<string | null>(null);
  async function checkForUpdate() {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateError(null);
    try {
      await checkAndApplyOTA({
        onStatus: setUpdateStatus,
        onError: setUpdateError,
      });
    } finally {
      setUpdateBusy(false);
    }
  }
  const copyDeadLog = async (slot: SlotSummary) => {
    try {
      const log = await readSlotLog(slot.slotId);
      const body = log || `(no log captured for ${slot.playerName})`;
      await Clipboard.setStringAsync(body);
      setCopiedSlotId(slot.slotId);
      setTimeout(() => setCopiedSlotId((cur) => (cur === slot.slotId ? null : cur)), 1500);
    } catch {
      // Silent — clipboard rarely fails on Android; if it does, the
      // player can still try LogScreen via the active session.
    }
  };
  // OTA 006 — share path mirrors the LogScreen treatment. Routes
  // through Android's Share intent instead of the clipboard, which
  // bypasses any silent paste-size cap in the destination app
  // (some chat clients truncate large pastes). Playtester:
  // "the log on the dead character tab on the home screen doesn't
  //  copy the whole log file. use the fix you use in the world
  //  screen."
  const shareDeadLog = async (slot: SlotSummary) => {
    try {
      const log = await readSlotLog(slot.slotId);
      const body = log || `(no log captured for ${slot.playerName})`;
      await Share.share({ message: body, title: `Tartaria-RPG — ${slot.playerName} log` });
      setSharedSlotId(slot.slotId);
      setTimeout(() => setSharedSlotId((cur) => (cur === slot.slotId ? null : cur)), 1500);
    } catch {
      // User-cancelled or unsupported — no-op.
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
          // LogScreen path is closed to the player. Two row-local
          // buttons: COPY LOG drops the full text on the clipboard;
          // SHARE routes through Android's Share intent so apps that
          // truncate large pastes get the full payload anyway.
          <View style={styles.deadActions}>
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
            <TouchableOpacity
              style={styles.shareLogBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                void shareDeadLog(item);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.shareLogText}>
                {sharedSlotId === item.slotId ? '✓ SHARED' : 'SHARE'}
              </Text>
            </TouchableOpacity>
          </View>
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

      <KokoroDownloadBanner />

      {(() => {
        // apkPointerTick is read here so the gate re-evaluates after
        // hydrateApkPointer + refreshFromGitHub flip the live pointer.
        void apkPointerTick;
        const url = getLatestApkUrl();
        if (!isApkOutdated() || url.length === 0) return null;
        const copied = apkUrlCopied;
        return (
          <View style={styles.apkBanner}>
            <Text style={styles.apkBannerTitle}>
              NEW APK AVAILABLE — build {getLatestApkBuild()}
            </Text>
            <Text style={styles.apkBannerBody}>
              {getLatestApkHighlights() || 'Native feature update. OTAs reach your current APK, but the new build adds capabilities only a fresh APK can ship.'}
            </Text>

            {/* OTA 198 — opening the release page in the browser is
                now the ONLY install path. The in-app installer button
                was pulled per playtester: "the download doesn't work,
                the go-to-url does work. Make the URL the main way to
                update." Styled as the primary action (was secondary). */}
            <TouchableOpacity
              style={styles.apkBannerInstallBtn}
              activeOpacity={0.7}
              onPress={() => {
                void Linking.openURL(url).catch(() => {});
              }}
            >
              <Text style={styles.apkBannerInstallText}>
                ⬇ OPEN RELEASE PAGE
              </Text>
            </TouchableOpacity>

            <Text style={styles.apkBannerHint}>
              On the release page, tap the .apk file under Assets to download. If your browser blocks it, use COPY URL and paste into a desktop browser.
            </Text>

            <TouchableOpacity
              style={styles.apkBannerCopyBtn}
              activeOpacity={0.7}
              onPress={() => {
                void Clipboard.setStringAsync(url).then(() => {
                  setApkUrlCopied(true);
                  setTimeout(() => setApkUrlCopied(false), 1500);
                });
              }}
            >
              <Text style={styles.apkBannerCopyText}>
                {copied ? '✓ COPIED' : 'COPY URL'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {pendingOTAUpdate && (
        <TouchableOpacity
          style={styles.updateBanner}
          activeOpacity={0.8}
          disabled={applyingOTA !== null}
          onPress={() => {
            setApplyingOTA('Preparing…');
            // OTA 047 — skipFetch: bundle is already on disk from
            // the boot fetchOnly pass. Re-fetching here was throwing
            // ERR_UPDATES_FETCH on transient network hiccups even
            // with a perfectly good staged update sitting locally.
            void checkAndApplyOTA({
              skipFetch: true,
              onStatus: (s) => setApplyingOTA(s),
              onError: (msg) => {
                setApplyingOTA(null);
                // Leave pendingOTAUpdate set — the banner stays
                // visible so the player can tap again to retry.
                // Pre-OTA-047 the flag was cleared here, which
                // hid the banner and forced a full app relaunch
                // to recover.
                useGameStore.setState({ slotLoadError: `Update failed: ${msg}\n\nTap UPDATE READY again to retry, or restart the app.` });
              },
            });
          }}
        >
          <Text style={styles.updateBannerTitle}>
            {applyingOTA ? `APPLYING UPDATE — ${applyingOTA.toUpperCase()}` : 'UPDATE READY — TAP TO APPLY'}
          </Text>
          <Text style={styles.updateBannerBody}>
            {applyingOTA
              ? 'Tearing down audio + AI handles before the reload. One moment.'
              : 'A new build is downloaded and waiting. Tap to restart and apply.'}
          </Text>
        </TouchableOpacity>
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
            <TouchableOpacity
              style={[styles.updateBtn, updateBusy && styles.updateBtnBusy]}
              onPress={() => { void checkForUpdate(); }}
              activeOpacity={0.7}
              disabled={updateBusy}
            >
              <Text style={styles.updateBtnText}>
                {updateBusy ? updateStatus.toUpperCase() : 'CHECK FOR OTA UPDATE'}
              </Text>
            </TouchableOpacity>
            {updateError ? (
              <Text style={styles.updateError}>{updateError}</Text>
            ) : null}
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

      {/* OTA 007 — full-screen overlay while an update is in flight.
          Without it, reloadAsync() blacks the screen mid-tear-down and
          the player thinks the app crashed. Spinner + status keeps
          them oriented through the gap. */}
      <Modal visible={updateBusy} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.updateScrim}>
          <View style={styles.updateCard}>
            <Text style={styles.updateTitle}>UPDATING</Text>
            <View style={styles.updateRule} />
            <View style={styles.updateSpinnerRow}>
              <ActivityIndicator color="#c9a86a" size="large" />
            </View>
            <Text style={styles.updateStatusLine}>{updateStatus}</Text>
            <Text style={styles.updateHint}>
              Tartaria is replacing its bones. The screen will go dark for ~10 seconds while
              the new bundle loads. If it stays black past a minute, force-close the app and
              reopen it — your progress is saved.
            </Text>
          </View>
        </View>
      </Modal>
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
  deadActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  copyLogBtn: {
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
  shareLogBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shareLogText: {
    color: '#c9a86a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  gems: { color: '#c9a86a', fontSize: 12, textAlign: 'center', marginBottom: 8, letterSpacing: 1 },
  updateBanner: {
    backgroundColor: '#2a1f12',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  updateBannerTitle: {
    color: '#c9a86a',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '800',
    textAlign: 'center',
  },
  updateBannerBody: {
    color: '#cdbf99',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 3,
  },
  apkBanner: {
    backgroundColor: '#1a2a14',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  apkBannerTitle: {
    color: '#9ec96a',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '800',
    textAlign: 'center',
  },
  apkBannerBody: {
    color: '#cdbf99',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 3,
  },
  apkBannerHint: {
    color: '#8b8576',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  apkBannerCopyBtn: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 3,
    borderColor: '#9ec96a',
    borderWidth: 1,
    alignSelf: 'center',
  },
  apkBannerCopyText: {
    color: '#9ec96a',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  apkBannerInstallBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: '#9ec96a',
    alignSelf: 'stretch',
  },
  apkBannerInstallText: {
    color: '#0a0908',
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '800',
    textAlign: 'center',
  },
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
  updateBtn: {
    backgroundColor: '#3a342c',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  updateBtnBusy: { backgroundColor: '#1a1714' },
  updateBtnText: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  updateError: { color: '#e07a5f', fontSize: 11, marginTop: 6, textAlign: 'center', fontStyle: 'italic' },
  updateScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  updateCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 18,
    alignItems: 'center',
  },
  updateTitle: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  updateRule: { height: 1, alignSelf: 'stretch', backgroundColor: '#3a342c', marginTop: 8, marginBottom: 14 },
  updateSpinnerRow: { paddingVertical: 6, marginBottom: 8 },
  updateStatusLine: { color: '#e6d8b3', fontSize: 13, letterSpacing: 1, marginBottom: 10 },
  updateHint: { color: '#7a705c', fontSize: 11, lineHeight: 16, textAlign: 'center', fontStyle: 'italic' },
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
  kokoroBanner: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  kokoroBannerText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1 },
  kokoroBannerProgress: { color: '#7a705c', fontSize: 11, marginTop: 2 },
});

// Surfaces the bundled-voice download state on the title screen so
// the playtester sees what's happening when they first install.
// Defaults flipped to bundled+TTS-on in OTA 127 — the ~100 MB Kokoro
// download fires automatically at boot. While they pick a character
// the model arrives in the background; "Voice ready" briefly confirms
// the install before fading. Errors surface so a tester on metered
// data can see why their voice isn't working.
function KokoroDownloadBanner(): React.ReactElement | null {
  const [state, setState] = useState<KokoroState>(() => getKokoroState());
  useEffect(() => onKokoroStateChange(setState), []);
  if (state.phase === 'idle') return null;
  if (state.phase === 'ready') {
    // Auto-hide the ready confirmation after 4 seconds so it doesn't
    // sit on the title screen forever once the voice is installed.
    return <ReadyFlash />;
  }
  return (
    <View style={styles.kokoroBanner}>
      <Text style={styles.kokoroBannerText}>
        {state.phase === 'downloading' ? '⬇  Installing premium voice (Kokoro)' :
         state.phase === 'loading'     ? '⚙  Loading premium voice…' :
                                          `⚠  Voice engine: ${state.message ?? 'error'}`}
      </Text>
      {state.phase === 'downloading' && (
        <Text style={styles.kokoroBannerProgress}>
          {(state.fraction * 100).toFixed(0)}%  ·  one-time download (~100 MB), runs fully offline after this
        </Text>
      )}
      {state.phase === 'error' && (
        <Text style={styles.kokoroBannerProgress}>
          The system voice will be used instead. Pull-to-refresh from Settings to retry.
        </Text>
      )}
    </View>
  );
}

function ReadyFlash(): React.ReactElement | null {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 4000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <View style={[styles.kokoroBanner, { borderColor: '#9ec96a' }]}>
      <Text style={[styles.kokoroBannerText, { color: '#9ec96a' }]}>✓  Premium voice ready</Text>
    </View>
  );
}

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
  BackHandler,
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const APP_VERSION: string = (require('../../app.json') as { expo: { version: string } }).expo.version;
import { getKokoroState, onKokoroStateChange, type KokoroState } from '../voice/PiperTTSManager';
import { speak as ttsSpeak } from '../voice/TTSManager';
import type { MainQuestPhase } from '../engine/types';
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

// v2.4.1 (OTA 036) — RESUME OBJECTIVE line for the slot card.
// Phase-aware so the player sees real progress (e.g. "3 of 9 Cores
// recovered. Heading to the Endless Stair next.").
function resumeObjectiveLine(phase: MainQuestPhase, cores: number): string {
  switch (phase) {
    case 'hook':       return '◆ A rumor of the Mud Flood Nexus.';
    case 'revelation': return '◆ 9 Cores to recover. None yet in pack.';
    case 'cores':      return `◆ ${cores}/9 Cores recovered.`;
    case 'descent':    return '◆ All 9 Cores in pack. The Endless Stair waits.';
    case 'nexus':      return '◆ Standing at the Mud Flood Nexus.';
    case 'choice':     return '◆ The Choice waits at the Nexus.';
    case 'ended':      return '◆ The run is closed.';
    default:           return '◆ Mud Flood Nexus quest in progress.';
  }
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
    | { kind: 'exit' }
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
  // v2.4.1 (OTA 023) — chunked-copy cursor for the dead-character log
  // button. Mirrors LogScreen's CHUNK_SIZE-based "PART X of Y" copy.
  // Holds the current slot being chunked plus the index of the LAST
  // copied part; next tap copies index+1, wrapping to 1 after the
  // final part. Cleared when the player switches to a different slot
  // so each slot starts at PART 1.
  const [deadLogChunk, setDeadLogChunk] = useState<
    | { slotId: string; lastIndex: number; total: number; copiedAt: number }
    | null
  >(null);
  // OTA 006 — separate latch for the SHARE action so the COPIED
  // and SHARED flashes don't fight each other on the same row.
  const [sharedSlotId, setSharedSlotId] = useState<string | null>(null);
  // v2.4.1 (OTA 051) — auto-check for an OTA on every TitleScreen
  // mount. Save-and-exit drops the player back here, which re-mounts
  // TitleScreen and re-fires this effect — so the player picks up
  // a new build without force-closing.
  //
  // 2026-05-25 — dropped fetchOnly. Previously fetchOnly:true would
  // download the bundle but defer the apply to the NEXT cold-start,
  // which meant a player N OTAs behind needed N+1 cold-starts to
  // catch up. With fetchOnly off, a fresh OTA fetched here triggers
  // Updates.reloadAsync immediately — the title screen flash-reloads
  // into the new version. Silent so a transient network error
  // doesn't dump an alert on every screen mount.
  useEffect(() => {
    let cancelled = false;
    void checkAndApplyOTA({ silent: true }).then((result) => {
      if (cancelled) return;
      if (result === 'pending') {
        useGameStore.setState({ pendingOTAUpdate: true });
      }
    });
    return () => { cancelled = true; };
  }, []);
  // v2.4.1 (OTA 023) — chunked copy for dead-character logs. Long
  // sessions easily exceed 25 KB and most chat clients silently
  // truncate larger pastes. Mirror LogScreen's chunking so the
  // player can send the log to me in pieces.
  const DEAD_LOG_CHUNK_SIZE = 25_000;
  const copyDeadLog = async (slot: SlotSummary) => {
    try {
      const log = await readSlotLog(slot.slotId);
      const body = log || `(no log captured for ${slot.playerName})`;
      const total = Math.max(1, Math.ceil(body.length / DEAD_LOG_CHUNK_SIZE));
      // If <= one chunk, behave like the original button — single
      // copy, single ✓ COPIED flash. No part-cursor noise.
      if (total <= 1) {
        await Clipboard.setStringAsync(body);
        setCopiedSlotId(slot.slotId);
        setDeadLogChunk(null);
        setTimeout(
          () => setCopiedSlotId((cur) => (cur === slot.slotId ? null : cur)),
          1500,
        );
        return;
      }
      // Determine which part to copy on THIS tap. Switching to a
      // different slot resets to PART 1; otherwise advance, wrapping
      // to 1 after the final part.
      let nextIndex = 1;
      if (deadLogChunk && deadLogChunk.slotId === slot.slotId) {
        nextIndex = deadLogChunk.lastIndex >= total
          ? 1
          : deadLogChunk.lastIndex + 1;
      }
      const start = (nextIndex - 1) * DEAD_LOG_CHUNK_SIZE;
      const end = start + DEAD_LOG_CHUNK_SIZE;
      const slice = body.slice(start, end);
      const stamped =
        `=== TARTARIA LOG · ${slot.playerName} · PART ${nextIndex} of ${total} · ${slice.length} CHARS · BEGIN ===\n` +
        `${slice}\n` +
        `=== END PART ${nextIndex} of ${total} ===\n`;
      await Clipboard.setStringAsync(stamped);
      const copiedAt = Date.now();
      setDeadLogChunk({
        slotId: slot.slotId,
        lastIndex: nextIndex,
        total,
        copiedAt,
      });
      setCopiedSlotId(null);
      // Clear the COPIED flash after 2.5s so the label switches back
      // to the "next part" prompt — same cadence as LogScreen. Only
      // clear if the current state still matches THIS copy (so a
      // rapid second tap doesn't get its flash cancelled by this
      // first tap's stale timer).
      setTimeout(() => {
        setDeadLogChunk((cur) =>
          cur && cur.slotId === slot.slotId && cur.copiedAt === copiedAt
            ? { ...cur, copiedAt: 0 }
            : cur,
        );
      }, 2500);
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
        {/* v2.4.1 (OTA 036) — RESUME OBJECTIVE row. Surfaces the
            character's main-quest progress on the title screen so
            the player can see where they left off without loading
            the save. Only renders when the slot summary has the
            mainQuestPhase field (legacy summaries pass through
            silently). */}
        {item.mainQuestPhase && (
          <Text style={styles.slotObjective}>
            {resumeObjectiveLine(
              item.mainQuestPhase as MainQuestPhase,
              item.mainQuestCoresRecovered ?? 0,
            )}
          </Text>
        )}
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
                {(() => {
                  // Single-chunk legacy flash.
                  if (copiedSlotId === item.slotId) return '✓ COPIED';
                  // Chunked-copy flash + next-part prompt for THIS row.
                  if (deadLogChunk && deadLogChunk.slotId === item.slotId) {
                    const { lastIndex, total, copiedAt } = deadLogChunk;
                    const flashing = copiedAt > 0 && Date.now() - copiedAt < 2500;
                    if (flashing) {
                      return lastIndex >= total
                        ? `✓ PART ${lastIndex}/${total} — DONE`
                        : `✓ PART ${lastIndex}/${total} — TAP FOR NEXT`;
                    }
                    const next = lastIndex >= total ? 1 : lastIndex + 1;
                    return `COPY PART ${next}/${total}`;
                  }
                  return 'COPY LOG';
                })()}
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

      {/* v2.4.1 (OTA 043) — completion badges. Shows the player's
          collection of (faction, ending) combos earned across all
          runs. 9 factions × 3 endings = 27 max badges. */}
      <EndingBadgesRow />

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
            {/* 2026-05-25 — manual CHECK FOR OTA UPDATE button restored.
                Removed in v2.4.1 (OTA 051) on the theory that the auto-
                check in useEffect was sufficient. Playtester report:
                "the manual pool OTA button is no longer on the cover
                screen ... I cold started about 10 times and finally
                it pulled the OTA." The auto-check uses fetchOnly so a
                staged OTA needs ANOTHER cold-start to apply (download
                pass N → apply pass N+1). The manual button fires the
                full fetch+apply pipeline so a single tap pulls AND
                applies in one go. Disabled while an apply is already
                in flight to avoid a double-fetch. */}
            <TouchableOpacity
              style={[styles.secondaryBtn, applyingOTA !== null && styles.btnDisabled]}
              disabled={applyingOTA !== null}
              onPress={() => {
                setApplyingOTA('Checking…');
                // 2026-05-25 — quiet failure + timeout-aware. Playtester
                // reported the check "runs a prolonged time and doesn't
                // always resolve." Root cause: expo-updates has no
                // built-in timeout on checkForUpdateAsync; OTA-025 added
                // a 10s/60s timeout inside checkAndApplyOTA so the
                // promise can't hang forever. .catch() handler below is
                // belt-and-suspenders for any truly unexpected
                // rejection.
                void checkAndApplyOTA({
                  onStatus: (s) => setApplyingOTA(s),
                  onError: () => {
                    setApplyingOTA('Failed — try later');
                    setTimeout(() => setApplyingOTA(null), 2500);
                  },
                }).then((result) => {
                  if (result === 'noUpdate') {
                    setApplyingOTA('Up to date');
                    setTimeout(() => setApplyingOTA(null), 2000);
                  } else if (result === 'skipped') {
                    setApplyingOTA('Updates disabled');
                    setTimeout(() => setApplyingOTA(null), 2000);
                  } else if (result === 'errored') {
                    // onError already fired with the detail. Make sure
                    // the button label clears even if onError was
                    // skipped for any reason.
                    setTimeout(() => setApplyingOTA(null), 2500);
                  }
                  // 'applied' triggers reloadAsync — no further UI.
                  // 'pending' is only set in fetchOnly mode which the
                  // manual button doesn't use.
                }).catch(() => {
                  // checkAndApplyOTA wraps everything in try/catch so
                  // this should be unreachable, but if some new code
                  // path ever rejects directly we still want the
                  // button to recover.
                  setApplyingOTA('Failed — try later');
                  setTimeout(() => setApplyingOTA(null), 2500);
                });
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryBtnText}>
                {applyingOTA ?? 'CHECK FOR OTA UPDATE'}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* v2.4.1 (OTA 051) — gear icon hoisted to the top-right corner
          for UI uniformity with the in-game ExplorationScreen, which
          places its gear in the same spot. The footer text (version
          + build) stays at the bottom as a quiet diagnostic strip. */}
      <TouchableOpacity
        style={styles.cornerGear}
        onPress={() => setScreen('about')}
        activeOpacity={0.7}
        hitSlop={10}
        accessibilityLabel="Settings"
      >
        <Text style={styles.gear}>⚙</Text>
      </TouchableOpacity>
      <View style={styles.bottomBar}>
        <Text style={styles.footer}>v{APP_VERSION}  /  2148</Text>
        {/* 2026-05-25 — EXIT GAME button. Per playtester request:
            full app exit from the title screen (Android only — iOS
            App Store guidelines forbid programmatic exit, but RN's
            BackHandler.exitApp() is the standard call and is a
            no-op safely on iOS). Confirm modal prevents an
            accidental tap mid-character-creation. */}
        <TouchableOpacity
          style={styles.exitBtn}
          activeOpacity={0.7}
          onPress={() => setPendingAction({ kind: 'exit' })}
        >
          <Text style={styles.exitBtnText}>EXIT GAME</Text>
        </TouchableOpacity>
      </View>

      <BrandedModal
        visible={pendingAction !== null}
        title={
          pendingAction?.kind === 'delete' ? 'Delete Tartarian'
          : pendingAction?.kind === 'resurrect' ? 'Resurrect Tartarian'
          : pendingAction?.kind === 'fallen' ? 'Fallen'
          : pendingAction?.kind === 'exit' ? 'Exit Game'
          : ''
        }
        body={
          pendingAction?.kind === 'delete'
            ? `${pendingAction.slot.playerName} will be lost to the buried world. This cannot be undone.`
          : pendingAction?.kind === 'resurrect'
            ? `${pendingAction.slot.playerName} has fallen. Spend 1 Resurrection Gem (you hold ${resurrectionGems}) to bring them back?`
          : pendingAction?.kind === 'fallen'
            ? `${pendingAction.slot.playerName} has fallen and you hold no Resurrection Gems. The buried world keeps them for now.`
          : pendingAction?.kind === 'exit'
            ? 'Close Tartaria Realms? Any unsaved progress will be lost — use SAVE & EXIT from in-game to keep it.'
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
          : pendingAction?.kind === 'exit'
            ? [
                { label: 'Stay', onPress: closeModal, tone: 'neutral' },
                { label: 'Exit', onPress: () => { closeModal(); BackHandler.exitApp(); }, tone: 'destructive' },
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

      {/* v2.4.1 (OTA 051) — full-screen UPDATING modal removed along
          with the manual CHECK FOR OTA UPDATE button. The boot-time
          auto-check is fetchOnly (no reload) and silent, so it has
          no UI surface. The UPDATE READY banner above handles the
          live apply path with its own inline status. */}
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
  // v2.4.1 (OTA 036) — RESUME OBJECTIVE line on each slot card.
  // Warm-gold to distinguish from the gray meta rows + signal it's
  // the main-quest beat.
  slotObjective: { color: '#c9a86a', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
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
  // v2.4.1 (OTA 043) — completion-badges row styles.
  badgesContainer: { marginBottom: 8, paddingHorizontal: 8 },
  badgesTag: { color: '#7a705c', fontSize: 10, letterSpacing: 2, textAlign: 'center', marginBottom: 6 },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#13110f',
    gap: 4,
  },
  badgeGlyph: { fontSize: 12, fontWeight: '700' },
  badgeText: { color: '#cdbf99', fontSize: 10, letterSpacing: 0.5 },
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
  btnDisabled: { opacity: 0.55 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  exitBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#8a3a3a',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  exitBtnText: { color: '#c97a7a', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  // v2.4.1 (OTA 051) — top-right gear matches ExplorationScreen's
  // cornerGear placement so the player always finds settings in the
  // same spot. Absolute over the title section; the crest + headers
  // are centered + don't reach the right edge.
  cornerGear: {
    position: 'absolute',
    top: 24,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(26, 23, 20, 0.85)',
    borderColor: '#3a342c',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
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
// v2.4.1 (OTA 043 — Phase 7) — completion badges row. Loads the
// global stash on mount + every time the title screen is re-rendered
// after an ending; shows a compact grid of earned (faction, ending)
// combos. Hidden when the player has zero badges (avoid clutter
// for new players).
const FACTION_NAMES_FOR_BADGES: Record<string, string> = {
  reclaimers_guild: 'Reclaimers',
  forgotten_order: 'Order',
  mud_monarchs: 'Monarchs',
  true_tartarians: 'True Tart.',
  eternal_dynasty: 'Dynasty',
  conspiracy_architects: 'Architects',
  servants_of_giants: 'Servants',
  stone_builders: 'Builders',
  tartarian_revivalists: 'Revivalists',
};
const ENDING_GLYPH: Record<string, string> = { seal: '◇', unleash: '◈', preserve: '◉' };
const ENDING_COLOR: Record<string, string> = { seal: '#5a6b8a', unleash: '#a85a3a', preserve: '#7a8a5a' };

function EndingBadgesRow(): React.ReactElement | null {
  const [badges, setBadges] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadGlobalStash } = require('../engine/saveSystem');
      const stash = await loadGlobalStash();
      if (!cancelled) setBadges(stash.endingBadges ?? []);
    })();
    return () => { cancelled = true; };
  }, []);
  if (badges.length === 0) return null;
  const total = 27;
  return (
    <View style={styles.badgesContainer}>
      <Text style={styles.badgesTag}>COMPLETED RUNS · {badges.length}/{total}</Text>
      <View style={styles.badgesGrid}>
        {badges.map((id) => {
          const [factionId, ending] = id.split(':');
          const faction = FACTION_NAMES_FOR_BADGES[factionId ?? ''] ?? factionId;
          const glyph = ENDING_GLYPH[ending ?? ''] ?? '◯';
          const color = ENDING_COLOR[ending ?? ''] ?? '#7a705c';
          return (
            <View key={id} style={[styles.badge, { borderColor: color }]}>
              <Text style={[styles.badgeGlyph, { color }]}>{glyph}</Text>
              <Text style={styles.badgeText} numberOfLines={1}>{faction}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function KokoroDownloadBanner(): React.ReactElement | null {
  const [state, setState] = useState<KokoroState>(() => getKokoroState());
  useEffect(() => onKokoroStateChange(setState), []);
  if (state.phase === 'idle') return null;
  if (state.phase === 'ready') {
    // Auto-hide the ready confirmation after 4 seconds so it doesn't
    // sit on the title screen forever once the voice is installed.
    return <ReadyFlash />;
  }
  // Time-based gate in PiperTTSManager keeps 'downloading' phase
  // suppressed for cache hits (resolve in <2s) and only escalates
  // when a real 100 MB download is in flight (>4s elapsed + progress
  // still <99%). So this branch only renders on a genuine first-time
  // fetch or a post-reinstall refetch. Cache hits stay on the calmer
  // 'loading' copy below.
  if (state.phase === 'downloading') {
    return (
      <View style={styles.kokoroBanner}>
        <Text style={styles.kokoroBannerText}>
          ⬇  Installing premium voice (Kokoro)
        </Text>
        <Text style={styles.kokoroBannerProgress}>
          {(state.fraction * 100).toFixed(0)}%  ·  one-time download (~100 MB), runs fully offline after this
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.kokoroBanner}>
      <Text style={styles.kokoroBannerText}>
        {state.phase === 'error'
          ? `⚠  Voice engine: ${state.message ?? 'error'}`
          : '⚙  Waking up the Arbiter — select your character when it turns green'}
      </Text>
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
    // The Arbiter's first words when the voice engine comes online —
    // Kokoro speaks "Choose your character" through the Arbiter voice.
    // No-op if TTS is disabled in voice settings. 'system' channel so
    // it's not subject to per-channel spam-collapse rules.
    void ttsSpeak('Choose your character.', 'system');
    // Banner hide timed to comfortably cover the spoken line (~1.5s
    // for that phrase at default speed) plus a beat for the green
    // confirmation to register visually before it fades.
    const t = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <View style={[styles.kokoroBanner, { borderColor: '#9ec96a' }]}>
      <Text style={[styles.kokoroBannerText, { color: '#9ec96a' }]}>
        ✓  The Arbiter wakes — choose your character
      </Text>
    </View>
  );
}

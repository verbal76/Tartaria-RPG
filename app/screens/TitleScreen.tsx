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
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Application from 'expo-application';
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
import { BugReportModal } from '../components/BugReportModal';
import { InvitePlaytesterModal } from '../components/InvitePlaytesterModal';
import { buildBasicDeviceSummary, stampLogExport } from '../diagnostics/aboutSummary';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';
import { readSlotLog, type SlotSummary } from '../engine/saveSystem';
import { OTA_BUILD_ID, MINIMUM_RECOMMENDED_APK_BUILD } from '../buildInfo';
import { getBuildCodename, getBuildCodenameOrNull, getApkCodename } from '../buildCodename';
// eslint-disable-next-line @typescript-eslint/no-require-imports
// OTA-251 — was reading app.json's expo.version. That field is now
// pinned to the runtimeVersion of the installed APK (2.4.1) so OTAs
// can flow without orphaning. The player-facing display string lives
// in DISPLAY_VERSION (app/buildInfo.ts) and bumps freely per OTA.
import { DISPLAY_VERSION as APP_VERSION } from '../buildInfo';
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
  // OTA-271 — Play Store stale-APK banner. Dismiss is per-session
  // (re-appears on next app launch so the player doesn't ignore it
  // forever). Different from the apkBanner system above, which
  // points sideload (HaL) testers at the GitHub release APK; this
  // one points production-bundle testers at the Play Store listing.
  const [playStoreNagDismissed, setPlayStoreNagDismissed] = useState(false);
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
  // OTA-063 — bug-report modal state. Open via the REPORT BUG button
  // on the bottom bar. On send, build the full report (description +
  // device summary + slot log), stage it on the clipboard, then open
  // mailto so the player's email app composes a new message to
  // hotatticgames@gmail.com. The brief flash on the bottom bar
  // confirms the clipboard was populated.
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugReportSent, setBugReportSent] = useState(false);
  // OTA-065 — invite-playtester modal state. Same UX pattern as
  // bug-report: open modal, collect input, open mailto, flash
  // a "✓ SENT" confirmation on the button so the player has
  // visual feedback that the draft actually opened.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
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
  //
  // OTA-234 — CRITICAL CRASH FIX. Reverted to fetchOnly:true. Player
  // playtest: "i hit the game icon, title screen visible for 1
  // second then drops to the phone's homescreen." Reproducer: on
  // launch, AppShell's useEffect kicks bootCognitive (MiniLM) +
  // bootQwen (llama.rn) + bootAudio (expo-av) + initTTSManager
  // (executorch Kokoro) — all four native modules are still
  // spinning up when this TitleScreen useEffect fires
  // checkAndApplyOTA. With fetchOnly OFF, a discovered OTA triggers
  // Updates.reloadAsync mid-boot → reloadAsync swaps the JS bundle
  // while native modules are mid-initialization → process crash to
  // home. The dropped-fetchOnly comment above acknowledges the
  // catch-up tradeoff, but mid-boot crash > catch-up friction.
  // App.tsx:171 already uses fetchOnly:true for exactly this
  // reason. Aligning the two paths. PendingOTAUpdate banner +
  // one-tap apply (from a clean state, after native modules are
  // ready) is the surfaced apply path now.
  useEffect(() => {
    let cancelled = false;
    void checkAndApplyOTA({ silent: true, fetchOnly: true }).then((result) => {
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
      // OTA-101 — appends buildBasicDeviceSummary via stampLogExport
      // so dead-character bug reports carry the same build context
      // as live-character ones. playerName surfaces in the header.
      const stamped = stampLogExport(slice, {
        chunk: { index: nextIndex, total },
        playerName: slot.playerName,
      });
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

  // OTA-063 — bug report send handler. Builds a full report block
  // (description + device summary + character log), drops it on
  // the clipboard, and opens a mailto: link to hotatticgames@gmail
  // .com with subject "Bug Report — <character>". The clipboard
  // staging is the workaround for mailto's body-length limit
  // (~2KB on iOS Mail, varies on Android Gmail) — character logs
  // run 50-200KB and would silently truncate inline. The player
  // pastes the report into the email composer before sending.
  //
  // OTA-064 — playtester report: "it didn't get the whole log, it
  // was truncated." Gmail compose silently chops a single paste at
  // ~32-64KB; with the full chronological log inline, the OLDEST
  // entries land in the email and the NEWEST (= what the player
  // just hit) get dropped. Fixed by:
  //   (1) Reversing the log so the newest entry is at the top.
  //   (2) Capping the log section at LOG_CHARS_CAP chars so the
  //       whole report fits in one Gmail paste. Bug reports get
  //       filed seconds after the issue, so the newest tail is
  //       what matters; older entries are intentionally trimmed.
  //   (3) Rewriting the mailto body so the paste-instruction is
  //       unmistakable (previous wording was a parenthetical that
  //       at least one tester missed entirely).
  const sendBugReport = async (args: {
    slot: SlotSummary | null;
    description: string;
  }): Promise<void> => {
    const { slot, description } = args;
    const charName = slot?.playerName ?? '(general / no character)';
    const subject = `Bug Report${slot ? ` — ${slot.playerName}` : ''}`;

    // ~40KB log target. Empirically Gmail Android compose accepts
    // a single paste up to ~64KB before silently truncating, and
    // iOS Mail.app caps lower at ~50KB. 40KB leaves comfortable
    // headroom for the ~2KB of description + device-summary
    // wrapper while still being "overkill" for a typical
    // session-length log (the previous playtester's pasted log
    // was 6KB; even a long session rarely tops 30KB).
    const LOG_CHARS_CAP = 40_000;

    // Pull device summary synchronously, then the slot log (async).
    const deviceBlock = buildBasicDeviceSummary();
    let logBlock = '(no character selected — no log attached)';
    if (slot) {
      try {
        const raw = await readSlotLog(slot.slotId);
        if (raw && raw.length > 0) {
          // Reverse line order: split on newline, reverse, then
          // accumulate from the newest end until we'd cross the
          // cap. The last line of the raw log is sometimes an
          // empty string (trailing \n) — filter it out so the
          // first reversed line is a real entry.
          const lines = raw.split('\n').filter((l) => l.length > 0);
          const totalLines = lines.length;
          lines.reverse();
          const accLines: string[] = [];
          let accChars = 0;
          let truncated = false;
          for (const line of lines) {
            // +1 accounts for the newline we re-add on join.
            if (accChars + line.length + 1 > LOG_CHARS_CAP) {
              truncated = true;
              break;
            }
            accLines.push(line);
            accChars += line.length + 1;
          }
          const header = truncated
            ? `(Newest entry at top — showing the most recent ${accLines.length} of ${totalLines} entries; older trimmed to fit a single email paste)`
            : `(Newest entry at top — full log, ${accLines.length} entries)`;
          logBlock = `${header}\n\n${accLines.join('\n')}`;
        } else {
          logBlock = `(log empty for ${slot.playerName})`;
        }
      } catch {
        logBlock = `(log read failed for ${slot.playerName})`;
      }
    }

    const report = [
      `=== TARTARIA BUG REPORT ===`,
      `Submitted: ${new Date().toISOString()}`,
      `Character: ${charName}`,
      slot ? `Slot ID: ${slot.slotId}` : null,
      slot ? `Race: ${raceLabel(slot.raceId)}` : null,
      slot ? `Location: ${locationLabel(slot.locationId)}` : null,
      slot ? `HP: ${slot.hp}/${slot.hpMax}${slot.dead ? ' (FALLEN)' : ''}` : null,
      ``,
      `--- DESCRIPTION ---`,
      description,
      ``,
      `--- DEVICE / BUILD ---`,
      deviceBlock,
      ``,
      `--- CHARACTER LOG (newest first) ---`,
      logBlock,
      ``,
      `=== END REPORT ===`,
    ]
      .filter((l) => l !== null)
      .join('\n');

    try {
      await Clipboard.setStringAsync(report);
    } catch {
      // Clipboard rarely fails — proceed to mailto either way so
      // the player at least lands in their mail app and can type
      // a manual summary.
    }

    // Mailto body intentionally explicit: previous wording was a
    // one-line parenthetical that at least one playtester
    // (correctly) treated as decoration and sent the email with
    // no paste. The new body is a structured READ ME FIRST with
    // a clear paste-below marker, kept under ~1KB so iOS Mail
    // doesn't truncate the instructions themselves.
    const mailtoBody =
      `READ ME FIRST\n` +
      `=============\n` +
      `Your full bug report (description, device info, and most-\n` +
      `recent log entries — newest at top) has been COPIED TO\n` +
      `YOUR CLIPBOARD. Before sending this email:\n` +
      `\n` +
      `  1. Long-press anywhere below the "PASTE BELOW" line\n` +
      `  2. Tap PASTE\n` +
      `  3. Then tap Send\n` +
      `\n` +
      `Without the paste, this email arrives empty and we can't\n` +
      `track the bug down.\n` +
      `\n` +
      `Character: ${charName}\n` +
      // OTA-267 — codename obfuscation. Was `OTA build: ${OTA_BUILD_ID}`
      // (e.g., "2026-05-31-266") which matched commit message patterns
      // and let a curious tester trace bugs back to GitHub. Codename is
      // mapped via app/buildCodename.ts; dev cross-references via
      // docs/build-codenames.md when triaging.
      `Build: ${getBuildCodename(OTA_BUILD_ID)}\n` +
      `\n` +
      `--- PASTE BELOW THIS LINE ---\n` +
      `\n`;
    const mailto =
      `mailto:hotatticgames@gmail.com` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(mailtoBody)}`;

    try {
      await Linking.openURL(mailto);
    } catch {
      // No mail client installed — the report is still on the
      // clipboard; the COPIED flash below tells the player so.
    }

    setBugReportOpen(false);
    setBugReportSent(true);
    setTimeout(() => setBugReportSent(false), 2200);
  };

  // OTA-065 — invite-playtester send handler. Opens a mailto to
  // hotatticgames@gmail.com with subject "New Playtester" and a
  // small body containing the suggested address + the requester's
  // OTA build so the owner has version context when whitelisting.
  // No clipboard staging — the body fits comfortably under iOS
  // Mail's mailto body cap. Owner replies with the install link
  // (up to 24 hours per the modal copy, usually within the hour).
  const sendPlaytesterInvite = async (gmail: string): Promise<void> => {
    const subject = 'New Playtester';
    const body =
      `Please add the following Gmail address to the Tartaria\n` +
      `Realms playtester whitelist:\n` +
      `\n` +
      `  ${gmail}\n` +
      `\n` +
      `Requested at: ${new Date().toISOString()}\n` +
      // OTA-267 — codename instead of raw OTA id. Same obfuscation
      // reason as the bug-report email above.
      `Requester's build: ${getBuildCodename(OTA_BUILD_ID)}\n` +
      `\n` +
      `(Sent from the INVITE PLAYTESTER button on the Tartaria\n` +
      `title screen.)\n`;
    const mailto =
      `mailto:hotatticgames@gmail.com` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    try {
      await Linking.openURL(mailto);
    } catch {
      // No mail client installed — silent. The ✓ SENT flash below
      // still fires; the player will notice their email app didn't
      // open and can reach out manually.
    }

    setInviteOpen(false);
    setInviteSent(true);
    setTimeout(() => setInviteSent(false), 2200);
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
        {/* OTA-120 Phase 5 — dog sub-line. Shows the active companion's
            name + breed when the save has one, so the player can pick
            the right character at a glance. Slots with no dog (or
            abandoned/dead dogs) render the same as before. */}
        {item.dogName && (
          <Text style={styles.slotDogLine}>
            └─ {item.dogName} ({item.dogBreed ?? 'dog'})
          </Text>
        )}
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

      {/* OTA-271 — Play Store stale-APK nag. Render conditions:
          (1) Android only — Play Store doesn't exist on iOS;
          (2) production bundle id (com.hotatticgames.tartarprim,
              no .hal2001 suffix) — sideload testers get the
              GitHub-pointer banner below, not this one;
          (3) installed APK build < MINIMUM_RECOMMENDED_APK_BUILD —
              the threshold bumps in buildInfo.ts each time a new
              AAB lands in Play Console internal testing;
          (4) player hasn't dismissed this session (re-fires next
              launch so it doesn't get tuned out forever).
          NOTE: only reaches testers whose APK rt matches our
          current OTA rt (2.4.1). Testers on ancient APKs with a
          different rt don't receive this OTA at all and need
          out-of-band contact OR a one-shot OTA published at their
          specific rt. */}
      {(() => {
        if (playStoreNagDismissed) return null;
        if (Platform.OS !== 'android') return null;
        const appId = Application.applicationId ?? '';
        if (appId.endsWith('.hal2001')) return null; // sideload path
        if (appId !== 'com.hotatticgames.tartarprim') return null;
        const apkBuild = Number.parseInt(
          String(Application.nativeBuildVersion ?? '0'),
          10,
        );
        if (!Number.isFinite(apkBuild) || apkBuild <= 0) return null;
        if (apkBuild >= MINIMUM_RECOMMENDED_APK_BUILD) return null;
        const openPlayStore = () => {
          const marketUrl = `market://details?id=${appId}`;
          const httpsFallback = `https://play.google.com/store/apps/details?id=${appId}`;
          Linking.canOpenURL(marketUrl)
            .then((supported) =>
              Linking.openURL(supported ? marketUrl : httpsFallback),
            )
            .catch(() => {
              void Linking.openURL(httpsFallback).catch(() => {});
            });
        };
        return (
          <View style={styles.playStoreNag}>
            <Text style={styles.playStoreNagTitle}>
              UPDATE AVAILABLE — {getApkCodename(MINIMUM_RECOMMENDED_APK_BUILD)}
            </Text>
            <Text style={styles.playStoreNagBody}>
              You're on build {apkBuild}. Open Google Play Store to install
              the latest Tartaria Realms ({getApkCodename(MINIMUM_RECOMMENDED_APK_BUILD)},
              build {MINIMUM_RECOMMENDED_APK_BUILD}) — newer features, bug
              fixes, and OTA-update compatibility.
            </Text>
            <View style={styles.playStoreNagButtons}>
              <TouchableOpacity
                style={styles.playStoreNagPrimary}
                onPress={openPlayStore}
              >
                <Text style={styles.playStoreNagPrimaryText}>OPEN PLAY STORE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playStoreNagDismiss}
                onPress={() => setPlayStoreNagDismissed(true)}
              >
                <Text style={styles.playStoreNagDismissText}>later</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {(() => {
        // apkPointerTick is read here so the gate re-evaluates after
        // hydrateApkPointer + refreshFromGitHub flip the live pointer.
        void apkPointerTick;
        // OTA-271 — this banner is the HaL sideload (.hal2001 bundle)
        // path that points at a GitHub release APK. Hide for the bare
        // production bundle — those testers belong to Play Store and
        // get the playStoreNag above. The HaL sideload check uses the
        // App ID rather than channel so it works regardless of OTA
        // channel state.
        const appId = Application.applicationId ?? '';
        if (!appId.endsWith('.hal2001')) return null;
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
        {/* OTA-068 — playtester thank-you line above the action
            row. Sized between the action buttons and the
            version footer in visual weight so it reads as a
            standalone message, not a button label or a diag
            string. */}
        <Text style={styles.thankYou}>
          Thank you for helping us test our new game, enjoy Tartaria!
        </Text>
        {/* OTA-068 — three centered action buttons (INVITE
            PLAYTESTER, REPORT BUG, EXIT GAME). Was flex-end /
            right-aligned in OTA-065; centered now so the
            three-button row reads as a balanced cluster above
            the centered footer. */}
        <View style={styles.bottomBtnRow}>
          {/* OTA-065 — INVITE PLAYTESTER button. Opens the
              InvitePlaytesterModal which collects a Gmail
              address and opens a mailto draft to
              hotatticgames@gmail.com with subject "New
              Playtester" for owner-side whitelisting. */}
          <TouchableOpacity
            style={styles.inviteBtn}
            activeOpacity={0.7}
            onPress={() => setInviteOpen(true)}
          >
            <Text style={styles.inviteBtnText}>
              {inviteSent ? '✓ SENT' : 'INVITE PLAYTESTER'}
            </Text>
          </TouchableOpacity>
          {/* OTA-063 — REPORT BUG button. Same footer-bar visual
              weight as EXIT GAME because both are peripheral,
              not primary, actions. Opens the BugReportModal
              which collects a character + description and
              stages the full report on the clipboard before
              opening mailto. */}
          <TouchableOpacity
            style={styles.bugReportBtn}
            activeOpacity={0.7}
            onPress={() => setBugReportOpen(true)}
          >
            <Text style={styles.bugReportBtnText}>
              {bugReportSent ? '✓ COPIED' : 'REPORT BUG'}
            </Text>
          </TouchableOpacity>
          {/* 2026-05-25 — EXIT GAME button. Per playtester
              request: full app exit from the title screen
              (Android only — iOS App Store guidelines forbid
              programmatic exit, but RN's BackHandler.exitApp()
              is the standard call and is a no-op safely on
              iOS). Confirm modal prevents an accidental tap
              mid-character-creation.
              OTA-251 — iOS now HIDES the button entirely. App
              Store review will reject any UI that programmatically
              terminates the app, even if the underlying call is a
              no-op. Wrapped the button in Platform.OS === 'android'. */}
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={styles.exitBtn}
              activeOpacity={0.7}
              onPress={() => setPendingAction({ kind: 'exit' })}
            >
              <Text style={styles.exitBtnText}>EXIT GAME</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* OTA-237 — surface last crash diagnostic if a previous launch
            died. App.tsx's global error handler writes to
            @tartaria/lastCrash on any fatal error or hydrate failure.
            Showing it here gives the player (and the bug report path)
            a concrete signal instead of "nothing happened". Tap to
            clear. */}
        <LastCrashLine />
        <Text style={styles.footer}>v{APP_VERSION}  /  2148</Text>
      </View>

      <BugReportModal
        visible={bugReportOpen}
        slots={slots}
        onCancel={() => setBugReportOpen(false)}
        onSend={(args) => { void sendBugReport(args); }}
      />

      <InvitePlaytesterModal
        visible={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onSend={(gmail) => { void sendPlaytesterInvite(gmail); }}
      />

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
            // OTA-267 — codename instead of raw OTA id, plus a fallback
            // ("an older build") for builds before this codename
            // layer existed.
            ? `Tartaria Realms refreshed itself in the background.\n\nPrevious build: ${getBuildCodenameOrNull(justUpdatedFromBuild) ?? 'an older build'}\nNow running: ${getBuildCodename(OTA_BUILD_ID)}\n\nYour characters and saves are untouched — the sudden reload was the new bundle taking over.`
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
  // OTA-120 Phase 5 — dog sub-line styling.
  slotDogLine: { color: '#c9a86a', fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
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
  // OTA-150 — Mastery capstone. Centered chip + one-line Arbiter
  // acknowledgement sit above the regular 27-grid when the player
  // has every (faction, ending) combo on file.
  masteryBadgeWrap: { alignItems: 'center', marginBottom: 8 },
  masteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: '#c9a86a',
    borderRadius: 4,
    backgroundColor: '#1a1408',
    gap: 6,
    marginBottom: 4,
  },
  masteryGlyph: { color: '#c9a86a', fontSize: 14, fontWeight: '700' },
  masteryText: { color: '#c9a86a', fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  masteryLine: {
    color: '#cdbf99',
    fontSize: 10,
    fontStyle: 'italic',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
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
  // OTA-271 — Play Store stale-APK nag. Tan accent (different from
  // the green sideload banner above) so the two never read as the
  // same affordance — different install paths, different visual.
  playStoreNag: {
    backgroundColor: '#1a1612',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  playStoreNagTitle: {
    color: '#c9a86a',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '800',
    marginBottom: 4,
  },
  playStoreNagBody: {
    color: '#cdbf99',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  playStoreNagButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  playStoreNagPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    backgroundColor: '#c9a86a',
  },
  playStoreNagPrimaryText: {
    color: '#13110f',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  playStoreNagDismiss: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    borderColor: '#3a342c',
    borderWidth: 1,
  },
  playStoreNagDismissText: {
    color: '#7a705c',
    fontSize: 11,
    fontStyle: 'italic',
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
  // OTA-065 — bottomBar now stacks vertically so the action
  // button row (INVITE PLAYTESTER + REPORT BUG + EXIT GAME) has
  // its own full-width row and doesn't compete with the footer
  // text for horizontal space. On a 360dp Android screen the
  // three buttons + footer text in one row overflowed once
  // "INVITE PLAYTESTER" replaced the shorter "INVITE" label
  // (~388dp content on a 360dp screen).
  bottomBar: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingTop: 8,
    gap: 6,
  },
  exitBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#8a3a3a',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  exitBtnText: { color: '#c97a7a', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  // OTA-068 — centered three-button row (INVITE PLAYTESTER,
  // REPORT BUG, EXIT GAME). Was flex-end / right-aligned in
  // OTA-065; the centered cluster reads better above the
  // centered footer + thank-you lines and feels less crowded
  // on the right edge of the screen.
  bottomBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // OTA-063 — REPORT BUG button. Visually equal-weight to EXIT
  // GAME (same paddings + font) but uses the brand amber instead
  // of the destructive red so the two are distinguishable at a
  // glance. The COPIED-flash state swaps in a green border so
  // the player sees confirmation.
  bugReportBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  bugReportBtnText: { color: '#c9a86a', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  // OTA-065 — INVITE PLAYTESTER button. Cool-blue accent so it
  // doesn't compete with REPORT BUG (amber) or EXIT GAME (red).
  // Three distinct tones in the action row keep the buttons
  // glanceable.
  inviteBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#6a9ec9',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  inviteBtnText: { color: '#6a9ec9', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
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
  // OTA-068 — footer now centered (was left-aligned with a
  // small marginLeft) so it sits under the centered action row
  // and thank-you message as the third centered line.
  // OTA-234 — was #3a342c (too faded; playtest: "I can barely see
  // it"). Bumped to #c9a86a to match REPORT BUG (bugReportBtnText)
  // so the version line reads at a glance.
  footer: { color: '#c9a86a', fontSize: 10, textAlign: 'center' },
  // OTA-068 — thank-you message above the action row. Color
  // sits between the action button text (#c9a86a / #6a9ec9 /
  // #c97a7a — bright accents) and the footer (#3a342c — deep
  // muted) so the message reads as warm-but-secondary.
  thankYou: {
    color: '#8a7d5c',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.3,
    paddingHorizontal: 8,
  },
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
  // OTA-150 — Mastery badge. Surfaces when the player has recorded
  // every (faction, ending) combo. Idempotent + cosmetic — no
  // mechanical effect, just acknowledgement that the matrix has
  // been walked end-to-end. Sits centered above the regular grid
  // so it reads as a capstone rather than a 28th peer.
  const mastered = badges.length >= total;
  return (
    <View style={styles.badgesContainer}>
      {mastered && (
        <View style={styles.masteryBadgeWrap}>
          <View style={styles.masteryBadge}>
            <Text style={styles.masteryGlyph}>✦</Text>
            <Text style={styles.masteryText}>MASTERY</Text>
            <Text style={styles.masteryGlyph}>✦</Text>
          </View>
          <Text style={styles.masteryLine}>
            You have walked this path under every banner.
          </Text>
        </View>
      )}
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

// OTA-237 — crash diagnostic surface. App.tsx's global error handler
// and hydrate failure path write to @tartaria/lastCrash on any boot-
// time failure. This component reads it on mount and shows a one-line
// pill: "Last crash @ <stage>: <message>". Tap to clear so a stale
// diagnostic doesn't haunt every launch. If no crash record exists,
// renders null — invisible to most players.
function LastCrashLine(): React.ReactElement | null {
  const [crash, setCrash] = useState<{ stage: string; message: string; timestamp: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const AS = require('@react-native-async-storage/async-storage').default;
        const raw = await AS.getItem('@tartaria/lastCrash');
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as { stage?: string; message?: string; timestamp?: number };
        if (!parsed?.message) return;
        setCrash({
          stage: parsed.stage ?? 'unknown',
          message: parsed.message,
          timestamp: parsed.timestamp ?? Date.now(),
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);
  if (!crash) return null;
  const ageMin = Math.max(1, Math.floor((Date.now() - crash.timestamp) / 60000));
  return (
    <TouchableOpacity
      onPress={() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const AS = require('@react-native-async-storage/async-storage').default;
          void AS.removeItem('@tartaria/lastCrash');
        } catch { /* ignore */ }
        setCrash(null);
      }}
      activeOpacity={0.7}
      style={lastCrashStyles.pill}
    >
      <Text style={lastCrashStyles.title}>LAST CRASH · {crash.stage} · {ageMin}m ago (tap to dismiss)</Text>
      <Text style={lastCrashStyles.message}>{crash.message}</Text>
    </TouchableOpacity>
  );
}

const lastCrashStyles = StyleSheet.create({
  pill: {
    borderColor: '#c97a7a',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    marginHorizontal: 12,
    backgroundColor: 'rgba(80,20,20,0.25)',
  },
  title: { color: '#c97a7a', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  message: { color: '#e6d8b3', fontSize: 11, marginTop: 2 },
});

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

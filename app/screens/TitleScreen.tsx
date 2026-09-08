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
  Platform,
  type ImageStyle,
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
import { buildBasicDeviceSummary, stampLogExport } from '../diagnostics/aboutSummary';
import { loadCrashSave, clearCrashSave, buildCrashSaveExport, type CrashSaveCapture } from '../diagnostics/crashSave';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';
import { readSlotLog, loadSlot, summaryFactionId, type SlotSummary } from '../engine/saveSystem';
// ⚠ PHONE-FIX — `importSaveAsNewSlot` / `decodeSaveExport` went to Settings with
// RESTORE (see app/ui/restoreCharacter.ts). `encodeSaveExport` stays: the dead
// rows' COPY LOG / BACK UP still write one here.
import { encodeSaveExport } from '../engine/saveExport';
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
import { useReadableMuted } from '../ui/displaySettings';
import { CONTENT_MAX_WIDTH } from '../ui/displayScale'; // OTA-1227 — one column width, platform-aware
import { modelBootPercent, modelsStillLoading } from '../ui/modelBootProgress'; // OTA-1228 — the 51% bar, made testable
// ⚠⚠⚠ VIS-1 — the Tartaria interface kit. This screen is its first reference
// implementation; read app/ui/tartariaKit.tsx before adding anything visual here.
import { T, TType, TButton, TDivider, TRule, TCorners, TResourceChit, TFactionPlate, TGear, TSettle, TStrata } from '../ui/tartariaKit';
import { factionCrest, crestArt, crestFactionIds, type CrestArt } from '../engine/factionCrests';

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

/* ⚠⚠⚠ THE FACTION FIELD — ONE TREATMENT, EVERY CARD, EACH ITS OWN EMBLEM.
 *
 * VIS-3 (OTA-1746) printed a Tartarian's faction art into the EXPANDED record's
 * ground: the canonical `assets/crests/<factionId>.png`, dramatically oversized,
 * anchored right and cropped by the card's own edges, at 0.09 — a ghosted
 * fragment embedded in the plate rather than a logo placed on it. The owner
 * confirmed that treatment on the device and asked for it on every card.
 *
 * ⚠⚠ SO IT IS NOW ONE COMPONENT, DRIVEN BY THE TARTARIAN'S OWN FACTION, and the
 * EXPANDED geometry is untouched — that card is the reference, and a "reuse"
 * that quietly restyled it would have thrown away the thing being extended.
 * The only new thing is `compact`, and it exists for a measurable reason, not a
 * taste one (see `dossierFieldCompact`).
 *
 * ⚠ WHAT IT REFUSES TO DO. A faction the game ships no art for renders NOTHING —
 * no placeholder, no substitute emblem, no generic mark. A stand-in would be
 * lore this file is not entitled to invent, and a single shared watermark is the
 * exact outcome the brief rules out. `pointerEvents="none"` throughout, so the
 * tap, the second tap that loads, the swipe-to-delete and the scroll all pass
 * straight through. `contain` always: the source PNGs run 1145x1374 to 1254x1254
 * and none are square, so the emblem is cropped by its container and NEVER
 * stretched.
 *
 * ⚠ AND IT IS FREE. On an expanded card this is the same `source` as the riveted
 * seal plate above it, so RN decodes the asset once and both draw from one cache
 * entry; on a collapsed card it is the only draw. No animation, no measurement,
 * no state, no subscription. */
/* ⚠⚠⚠ AND WHERE THAT WINDOW SITS ON THE ARTWORK — OTA-1753.
 *
 * `engine/factionCrests` measures where each emblem lives inside its own file.
 * This converts that art fact into a nudge for THESE two boxes, which is layout
 * and therefore belongs here rather than beside the measurement.
 *
 * ⚠⚠ THE ARITHMETIC. Both boxes fit the emblem BY WIDTH, so the drawn height is
 * `boxWidthFraction × cardWidth × aspect`. To bring a focus at `focusY` to the
 * middle of the window the image must move DOWN by `(0.5 − focusY) × drawnHeight`
 * pixels. The box's `top`/`bottom` are percentages of the CARD'S HEIGHT, and
 * making them asymmetric by `d` while keeping their sum constant moves the image
 * down by exactly `d%` of the card's height without changing the box's size. So
 *     d = 100 × (0.5 − focusY) × aspect × (boxWidthFraction × cardW ÷ cardH)
 * and the trailing ratio is the only part that is not universal — it is the
 * card's own shape. K below is that ratio, measured on the Pixel.
 *
 * ⚠ SO K IS DEVICE-CALIBRATED AND SAYS SO. Percentages of width and percentages
 * of height cannot be linked in RN, so a watermark nudge cannot be made
 * resolution-independent without measuring the card at runtime — which is a
 * layout pass on every row, for a decoration. Calibrating on the phone the owner
 * plays on and writing the formula down is the honest trade; on a tablet the
 * nudge lands short rather than wrong, and the emblem is merely less
 * well-centred, never displaced.
 *
 * ⚠⚠ AND IT COSTS NOTHING AT RENDER. Every style is built ONCE at module load,
 * keyed by faction — nine entries, two each. `DossierField` does a lookup, not a
 * computation, so this adds no per-row work to a FlatList that OTA-1739 fought
 * to keep quiet. */
const TILE_NUDGE_K = 246;   // 42% of a 340dp card, over a ~58dp collapsed tile
const OPEN_NUDGE_K = 129;   // 76% of a 340dp card, over a ~200dp expanded card

/** Recentre the window on the artwork's own focus, in % of the card's height. */
function fieldNudge(k: number, art: CrestArt | undefined): number {
  if (!art) return 0;                                   // no measurement, no guess
  return Math.round(k * (0.5 - art.focusY) * art.aspect);
}

/* ⚠ The two resting boxes. `dossierField` / `dossierFieldCompact` in the
 * StyleSheet below hold everything a nudge does NOT touch; these constants are
 * the vertical extents the nudge splits. Kept beside the formula so the pair
 * cannot drift apart. */
const TILE_SPREAD = 250;    // top/bottom of the collapsed tile's box
const OPEN_SPREAD = 80;     // top/bottom of the expanded card's box

type FieldStyles = { compact: ImageStyle; open: ImageStyle };
const FIELD_STYLES: Record<string, FieldStyles> = {};
for (const id of crestFactionIds()) {
  const art = crestArt(id);
  const dTile = fieldNudge(TILE_NUDGE_K, art);
  const dOpen = fieldNudge(OPEN_NUDGE_K, art);
  FIELD_STYLES[id] = {
    // a POSITIVE nudge moves the emblem down: less inset above, more below.
    compact: { top: `${-(TILE_SPREAD - dTile)}%`, bottom: `${-(TILE_SPREAD + dTile)}%` },
    open: { top: `${-(OPEN_SPREAD - dOpen)}%`, bottom: `${-(OPEN_SPREAD + dOpen)}%` },
  };
}

/* ⚠⚠⚠ THE FACTION FIELD — ONE TREATMENT, EVERY CARD, EACH ITS OWN EMBLEM.
 *
 * VIS-3 (OTA-1746) printed a Tartarian's faction art into the record's ground:
 * the canonical `assets/crests/<factionId>.png`, dramatically oversized and
 * cropped by the card's own edges — a ghosted fragment embedded in the plate
 * rather than a logo placed on it. OTA-1747 put it on both card states, and
 * OTA-1753 gave each faction its own window onto its own artwork.
 *
 * ⚠⚠ BOTH STATES NOW WEAR THE SAME TREATMENT. They previously did not: the
 * expanded card sat at 0.13 against the tile's 0.22 and fit by a different axis
 * depending on the crest, so beside a tile it read as absent — which is what the
 * owner saw when he asked for the image "in both". They now share the alpha, the
 * fit axis and the focus table, and differ only in the box each surface has room
 * for. A tile is a 58dp strip; a record is four times that.
 *
 * ⚠ WHAT IT REFUSES TO DO. A faction the game ships no art for renders NOTHING —
 * no placeholder, no substitute emblem, no generic mark, and no borrowed offset.
 * `pointerEvents="none"` throughout, so the tap, the second tap that loads, the
 * swipe-to-delete and the scroll all pass straight through. `contain` always:
 * the emblem is cropped by its container and NEVER stretched.
 *
 * ⚠ AND IT IS FREE. On an expanded card this is the same `source` as the riveted
 * seal plate above it, so RN decodes the asset once and both draw from one cache
 * entry. No animation, no measurement, no state, no subscription. */
function DossierField({
  crest, factionId, compact = false,
}: { crest: number | undefined; factionId?: string; compact?: boolean }) {
  if (crest === undefined) return null;
  const tuned = factionId ? FIELD_STYLES[factionId] : undefined;
  return (
    <View style={styles.dossierFieldClip} pointerEvents="none">
      <Image
        source={crest}
        style={compact
          ? [styles.dossierFieldCompact, tuned?.compact]
          : [styles.dossierField, tuned?.open]}
        resizeMode="contain"
      />
    </View>
  );
}

export function TitleScreen() {
  // The title screen renders directly on the player's tuned background (the
  // container is transparent), so the muted secondary text washed out when a
  // player picked a light/bright bg — same problem the inventory legend had.
  // Reuse the exact auto-contrast tone so this text stays readable on ANY bg.
  const mutedColor = useReadableMuted();
  const slots = useGameStore((s) => s.slots);
  const setScreen = useGameStore((s) => s.setScreen);
  const refreshSlots = useGameStore((s) => s.refreshSlots);
  const loadSlotIntoGame = useGameStore((s) => s.loadSlotIntoGame);
  const slotLoadError = useGameStore((s) => s.slotLoadError);
  const clearSlotLoadError = useGameStore((s) => s.clearSlotLoadError);
  const deleteSlotById = useGameStore((s) => s.deleteSlotById);
  // arb38 — slots that crashed the app on load last session. Tapping
  // one opens the recovery modal (Retry / Delete) instead of re-running
  // the crashing load.
  const crashedSlotIds = useGameStore((s) => s.crashedSlotIds);
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
    // ⚠ PHONE-FIX — `restored` went with RESTORE (Settings owns that outcome
    // now). `restoreFailed` STAYS: it is also what the dead rows' BACK UP
    // button reports through, which is its only remaining producer here, so it
    // is titled for what it actually says now.
    | { kind: 'restoreFailed'; reason: string }
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
  // OTA-294 — gate the CHECK FOR OTA UPDATE button on model readiness.
  // Player insight: killing the app mid-Qwen-load or mid-Kokoro-load
  // leaves partial cache files on disk, which the next launch tries to
  // use and crashes on. The OTA apply path's teardown also tears down
  // models mid-init, leaving the same corrupt state. Lock the button
  // until both are 'ready' so the player physically can't trigger
  // OTA-apply during the danger window.
  const qwenStatus = useGameStore((s) => s.qwenStatus);
  const qwenFraction = useGameStore((s) => s.qwenFraction);
  // OTA-405 — GATE A + GATE B inputs. otaBootResolved (Gate A): the boot OTA
  // check has resolved to "staying on this bundle," so loading a save can't be
  // caught by an imminent reloadAsync. cognitiveStatus (Gate B): the MiniLM
  // classifier — the small, fast model the gameplay actually needs from turn
  // one for target resolution. We gate on the CLASSIFIER, not the heavy mind
  // (Qwen) or voice (Kokoro): those keep warming in the background and the
  // engine's dispatch guards (qwen.isReady() / cognitiveStatus==='ready')
  // make playing through their warm-up crash-safe, so waiting on them would
  // only hurt load times for no safety gain.
  const otaBootResolved = useGameStore((s) => s.otaBootResolved);
  const cognitiveStatus = useGameStore((s) => s.cognitiveStatus);
  const [kokoroPhase, setKokoroPhase] = useState<KokoroState>(() => getKokoroState());
  useEffect(() => onKokoroStateChange(setKokoroPhase), []);
  // ⚠⚠ OTA-1294 — THE SLOT LIST REFRESHES EVERY TIME THIS SCREEN APPEARS. It
  // used to be a BOOT-TIME SNAPSHOT: filled at hydrate, re-read only on
  // pull-to-refresh, restore, or delete. A character created THIS session was
  // not in it — so when the lore trapdoor (OTA-1292) threw the owner onto the
  // title mid-game, the select showed no character at all and read as a wipe.
  // His own diagnosis, verbatim: "my character selection screen really wasn't
  // a character selection screen. it was a hallucination and it hadn't saved
  // and updated in that aspect so it didn't see the character which was still
  // live." The character was on disk the whole time (the relaunch proved it:
  // "Welcome back, Francis"); the screen just never re-looked. Now it does.
  useEffect(() => { void refreshSlots(); }, [refreshSlots]);
  // OTA-471 — the opening splash now lives in <SplashOverlay/> at the AppShell
  // root (full-bleed). The title screen just renders the menu + a compact loading
  // bar (below) if a first-install download is still running.
  const modelsLoading = modelsStillLoading(qwenStatus, kokoroPhase);
  // OTA-468 — the verbose per-engine MIND/VOICE labels were retired with the old
  // loading banner; the splash + compact bar now carry progress as a single fill.
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
  // OTA-1491 — which slot card is expanded to full size (one at a time; null =
  // all compact). Expansion is presentation only: no store read, no load.
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);

  const onSlotTap = (slot: SlotSummary) => {
    // OTA-405 — boot gate (A+B). Don't load a save until the boot OTA check
    // has resolved (no imminent reload) and the classifier has settled (or the
    // cap elapsed). The slot rows render dimmed + show the warm-up hint while
    // this is closed; this is the defensive guard if a tap slips through.
    if (!bootGateOpen) return;
    if (slot.dead) {
      if (resurrectionGems > 0) {
        setPendingAction({ kind: 'resurrect', slot });
      } else {
        setPendingAction({ kind: 'fallen', slot });
      }
      return;
    }
    // arb38 — this character closed the app on load last session. Show
    // the recovery modal BEFORE re-running the crashing load so the
    // player deliberately chooses Retry or Delete instead of hitting an
    // instant re-crash. Retry runs the real load (and clears the flag
    // if it succeeds); Delete removes the bad save for good.
    if (crashedSlotIds.includes(slot.slotId)) {
      setLastTappedSlot(slot);
      useGameStore.setState({
        slotLoadError:
          'This character closed the app the last time it was opened — ' +
          'most likely a save left over from a previous version of the build. ' +
          'Your other characters are not affected.',
      });
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
  // OTA-1178 — per-row "✓ BACKED UP" flash, same cadence as COPIED / SHARED.
  const [backedUpSlotId, setBackedUpSlotId] = useState<string | null>(null);
  // OTA-063 — bug-report modal state. Open via the REPORT BUG button
  // on the bottom bar. On send, build the full report (description +
  // device summary + slot log), stage it on the clipboard, then open
  // mailto so the player's email app composes a new message to
  // hotatticgames@gmail.com. The brief flash on the bottom bar
  // confirms the clipboard was populated.
  // ⚠ PHONE-FIX — the bug-report and invite state went to Settings with their
  // buttons; nothing on this screen reads them any more.
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

  // OTA-405 — OPTIONAL "apply now" for a staged update (full safe teardown
  // + reloadAsync). A downloaded-but-unapplied bundle ALREADY applies on its
  // own the next time the app is opened (expo-updates `checkAutomatically:
  // ON_LOAD` loads the newest fetched bundle at the next launch, where the
  // boot-front sequence applies it BEFORE any native module starts — the
  // clean path). So this tap is just a "skip the wait, apply right now"
  // shortcut, not a requirement.
  //
  // OTA-405 SUPERSEDES OTA-404's automatic mid-session reload: that auto-fire
  // was reverted. Reloading mid-session — even gated on a settled Qwen — is
  // the exact risk class OTA-234 hit (teardown racing native handles), and it
  // buys nothing now that the next-launch apply is automatic and lands through
  // the safe boot-front path. We keep ONLY the user-initiated tap.
  const applyPendingOTA = useCallback(() => {
    setApplyingOTA('Preparing…');
    void checkAndApplyOTA({
      skipFetch: true,
      onStatus: (s) => setApplyingOTA(s),
      onError: (msg) => {
        setApplyingOTA(null);
        // Leave pendingOTAUpdate set — the banner stays visible so the
        // player can tap again to retry. Pre-OTA-047 the flag was cleared
        // here, which hid the banner and forced a full app relaunch.
        useGameStore.setState({ slotLoadError: `Update failed: ${msg}\n\nTap APPLY NOW again to retry, or just restart the app.` });
      },
    });
  }, []);

  // OTA-405 — GATE B readiness cap. The character-entry gate (below) holds
  // load/create until the classifier (MiniLM) reaches a TERMINAL state OR
  // this cap elapses, whichever is first. The cap guarantees a slow /
  // offline / weird-status device is never locked out for more than a few
  // seconds — the heavy generative model + voice are NEVER waited on (they
  // load in the background and the engine's dispatch guards make playing
  // through their warm-up crash-safe).
  const [bootGateCapReached, setBootGateCapReached] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBootGateCapReached(true), 5000);
    return () => clearTimeout(t);
  }, []);

  // OTA-405 — the combined boot gate. Character load / create is held until:
  //   GATE A — the boot OTA check has resolved (otaBootResolved), AND
  //   GATE B — the classifier has reached a TERMINAL state ('ready' / 'failed'
  //            / 'skipped'), OR the safety cap elapsed.
  // 'idle' / 'downloading' / a mid-load BootStage all keep it closed, so a
  // player can't act before the classifier has even tried to come up — but the
  // cap guarantees release within a few seconds no matter what (slow / offline
  // / unexpected status), and a DISABLED device reports 'skipped' immediately
  // (App.tsx OTA-405) so it never waits at all.
  const classifierSettled =
    cognitiveStatus === 'ready' || cognitiveStatus === 'failed' || cognitiveStatus === 'skipped';
  const bootGateOpen = otaBootResolved && (classifierSettled || bootGateCapReached);
  // What's still pending, for the locked-state hint copy.
  const bootGateReason = !otaBootResolved
    ? 'Checking for updates…'
    : 'Waking the Arbiter…';
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

  // ⚠⚠ OTA-1178 — BACK UP A CHARACTER. The owner reinstalled to clear a memory
  // kill on 2026-08-08 and the character was gone for good: every save lives in
  // AsyncStorage, which iOS deletes with the app, and nothing anywhere held a
  // copy. OTA-344's atomic writes and OTA-395's trimming protect a save from
  // processes; neither protects it from the phone.
  //
  // ⚠ SHARE FIRST, CLIPBOARD SECOND, and that order is from this app's own scar
  // tissue. A save runs far past the 25,000 characters at which TitleScreen
  // already chunks dead-character logs because "most chat clients silently
  // truncate larger pastes" (OTA-023), and Share exists here precisely to bypass
  // that (OTA-006/215). The clipboard copy still happens so a short save can be
  // pasted straight into a note, but the share sheet is what opens.
  // OTA-1208 — the encode/share body moved to app/ui/backupCharacter.ts so
  // Settings → RUN (the living character's door now) and this screen (the dead
  // rows' only door) cannot drift apart.
  const backUpSlot = async (slot: SlotSummary) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { backUpCharacterSlot } = require('../ui/backupCharacter') as typeof import('../ui/backupCharacter');
    const result = await backUpCharacterSlot(slot);
    if (result === 'ok') {
      setBackedUpSlotId(slot.slotId);
      setTimeout(() => setBackedUpSlotId((cur) => (cur === slot.slotId ? null : cur)), 2000);
    } else if (result === 'unreadable') {
      setPendingAction({ kind: 'restoreFailed', reason: `${slot.playerName}'s save could not be read from storage.` });
    } else {
      setPendingAction({ kind: 'restoreFailed', reason: 'The backup could not be created.' });
    }
  };

  /* ⚠⚠⚠ PHONE-FIX — THE BUG-REPORT HANDLER LEFT WITH ITS BUTTON.
   *
   * `sendBugReport`, `BugReportModal`, the outcome note and the outcome popup
   * all lived here to serve a REPORT BUG button in the title-screen footer, and
   * the owner has taken that button off this surface. Settings already files
   * the IDENTICAL report through the same shared helper
   * (`diagnostics/bugReport.composeAndSendBugReport`) — and files it better,
   * because in there the app knows which character is being played and can send
   * that character's log rather than the newest save's. Deleting the copy here
   * removes a second call site, not a capability.
   *
   * ⚠ `_legacySendBugReport` was deleted at OTA-1665 and does not come back. */

  // ⚠ PHONE-FIX — `sendPlaytesterInvite` moved to Settings with its button.
  // It is still a mailto, and should be: a short human request to a person is
  // not a payload (OTA-1665's own distinction).

  // ⚠⚠ OTA-1491 — TWO-STAGE SLOT CARDS. Owner: "shrink the character blocks on
  // the character selection screen to a block that just has the name and the
  // status line … when they tap on it it opens to the full size block and they
  // can then select that player." So a COLLAPSED card shows the name row and
  // the same bottom status line the full card ends on (the resume objective,
  // or the HP line when a save predates objectives); the FIRST tap expands it
  // in place; the SECOND tap — on the full card — is what loads. One card
  // expanded at a time; expanding one collapses the last. Swipe-to-delete
  // works in both states (SwipeableRow wraps both).
  const renderItem = ({ item }: { item: SlotSummary }) => {
    /* ⚠⚠⚠ OTA-1749 — `summaryFactionId`, NOT `item.factionId`, AND THAT WAS THE
       "SPORADIC" BUG. Owner, on the device: the faded emblem shows on some cards
       and not others. It was never sporadic — `SlotSummary.factionId` is
       OPTIONAL and is written into the index at SAVE time (since OTA-036), so a
       character not saved since then has a summary with no faction on it, and
       this row drew nothing while the row beside it drew correctly. The id is
       recoverable for free: `characterSeed` IS `name|raceId|factionId|<created>`
       (OTA-1311), so the helper reads it back out of the encoding its own
       `characterSeedOf` writes. No save migration, no extra disk read.
       ⚠ This also repairs the FACTION PLATE on the expanded card, which has had
       the identical hole since VIS-1 and nobody had connected the two.
       ⚠ VIS-3 / OTA-1747 — hoisted out of the expanded branch, because BOTH
       states wear the field now. One lookup, one source, either card. */
    const crest = factionCrest(summaryFactionId(item));
    if (expandedSlotId !== item.slotId) {
      /* ⚠⚠⚠ VIS-1 — A RECOVERED RECORD, NOT AN APPLICATION ROW. The collapsed
         dossier keeps exactly the two lines it always showed (name + time, then
         the resume objective or the HP line) and gains the material the rest of
         Tartaria will be built from: an outer drop shadow so the plate sits ON
         the world, a structural rim whose top edge catches light and whose
         bottom falls into shadow, a recessed face, corner registration marks,
         and a left IDENTITY SPINE — the engraved edge of a filed record.
         Compact enough to browse a stack of them, which was the point of the
         two-stage card (OTA-1491) and is unchanged here. */
      return (
        <SwipeableRow onDelete={() => confirmDelete(item)}>
          <TouchableOpacity
            style={[styles.dossierOuter, !bootGateOpen && styles.btnDisabled]}
            onPress={() => setExpandedSlotId(item.slotId)}
            activeOpacity={0.85}
            disabled={!bootGateOpen}
            accessibilityRole="button"
            accessibilityState={{ disabled: !bootGateOpen, expanded: false }}
            accessibilityHint={`Shows ${item.playerName}'s full details`}
          >
            {/* ⚠ VIS-1 — the same TSettle wraps BOTH states, so React keeps one
                instance across the expand and the animation runs on the change
                rather than on a mount that never happens (FlatList reuses the
                row). A collapsed record simply sits at rest. */}
            <TSettle active={false}>
            <View style={[styles.dossierRim, item.dead && styles.dossierRimDead]}>
              <View style={[styles.dossierFace, styles.dossierFaceCompact, item.dead && styles.dossierFaceDead]}>
                <DossierField crest={crest} factionId={summaryFactionId(item)} compact />
                <View style={[styles.spine, item.dead && styles.spineDead]} pointerEvents="none" />
                <View style={[styles.spineTick, { top: '30%' }]} pointerEvents="none" />
                <View style={[styles.spineTick, { top: '70%' }]} pointerEvents="none" />
                <TCorners />
                <View style={styles.dossierBody}>
                  <View style={styles.slotHead}>
                    <View style={styles.slotNameRow}>
                      <Text style={[styles.slotName, item.dead && styles.slotNameDead]} numberOfLines={1}>{item.playerName}</Text>
                      {item.dead && <Text style={styles.deadBadge}>DEAD</Text>}
                    </View>
                    <Text style={styles.slotTime}>{timeAgo(item.savedAt)}</Text>
                  </View>
                  {item.mainQuestPhase ? (
                    <Text style={styles.slotObjective} numberOfLines={1}>
                      {resumeObjectiveLine(
                        item.mainQuestPhase as MainQuestPhase,
                        item.mainQuestCoresRecovered ?? 0,
                      )}
                    </Text>
                  ) : (
                    <Text style={styles.slotMeta}>HP {item.hp}/{item.hpMax}</Text>
                  )}
                </View>
              </View>
            </View>
            </TSettle>
          </TouchableOpacity>
        </SwipeableRow>
      );
    }
    /* ⚠⚠⚠ VIS-1 — THE SELECTED DOSSIER IS THE SCREEN'S VISUAL MOMENT. Same
       tap contract as ever (OTA-1491: first tap expanded it, this second tap
       LOADS it) — what changed is that the plate now lifts: a lit rim, a warmer
       face, a brighter top bevel, a wider gold-lit spine, brighter corner marks,
       a deeper shadow, and an engraved rule under the name. Unselected records
       recede by face tone alone, never by dimming their text.
       ⚠ The whole plate remains the one tap target. Everything added below —
       the faction plate, the ENTER TARTARIA band — is `pointerEvents="none"`, so
       no new layer can intercept the tap, the second tap, the swipe-to-delete
       or the scroll. */
    return (
    <SwipeableRow onDelete={() => confirmDelete(item)}>
      <TouchableOpacity
        style={[styles.dossierOuter, styles.dossierOuterOpen, !bootGateOpen && styles.btnDisabled]}
        onPress={() => onSlotTap(item)}
        activeOpacity={0.9}
        disabled={!bootGateOpen}
        accessibilityRole="button"
        accessibilityState={{ disabled: !bootGateOpen, expanded: true }}
        accessibilityHint={`Loads ${item.playerName}`}
      >
        <TSettle active>
        <View style={[styles.dossierRim, styles.dossierRimOpen, item.dead && styles.dossierRimDead]}>
          <View style={[styles.dossierFace, styles.dossierFaceOpen, item.dead && styles.dossierFaceDead]}>
            <DossierField crest={crest} factionId={summaryFactionId(item)} />
            <View style={[styles.spine, styles.spineOpen, item.dead && styles.spineDead]} pointerEvents="none" />
            <View style={[styles.spineTick, { top: '22%', width: 9 }]} pointerEvents="none" />
            <View style={[styles.spineTick, { top: '50%', width: 9 }]} pointerEvents="none" />
            <View style={[styles.spineTick, { top: '78%', width: 9 }]} pointerEvents="none" />
            <TCorners lit />
            <View style={styles.dossierBody}>
              {/* ⚠ VIS-1 — the record splits into the written column and the
                  seal gutter, so the emblem can never land on top of a name, a
                  wrapped objective or a dead-row button. Layout does the
                  clearing; nothing is absolutely positioned over the text. */}
              <View style={styles.dossierSplit}>
              <View style={styles.dossierMain}>
        <View style={styles.slotHead}>
          <View style={styles.slotNameRow}>
            <Text style={[styles.slotName, styles.slotNameOpen, item.dead && styles.slotNameDead]} numberOfLines={1}>{item.playerName}</Text>
            {item.dead && <Text style={styles.deadBadge}>DEAD</Text>}
          </View>
          <Text style={styles.slotTime}>{timeAgo(item.savedAt)}</Text>
        </View>
        <TRule lit style={styles.dossierNameRule} />
        {/* arb38 — load-crash warning. Surfaces BEFORE the player taps
            so they know this character closed the app last time and a
            tap opens the recovery options rather than the game. */}
        {!item.dead && crashedSlotIds.includes(item.slotId) && (
          <Text style={styles.slotCrashWarn}>
            ⚠ Closed the app last time it opened — tap for recovery (Retry / Delete)
          </Text>
        )}
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
        {/* OTA-707 — golem sub-line (mirrors the dog line). */}
        {item.golemName && (
          <Text style={styles.slotDogLine}>
            └─ {item.golemName} ({item.golemKind ?? 'golem'})
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
        {/* ⚠ OTA-1208 — BACK UP on DEAD rows only (owner: the button on every
            living row "makes the game look broken to testers"). A dead
            character can never be loaded into a session, so this row is its
            ONLY door — the button stays. A LIVING character backs up from
            Settings → RUN, beside SAVE, where the thought actually occurs.
            OTA-1178's rule ("a backup you can only take after the character
            dies is not a backup") still holds — the capability moved rooms,
            it did not narrow. */}
        {item.dead && (
          <View style={styles.deadActions}>
            <TouchableOpacity
              style={styles.shareLogBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                void backUpSlot(item);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Back up ${item.playerName}`}
            >
              <Text style={styles.shareLogText}>
                {backedUpSlotId === item.slotId ? '✓ BACKED UP' : 'BACK UP'}
              </Text>
            </TouchableOpacity>
          </View>
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
              accessibilityRole="button"
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
              accessibilityRole="button"
            >
              <Text style={styles.shareLogText}>
                {sharedSlotId === item.slotId ? '✓ SHARED' : 'SHARE'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
              </View>
              {/* ⚠⚠⚠ VIS-1 — THE EXPANSION REWARD. The Tartarian's canonical
                  faction emblem, stamped on a riveted plate that breaks the
                  record's top-right boundary the way a wax seal sits proud of
                  the paper it closed. It appears ONLY here — never on a
                  collapsed record — which is what makes opening one feel like
                  pulling a file. The art is the game's own
                  `assets/crests/<factionId>.png` (all nine factions have one);
                  a save with no faction, or a faction with no art, renders
                  NOTHING rather than a stand-in. It is inert to touch and lives
                  in its own column, so it cannot cover text or take a tap. */}
              {crest !== undefined && (
                <View style={styles.dossierSeal} pointerEvents="none">
                  {/* ⚠⚠ PHONE-FIX — 58 WAS A THUMBNAIL. On the Pixel the
                      faction could not be read at all, which made the one thing
                      the expansion exists to reveal illegible. 96 makes the
                      emblem the subject of its column while the written record
                      keeps the rest of the width; the art is still the game's
                      own file, drawn with `contain`, so nothing about it changes
                      but its size. */}
                  <TFactionPlate source={crest} size={96} />
                </View>
              )}
              </View>
        {/* ⚠⚠ VIS-1 — THE THRESHOLD. Visual affordance only: the plate itself is
            still the second-tap target (`pointerEvents="none"`), so nothing about
            the load path changes. A dead Tartarian cannot be entered — that tap
            opens the resurrection prompt — so the band says what will actually
            happen instead of promising a door that is not there. */}
        <View style={styles.enterBand} pointerEvents="none">
          <TRule lit />
          <View style={styles.enterRow}>
            <Text style={item.dead ? styles.enterTextDead : styles.enterText}>
              {item.dead ? 'RESURRECT THIS TARTARIAN' : 'ENTER TARTARIA'}
            </Text>
            <Text style={item.dead ? styles.enterChevronDead : styles.enterChevron}>›</Text>
          </View>
        </View>
            </View>
          </View>
        </View>
        </TSettle>
      </TouchableOpacity>
    </SwipeableRow>
    );
  };

  return (
    <View style={styles.container}>
      {/* ⚠ VIS-1 — the buried-world strata: three excavation bands and three
          registration ticks, behind everything, drawing nothing that moves. Each
          is the kit's own engraved rule at ~28% — a hairline of shadow over a
          hairline of light — so it reads faintly on a dark theme AND on a light
          one, and no text depends on it to be legible. */}
      <TStrata />
      {/* ⚠⚠ VIS-1 — THE TITLE PLINTH. The crest was a logo sitting above a list
          of application controls; it is now the head of one composed face. The
          engraved rule under the wordmark is the same ornament every plate below
          uses, which is what binds the two halves of the screen together. */}
      <View style={styles.titleBlock}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.crest}
          resizeMode="contain"
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        />
        <Text style={styles.title} accessibilityRole="header">TARTARIA</Text>
        <View style={styles.subtitleRow}>
          <View style={styles.subtitleRule}><TRule /></View>
          <Text style={styles.subtitle}>REALMS</Text>
          <View style={styles.subtitleRule}><TRule /></View>
        </View>
        <Text style={[styles.flavor, { color: mutedColor }]}>A procedural narrative of the buried world.</Text>
      </View>
      {/* ⚠⚠ VIS-1 — Resurrection Gems are an in-world resource, not an
          application status string. Stamped chit: recessed well, rim, the survey
          diamond as the resource's own mark, count large and name quiet. It sits
          with the roster because that is where it is spent (resurrecting a
          fallen Tartarian), and it is deliberately small — a held resource, not
          a headline. */}
      {resurrectionGems > 0 && (
        <View style={styles.gemsRow}>
          <TResourceChit
            count={resurrectionGems}
            label={`RESURRECTION GEM${resurrectionGems === 1 ? '' : 'S'}`}
          />
        </View>
      )}

      {/* v2.4.1 (OTA 043) — completion badges. Shows the player's
          collection of (faction, ending) combos earned across all
          runs. 9 factions × 3 endings = 27 max badges. */}
      <EndingBadgesRow />

      <KokoroDownloadBanner />

      {/* OTA-294 — DON'T CLOSE THE APP warning during initial model
          loads. Renders when Qwen OR Kokoro is downloading/loading.
          Player insight: killing the app mid-load corrupts cached
          model files, breaking subsequent launches until uninstall+
          reinstall. This banner makes the danger explicit so testers
          don't accidentally interrupt the setup. */}
      {/* OTA-468 — compact loading bar (replaced the verbose MIND/VOICE banner).
          The splash covers the typical load window; if a first-install download
          is still running after the splash, this thin bar carries the progress +
          a short keep-open hint instead of the old wall of text. */}
      {modelsLoading && (() => {
        // ⚠ OTA-1228 — the arithmetic moved to app/ui/modelBootProgress.ts, where a
        // test can reach it. It had a real defect while it lived inline here (Qwen's
        // 'failed'/'skipped' scored 0.1 instead of 1) and that defect was half of the
        // owner's frozen 51%. Inline JSX math is untestable math.
        const pct = modelBootPercent(qwenStatus, qwenFraction, kokoroPhase);
        return (
          <View style={styles.compactLoadWrap}>
            <View style={styles.splashBarTrack}>
              <View style={[styles.splashBarFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.compactLoadLabel}>
              Preparing the Arbiter ({pct}%) — first-time setup, keep the app open
            </Text>
          </View>
        );
      })()}

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
                accessibilityRole="button"
              >
                <Text style={styles.playStoreNagPrimaryText}>OPEN PLAY STORE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playStoreNagDismiss}
                onPress={() => setPlayStoreNagDismissed(true)}
                accessibilityRole="button"
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
              accessibilityRole="button"
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
              accessibilityRole="button"
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
          accessibilityRole="button"
          accessibilityState={{ disabled: applyingOTA !== null }}
          // OTA-405 — the staged bundle applies AUTOMATICALLY the next time
          // the app is opened (expo ON_LOAD → boot-front apply, before any
          // native module starts). So this tap is optional: "apply now"
          // instead of waiting for the next launch. No mid-session auto-reload
          // (that was OTA-404, reverted — it's the OTA-234 risk class).
          onPress={applyPendingOTA}
        >
          <Text style={styles.updateBannerTitle}>
            {applyingOTA
              ? `APPLYING UPDATE — ${applyingOTA.toUpperCase()}`
              : 'UPDATE DOWNLOADED — APPLIES ON NEXT OPEN'}
          </Text>
          <Text style={styles.updateBannerBody}>
            {applyingOTA
              ? 'Tearing down audio + AI handles before the reload. One moment.'
              : 'A new build is ready. It applies automatically the next time you open the app — or tap to apply it now.'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ⚠⚠⚠ PHONE-FIX — THE ROSTER IS THE ONLY THING THAT SCROLLS.
          Owner, on the Pixel: *"it feels like it has double/page scrolling …
          when the character roster is scrolled, the whole lower portion of the
          screen moves with it."* It did: NEW TARTARIAN and the OTA button were
          the FlatList's `ListFooterComponent` and the roster label was its
          `ListHeaderComponent`, so all of it was scroll CONTENT. The label is a
          fixed heading now, the list is data only, and the actions are a fixed
          footer below it — one scroll region on the screen, no nesting. */}
      {slots.length > 0 ? (
        <View style={styles.rosterHeader}>
          <TDivider
            color={mutedColor}
            label={bootGateOpen
              ? 'YOUR TARTARIANS'
              : `${bootGateReason.toUpperCase()}  ·  ONE MOMENT`}
          />
          {bootGateOpen ? (
            <Text style={[styles.listLabel, { color: mutedColor }]}>swipe left to delete</Text>
          ) : null}
        </View>
      ) : null}
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={slots}
        keyExtractor={(s) => s.slotId}
        renderItem={renderItem}
        extraData={expandedSlotId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c9a86a" />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: mutedColor }]}>
            No Tartarians yet. Swipe down to refresh — or pull a New Expedition below.
          </Text>
        }
      />
      <View style={styles.footerActions}>
        {/* ⚠⚠⚠ VIS-1 — THE PRIMARY ACTION. Starting a new Tartarian is the
            one thing this screen exists to offer a player who has nothing to
            resume, so it gets the full treatment — lit rim, raised face, top
            bevel, survey diamonds, gold plate type — and it is the only
            control on the screen that gets it. It DEPRESSES on touch (90ms
            down, 120ms release, transform-only, skipped under reduced
            motion) and it still navigates on the same tap. The gate string
            is unchanged; it just no longer has to be a whole button label to
            be read. */}
        <TButton
          label={bootGateOpen ? 'NEW TARTARIAN' : bootGateReason}
          sub={bootGateOpen ? 'BEGIN A NEW EXPEDITION' : undefined}
          variant="primary"
          disabled={!bootGateOpen}
          onPress={() => setScreen('character_creation')}
        />
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
        {/* ⚠ VIS-1 — utility variant: the same material family (rim, face,
            bevel, depress) at a quieter weight, so it reads as subordinate to
            NEW TARTARIAN without becoming a different design language. */}
        <TButton
          label={applyingOTA
            ?? (modelsLoading ? 'MODELS LOADING — PLEASE WAIT' : 'CHECK FOR OTA UPDATE')}
          variant="utility"
          disabled={applyingOTA !== null || modelsLoading}
          onPress={() => {
            // OTA-294 — should be unreachable because disabled=true
            // when modelsLoading, but guard defensively. Killing
            // OTA apply mid-model-load corrupts the cached GGUF
            // and Kokoro state, requiring uninstall+reinstall.
            if (modelsLoading) {
              setApplyingOTA('Wait for models to finish loading');
              setTimeout(() => setApplyingOTA(null), 2500);
              return;
            }
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
        />
      </View>
      {/* v2.4.1 (OTA 051) — gear icon hoisted to the top-right corner
          for UI uniformity with the in-game ExplorationScreen, which
          places its gear in the same spot. The footer text (version
          + build) stays at the bottom as a quiet diagnostic strip.
          ⚠⚠ OTA-1748 — AND NOW IT IS THE SAME MARK IN THE SAME COLOUR AS THE
          ONE IN EXPLORATION. "UI uniformity" was the stated goal of putting it
          here, but the two were never actually uniform: different glyph sizes,
          and this one gold while the in-game one went ceramic in VIS-3. Ceramic
          is the principled half of that pair — on this project gold marks a live
          obligation or a live process, and a settings key is neither. One
          primitive, one colour, two sizes chosen by the space each sits in. */}
      <TouchableOpacity
        style={styles.cornerGear}
        onPress={() => setScreen('about')}
        activeOpacity={0.7}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <TGear size={20} color={T.ceramic} />
      </TouchableOpacity>
      {/* ⚠⚠⚠ PHONE-FIX — THE UTILITY SEDIMENT IS OFF THE TITLE SCREEN.
          Owner: remove RESTORE FROM BACKUP, EXIT GAME, REPORT BUG and INVITE
          PLAYTESTER. EXIT GAME is DELETED outright — on Android it only
          backgrounds the app, so it was a button that lied about what it did.
          The other three moved to Settings, which is where a player looks for a
          tool rather than for a game: RESTORE beside BACK UP CHARACTER (its own
          partner), INVITE and REPORT beside the reporting section that already
          owns REPORT A BUG. Nothing was deleted except the misleading one.
          ⚠ And the space is NOT refilled. The roster gets it. */}
      <View style={styles.bottomBar}>
        {/* OTA-237 — surface last crash diagnostic if a previous launch
            died. App.tsx's global error handler writes to
            @tartaria/lastCrash on any fatal error or hydrate failure.
            Showing it here gives the player (and the bug report path)
            a concrete signal instead of "nothing happened". Tap to
            clear. */}
        <LastCrashLine />
        {/* OTA-343 — if a crash captured the offending save's bytes,
            offer a one-tap COPY CRASHED SAVE so the exact brick reaches
            the dev for repro — including a corrupt save that can never
            be loaded (and so can never be reached by COPY SAVE). */}
        <CopyCrashedSaveLine />
        {/* OTA-377 — the trailing "2148" is the in-world year (Tartaria's
            "Present Day" — see data/events/timeline.json), not a build
            number. Labelled "Year 2148" so it no longer reads like one. */}
        {/* ⚠⚠ VIS-1 — THE META ROW. Build identity, app version and the
            in-world year are all diagnostics, and they now read as one quiet
            strip at the foot of the screen instead of the build line shouting
            from under the crest. Nothing about what any of them SAY changed —
            the build mapping below is byte-for-byte the arb132/OTA-1228 one,
            moved. */}
        <View style={styles.metaRow}>
        {(() => {
          // arb132 — build-line marker (VIS-1 moved it from under the crest to
          // the meta row; the mapping below is unchanged), so the
          // side-by-side installs are instantly distinguishable. Derived from the
          // App ID (correct regardless of OTA-channel state) and mapped PER LINE,
          // since each line is now its own package: .arbiters → ARBITER,
          // .golem → GOLEM, .engine → ENGINE, base (.tartarprim) → TARTARIA.
          // (Previously everything that wasn't .arbiters fell through to "GOLEM",
          // so the HaL / Tartaria build mislabeled itself as GOLEM.)
          // ⚠ OTA-1228 — THE DESKTOP LINE NEEDS ITS OWN NAME. Owner, on the PC
          // build: *"this says Tartaria Build, that's HAL — this should be Steam
          // Beta Build."* Right, and the reason it said TARTARIA is that the
          // mapping above reads `Application.applicationId`, which on desktop is
          // the empty string (the owner's copied diagnostic: `App ID: (unknown)`).
          // Every unrecognised id fell through to the base label, so the PC build
          // claimed to be the phone build. Platform is checked FIRST because it is
          // the one fact desktop actually knows about itself.
          const appId = Application.applicationId ?? '';
          const isSteam = Platform.OS === 'web';
          const isArb = !isSteam && appId.endsWith('.arbiters');
          const isGolem = !isSteam && appId.endsWith('.golem');
          const isEngine = !isSteam && appId.endsWith('.engine');
          const buildLine = isSteam ? '⟁ STEAM BETA BUILD'
            : isArb ? '⟁ ARBITER BUILD'
            : isGolem ? '⟁ GOLEM BUILD'
            : isEngine ? '⟁ ENGINE BUILD'
            : '⟁ TARTARIA BUILD';
          const buildColor = isSteam ? '#d08bd0' : isArb ? '#7ec8e3' : isEngine ? '#9ec96a' : '#c9a86a';
          // ⚠ VIS-1 — the line itself is unchanged; only where it sits moved.
          return (
            <Text style={[styles.buildMarker, { color: buildColor }]}>
              {buildLine}
            </Text>
          );
        })()}
          <Text style={[styles.footer, { color: mutedColor }]}>v{APP_VERSION}  ·  Year 2148</Text>
        </View>
      </View>

      <BrandedModal
        visible={pendingAction !== null}
        title={
          pendingAction?.kind === 'delete' ? 'Delete Tartarian'
          : pendingAction?.kind === 'resurrect' ? 'Resurrect Tartarian'
          : pendingAction?.kind === 'fallen' ? 'Fallen'
          : pendingAction?.kind === 'restoreFailed' ? 'That did not work'
          : ''
        }
        body={
          pendingAction?.kind === 'delete'
            ? `${pendingAction.slot.playerName} will be lost to the buried world. This cannot be undone.`
          : pendingAction?.kind === 'resurrect'
            ? `${pendingAction.slot.playerName} has fallen. Spend 1 Resurrection Gem (you hold ${resurrectionGems}) to bring them back?`
          : pendingAction?.kind === 'fallen'
            ? `${pendingAction.slot.playerName} has fallen and you hold no Resurrection Gems. The buried world keeps them for now.`
          : pendingAction?.kind === 'restoreFailed'
            ? pendingAction.reason
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
  // OTA-468/471 — compact on-menu loading bar (replaced the verbose MIND/VOICE
  // banner). The full opening splash now lives in <SplashOverlay/> at the AppShell
  // root; only the thin track/fill are reused here for the menu's download bar.
  splashBarTrack: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  splashBarFill: { height: '100%', borderRadius: 2, backgroundColor: '#c9a86a' },
  compactLoadWrap: { width: '100%', marginVertical: 10, alignItems: 'center' },
  compactLoadLabel: { marginTop: 6, color: '#9a8f78', fontSize: 10, letterSpacing: 1, textAlign: 'center' },
  // OTA-275 — width cap for tablets. Phones (<600pt wide) render
  // unchanged. iPad portrait (744-1024pt) + landscape (1024-1366pt)
  // get the layout centered at 600pt instead of edge-to-edge buttons.
  container: { flex: 1, backgroundColor: 'transparent', padding: 16, paddingTop: 24, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  crest: { width: 180, height: 180, alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 36, color: '#e6d8b3', letterSpacing: 8, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#c9a86a', letterSpacing: 14, marginTop: -4, textAlign: 'center' },
  flavor: { color: '#a2977b', fontSize: 12, marginTop: 10, fontStyle: 'italic', textAlign: 'center', marginBottom: 14 },
  list: { flex: 1 },
  listContent: { paddingVertical: 4 },
  listLabel: { color: '#a2977b', fontSize: 10, letterSpacing: 2, marginBottom: 6 },

  // ══════════════════════════════════════════════════════════════════════════
  // ⚠⚠⚠ VIS-1 — THE TARTARIA MATERIAL, AS USED BY THIS SCREEN.
  // The shapes live in app/ui/tartariaKit.tsx; these are the screen-local
  // measurements that place them. Every colour here is a NEUTRAL grey-black or
  // a warm metal — nothing is keyed to a hue — because the player owns the
  // background colour (displaySettings bgHue/bgSat/bgLight) and this language
  // has to sit on olive, purple, blue or slate without being redesigned.
  // ══════════════════════════════════════════════════════════════════════════
  titleBlock: { marginBottom: 6 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  subtitleRule: { flex: 1 },
  gemsRow: { alignItems: 'center', marginBottom: 10 },
  rosterHeader: { marginBottom: 8 },
  metaRow: { alignItems: 'center', marginTop: 6 },

  // A RECORD, IN LAYERS — outer shadow, structural rim, recessed face, then
  // content. The rim's top border is lighter than its sides and its bottom is
  // near-black: that one asymmetry is what stops these reading as a rectangle
  // with a border, and it is repeated by every control in the kit.
  /* ⚠⚠⚠ PHONE-FIX — NO `elevation` ON A RECORD, AND THAT IS DELIBERATE.
   * Android's elevation shadow is drawn on EVERY side and ignores
   * `shadowOffset`, so it paints a dark halo ABOVE the plate as well as below —
   * a second, unintended line sitting directly on top of the gold rim the card
   * is supposed to be defined by. That is the belt half of the black-line fix
   * (the buckle is TSettle's resting pose; see tartariaKit). The iOS shadow
   * props stay because they DO respect the offset and only fall downward.
   * ⚠ NOTHING IS LOST ON ANDROID: the depth here was never the drop shadow, it
   * is the rim — top edge lit, bottom edge near-black — over a recessed face,
   * which is the construction the whole kit is built on. */
  dossierOuter: {
    marginVertical: 3,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  dossierOuterOpen: {
    shadowOpacity: 0.62,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 6 },
  },
  /* ⚠⚠ PHONE-FIX — A RECORD AT REST IS ALLOY. Owner: keep steering away from
   * medieval/bronze. An unselected record is a machined plate under a dead
   * coating — cool grey rim, light on the top edge, near-black at the bottom —
   * and the warm gold is saved for the one that is SELECTED. That contrast is
   * what makes the gold read as "this one is live" rather than as decoration,
   * which is the difference between recovered technology and a treasure chest. */
  dossierRim: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: T.rim,
    borderTopColor: T.rimAlloy,
    borderBottomColor: '#0D0E0E',
    backgroundColor: '#232527',
    padding: 1,
  },
  dossierRimOpen: { borderColor: T.rimLit, borderTopColor: '#B08F55', borderBottomColor: '#1E170F', backgroundColor: '#443925' },
  dossierRimDead: { borderColor: T.rustRim, borderTopColor: '#7A3B34', borderBottomColor: '#170C0A', backgroundColor: '#33201D' },
  dossierFace: { borderRadius: 3, backgroundColor: T.face, borderTopWidth: 1, borderTopColor: T.edgeLit },
  // The selected record is not "the same card with a different border": the
  // face itself warms and lifts, the top bevel brightens, and the shadow above
  // deepens. An unselected record recedes by TONE — its text never dims.
  dossierFaceOpen: { backgroundColor: T.faceLit, borderTopColor: 'rgba(214,190,140,0.36)' },
  dossierFaceDead: { backgroundColor: 'rgba(26,13,11,0.82)' },
  // ⚠ A record at rest catches LESS light than the base plate, and a selected
  // one catches more: three values on one edge is the whole hierarchy, and it
  // is why a stack of records reads calmly instead of as a row of buttons.
  dossierFaceCompact: { borderTopColor: 'rgba(214,190,140,0.12)' },
  dossierBody: { paddingVertical: 9, paddingLeft: 14, paddingRight: 12 },
  dossierSplit: { flexDirection: 'row', alignItems: 'flex-start' },
  dossierMain: { flex: 1, minWidth: 0 },
  dossierSeal: { marginLeft: 10, marginTop: -13, marginRight: -13 },
  /* ⚠⚠ VIS-3 — the faction field. Anchored to the right edge and taller than
   * the record so it bleeds off top and bottom: the art is a PRINT on the file,
   * not a picture centred in a box, and cropping is what makes it read that way.
   * ⚠ `left: '32%'` keeps it clear of the written column even before opacity —
   * at this weight the name and the objective are never composited over more
   * than the emblem's outer edge, so no text loses contrast on any theme. */
  dossierFieldClip: { ...StyleSheet.absoluteFillObject, borderRadius: 3, overflow: 'hidden' },
  /* ⚠⚠⚠ OTA-1754 — ONE COLUMN, ON THE RIGHT, BOTH CARDS.
   * Owner: *"if we can get the column on the far right we are done, especially
   * if it is on the expanded and collapsed character tiles."*
   * The two cards had never shared a column. The tile was walked LEFT over three
   * passes to a centre of 38%; the expanded card stayed where VIS-3 first put
   * it, centre 70% with 8% of the emblem hanging off the right border. Two cards
   * for the same character, two different places to look.
   * ⚠⚠ AND "TOO FAR RIGHT" NEVER MEANT "MOVE IT LEFT". Re-read against this: the
   * complaint was that the emblem RAN OFF the right edge, so only a sliver of it
   * was on the card. The answer was to contain it at the right, not to march it
   * across to the left — which is what OTA-1751 and OTA-1752 did, twice, on a
   * misreading I should have checked rather than inferred.
   * So both cards anchor to the SAME RIGHT EDGE — a 3% margin, so the column
   * never touches the rim and its whole width is on the card.
   * ⚠ The widths differ, 42% on the tile and 62% on the record, and that is
   * arithmetic rather than inconsistency: `contain` fits by width, so the box's
   * width IS the emblem's size. 42% of the card makes an emblem ~3x a 58dp
   * tile's height (a cropped fragment) but under 0.9x a 200dp record's (a
   * complete logo). The record needs the wider box to stay a fragment — and it
   * has to clear the SQUAREST crest, not the average: at 52% the tall crests
   * cropped and mud_monarchs, which is 1254x1254, did not. Anchored to one edge
   * they read as one column; matched in width they would not.
   * ⚠ The vertical spread (-80%) keeps every crest fitting by WIDTH, which is
   * what makes the placement exact and the per-faction focus nudge meaningful
   * (OTA-1753). At 52% of the card's width the emblem is still taller than the
   * record, so it stays a cropped fragment rather than a logo. */
  dossierField: { position: 'absolute', top: '-80%', bottom: '-80%', right: '3%', left: '35%', opacity: 0.2 },
  /* ⚠⚠⚠ THE COLLAPSED CARD NEEDS DIFFERENT NUMBERS TO GET THE SAME LOOK — AND
   * OTA-1747 GOT THEM WRONG IN THE OTHER DIRECTION. Recorded because the error
   * is instructive and I would otherwise repeat it.
   *
   * `contain` scales the emblem until the first axis runs out. Fitting by WIDTH
   * is right — it fixes the emblem's width as an exact fraction of the tile on
   * every screen size, with no centring slack, so placement is deterministic.
   * What I got wrong was the SIZE OF THE BOX. At 76% of the tile's width the
   * emblem came out 5.3x THE TILE'S HEIGHT, so barely a fifth of it ever fell
   * inside the card: what the owner saw on the device was a thin diagonal
   * splinter, different on every crest, and mostly off the right edge. I had
   * optimised for "oversized and cropped" and overshot into "invisible".
   *
   * ⚠⚠ SMALLER BOX = SHORTER EMBLEM = MORE OF IT VISIBLE. At 42% of the tile's
   * width the emblem is ~3x the tile's height instead of 5.3x, so a THIRD of it
   * shows rather than a fifth, and the whole of its width sits inside the card
   * instead of running off the edge. Measured, phone and tablet cap:
   *     BEFORE  76% wide, 5.3x tall, 19% of the emblem visible
   *     AFTER   42% wide, 3.0x tall, 34% of the emblem visible
   * It covers 42% of the tile — comfortably past the owner's one-third floor —
   * and it covers the SAME 42% whichever crest it is, which is the answer to
   * "some designs are smaller than others": fitting by width makes every emblem
   * exactly as wide, and only the amount of its HEIGHT on show varies with the
   * artwork's own aspect (the nine run 1.00 to 1.20).
   *
   * ⚠ `top`/`bottom` are deliberately far larger than the emblem needs. They are
   * not the emblem's size — they only have to be tall enough that the fit stays
   * on the WIDTH axis at the 600dp tablet width, where the box is wider and so
   * the emblem would otherwise be taller than the box. Excess is inert slack.
   *
   * ⚠ It sits from 40% to 82% of the tile, which clears the name column and
   * stops short of the timestamp. */
  /* ⚠⚠⚠ OTA-1754 — THE TILE JOINS THE RECORD'S COLUMN, ON THE RIGHT.
   * This is the same 45%-to-97% band the expanded card now uses, so a character
   * wears its emblem in one place whichever state its card is in.
   * ⚠⚠ IT REVERSES OTA-1751 AND OTA-1752, AND THE REASON IS WORTH KEEPING. The
   * owner said the emblems sat "too far to the right"; I read that as "move them
   * left" and moved them twice — first to the geometric centre, then past it to
   * 38%. What he meant was that the emblem was running OFF the right edge, so
   * only a sliver of it was on the card. Containing it at the right was the fix
   * all along. The two passes were not wasted — they are what produced the
   * coverage floor, the contrast arithmetic and the focus table this column
   * rests on — but the direction was mine, not his, and I should have shown a
   * picture and asked rather than inferred it from four words.
   * ⚠ 42% wide: past the one-third floor from OTA-1750, and at ~3x the tile's
   * height still a fragment cropped top and bottom. A wider column would make
   * the emblem TALLER and therefore show LESS of it — the trap OTA-1750
   * documented, which is why this is not simply widened to match the record. */
  dossierFieldCompact: { position: 'absolute', top: '-250%', bottom: '-250%', right: '3%', left: '55%', opacity: 0.22 },
  dossierNameRule: { marginTop: 6, marginBottom: 6 },
  /* ⚠ PHONE-FIX — INDEX TICKS: three hairlines machined across the spine, the
   * way a real filed plate carries a position mark. Fine technical engraving is
   * the note the owner asked for ("precise ancient alloys ... geometric/glyph
   * markings"), and it costs three static Views that never move. */
  spineTick: { position: 'absolute', left: 0, width: 7, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.65)' },
  // THE IDENTITY SPINE — the engraved edge of a filed record, and the only
  // vertical the eye can use to line a stack of them up.
  // ⚠ PHONE-FIX — the resting spine is alloy; only the selected one is gold.
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: T.rimAlloy, opacity: 0.75 },
  spineOpen: { width: 5, backgroundColor: T.gold, opacity: 1 },
  spineDead: { backgroundColor: '#8A473C', opacity: 0.8 },
  slotNameOpen: { fontSize: 18, letterSpacing: 0.5 },
  // THE THRESHOLD — the second tap's affordance. pointerEvents="none" in the
  // JSX, so it is a label on the door, never the door itself.
  enterBand: { marginTop: 10 },
  enterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  enterText: { color: T.gold, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  enterTextDead: { color: T.rust, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  enterChevron: { color: T.gold, fontSize: 18, fontWeight: '800' },
  enterChevronDead: { color: T.rust, fontSize: 18, fontWeight: '800' },
  empty: { color: '#a2977b', fontStyle: 'italic', fontSize: 12, textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  // ⚠ VIS-1 — `slot` / `slotDead` / `slotCompact` DELETED. They were the whole
  // record: one background, one border, one radius. The layered construction
  // above replaced them; leaving the flat originals behind is how a screen ends
  // up with two visual languages and no way to tell which one is live.
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
  slotTime: { color: '#a2977b', fontSize: 11 },
  slotMeta: { color: '#a2977b', fontSize: 12, marginTop: 2 },
  // v2.4.1 (OTA 036) — RESUME OBJECTIVE line on each slot card.
  // Warm-gold to distinguish from the gray meta rows + signal it's
  // the main-quest beat.
  slotObjective: { color: '#c9a86a', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  // OTA-120 Phase 5 — dog sub-line styling.
  slotDogLine: { color: '#c9a86a', fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  // arb38 — amber load-crash warning on a flagged slot tile.
  slotCrashWarn: { color: '#d8923c', fontSize: 11, marginTop: 3, fontWeight: '600' },
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
  // ⚠ VIS-1 — `gems` DELETED: the count is a stamped chit (TResourceChit) now,
  // not a sentence. arb132's build-line marker keeps its words and its colours
  // and loses its prominence — it reads at the foot of the screen, in the meta
  // row, not under the crest.
  buildMarker: { fontSize: 10, fontWeight: '800', textAlign: 'center', letterSpacing: 3, marginBottom: 3 },
  // v2.4.1 (OTA 043) — completion-badges row styles.
  badgesContainer: { marginBottom: 8, paddingHorizontal: 8 },
  badgesTag: { color: '#a2977b', fontSize: 10, letterSpacing: 2, textAlign: 'center', marginBottom: 6 },
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
  // OTA-294 — "getting things ready" loading banner. Amber/orange accent
  // (#c9892f outline, #2a1e0c fill, #f0a740 title) so it reads as a calm
  // "heads up, this is normal" notice rather than a red error/danger
  // alert. Sized like the updateBanner so it sits flush with the rest of
  // the title-screen banner stack.
  modelLoadingBanner: {
    backgroundColor: '#2a1e0c',
    borderColor: '#c9892f',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  modelLoadingBannerTitle: {
    color: '#f0a740',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '800',
    textAlign: 'center',
  },
  modelLoadingBannerBody: {
    color: '#cdbf99',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 15,
  },
  // Live per-engine progress rows (real download %, "finishing…" during
  // the no-progress compile step, "ready ✓" when done).
  modelLoadingRows: {
    marginTop: 8,
    marginBottom: 2,
    paddingHorizontal: 28,
    gap: 3,
  },
  modelLoadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelLoadingRowLabel: {
    color: '#cdbf99',
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  modelLoadingRowValue: {
    color: '#f0a740',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  modelLoadingRowValueDone: {
    color: '#9ec96a',
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
    color: '#a2977b',
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
  // ⚠⚠ VIS-1 SUPERSEDES OTA-1445's METRIC RULE — and keeps its ORDER rule.
  // OTA-1445's owner instruction was "all of them the same thickness ... rank
  // shows in colour, not in size", decided when all three were the same flat
  // rectangle and the lead one being taller just looked misaligned. VIS-1's
  // instruction is the opposite for a different reason: NEW TARTARIAN "should
  // become the strongest standalone action on the screen ... full primary
  // treatment", with OTA and RESTORE as its subordinate utility family. Rank now
  // reads in MATERIAL — lit rim, raised face, bevel, plate type, survey diamonds
  // — of which height is one part. The ORDER OTA-1445 fixed (new first, OTA
  // second, restore third) is untouched and still pinned.
  // primaryBtn / primaryBtnText / secondaryBtn / secondaryBtnText DELETED:
  // the three buttons are <TButton variant="primary" | "utility"> now, so their
  // material lives in app/ui/tartariaKit.tsx where every screen can reach it.
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
  // ⚠ PHONE-FIX — exitBtn / bottomBtnRow / bugReportBtn / inviteBtn and their
  // text styles are DELETED. Four bespoke bordered pills in four accent colours
  // (red, amber, cool blue) is the sediment the owner asked to clear: three of
  // those controls moved to Settings, where they wear Settings' own buttons, and
  // EXIT GAME went altogether. Deleting the styles is what stops them growing
  // back the next time somebody needs "a small button on the title screen".
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
  // OTA-068 — footer now centered (was left-aligned with a
  // small marginLeft) so it sits under the centered action row
  // and thank-you message as the third centered line.
  // OTA-234 — was #3a342c (too faded; playtest: "I can barely see
  // it"). Bumped to #c9a86a to match REPORT BUG (bugReportBtnText)
  // so the version line reads at a glance.
  footer: { color: '#c9a86a', fontSize: 10, textAlign: 'center' },
  // OTA-068 — thank-you message above the action row. Color
  // ⚠ PHONE-FIX — `thankYou` deleted with the playtester line. It sat above an
  // action row that no longer exists, and the owner's instruction for the
  // recovered space was explicit: do not refill it, let the roster have it.
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
  kokoroBannerProgress: { color: '#a2977b', fontSize: 11, marginTop: 2 },
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
          const color = ENDING_COLOR[ending ?? ''] ?? '#a2977b';
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
      accessibilityRole="button"
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

// OTA-343 — COPY CRASHED SAVE surface. When a crash captured the offending
// save's bytes (saveLoadHealth on a load-crash, or App.tsx's crash handlers
// on a fatal/render crash), this shows a button that copies the EXACT save —
// wrapped in the COPY SAVE export envelope — to the clipboard for repro. It
// reaches even a corrupt save that can never be loaded (so COPY SAVE in
// About can't reach it). Renders null when no crash save was captured.
function CopyCrashedSaveLine(): React.ReactElement | null {
  const [capture, setCapture] = useState<CrashSaveCapture | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cap = await loadCrashSave();
      if (!cancelled) setCapture(cap);
    })();
    return () => { cancelled = true; };
  }, []);
  if (!capture) return null;
  const ageMin = Math.max(1, Math.floor((Date.now() - capture.capturedAt) / 60000));
  const bytes = capture.raw?.length ?? 0;
  const doCopy = async () => {
    try {
      const stamped = buildCrashSaveExport(capture, buildBasicDeviceSummary());
      await Clipboard.setStringAsync(stamped);
      setCopied(true);
    } catch {
      /* clipboard unavailable — leave the button so a retry is possible */
    }
  };
  return (
    <View style={crashSaveStyles.pill}>
      <Text style={crashSaveStyles.title}>
        ⎘ CRASHED SAVE CAPTURED · {capture.stage} · {ageMin}m ago · {bytes} bytes
      </Text>
      <View style={crashSaveStyles.row}>
        <TouchableOpacity onPress={() => void doCopy()} activeOpacity={0.7} style={crashSaveStyles.btn} accessibilityRole="button">
          <Text style={crashSaveStyles.btnText}>{copied ? '✓ COPIED' : 'COPY CRASHED SAVE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { void clearCrashSave(); setCapture(null); }}
          activeOpacity={0.7}
          style={[crashSaveStyles.btn, crashSaveStyles.btnGhost]}
          accessibilityRole="button"
        >
          <Text style={crashSaveStyles.btnText}>DISMISS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const crashSaveStyles = StyleSheet.create({
  pill: {
    borderColor: '#d8923c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    marginHorizontal: 12,
    backgroundColor: 'rgba(80,50,10,0.25)',
  },
  title: { color: '#d8923c', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: {
    borderColor: '#d8923c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#2a1f12',
  },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: { color: '#e6d8b3', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});

function KokoroDownloadBanner(): React.ReactElement | null {
  const [state, setState] = useState<KokoroState>(() => getKokoroState());
  useEffect(() => onKokoroStateChange(setState), []);
  // VOICE-only banner. The "WAKING THE ARBITER" status box above owns the
  // overall boot narrative and shows the VOICE download % in its own row, so
  // this component no longer renders the 'downloading' / 'loading' phases
  // (that was a misnamed duplicate — it said "Waking up the Arbiter" but was
  // driven solely by the voice engine). It now only handles the two things
  // the status box can't: the spoken ready-flash, and the voice-failed
  // fallback notice.
  if (state.phase === 'ready') {
    // The voice just came online — announce it (and auto-hide after a beat).
    return <ReadyFlash />;
  }
  if (state.phase === 'error') {
    return (
      <View style={styles.kokoroBanner}>
        <Text style={styles.kokoroBannerText}>
          ⚠  The Arbiter's voice couldn't load
        </Text>
        <Text style={styles.kokoroBannerProgress}>
          The Arbiter still narrates — the system voice will speak instead.
          Pull-to-refresh from Settings to retry.
        </Text>
      </View>
    );
  }
  // idle / downloading / loading — covered by the WAKING THE ARBITER box.
  return null;
}

function ReadyFlash(): React.ReactElement | null {
  const [show, setShow] = useState(true);
  useEffect(() => {
    // The Arbiter's first words when the voice engine comes online.
    // arb70 — back to the clean single line. The head-clip was a real
    // regression: Kokoro's warm-up inference ran at a hardcoded rate 1.0, but
    // the default speech rate was raised to 1.2, so the warm-up stopped
    // covering the real line and the title line (first forward at 1.2) lost
    // its head. Fixed at the source — the warm-up now runs at the configured
    // rate (see PiperTTSManager.ensureLoaded) — so the sacrificial "Welcome."
    // primer (arb68/69) is no longer needed.
    // 'system' channel so it's not subject to per-channel spam-collapse rules.
    void ttsSpeak('Choose your character.', 'system');
    // Banner hide timed to comfortably cover the spoken line plus a beat for
    // the green confirmation to register visually before it fades.
    const t = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <View style={[styles.kokoroBanner, { borderColor: '#9ec96a' }]}>
      <Text style={[styles.kokoroBannerText, { color: '#9ec96a' }]}>
        ✓  The Arbiter finds their voice — choose your character
      </Text>
    </View>
  );
}

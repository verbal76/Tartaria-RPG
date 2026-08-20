import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import { useGameStore } from '../state/gameStore';
import { OTA_BUILD_ID } from '../buildInfo';
import { getBuildCodename } from '../buildCodename';
import { buildBasicDeviceSummary, stampLogExport } from '../diagnostics/aboutSummary';
import { buildInventorySnapshot, stampInventoryExport } from '../diagnostics/inventorySnapshot';
import { buildSaveSnapshot, stampSaveExport } from '../diagnostics/saveSnapshot';
import { NumberStepper } from '../components/NumberStepper';
import { ColorWheel } from '../components/ColorWheel';
import {
  getDisplaySettings,
  setDisplaySettings,
  onDisplaySettingsChange,
  resetDisplaySettings,
  type DisplaySettings,
} from '../ui/displaySettings';
import { LoreCodexBody } from '../components/LoreCodexBody';
import { useHintsDisabled, setHintsDisabled, resetAllFirstTimeHints } from '../components/useFirstTimeHint';
import { useAutosaveDisabled, setAutosaveDisabled } from '../ui/autosave';
import { useUiScale, setUiScale, UI_SCALES, displayScaleSupported, type UiScale } from '../ui/displayScale'; // OTA-1227
import { useAccessibility } from '../state/accessibility';
import { THIRD_PARTY_NOTICES, NOTICES_PREAMBLE, NOTICES_VERIFIED_AT } from '../data/thirdPartyNotices';
import {
  flushLogWrites,
  readFullLog,
  getLastLogWriteError,
  clearLastLogWriteError,
  clearActiveSlotLog,
  listSlots,
  type SlotSummary,
} from '../engine/saveSystem';
import { BugReportModal } from '../components/BugReportModal';
import { composeAndSendBugReport } from '../diagnostics/bugReport';
import {
  loadReportingPref, setReportingEnabled, reportingStatusLine, reportingConfigured,
} from '../diagnostics/crashReporter';
import { getAudioSettings, setAudioSettings, onAudioSettingsChange, type AudioSettings } from '../audio/audioSettings';
import { forceReapplyAudioFromState } from '../audio/AudioController';
import {
  getVoiceSettings,
  setVoiceSettings,
  onVoiceSettingsChange,
  type VoiceSettings,
} from '../voice/voiceSettings';
import { isTTSAvailable, getTTSVoices, stopAndClear as stopTTS, getTtsRouteLog } from '../voice/TTSManager';
// OTA-189 — isSTTAvailable import dropped along with the STT toggle
// + mic affordance. The Voice tab no longer surfaces any STT row, so
// the availability probe is no longer needed.
import { isPiperInstalled, downloadPiperVoice, type PiperDownloadStatus } from '../voice/PiperDownloader';
import { clearExecutorchCache, inspectExecutorchCache, type ExecutorchCacheEntry } from '../voice/executorchAdapter';
import {
  listKokoroVoices,
  onDownloadProgress as onKokoroProgress,
  onKokoroStateChange,
  speak as kokoroSpeak,
  getKokoroState,
  refreshPiperEngine,
  getKokoroErrorHistory,
  type KokoroState,
} from '../voice/PiperTTSManager';
import type * as Speech from 'expo-speech';
import { resetMLHealth, mlHealthSummary } from '../diagnostics/mlHealth';
import { CONTENT_MAX_WIDTH } from '../ui/displayScale'; // OTA-1227 — one column width, platform-aware

export function AboutScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const cognitiveStatus = useGameStore((s) => s.cognitiveStatus);
  const cognitiveFraction = useGameStore((s) => s.cognitiveFraction);
  const cognitiveError = useGameStore((s) => s.cognitiveError);
  const cognitiveLastResponse = useGameStore((s) => s.cognitiveLastResponse);
  const cognitiveModelInfo = useGameStore((s) => s.cognitiveModelInfo);
  const qwenStatus = useGameStore((s) => s.qwenStatus);
  const qwenFraction = useGameStore((s) => s.qwenFraction);
  const qwenError = useGameStore((s) => s.qwenError);
  const qwenModelId = useGameStore((s) => s.qwenModelId);
  const bootQwen = useGameStore((s) => s.bootQwen);
  const gameLogLength = useGameStore((s) => s.gameLog.length);
  const player = useGameStore((s) => s.player);

  const [copied, setCopied] = useState(false);
  const [voiceCopied, setVoiceCopied] = useState(false);
  // OTA-459 — manual AI-narration re-enable. On devices where Qwen self-disabled
  // after repeated native crashes (resetMLHealth was never wired to UI before),
  // this clears the crash breadcrumbs so the next boot re-attempts Qwen — needed
  // to TEST an inference-config fix on a previously-disabled device.
  const [aiReset, setAiReset] = useState(false);
  const [kokoroCacheCleared, setKokoroCacheCleared] = useState(false);
  const [kokoroCache, setKokoroCache] = useState<ExecutorchCacheEntry[]>([]);
  // arb75 — in-game bug report (Settings/About). Loads slots so the report can
  // attach the current character's log; composeAndSendBugReport bundles VOICE +
  // device + log into one clipboard copy.
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugReportSlots, setBugReportSlots] = useState<SlotSummary[]>([]);
  useEffect(() => {
    let live = true;
    void listSlots().then((s) => { if (live) setBugReportSlots(s); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // v2.4.1 (OTA 047) — SESSION tab added and made the first thing
  // seen when the gear opens. Holds save & exit, copy log, and
  // clear log — the three actions that previously cluttered the
  // bottom of the ExplorationScreen menu row. save & exit is the
  // most-pressed action, so it's the default tab on open.
  const [tab, setTab] = useState<'session' | 'sfx' | 'display' | 'lore' | 'about' | 'notices'>('session');
  // OTA-860 — global first-time-tips kill-switch (per-install, reactive).
  const hintsDisabled = useHintsDisabled();
  const autosaveDisabled = useAutosaveDisabled();
  const uiScale = useUiScale(); // OTA-1227 — desktop only; the row hides itself elsewhere
  const scaleSupported = displayScaleSupported();
  // OTA-898 (SA-6) — device reduce-motion preference (reactive).
  const reduceMotion = useAccessibility((s) => s.reduceMotion);
  const setReduceMotion = useAccessibility((s) => s.setReduceMotion);
  const [tipsReset, setTipsReset] = useState(false);
  // arb78 — player-tunable background settings (live).
  const [display, setDisplay] = useState<DisplaySettings>(() => getDisplaySettings());
  useEffect(() => {
    setDisplay(getDisplaySettings());
    return onDisplaySettingsChange(setDisplay);
  }, []);
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);
  const [logCharCount, setLogCharCount] = useState(0);
  const [logCopied, setLogCopied] = useState(false);
  const [logCleared, setLogCleared] = useState(false);
  // Manual SAVE button feedback. 'saving' while the write runs, then a 'saved'
  // / 'failed' flash reflecting whether the atomic write actually landed.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  // OTA-1208 — the RUN card's BACK UP CHARACTER button (moved from the title rows).
  const [backupState, setBackupState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  // OTA-203 — dedicated COPY INVENTORY button. Separate from the log
  // export so the player can choose which one to paste back.
  const [invCopied, setInvCopied] = useState(false);
  const [invCharCount, setInvCharCount] = useState(0);
  // arb172 — Session-tab declutter: the rarely-used clipboard dumps (COPY SAVE,
  // COPY INVENTORY) hide behind this toggle. (COPY AI HEALTH was removed — its
  // output is already inside COPY LOG / REPORT A BUG's device summary.)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // ⚠ OTA-web10 — the crash-delivery opt-in.
  const crashConfigured = reportingConfigured();
  const [crashOptIn, setCrashOptIn] = useState(false);
  const [reportingStatus, setReportingStatus] = useState(reportingStatusLine());
  useEffect(() => {
    let live = true;
    void loadReportingPref().then((on) => {
      if (!live) return;
      setCrashOptIn(on);
      setReportingStatus(reportingStatusLine());
    });
    return () => { live = false; };
  }, []);

  // OTA-341 — COPY SAVE: export the loadable save state for brick repro.
  const [saveCopied, setSaveCopied] = useState(false);
  const [saveCharCount, setSaveCharCount] = useState(0);
  // IMPORT SAVE: paste a COPY SAVE export (from this or another install — e.g. a
  // Golem-line save into this build) and load it as a new playable slot.
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // v2.4.1 (OTA 053) — chunked-copy cursor for the session log so
  // long sessions (>~25 KB, the silent paste cap on most chat
  // clients) can be sent in parts the way the dead-character log
  // can on the title screen. Each tap copies the NEXT chunk and
  // wraps to PART 1 after the final part. Mirrors the LogScreen
  // pattern. Reset whenever the player clears the log.
  const LOG_CHUNK_SIZE = 25_000;
  const [logChunk, setLogChunk] = useState<
    | { lastIndex: number; total: number; copiedAt: number }
    | null
  >(null);
  const saveAndExitToTitle = useGameStore((s) => s.saveAndExitToTitle);
  const persist = useGameStore((s) => s.persist);

  // Save in place (stay on the screen). Reports the real result — important
  // because a save can silently fail (storage full / oversized slot blob).
  const handleSave = async () => {
    setSaveState('saving');
    let ok = false;
    try {
      ok = await persist();
    } catch {
      ok = false;
    }
    setSaveState(ok ? 'saved' : 'failed');
    setTimeout(() => setSaveState('idle'), 3000);
  };

  // ⚠ OTA-1208 — BACK UP moved HERE from every title-screen character row
  // (owner: the per-row buttons "make the game look broken to testers"; dead
  // rows keep theirs — a dead save has no other door). SAVES FIRST, always:
  // a backup of a stale slot silently loses the session the player is
  // standing in, which is the OTA-1178 wound in a new place.
  const handleBackUp = async () => {
    const p = useGameStore.getState().player;
    const slotId = useGameStore.getState().activeSlotId;
    if (!p || !slotId) return;
    setBackupState('busy');
    let ok = false;
    try {
      ok = await persist();
    } catch {
      ok = false;
    }
    if (!ok) {
      setBackupState('failed');
      setTimeout(() => setBackupState('idle'), 3000);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { backUpCharacterSlot } = require('../ui/backupCharacter') as typeof import('../ui/backupCharacter');
    const result = await backUpCharacterSlot({
      slotId,
      playerName: p.name,
      raceId: p.raceId,
      locationId: p.currentLocationId,
    });
    setBackupState(result === 'ok' ? 'done' : 'failed');
    setTimeout(() => setBackupState('idle'), 3000);
  };
  async function handleCopyLog() {
    try {
      await flushLogWrites();
      const fresh = await readFullLog();
      const total = Math.max(1, Math.ceil(fresh.length / LOG_CHUNK_SIZE));
      // Single-chunk path — old behaviour, single COPIED flash.
      // OTA-101 — stampLogExport bundles the basic device/
      // install summary at the end so the report always carries
      // build context. OTA-203 reverted the OTA-202 inventory
      // bundling — the inventory snapshot is now exported via a
      // dedicated COPY INVENTORY button so the log export stays
      // log-only and the player can choose which one to share.
      if (total <= 1) {
        const stamped = stampLogExport(fresh);
        await Clipboard.setStringAsync(stamped);
        setLogCharCount(stamped.length);
        setLogCopied(true);
        setLogChunk(null);
        setTimeout(() => setLogCopied(false), 2500);
      } else {
        // Multipart path — pick the next chunk based on the cursor.
        let nextIndex = 1;
        if (logChunk) {
          nextIndex = logChunk.lastIndex >= total ? 1 : logChunk.lastIndex + 1;
        }
        const start = (nextIndex - 1) * LOG_CHUNK_SIZE;
        const slice = fresh.slice(start, start + LOG_CHUNK_SIZE);
        const stamped = stampLogExport(slice, { chunk: { index: nextIndex, total } });
        await Clipboard.setStringAsync(stamped);
        setLogCharCount(stamped.length);
        setLogChunk({ lastIndex: nextIndex, total, copiedAt: Date.now() });
        setLogCopied(false);
      }
      const writeErr = getLastLogWriteError();
      if (writeErr) {
        useGameStore.setState((s) => ({
          gameLog: [
            ...s.gameLog,
            {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              ts: Date.now(),
              channel: 'system' as const,
              text: `⚠ Log-write failure: ${writeErr}. Some entries may be missing from the copy — use SHARE on the full log screen for a complete export.`,
            },
          ],
        }));
        clearLastLogWriteError();
      }
    } catch { /* clipboard rarely fails on Android */ }
  }
  // OTA-203 — dedicated COPY INVENTORY button. Builds the snapshot
  // from the live player state, wraps it in the BEGIN/END envelope +
  // device summary (so the paste is greppable and pairs the pack
  // against the OTA build), and drops it on the clipboard. Separate
  // from COPY LOG so the player can share just the pack contents
  // without a giant log appended.
  async function handleCopyInventory() {
    try {
      const player = useGameStore.getState().player;
      const snapshot = buildInventorySnapshot(player);
      const stamped = stampInventoryExport(
        snapshot,
        buildBasicDeviceSummary(),
        player?.name,
      );
      await Clipboard.setStringAsync(stamped);
      setInvCharCount(stamped.length);
      setInvCopied(true);
      setTimeout(() => setInvCopied(false), 2500);
    } catch { /* clipboard rarely fails on Android */ }
  }
  // OTA-341 — COPY SAVE. Exports the loadable save state (player +
  // worldMemory, minus the narration log) so a crashing/bricked save can be
  // pasted back and reproduced EXACTLY via loadSlotIntoGame. Player ask after
  // the OTA-338 brick, where we had no way to capture the fatal state before
  // the character had to be deleted to recover.
  async function handleCopySave() {
    try {
      const s = useGameStore.getState();
      const snapshot = buildSaveSnapshot(s.player, s.worldMemory);
      const stamped = stampSaveExport(snapshot, buildBasicDeviceSummary(), s.player?.name);
      await Clipboard.setStringAsync(stamped);
      setSaveCharCount(stamped.length);
      setSaveCopied(true);
      setTimeout(() => setSaveCopied(false), 2500);
    } catch { /* clipboard rarely fails on Android */ }
  }
  // IMPORT SAVE — read the clipboard (the user copies a COPY SAVE export first),
  // parse it, write it to a new slot, and drop into the game. Lets a save from
  // another install (e.g. a Golem-line build) be played here.
  async function handleImportSave() {
    if (importBusy) return;
    setImportBusy(true);
    setImportMsg('Reading clipboard…');
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || text.trim().length === 0) {
        setImportMsg('Clipboard is empty — copy a COPY SAVE export first, then tap Import.');
        return;
      }
      const res = await useGameStore.getState().importSaveFromText(text);
      if (res.ok) {
        setImportMsg(`Imported ${res.name || 'character'} — loading…`);
        useGameStore.getState().setScreen('exploration');
      } else {
        setImportMsg(res.error ?? 'Import failed.');
      }
    } catch (e) {
      setImportMsg(`Import failed (${e instanceof Error ? e.message : 'unknown error'}).`);
    } finally {
      setImportBusy(false);
      setTimeout(() => setImportMsg(null), 6000);
    }
  }
  async function handleClearLog() {
    useGameStore.getState().clearGameLog();
    try {
      await clearActiveSlotLog();
    } catch { /* tolerated */ }
    setLogCleared(true);
    // v2.4.1 (OTA 053) — reset the chunked-copy cursor so the next
    // tap starts from PART 1 of the fresh log.
    setLogChunk(null);
    setLogCopied(false);
    setTimeout(() => setLogCleared(false), 1500);
  }
  // OTA 007 — update button + state moved to TitleScreen.
  const [audio, setAudio] = useState<AudioSettings>(() => getAudioSettings());
  const [voice, setVoice] = useState<VoiceSettings>(() => getVoiceSettings());
  const [voicesList, setVoicesList] = useState<Speech.Voice[]>([]);
  const [ttsAvailable, setTtsAvailable] = useState<boolean>(true);
  // OTA-189 — sttAvailable state dropped along with the STT toggle.
  const [piperInstalled, setPiperInstalled] = useState<boolean>(false);
  const [piperStatus, setPiperStatus] = useState<PiperDownloadStatus | null>(null);
  const [kokoroProgress, setKokoroProgress] = useState<number>(0);
  const [kokoroState, setKokoroState] = useState<KokoroState>(() => getKokoroState());

  useEffect(() => {
    setAudio(getAudioSettings());
    return onAudioSettingsChange(setAudio);
  }, []);

  useEffect(() => {
    setVoice(getVoiceSettings());
    const unsub = onVoiceSettingsChange(setVoice);
    // OTA-189 — isSTTAvailable probe dropped along with the STT
    // toggle + mic button. Only TTS availability + voice catalog +
    // Kokoro install state are still surfaced.
    void Promise.all([isTTSAvailable(), getTTSVoices(), isPiperInstalled()]).then(
      ([ttsOk, voices, piperOk]) => {
        setTtsAvailable(ttsOk);
        setVoicesList(voices);
        setPiperInstalled(piperOk);
      },
    );
    return unsub;
  }, []);

  // Subscribe to Kokoro model-download progress (only emits during the
  // first-launch fetch; afterwards stays at 1.0).
  useEffect(() => {
    return onKokoroProgress(setKokoroProgress);
  }, []);

  // Subscribe to Kokoro install/load state machine.
  useEffect(() => {
    return onKokoroStateChange(setKokoroState);
  }, []);

  const testKokoro = () => {
    kokoroSpeak('Welcome to Tartaria. This is the bundled neural voice — Kokoro.');
  };
  const handleEngineThirdBtn = () => {
    // When ready, the third button means UPDATE — wipe cache + dispose
    // engine + reset state so the next test re-downloads. Otherwise
    // it's the DOWNLOAD / RETRY action which kicks the same install
    // flow via testKokoro (which lazily triggers fromModelName).
    if (kokoroState.phase === 'ready') {
      void refreshPiperEngine();
      return;
    }
    testKokoro();
  };

  const toggleTTS = () => {
    const next = !voice.ttsEnabled;
    if (!next) stopTTS();
    void setVoiceSettings({ ttsEnabled: next });
  };
  // OTA-189 — toggleSTT + toggleAutoSubmit removed alongside the STT
  // toggle row and the Auto-submit speech row. STT is gone from the
  // game entirely; only TTS-side voice settings still render.
  // Direct setters — the NumberStepper passes the actual rate / pitch
  // value (not a 0..1 normalized fraction the old slider used), so no
  // remapping needed. Clamp guards against any future range drift.
  const setRate = (v: number) => { void setVoiceSettings({ rate: v }); };
  const setPitch = (v: number) => { void setVoiceSettings({ pitch: v }); };
  const setVoiceVolume = (v: number) => { void setVoiceSettings({ volume: v }); };
  const switchEngine = (next: 'system' | 'bundled') => {
    stopTTS();
    void setVoiceSettings({ engine: next });
  };
  const startPiperDownload = () => {
    void downloadPiperVoice({
      onProgress: (s) => setPiperStatus({ ...s }),
    }).then(() => {
      void isPiperInstalled().then(setPiperInstalled);
    });
  };
  const cycleVoice = (dir: 1 | -1) => {
    if (voicesList.length === 0) return;
    const idx = voicesList.findIndex((v) => v.identifier === voice.voiceId);
    const next = (idx + dir + voicesList.length) % voicesList.length;
    void setVoiceSettings({ voiceId: voicesList[next]?.identifier ?? null });
  };
  const cycleKokoroVoice = (dir: 1 | -1) => {
    const list = listKokoroVoices();
    if (list.length === 0) return;
    const idx = list.indexOf(voice.kokoroVoice);
    const next = (idx + dir + list.length) % list.length;
    void setVoiceSettings({ kokoroVoice: list[next] });
  };
  const currentVoiceLabel = (() => {
    if (voicesList.length === 0) return 'No voices installed';
    const v = voicesList.find((vv) => vv.identifier === voice.voiceId) ?? voicesList[0];
    if (!v) return 'Default';
    return `${v.name ?? v.identifier} (${v.language ?? '?'})`;
  })();

  const [applyFlash, setApplyFlash] = useState(false);
  const toggleMusic = () => { void setAudioSettings({ enabled: !audio.enabled }); };
  const setMusicVolume = (v: number) => { void setAudioSettings({ volume: v }); };
  const setMusicDuck = (v: number) => { void setAudioSettings({ duck: v }); };
  const applyMusic = () => {
    void forceReapplyAudioFromState().then(() => {
      setApplyFlash(true);
      setTimeout(() => setApplyFlash(false), 1200);
    });
  };

  // OTA 007 — checkForUpdate moved to TitleScreen.

  const info = useMemo(() => {
    const mb = (bytes: number | null | undefined) =>
      bytes != null ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : 'unknown';

    // OTA-063 — app/APK/OTA build fields now live inside
    // buildBasicDeviceSummary(); the local apkBuildNumber/
    // apkAppVersion declarations were removed because they were
    // only used in the now-replaced lines[] header. The summary
    // helper pulls Application.nativeBuildVersion +
    // nativeApplicationVersion the same way and produces the same
    // identifiers, plus device name / locale / timezone / screen.

    // Resolved runtime version from expo-updates. This is what the manifest
    // server uses to decide whether an OTA applies. If this doesn't equal
    // the publish-side runtimeVersion, every OTA silently no-ops.
    const updRuntimeVersion = safeUpdates(() => Updates.runtimeVersion);
    const updChannel = safeUpdates(() => Updates.channel);
    const updUpdateId = safeUpdates(() => Updates.updateId);
    const updCreatedAt = safeUpdates(() => {
      const d = Updates.createdAt;
      return d instanceof Date ? d.toISOString() : d;
    });
    const updIsEmbedded = safeUpdates(() => Updates.isEmbeddedLaunch);
    const updIsEnabled = safeUpdates(() => Updates.isEnabled);

    const otaApplied =
      updIsEmbedded === 'true'
        ? 'No (running the APK\'s embedded bundle)'
        : updUpdateId && updUpdateId !== '(unset)'
          // OTA-268 — show the build codename instead of Expo's
          // raw updateId UUID (e.g., "019e836b-cd5f-70fc-..."). The
          // UUID is an Expo-server identifier that wasn't really
          // useful to the player anyway, and reading "Yes — Smoke
          // Anvil" reads like "I know which build I'm on" rather
          // than "I'm staring at a hash." The codename reflects
          // the currently-running OTA bundle, which is the same
          // bundle the updateId points to.
          ? `Yes — ${getBuildCodename(OTA_BUILD_ID)}`
          : '(unknown)';

    // OTA-063 — Device + Install summary moved to the shared
    // buildBasicDeviceSummary() helper so the About screen and the
    // bug-report email show identical identifying fields. Adds
    // device name / locale / timezone / screen size / capture-time
    // alongside the existing app+APK+OTA build IDs. Platform and
    // Hermes now live inside the Device block (used to be free-
    // floating lines below the OTA status). The OTA status block
    // stays here because it pulls live Updates.* state.
    const lines = [
      `Tartaria Realms`,
      ``,
      buildBasicDeviceSummary(),
      ``,
      `OTA status`,
      `  Channel: ${updChannel}`,
      `  Runtime version: ${updRuntimeVersion}`,
      `  Last OTA applied: ${otaApplied}`,
      `  OTA published at: ${updCreatedAt || '(none)'}`,
      `  Updates enabled: ${updIsEnabled}`,
      `  (Update via TitleScreen → CHECK FOR OTA UPDATE button)`,
      ``,
      `Cognitive layer (classifier)`,
      `  Status: ${cognitiveStatus}`,
      `  Progress: ${(cognitiveFraction * 100).toFixed(0)}%`,
      `  Error: ${cognitiveError ?? 'none'}`,
      cognitiveLastResponse
        ? `  Last response: ${cognitiveLastResponse.inferredEmotions.join(',') || '-'} / ${cognitiveLastResponse.inferredIntentions.join(',') || '-'} (${cognitiveLastResponse.embeddingMs.toFixed(1)}ms embed, ${cognitiveLastResponse.inferenceMs.toFixed(1)}ms infer)`
        : `  Last response: none yet`,
      ``,
      `Qwen generator (Arbiter narration)`,
      `  Status: ${qwenStatus}`,
      `  Progress: ${(qwenFraction * 100).toFixed(0)}%`,
      `  Model: ${qwenModelId}`,
      `  Error: ${qwenError ?? 'none'}`,
      ``,
      `Classifier model`,
      cognitiveModelInfo
        ? [
            `  Name: ${cognitiveModelInfo.name}`,
            `  Source: ${cognitiveModelInfo.source}`,
            `  Embedding dim: ${cognitiveModelInfo.embeddingDim}`,
            `  Vocab tokens: ${cognitiveModelInfo.vocabSize}`,
            `  Max seq len: ${cognitiveModelInfo.maxSeqLen}`,
            `  File size: ${mb(cognitiveModelInfo.modelSizeBytes)}`,
            `  Local path: ${cognitiveModelInfo.modelPath ?? 'unknown'}`,
            `  Runtime: ${cognitiveModelInfo.runtime}`,
          ].join('\n')
        : `  (not loaded yet)`,
      ``,
      `Session`,
      `  Player: ${player?.name ?? 'none'}`,
      `  Log entries in memory: ${gameLogLength}`,
    ];
    return lines.join('\n');
  }, [cognitiveStatus, cognitiveFraction, cognitiveError, cognitiveLastResponse, cognitiveModelInfo, qwenStatus, qwenFraction, qwenError, qwenModelId, player, gameLogLength]);

  // Voice tab COPY ALL — same identifier header as About so we can
  // tell which device / build the report came from regardless of
  // which tab the player copied from. OTA-063 swaps the inline
  // app/APK/OTA lines for the shared buildBasicDeviceSummary() so
  // the Voice diagnostic now also carries device name, locale,
  // timezone, screen, and Hermes flag.
  const voiceInfo = useMemo(() => {
    const lines = [
      `Tartaria Realms`,
      ``,
      buildBasicDeviceSummary(),
      ``,
      `Voice`,
      `  TTS enabled: ${voice.ttsEnabled ? 'yes' : 'no'}`,
      `  Engine: ${voice.engine}`,
      `  Rate: ${voice.rate.toFixed(2)} · Pitch: ${voice.pitch.toFixed(2)}`,
      `  System voice id: ${voice.voiceId ?? '(default)'}`,
      `  Kokoro voice: ${voice.kokoroVoice}`,
      `  TTS availability: ${ttsAvailable ? 'yes' : 'no'}`,
      // OTA-189 — STT-related diagnostic lines (enabled, availability,
      // auto-submit) dropped along with the STT toggle + mic button.
      `  Installed voices: ${voicesList.length}`,
      `  Kokoro state: ${
        kokoroState.phase === 'idle' ? 'idle (not loaded yet)' :
        kokoroState.phase === 'downloading' ? `downloading ${Math.round(kokoroState.fraction * 100)}%` :
        kokoroState.phase === 'loading' ? 'loading model into memory' :
        kokoroState.phase === 'ready' ? 'ready' :
        `error: ${kokoroState.message}`
      }`,
    ];
    // arb68 diagnostic — which engine actually voiced the last few lines.
    // The title "Choose your character" clip is upstream of playback, so this
    // tells us whether that line went out on bundled Kokoro or system
    // expo-speech (the latter clips its first utterance on Android).
    const routes = getTtsRouteLog();
    if (routes.length > 0) {
      lines.push('');
      lines.push(`  Last TTS routes (newest first):`);
      for (const r of routes) {
        lines.push(`    • route=${r.route} · kokoro=${r.phase} · "${r.textHead}"`);
      }
    }
    // OTA 23-017 — append the Kokoro error history (last 5
    // attempts) so a tester reporting "Failed to load model"
    // can copy a paste-back that tells us WHICH step failed
    // (download / load / warmup), the full error message, the
    // stack, and free disk at the moment of failure. Without
    // this we were guessing OOM from a 240-char truncation.
    const history = getKokoroErrorHistory();
    if (history.length > 0) {
      lines.push('');
      lines.push(`Kokoro error history (most recent first, ${history.length} of last 5):`);
      for (const rec of history) {
        lines.push(`  • ${rec.at} · step=${rec.step} · voice=${rec.voiceId} · diskFree=${rec.diskFreeMB === -1 ? 'unknown' : rec.diskFreeMB + ' MB'}`);
        lines.push(`    msg: ${rec.message}`);
        if (rec.stack) {
          // First 3 stack frames are usually enough to locate the
          // native call; trim deeper noise.
          const trimmedStack = rec.stack.split('\n').slice(0, 4).join('\n      ');
          lines.push(`    stack: ${trimmedStack}`);
        }
      }
    }
    // OTA 23-018 — what's actually in the executorch cache dir
    // right now. If the Kokoro Medium model file sits there at a
    // truncated size (Kokoro-82M is ~100 MB; anything under ~95 MB
    // is a partial-write smoking gun), this is the diagnostic
    // that surfaces it. Also confirms the cache exists at all —
    // if the player tapped CLEAR BUNDLED VOICE CACHE the list
    // will read empty.
    lines.push('');
    if (kokoroCache.length === 0) {
      lines.push(`Executorch cache: empty (no model files on disk).`);
    } else {
      lines.push(`Executorch cache (${kokoroCache.length} file${kokoroCache.length === 1 ? '' : 's'}):`);
      for (const e of kokoroCache) {
        const sz = e.sizeMB === -1 ? 'unknown size' : `${e.sizeMB.toFixed(1)} MB`;
        const mt = e.modificationTimeMs > 0 ? new Date(e.modificationTimeMs).toISOString() : 'unknown mtime';
        lines.push(`  • ${e.name} · ${sz} · ${mt}`);
      }
    }
    return lines.join('\n');
  }, [voice, ttsAvailable, voicesList, kokoroState, kokoroCache]);

  async function handleCopy() {
    await Clipboard.setStringAsync(info);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function handleVoiceCopy() {
    // OTA 23-018 — refresh the cache inventory immediately before
    // copy so the pasted diagnostic shows what's actually on disk
    // RIGHT NOW (size, mtime) rather than what was on disk when the
    // screen mounted.
    try {
      const fresh = await inspectExecutorchCache();
      setKokoroCache(fresh);
    } catch { /* ignore */ }
    await Clipboard.setStringAsync(voiceInfo);
    setVoiceCopied(true);
    setTimeout(() => setVoiceCopied(false), 1500);
  }

  // OTA 23-018 — manual recovery for "downloaded but failed to
  // load" (corrupt cached model). Wipes the executorch cache dir
  // so the next TEST VOICE tap re-downloads from scratch.
  async function handleClearKokoroCache() {
    await clearExecutorchCache();
    setKokoroCache([]);
    setKokoroCacheCleared(true);
    setTimeout(() => setKokoroCacheCleared(false), 3000);
  }

  // Populate the cache snapshot once on mount so COPY VOICE INFO
  // has something to include even on the first copy without
  // waiting for the inspector to roundtrip.
  useEffect(() => {
    void inspectExecutorchCache().then(setKokoroCache).catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen(player ? 'exploration' : 'title')}
          style={styles.backBtn}
          hitSlop={12}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.back}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">SETTINGS</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Tab row — two sections in one screen. OTA 23-006 collapsed
          'music' + 'voice' into a single SFX tab; the technical
          ABOUT / diagnostic block stays its own tab. Music card
          renders first inside SFX (most tweaked), voice card below. */}
      <View style={styles.tabRow}>
        {(['session', 'sfx', 'display', 'lore', 'about', 'notices'] as const).map((id) => (
          <TouchableOpacity
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tabBtn, tab === id && styles.tabBtnActive]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === id }}
          >
            <Text
              style={[styles.tabBtnText, tab === id && styles.tabBtnTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {id.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* v2.4.1 (OTA 047) — SESSION tab. The three run-control
            actions that used to clutter the in-game menu row
            (save & exit, copy log, clear log) live here as proper
            buttons. Save & exit is the headline action so it's
            first; copy + clear are diagnostic tools below. */}
        {tab === 'session' && (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionLabel} accessibilityRole="header">RUN</Text>
          <Text style={styles.sessionHint}>
            Save or leave the run, share a log / bug report, or reload the AI.
          </Text>

          {/* SAVE in place — keep playing. Separate from SAVE & EXIT so the
              player can checkpoint without leaving the run. Reports the real
              write result (a save can silently fail when storage is full). */}
          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnPrimary, saveState === 'failed' && styles.sessionBtnDanger]}
            onPress={() => { void handleSave(); }}
            activeOpacity={0.7}
            disabled={saveState === 'saving'}
            accessibilityRole="button"
            accessibilityState={{ disabled: saveState === 'saving' }}
          >
            <Text style={styles.sessionBtnPrimaryText}>
              {saveState === 'saving' ? 'SAVING…'
                : saveState === 'saved' ? '✓ SAVED'
                : saveState === 'failed' ? '✗ SAVE FAILED'
                : 'SAVE'}
            </Text>
          </TouchableOpacity>

          {/* OTA-1208 — the living character's backup door (title rows carry it
              only for the dead now). Saves first, then opens the share sheet
              with the fresh export; clipboard gets a copy either way. */}
          {player && (
            <TouchableOpacity
              style={[styles.sessionBtn, styles.sessionBtnSecondary, backupState === 'failed' && styles.sessionBtnDanger]}
              onPress={() => { void handleBackUp(); }}
              activeOpacity={0.7}
              disabled={backupState === 'busy'}
              accessibilityRole="button"
              accessibilityState={{ disabled: backupState === 'busy' }}
            >
              <Text style={styles.sessionBtnSecondaryText}>
                {backupState === 'busy' ? 'BACKING UP…'
                  : backupState === 'done' ? '✓ BACKED UP (share or paste it somewhere safe)'
                  : backupState === 'failed' ? '✗ BACKUP FAILED'
                  : 'BACK UP CHARACTER'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnPrimary]}
            onPress={() => { void saveAndExitToTitle(); }}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sessionBtnPrimaryText}>SAVE &amp; EXIT TO TITLE</Text>
          </TouchableOpacity>

          {/* OTA-1209 — the 90-second autosave's toggle (the autosave itself is
              OTA-368 and ships ON). Here beside SAVE so the player who lost a
              session to a swipe-close can SEE the net exists. */}
          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Autosave (every 90s)</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => { void setAutosaveDisabled(!autosaveDisabled); }}
              style={[styles.musicToggle, !autosaveDisabled && styles.musicToggleOn]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Autosave"
              accessibilityState={{ selected: !autosaveDisabled }}
            >
              <Text style={[styles.musicToggleText, !autosaveDisabled && styles.musicToggleTextOn]}>
                {autosaveDisabled ? 'OFF' : 'ON'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sessionHint}>
            The game also saves after every action and when the app goes to the
            background — this timer just bounds what an idle stretch could lose.
          </Text>

          {/* ⚠ OTA-1227 — UI SCALE (desktop/Steam only). Deliberately NOT a
              resolution picker: inside a maximized window the OS owns the
              resolution, and a dropdown fighting it is a mobile-porting
              anti-pattern. This is the desktop convention — scale the whole
              interface, text and controls together, via the Electron zoom.
              The row is absent entirely off-desktop rather than shown inert. */}
          {scaleSupported && (
            <>
              <View style={styles.musicRow}>
                <Text style={styles.musicLabel}>Display size</Text>
                <View style={{ flex: 1 }} />
                {UI_SCALES.map((s2: UiScale) => (
                  <TouchableOpacity
                    key={s2}
                    onPress={() => { void setUiScale(s2); }}
                    style={[styles.musicToggle, uiScale === s2 && styles.musicToggleOn, { marginLeft: 6 }]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Display size ${s2}`}
                    accessibilityState={{ selected: uiScale === s2 }}
                  >
                    <Text style={[styles.musicToggleText, uiScale === s2 && styles.musicToggleTextOn]}>
                      {s2 === 'small' ? 'S' : s2 === 'medium' ? 'M' : 'L'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sessionHint}>
                Scales the whole interface for your monitor. F11 toggles fullscreen.
              </Text>
            </>
          )}

          {/* OTA-1023 — REPLAY OPENING moved to the CharacterScreen header
              (owner: "I went to settings and about and there was no replay
              opening"). About's normal entry is the TITLE screen, where no
              character is loaded, so the player-gated button here was
              invisible on the only path players actually took to it. The
              character sheet only exists with a live run — no gate needed. */}

          <Text style={[styles.sessionLabel, { marginTop: 14 }]} accessibilityRole="header">REPORTING</Text>
          <View style={styles.sessionBtnRow}>
            <TouchableOpacity
              style={[styles.sessionBtn, styles.sessionBtnSecondary, { flex: 1 }]}
              onPress={() => { void handleCopyLog(); }}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.sessionBtnSecondaryText}>
                {(() => {
                  // Single-chunk legacy flash.
                  if (logCopied) return `✓ ${logCharCount.toLocaleString()} CHARS`;
                  // Multipart cursor — shows what gets copied next, and
                  // a brief "COPIED PART X/Y" flash for 2.5s after a
                  // copy. Wraps to PART 1 after the final part.
                  if (logChunk) {
                    const { lastIndex, total, copiedAt } = logChunk;
                    const flashing = Date.now() - copiedAt < 2500;
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
              style={[styles.sessionBtn, styles.sessionBtnSecondary, { flex: 1 }]}
              onPress={() => { void handleClearLog(); }}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.sessionBtnSecondaryText}>
                {logCleared ? '✓ CLEARED' : 'CLEAR LOG'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* arb75 — REPORT A BUG. One report bundling voice + device + log
              (no more separate COPY VOICE / COPY LOG). Opens the same
              BugReportModal the Title screen uses. */}
          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnPrimary, { marginTop: 8 }]}
            onPress={() => setBugReportOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sessionBtnPrimaryText}>REPORT A BUG</Text>
          </TouchableOpacity>
          {/* ⚠⚠ OTA-web10 — AUTOMATIC CRASH REPORTS. OFF BY DEFAULT, and that is
              the owner's explicit ruling, not a placeholder. This is an
              offline-first game with on-device AI; a fair number of people
              chose it partly BECAUSE nothing phones home, and shipping opt-out
              would trade that for crash volume.

              ⚠ The row states what this BUILD can actually do, not what the
              feature will eventually do. No transport is installed and no
              destination is configured yet (Sentry is a native module — it
              needs a store build, not an OTA), so the toggle is shown disabled
              with the reason spelled out. A live-looking switch that silently
              cannot deliver is how a player concludes their reports are being
              received when nothing is being sent. */}
          <View style={styles.crashOptRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.crashOptTitle}>AUTOMATIC CRASH REPORTS</Text>
              <Text style={styles.crashOptBody}>{reportingStatus}</Text>
              <Text style={styles.crashOptBody}>
                Crashes are always recorded ON THIS DEVICE either way — REPORT A BUG sends them
                only when you choose to.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.crashOptBtn, crashOptIn && styles.crashOptBtnOn,
                      !crashConfigured && styles.crashOptBtnDead]}
              onPress={() => {
                const next = !crashOptIn;
                setCrashOptIn(next);
                void setReportingEnabled(next).then(() => setReportingStatus(reportingStatusLine()));
              }}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityState={{ checked: crashOptIn, disabled: !crashConfigured }}
              disabled={!crashConfigured}
            >
              <Text style={[styles.crashOptBtnText, crashOptIn && styles.crashOptBtnTextOn]}>
                {crashOptIn ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* arb172 — rarely-needed clipboard dumps tucked behind a toggle so the
              page isn't a wall of COPY buttons. COPY SAVE = the loadable save for
              brick-repro; COPY INVENTORY = the pack snapshot for balance reports. */}
          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnSecondary, { marginTop: 8 }]}
            onPress={() => setAdvancedOpen((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ expanded: advancedOpen }}
          >
            <Text style={styles.sessionBtnSecondaryText}>
              {advancedOpen ? '▾ ADVANCED EXPORTS' : '▸ ADVANCED EXPORTS'}
            </Text>
          </TouchableOpacity>
          {advancedOpen && (
            <>
              <TouchableOpacity
                style={[styles.sessionBtn, styles.sessionBtnSecondary, { marginTop: 8 }]}
                onPress={() => { void handleCopySave(); }}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.sessionBtnSecondaryText}>
                  {saveCopied ? `✓ ${saveCharCount.toLocaleString()} CHARS` : 'COPY SAVE (download / export)'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sessionBtn, styles.sessionBtnSecondary, { marginTop: 8 }]}
                onPress={() => { void handleImportSave(); }}
                activeOpacity={0.7}
                disabled={importBusy}
              >
                <Text style={styles.sessionBtnSecondaryText}>
                  {importBusy ? 'IMPORTING…' : 'IMPORT SAVE (upload / paste)'}
                </Text>
              </TouchableOpacity>
              {importMsg ? (
                <Text style={styles.sessionFootnote}>{importMsg}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.sessionBtn, styles.sessionBtnSecondary, { marginTop: 8 }]}
                onPress={() => { void handleCopyInventory(); }}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.sessionBtnSecondaryText}>
                  {invCopied ? `✓ ${invCharCount.toLocaleString()} CHARS` : 'COPY INVENTORY'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={[styles.sessionLabel, { marginTop: 14 }]} accessibilityRole="header">AI</Text>
          {/* OTA-459/460 — RESET AI NARRATION & RELOAD. Clears the ML crash
              breadcrumbs AND force-loads Qwen in-session, bypassing the boot-time
              skip gate entirely (bootQwen doesn't consult shouldAttemptQwen, it just
              initializes). The store's qwenStatus is reset to 'idle' first so
              bootQwen's "already running" early-return doesn't swallow the call after
              a boot-time 'skipped'. No app restart needed — watch the label go to
              "✓ AI NARRATION LOADED". */}
          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnPrimary, { marginTop: 8 }]}
            onPress={() => {
              setAiReset(true);
              void resetMLHealth().then(() => {
                useGameStore.setState({ qwenStatus: 'idle', qwenError: null });
                void bootQwen();
              });
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sessionBtnPrimaryText}>
              {!aiReset ? 'RELOAD AI'
                : qwenStatus === 'ready' ? '✓ AI LOADED'
                : qwenStatus === 'failed' ? '✗ AI LOAD FAILED — SEE BELOW'
                : qwenStatus === 'downloading' ? `LOADING AI… ${Math.round(qwenFraction * 100)}%`
                : qwenStatus === 'loading' ? 'LOADING AI…'
                : 'STARTING AI…'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.sessionFootnote}>
            Current state: {mlHealthSummary().split('\n')[1]?.replace(/^\s*Status:\s*/, '').trim() ?? 'unknown'}
            {qwenStatus === 'failed' && qwenError ? `\nLoad error: ${qwenError}` : ''}
          </Text>
          <Text style={styles.sessionFootnote}>
            Long-press COPY LOG for the share + chunked-paste view.
          </Text>
        </View>
        )}

        {/* arb78 — DISPLAY tab: player-tunable "aged artifact" background.
            Every slider applies LIVE (the AppShell subscribes), so the player
            sees the change behind this screen as they drag. */}
        {tab === 'display' && (
        <View style={styles.musicCard}>
          <View style={styles.musicHeader}>
            <Text style={styles.musicTitle} accessibilityRole="header">BACKGROUND</Text>
          </View>
          <Text style={styles.sessionHint}>
            Make the parchment your own. Changes apply instantly and are saved.
          </Text>

          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Brightness</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <NumberStepper
                value={Math.round(((display.bgLight - 0.04) / 0.16) * 100)}
                min={0} max={100} step={5} decimals={0} suffix="%"
                onChange={(v) => { void setDisplaySettings({ bgLight: 0.04 + (Math.max(0, Math.min(100, v)) / 100) * 0.16 }); }}
              />
            </View>
          </View>

          {/* arb85 — color wheel replaces the old Hue + Color-richness sliders.
              Angle = hue, distance from center = richness (saturation). Drag
              the dot anywhere on the disc; the base tone updates live. */}
          <View style={styles.wheelRow}>
            <Text style={styles.wheelLabel}>COLOR</Text>
            <ColorWheel
              size={220}
              hue={display.bgHue}
              sat={display.bgSat}
              light={Math.max(0.4, display.bgLight + 0.35)}
              onChange={(h, s) => { void setDisplaySettings({ bgHue: h, bgSat: s }); }}
            />
            <Text style={styles.wheelHint}>
              Angle picks the color family · center → edge sets richness
            </Text>
          </View>

          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Paper texture</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <NumberStepper
                value={Math.round(display.textureOpacity * 100)}
                min={0} max={50} step={1} decimals={0} suffix="%"
                onChange={(v) => { void setDisplaySettings({ textureOpacity: v / 100 }); }}
              />
            </View>
          </View>

          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Edge shadow</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <NumberStepper
                value={Math.round(display.vignetteStrength * 100)}
                min={0} max={100} step={5} decimals={0} suffix="%"
                onChange={(v) => { void setDisplaySettings({ vignetteStrength: v / 100 }); }}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnSecondary, { marginTop: 10 }]}
            onPress={() => { void resetDisplaySettings(); }}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sessionBtnSecondaryText}>RESET TO DEFAULT</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* OTA-860 — GUIDANCE: master switch for the first-time tips that pop up the
            first time you open each system. Off hides them everywhere; the reset makes
            them all show once more (e.g. after a big update). */}
        {tab === 'display' && (
        <View style={styles.musicCard}>
          <View style={styles.musicHeader}>
            <Text style={styles.musicTitle} accessibilityRole="header">GUIDANCE</Text>
          </View>
          <Text style={styles.sessionHint}>
            Short tips pop up the first time you open a screen. Turn them off, or show them
            all again after an update.
          </Text>

          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>First-time tips</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => { void setHintsDisabled(!hintsDisabled); }}
              style={[styles.musicToggle, !hintsDisabled && styles.musicToggleOn]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="First-time tips"
              accessibilityState={{ selected: !hintsDisabled }}
            >
              <Text style={[styles.musicToggleText, !hintsDisabled && styles.musicToggleTextOn]}>
                {hintsDisabled ? 'OFF' : 'ON'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnSecondary, { marginTop: 10 }]}
            onPress={() => {
              void resetAllFirstTimeHints();
              void setHintsDisabled(false);
              setTipsReset(true);
              setTimeout(() => setTipsReset(false), 2000);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.sessionBtnSecondaryText}>{tipsReset ? 'TIPS RESET ✓' : 'SHOW ALL TIPS AGAIN'}</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* OTA-898 (SA-6) — ACCESSIBILITY: reduce motion holds the UI's looping /
            flashing animations (the low-HP damage flash, the tutorial pulse)
            static. Text size is driven by the OS font-size setting — the app
            respects it everywhere — so it isn't duplicated here. */}
        {tab === 'display' && (
        <View style={styles.musicCard}>
          <View style={styles.musicHeader}>
            <Text style={styles.musicTitle} accessibilityRole="header">ACCESSIBILITY</Text>
          </View>
          <Text style={styles.sessionHint}>
            Reduce motion holds pulsing and flashing effects still. Text size follows your
            device&apos;s system font-size setting.
          </Text>

          <View
            style={styles.musicRow}
            accessible
            accessibilityRole="switch"
            accessibilityLabel="Reduce motion"
            accessibilityState={{ checked: reduceMotion }}
          >
            <Text style={styles.musicLabel}>Reduce motion</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => setReduceMotion(!reduceMotion)}
              style={[styles.musicToggle, reduceMotion && styles.musicToggleOn]}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityLabel="Reduce motion"
              accessibilityState={{ checked: reduceMotion }}
            >
              <Text style={[styles.musicToggleText, reduceMotion && styles.musicToggleTextOn]}>
                {reduceMotion ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        )}

        {tab === 'sfx' && (
        <View style={styles.musicCard}>
          <View style={styles.musicHeader}>
            <Text style={styles.musicTitle} accessibilityRole="header">MUSIC</Text>
            <TouchableOpacity
              onPress={toggleMusic}
              style={[styles.musicToggle, audio.enabled && styles.musicToggleOn]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Music"
              accessibilityState={{ selected: audio.enabled }}
            >
              <Text style={[styles.musicToggleText, audio.enabled && styles.musicToggleTextOn]}>
                {audio.enabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Volume</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {/* OTA 225 — same NumberStepper pattern as voice Rate /
                  Pitch. SimpleSlider was twitchy on a fingertip
                  contact patch. Stepper works in 5% increments;
                  tap the number to type an exact value. Volume is
                  stored 0..1 internally so the on-change converts
                  back from the displayed percent. */}
              <NumberStepper
                value={Math.round(audio.volume * 100)}
                min={0}
                max={100}
                step={5}
                decimals={0}
                suffix="%"
                onChange={(v) => setMusicVolume(v / 100)}
              />
            </View>
          </View>
          {/* arb17 — voice ducking: how much the music dips while the
              Arbiter speaks. 0% = off; default 15%. Stored 0..0.5. */}
          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Duck under voice</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <NumberStepper
                value={Math.round((audio.duck ?? 0.15) * 100)}
                min={0}
                max={50}
                step={5}
                decimals={0}
                suffix="%"
                onChange={(v) => setMusicDuck(v / 100)}
              />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.applyBtn, applyFlash && styles.applyBtnFlash]}
            onPress={applyMusic}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.applyBtnText, applyFlash && styles.applyBtnTextFlash]}>
              {applyFlash ? 'APPLIED' : 'APPLY'}
            </Text>
          </TouchableOpacity>
        </View>
        )}

        {tab === 'sfx' && (
        <View style={styles.musicCard}>
          <View style={styles.musicHeader}>
            <Text style={styles.musicTitle} accessibilityRole="header">VOICE</Text>
          </View>

          {/* Toggles stay tappable even when the availability probe
              came back empty — some Android devices return no voice
              catalog but the TTS bridge still works. Notes below the
              row tell the player what to expect. */}
          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Read aloud (TTS)</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={toggleTTS}
              style={[styles.musicToggle, voice.ttsEnabled && styles.musicToggleOn]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Read aloud (TTS)"
              accessibilityState={{ selected: voice.ttsEnabled }}
            >
              <Text style={[styles.musicToggleText, voice.ttsEnabled && styles.musicToggleTextOn]}>
                {voice.ttsEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* OTA-189 — Speak input (STT) toggle row + !sttAvailable
              hint removed per player ask: "remove the stt button, the
              code for it from the game, and the button for activation
              from the voice tab in settings." */}

          {!ttsAvailable && (
            <Text style={styles.voiceNote}>
              Voice catalog appears empty on this device — toggle on and listen for the first
              line of narration. If nothing plays, check Android Settings → Accessibility →
              Text-to-speech output, and confirm an engine (Google TTS, Samsung TTS, etc.) is
              installed and selected.
            </Text>
          )}

          {voice.ttsEnabled && (
            <>
              {/* Engine picker — System uses expo-speech (lightweight,
                  device-dependent quality); Bundled uses the Kokoro-82M
                  neural voice via react-native-executorch (better quality,
                  fully offline, ~100 MB one-time download). */}
              <View style={styles.musicRow}>
                <Text style={styles.musicLabel}>Engine</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => switchEngine('system')}
                    style={[styles.musicToggle, voice.engine === 'system' && styles.musicToggleOn]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="System voice engine"
                    accessibilityState={{ selected: voice.engine === 'system' }}
                  >
                    <Text style={[styles.musicToggleText, voice.engine === 'system' && styles.musicToggleTextOn]}>SYSTEM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => switchEngine('bundled')}
                    style={[styles.musicToggle, voice.engine === 'bundled' && styles.musicToggleOn]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Bundled voice engine"
                    accessibilityState={{ selected: voice.engine === 'bundled' }}
                  >
                    <Text style={[styles.musicToggleText, voice.engine === 'bundled' && styles.musicToggleTextOn]}>BUNDLED</Text>
                  </TouchableOpacity>
                  {/* Third button — kicks the Kokoro install / re-check.
                      Independent of the engine toggle so a player can
                      force a download or re-verify the model even while
                      SYSTEM is active. Label adapts to install state. */}
                  <TouchableOpacity
                    onPress={handleEngineThirdBtn}
                    style={[styles.musicToggle, kokoroState.phase === 'ready' && styles.musicToggleOn]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Download or update bundled voice"
                  >
                    <Text style={[styles.musicToggleText, kokoroState.phase === 'ready' && styles.musicToggleTextOn]}>
                      {kokoroState.phase === 'downloading' ? `${Math.round(kokoroState.fraction * 100)}%` :
                       kokoroState.phase === 'loading' ? 'LOAD' :
                       kokoroState.phase === 'ready' ? 'UPDATE' :
                       kokoroState.phase === 'error' ? 'RETRY' :
                       'DOWNLOAD'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {voice.engine === 'bundled' && (
                <>
                  <Text style={styles.voiceNote}>
                    Bundled = Kokoro-82M neural voice via react-native-executorch. Higher
                    quality than the system engine, fully offline. ~100 MB one-time download
                    on first use; cached forever after.
                  </Text>
                  {/* Explicit status — never make the player guess. */}
                  <Text style={styles.voiceNote}>
                    Status:{' '}
                    {kokoroState.phase === 'idle' && 'Not loaded yet. Tap TEST VOICE to start.'}
                    {kokoroState.phase === 'downloading' &&
                      `Downloading model… ${Math.round(kokoroState.fraction * 100)}%`}
                    {kokoroState.phase === 'loading' && 'Loading model into memory…'}
                    {kokoroState.phase === 'ready' && '✓ Installed and ready.'}
                    {kokoroState.phase === 'error' && (
                      <Text style={{ color: '#e07a5f' }}>Error: {kokoroState.message}</Text>
                    )}
                  </Text>
                  <TouchableOpacity
                    onPress={testKokoro}
                    style={[styles.applyBtn, { marginTop: 4 }]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Text style={styles.applyBtnText}>
                      {kokoroState.phase === 'ready' ? 'TEST VOICE' :
                       kokoroState.phase === 'downloading' || kokoroState.phase === 'loading' ? 'WORKING…' :
                       'TEST VOICE (downloads on first tap)'}
                    </Text>
                  </TouchableOpacity>
                  {/* OTA 23-018 — manual recovery for the "downloaded
                      but failed to load" case where a prior partial
                      download cached a corrupt model file. The cache
                      check only verifies size > 0; a truncated 30 MB
                      file passes that check and gets re-used forever.
                      This button nukes the cache dir. Next TEST VOICE
                      tap re-downloads from scratch. */}
                  <TouchableOpacity
                    onPress={handleClearKokoroCache}
                    style={[styles.applyBtn, { marginTop: 4, backgroundColor: 'transparent', borderColor: '#5a3a2a', borderWidth: 1 }]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.applyBtnText, { color: '#c9a26a' }]}>
                      {kokoroCacheCleared ? 'CACHE CLEARED — TAP TEST VOICE' : 'CLEAR BUNDLED VOICE CACHE'}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.musicRow}>
                    <Text style={styles.musicLabel}>Voice</Text>
                    <TouchableOpacity onPress={() => cycleKokoroVoice(-1)} style={styles.voiceCycleBtn} accessibilityRole="button" accessibilityLabel="Previous voice">
                      <Text style={styles.voiceCycleText}>◀</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, paddingHorizontal: 6 }}>
                      <Text style={styles.voicePickerLabel} numberOfLines={1}>
                        {voice.kokoroVoice.toUpperCase().replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => cycleKokoroVoice(1)} style={styles.voiceCycleBtn} accessibilityRole="button" accessibilityLabel="Next voice">
                      <Text style={styles.voiceCycleText}>▶</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {/* OTA-285 — master TTS volume slider. Parallel to the
                  Music card's Volume row above. Bundled engine: takes
                  effect on the next utterance (expo-av Sound created
                  with this volume). System engine on iOS: passed to
                  Speech.speak's volume option. System engine on
                  Android: ignored — Android's system TTS uses the
                  device media stream volume. Surfaced via a one-line
                  note below the slider so testers know. */}
              <View style={styles.musicRow}>
                <Text style={styles.musicLabel}>Volume</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <NumberStepper
                    value={Math.round((voice.volume ?? 1) * 100)}
                    min={0}
                    max={100}
                    step={5}
                    decimals={0}
                    suffix="%"
                    onChange={(v) => setVoiceVolume(v / 100)}
                  />
                </View>
              </View>
              {voice.engine === 'system' && Platform.OS === 'android' && (
                <Text style={styles.voiceNote}>
                  System engine on Android uses the device media volume — use the hardware
                  volume keys to adjust. Switch to BUNDLED to control voice volume from this
                  slider.
                </Text>
              )}
              <View style={styles.musicRow}>
                <Text style={styles.musicLabel}>Rate</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <NumberStepper
                    value={voice.rate}
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    suffix="x"
                    onChange={setRate}
                  />
                </View>
              </View>
              <View style={styles.musicRow}>
                <Text style={styles.musicLabel}>Pitch</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <NumberStepper
                    value={voice.pitch}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    onChange={setPitch}
                  />
                </View>
              </View>
              {/* System-engine voice picker — only relevant when the
                  player is on the SYSTEM engine. When BUNDLED is
                  selected, the Kokoro voice picker above is the
                  active one; this row would just show "No voices
                  installed" because the system voice cache is empty
                  on devices where the bundled engine is the user's
                  choice. */}
              {voice.engine === 'system' && (
                <View style={styles.musicRow}>
                  <Text style={styles.musicLabel}>Voice</Text>
                  <TouchableOpacity onPress={() => cycleVoice(-1)} style={styles.voiceCycleBtn} accessibilityRole="button" accessibilityLabel="Previous voice">
                    <Text style={styles.voiceCycleText}>◀</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, paddingHorizontal: 6 }}>
                    <Text style={styles.voicePickerLabel} numberOfLines={1}>{currentVoiceLabel}</Text>
                  </View>
                  <TouchableOpacity onPress={() => cycleVoice(1)} style={styles.voiceCycleBtn} accessibilityRole="button" accessibilityLabel="Next voice">
                    <Text style={styles.voiceCycleText}>▶</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* OTA-189 — Auto-submit speech row removed alongside the
              STT toggle. The autoSubmit flag is still persisted in
              voiceSettings for any future restoration, but with STT
              gone there's nothing to auto-submit. */}

          {/* Voice tab has its own COPY ALL — copies just the
              Voice diagnostic block (plus the identifier header) so
              the player can hand-off voice-specific issues without
              the full About dump. */}
          <TouchableOpacity
            onPress={handleVoiceCopy}
            style={[styles.applyBtn, { marginTop: 8 }]}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.applyBtnText}>{voiceCopied ? 'COPIED' : 'COPY VOICE INFO'}</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* v2.4.1 (OTA 046) — LORE tab. Renders the shared
            LoreCodexBody (races / factions / places / timeline)
            inside the gear-screen. Same content as the standalone
            LoreScreen, no duplicate code. */}
        {tab === 'lore' && (
          <LoreCodexBody />
        )}

        {tab === 'about' && (
        <>
          <Text style={styles.mono}>{info}</Text>
          <View style={styles.dedication}>
            <Text style={styles.dedicationRule}>· · ·</Text>
            <Text style={styles.dedicationBody}>
              For my wife and my children — who put up with a man who was always on his
              phone, building this. You were the reason I kept going, and the reason I
              should have looked up more. Thank you for the patience I did not earn.
            </Text>
            <Text style={styles.dedicationSign}>— Verbal</Text>
          </View>
        </>
        )}

        {tab === 'notices' && (
        <View>
          <Text style={styles.noticesPreamble}>{NOTICES_PREAMBLE}</Text>
          <Text style={styles.noticesVerified}>
            Last verified: {NOTICES_VERIFIED_AT}
          </Text>
          {THIRD_PARTY_NOTICES.map((n) => {
            const expanded = expandedNoticeId === n.id;
            return (
              <View key={n.id} style={styles.noticeCard}>
                <TouchableOpacity
                  onPress={() => setExpandedNoticeId(expanded ? null : n.id)}
                  activeOpacity={0.7}
                  style={styles.noticeHeaderRow}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noticeName}>{n.name}</Text>
                    <Text style={styles.noticeLicense}>{n.license}</Text>
                  </View>
                  <Text style={styles.noticeChevron}>{expanded ? '▾' : '▸'}</Text>
                </TouchableOpacity>
                <Text style={styles.noticeRole}>{n.role}</Text>
                <Text style={styles.noticeCopyright}>{n.copyright}</Text>
                <Text style={styles.noticeUrl} selectable>
                  {n.url}
                </Text>
                {expanded && (
                  <View style={styles.noticeLicenseBlock}>
                    <Text style={styles.noticeLicenseText} selectable>
                      {n.text}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        )}
      </ScrollView>

      {tab === 'about' && (
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.copyText}>{copied ? 'COPIED' : 'COPY ALL'}</Text>
        </TouchableOpacity>
      )}

      {/* OTA 007 — UPDATE button + busy overlay moved to TitleScreen
          (under Lore Codex) so the player can pull updates from the
          main screen without opening settings. */}

      {/* arb75 — in-game bug report (bundles voice + device + log into one
          clipboard copy → one paste). Native zero-paste (mail-composer) is
          a follow-up build. */}
      <BugReportModal
        visible={bugReportOpen}
        slots={bugReportSlots}
        onCancel={() => setBugReportOpen(false)}
        onSend={(args) => { void composeAndSendBugReport(args); setBugReportOpen(false); }}
      />
    </View>
  );
}

// Defensive accessor — older builds may not have every Updates.* field. Wrap
// each access so a missing key returns "(unavailable)" instead of crashing
// the About screen.
function safeUpdates<T>(fn: () => T): string {
  try {
    const v = fn();
    return v === undefined || v === null ? '(unset)' : String(v);
  } catch {
    return '(unavailable)';
  }
}

const styles = StyleSheet.create({
  // OTA-275 — tablet width cap. Phones unchanged; iPad centers at 600pt.
  container: { flex: 1, backgroundColor: 'transparent', padding: 12, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
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
  back: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  body: {
    flex: 1,
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },
  bodyContent: { paddingBottom: 24 },
  mono: { color: '#cdbf99', fontSize: 12, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  // Tab row sits below the header. Three equal-flex chips; the active
  // one is filled (amber on dark) and the others are outlined.
  tabRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 4,
    borderColor: '#3a342c',
    borderWidth: 1,
    backgroundColor: '#1a1612',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#c9a86a',
    borderColor: '#c9a86a',
  },
  tabBtnText: {
    color: '#cdbf99',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabBtnTextActive: {
    color: '#13110f',
  },
  musicCard: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    marginBottom: 14,
    backgroundColor: '#1a1714',
  },
  dedication: {
    marginTop: 28,
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  dedicationRule: {
    color: '#3a4348',
    fontSize: 13,
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 16,
  },
  dedicationBody: {
    color: '#8aa0a4',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 21,
    textAlign: 'center',
  },
  dedicationSign: {
    color: '#cdbf99',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 1,
  },
  // v2.4.1 (OTA 047) — SESSION tab styles. Primary button (save &
  // exit) is warm gold + filled, the two secondaries (copy / clear
  // log) sit in a row below in outlined neutral tone.
  sessionCard: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 14,
    marginBottom: 14,
    backgroundColor: '#13110f',
  },
  sessionLabel: {
    color: '#c9a86a',
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '700',
    marginBottom: 8,
  },
  sessionHint: {
    color: '#cdbf99',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  sessionBtn: {
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sessionBtnPrimary: {
    backgroundColor: '#c9a86a',
    borderColor: '#c9a86a',
    marginBottom: 10,
  },
  sessionBtnPrimaryText: {
    color: '#13110f',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  // OTA-web10 — the crash-delivery opt-in row.
  crashOptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    borderWidth: 1, borderColor: '#4a4136', borderRadius: 3, padding: 10,
  },
  crashOptTitle: { color: '#c9a86a', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  crashOptBody: { color: '#a2977b', fontSize: 11, lineHeight: 16, marginTop: 4 },
  crashOptBtn: {
    borderWidth: 1, borderColor: '#6f93c4', borderRadius: 3,
    paddingVertical: 8, paddingHorizontal: 14, minWidth: 62, alignItems: 'center',
  },
  crashOptBtnOn: { backgroundColor: '#123a3a', borderColor: '#7ef0dd' },
  // ⚠ Dashed + muted when the build cannot deliver, matching the codex's
  // locked-row language rather than dimming the whole row's contrast.
  crashOptBtnDead: { borderStyle: 'dashed', borderColor: '#5a5245' },
  crashOptBtnText: { color: '#9ec0ef', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  crashOptBtnTextOn: { color: '#c7fff4' },
  // Failed-save flash on the SAVE button — red so a silent save failure is loud
  // (bright enough that the dark primary text still reads on it).
  sessionBtnDanger: {
    backgroundColor: '#e07a5f',
    borderColor: '#e07a5f',
  },
  sessionBtnSecondary: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
  },
  sessionBtnSecondaryText: {
    color: '#c9a86a',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  sessionBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sessionFootnote: {
    color: '#a2977b',
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
    marginTop: 4,
  },
  musicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  musicTitle: { color: '#c9a86a', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  musicToggle: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#3a342c',
    minWidth: 56,
    alignItems: 'center',
  },
  musicToggleOn: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  musicToggleText: { color: '#a2977b', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  musicToggleTextOn: { color: '#13110f' },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  musicLabel: { color: '#a2977b', fontSize: 11, letterSpacing: 1, width: 60 },
  // arb85 — color-wheel row (stacked + centered, full width).
  wheelRow: { alignItems: 'center', gap: 8, marginVertical: 6 },
  wheelLabel: { color: '#a2977b', fontSize: 11, letterSpacing: 2, textAlign: 'center' },
  wheelHint: { color: '#a2977b', fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },
  musicValue: { color: '#cdbf99', fontSize: 11, fontVariant: ['tabular-nums'], width: 44, textAlign: 'right' },
  applyBtn: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#c9a86a',
    alignSelf: 'flex-end',
  },
  applyBtnFlash: { backgroundColor: '#c9a86a' },
  applyBtnText: { color: '#c9a86a', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  applyBtnTextFlash: { color: '#13110f' },
  voiceNote: { color: '#a2977b', fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  voiceCycleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    borderColor: '#3a342c',
    borderWidth: 1,
    backgroundColor: '#1a1612',
  },
  voiceCycleText: { color: '#c9a86a', fontSize: 12, fontWeight: '700' },
  voicePickerLabel: { color: '#cdbf99', fontSize: 11, textAlign: 'center' },
  copyBtn: {
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  copyText: { color: '#0a0908', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  noticesPreamble: {
    color: '#cdbf99',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  noticesVerified: {
    color: '#a2977b',
    fontSize: 10,
    letterSpacing: 1,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  noticeCard: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    marginBottom: 10,
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeName: {
    color: '#e6d8b3',
    fontSize: 14,
    fontWeight: '700',
  },
  noticeLicense: {
    color: '#c9a86a',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginTop: 2,
  },
  noticeChevron: {
    color: '#c9a86a',
    fontSize: 16,
    paddingLeft: 8,
    paddingRight: 4,
  },
  noticeRole: {
    color: '#cdbf99',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  noticeCopyright: {
    color: '#a2977b',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  noticeUrl: {
    color: '#9ec96a',
    fontSize: 11,
    marginTop: 4,
  },
  noticeLicenseBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
  },
  noticeLicenseText: {
    color: '#cdbf99',
    fontSize: 10,
    lineHeight: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

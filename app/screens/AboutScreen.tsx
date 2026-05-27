import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, PermissionsAndroid } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import { useGameStore } from '../state/gameStore';
import { OTA_BUILD_ID } from '../buildInfo';
import { buildBasicDeviceSummary, stampLogExport } from '../diagnostics/aboutSummary';
import { NumberStepper } from '../components/NumberStepper';
import { LoreCodexBody } from '../components/LoreCodexBody';
import {
  flushLogWrites,
  readFullLog,
  getLastLogWriteError,
  clearLastLogWriteError,
  clearActiveSlotLog,
} from '../engine/saveSystem';
import { getAudioSettings, setAudioSettings, onAudioSettingsChange, type AudioSettings } from '../audio/audioSettings';
import { forceReapplyAudioFromState } from '../audio/AudioController';
import {
  getVoiceSettings,
  setVoiceSettings,
  onVoiceSettingsChange,
  type VoiceSettings,
} from '../voice/voiceSettings';
import { isTTSAvailable, getTTSVoices, stopAndClear as stopTTS } from '../voice/TTSManager';
import { isSTTAvailable } from '../voice/STTManager';
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
  const gameLogLength = useGameStore((s) => s.gameLog.length);
  const player = useGameStore((s) => s.player);

  const [copied, setCopied] = useState(false);
  const [voiceCopied, setVoiceCopied] = useState(false);
  const [kokoroCacheCleared, setKokoroCacheCleared] = useState(false);
  const [kokoroCache, setKokoroCache] = useState<ExecutorchCacheEntry[]>([]);
  // v2.4.1 (OTA 047) — SESSION tab added and made the first thing
  // seen when the gear opens. Holds save & exit, copy log, and
  // clear log — the three actions that previously cluttered the
  // bottom of the ExplorationScreen menu row. save & exit is the
  // most-pressed action, so it's the default tab on open.
  const [tab, setTab] = useState<'session' | 'sfx' | 'lore' | 'about'>('session');
  const [logCharCount, setLogCharCount] = useState(0);
  const [logCopied, setLogCopied] = useState(false);
  const [logCleared, setLogCleared] = useState(false);
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
  async function handleCopyLog() {
    try {
      await flushLogWrites();
      const fresh = await readFullLog();
      const total = Math.max(1, Math.ceil(fresh.length / LOG_CHUNK_SIZE));
      // Single-chunk path — old behaviour, single COPIED flash.
      // OTA-101 — stampLogExport bundles the basic device/
      // install summary at the end so the report always carries
      // build context.
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
  const [sttAvailable, setSttAvailable] = useState<boolean>(true);
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
    void Promise.all([isTTSAvailable(), getTTSVoices(), isSTTAvailable(), isPiperInstalled()]).then(
      ([ttsOk, voices, sttOk, piperOk]) => {
        setTtsAvailable(ttsOk);
        setVoicesList(voices);
        setSttAvailable(sttOk);
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
  const toggleSTT = async () => {
    const next = !voice.sttEnabled;
    if (next && Platform.OS === 'android') {
      // Request RECORD_AUDIO up-front when the player enables STT —
      // surfaces the Android permission prompt right at the moment of
      // intent rather than waiting until they tap the mic button mid-
      // game. If they deny, leave the toggle OFF + show a one-time
      // hint via the voice note below.
      try {
        const perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
        if (!perm) return;
        const granted = await PermissionsAndroid.request(
          perm,
          {
            title: 'Microphone access',
            message:
              'Tartaria Realms needs the microphone so you can speak commands to the Arbiter. ' +
              'You can disable speech input any time from Settings → SFX.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          // Permission denied — leave the toggle OFF.
          return;
        }
      } catch {
        // Best-effort; if the prompt errors we still toggle so the
        // user can try via the mic button anyway.
      }
    }
    void setVoiceSettings({ sttEnabled: next });
  };
  // Direct setters — the NumberStepper passes the actual rate / pitch
  // value (not a 0..1 normalized fraction the old slider used), so no
  // remapping needed. Clamp guards against any future range drift.
  const setRate = (v: number) => { void setVoiceSettings({ rate: v }); };
  const setPitch = (v: number) => { void setVoiceSettings({ pitch: v }); };
  const toggleAutoSubmit = () => { void setVoiceSettings({ autoSubmit: !voice.autoSubmit }); };
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
          ? `Yes — ${updUpdateId}`
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
      `  STT enabled: ${voice.sttEnabled ? 'yes' : 'no'}`,
      `  Engine: ${voice.engine}`,
      `  Rate: ${voice.rate.toFixed(2)} · Pitch: ${voice.pitch.toFixed(2)}`,
      `  System voice id: ${voice.voiceId ?? '(default)'}`,
      `  Kokoro voice: ${voice.kokoroVoice}`,
      `  Auto-submit STT: ${voice.autoSubmit ? 'yes' : 'no'}`,
      `  TTS availability: ${ttsAvailable ? 'yes' : 'no'}`,
      `  STT availability: ${sttAvailable ? 'yes' : 'no'}`,
      `  Installed voices: ${voicesList.length}`,
      `  Kokoro state: ${
        kokoroState.phase === 'idle' ? 'idle (not loaded yet)' :
        kokoroState.phase === 'downloading' ? `downloading ${Math.round(kokoroState.fraction * 100)}%` :
        kokoroState.phase === 'loading' ? 'loading model into memory' :
        kokoroState.phase === 'ready' ? 'ready' :
        `error: ${kokoroState.message}`
      }`,
    ];
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
  }, [voice, ttsAvailable, sttAvailable, voicesList, kokoroState, kokoroCache]);

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
        >
          <Text style={styles.back}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SETTINGS</Text>
        <View style={{ width: 80 }} />
      </View>

      {/* Tab row — two sections in one screen. OTA 23-006 collapsed
          'music' + 'voice' into a single SFX tab; the technical
          ABOUT / diagnostic block stays its own tab. Music card
          renders first inside SFX (most tweaked), voice card below. */}
      <View style={styles.tabRow}>
        {(['session', 'sfx', 'lore', 'about'] as const).map((id) => (
          <TouchableOpacity
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tabBtn, tab === id && styles.tabBtnActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabBtnText, tab === id && styles.tabBtnTextActive]}>
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
          <Text style={styles.sessionLabel}>RUN CONTROLS</Text>
          <Text style={styles.sessionHint}>
            Save your progress, copy the on-disk log for sharing, or wipe the log
            so the next paste-back contains only fresh activity.
          </Text>

          <TouchableOpacity
            style={[styles.sessionBtn, styles.sessionBtnPrimary]}
            onPress={() => { void saveAndExitToTitle(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.sessionBtnPrimaryText}>SAVE &amp; EXIT TO TITLE</Text>
          </TouchableOpacity>

          <View style={styles.sessionBtnRow}>
            <TouchableOpacity
              style={[styles.sessionBtn, styles.sessionBtnSecondary, { flex: 1 }]}
              onPress={() => { void handleCopyLog(); }}
              activeOpacity={0.7}
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
            >
              <Text style={styles.sessionBtnSecondaryText}>
                {logCleared ? '✓ CLEARED' : 'CLEAR LOG'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sessionFootnote}>
            COPY LOG drops the full disk log on the clipboard. Long-press it in the
            in-game menu (or use the LOG screen) for the share + chunked-paste view.
            CLEAR LOG wipes both the on-disk log and the in-memory feed — the next
            log paste-back will contain only the play that follows.
          </Text>
        </View>
        )}

        {tab === 'sfx' && (
        <View style={styles.musicCard}>
          <View style={styles.musicHeader}>
            <Text style={styles.musicTitle}>MUSIC</Text>
            <TouchableOpacity
              onPress={toggleMusic}
              style={[styles.musicToggle, audio.enabled && styles.musicToggleOn]}
              activeOpacity={0.7}
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
          <TouchableOpacity
            style={[styles.applyBtn, applyFlash && styles.applyBtnFlash]}
            onPress={applyMusic}
            activeOpacity={0.7}
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
            <Text style={styles.musicTitle}>VOICE</Text>
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
            >
              <Text style={[styles.musicToggleText, voice.ttsEnabled && styles.musicToggleTextOn]}>
                {voice.ttsEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.musicRow}>
            <Text style={styles.musicLabel}>Speak input (STT)</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={toggleSTT}
              style={[styles.musicToggle, voice.sttEnabled && styles.musicToggleOn]}
              activeOpacity={0.7}
            >
              <Text style={[styles.musicToggleText, voice.sttEnabled && styles.musicToggleTextOn]}>
                {voice.sttEnabled ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {!ttsAvailable && (
            <Text style={styles.voiceNote}>
              Voice catalog appears empty on this device — toggle on and listen for the first
              line of narration. If nothing plays, check Android Settings → Accessibility →
              Text-to-speech output, and confirm an engine (Google TTS, Samsung TTS, etc.) is
              installed and selected.
            </Text>
          )}
          {!sttAvailable && (
            <Text style={styles.voiceNote}>
              Speech recognition reports as unavailable on this device — many Android devices
              gate availability on the first mic request. Toggle on and tap the 🎙 button in
              the input box; the OS will prompt for microphone permission. Grant it and
              speech recognition should start working.
            </Text>
          )}

          {voice.ttsEnabled && (
            <>
              {/* Engine picker — System uses expo-speech (lightweight,
                  device-dependent quality); Bundled uses the Piper
                  neural voice via sherpa-onnx (better quality, requires
                  one-time ~63 MB download). */}
              <View style={styles.musicRow}>
                <Text style={styles.musicLabel}>Engine</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => switchEngine('system')}
                    style={[styles.musicToggle, voice.engine === 'system' && styles.musicToggleOn]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.musicToggleText, voice.engine === 'system' && styles.musicToggleTextOn]}>SYSTEM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => switchEngine('bundled')}
                    style={[styles.musicToggle, voice.engine === 'bundled' && styles.musicToggleOn]}
                    activeOpacity={0.7}
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
                  >
                    <Text style={[styles.applyBtnText, { color: '#c9a26a' }]}>
                      {kokoroCacheCleared ? 'CACHE CLEARED — TAP TEST VOICE' : 'CLEAR BUNDLED VOICE CACHE'}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.musicRow}>
                    <Text style={styles.musicLabel}>Voice</Text>
                    <TouchableOpacity onPress={() => cycleKokoroVoice(-1)} style={styles.voiceCycleBtn}>
                      <Text style={styles.voiceCycleText}>◀</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, paddingHorizontal: 6 }}>
                      <Text style={styles.voicePickerLabel} numberOfLines={1}>
                        {voice.kokoroVoice.toUpperCase().replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => cycleKokoroVoice(1)} style={styles.voiceCycleBtn}>
                      <Text style={styles.voiceCycleText}>▶</Text>
                    </TouchableOpacity>
                  </View>
                </>
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
                  <TouchableOpacity onPress={() => cycleVoice(-1)} style={styles.voiceCycleBtn}>
                    <Text style={styles.voiceCycleText}>◀</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, paddingHorizontal: 6 }}>
                    <Text style={styles.voicePickerLabel} numberOfLines={1}>{currentVoiceLabel}</Text>
                  </View>
                  <TouchableOpacity onPress={() => cycleVoice(1)} style={styles.voiceCycleBtn}>
                    <Text style={styles.voiceCycleText}>▶</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {voice.sttEnabled && (
            <View style={styles.musicRow}>
              <Text style={styles.musicLabel}>Auto-submit speech</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={toggleAutoSubmit}
                style={[styles.musicToggle, voice.autoSubmit && styles.musicToggleOn]}
                activeOpacity={0.7}
              >
                <Text style={[styles.musicToggleText, voice.autoSubmit && styles.musicToggleTextOn]}>
                  {voice.autoSubmit ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Voice tab has its own COPY ALL — copies just the
              Voice diagnostic block (plus the identifier header) so
              the player can hand-off voice-specific issues without
              the full About dump. */}
          <TouchableOpacity
            onPress={handleVoiceCopy}
            style={[styles.applyBtn, { marginTop: 8 }]}
            activeOpacity={0.7}
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
        <Text style={styles.mono}>{info}</Text>
        )}
      </ScrollView>

      {tab === 'about' && (
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
          <Text style={styles.copyText}>{copied ? 'COPIED' : 'COPY ALL'}</Text>
        </TouchableOpacity>
      )}

      {/* OTA 007 — UPDATE button + busy overlay moved to TitleScreen
          (under Lore Codex) so the player can pull updates from the
          main screen without opening settings. */}
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
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
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
    gap: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 4,
    borderColor: '#3a342c',
    borderWidth: 1,
    backgroundColor: '#1a1612',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#c9a86a',
    borderColor: '#c9a86a',
  },
  tabBtnText: {
    color: '#cdbf99',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
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
    color: '#7a705c',
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
  musicToggleText: { color: '#7a705c', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  musicToggleTextOn: { color: '#13110f' },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  musicLabel: { color: '#7a705c', fontSize: 11, letterSpacing: 1, width: 60 },
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
  voiceNote: { color: '#7a705c', fontSize: 11, marginTop: 4, fontStyle: 'italic' },
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
});

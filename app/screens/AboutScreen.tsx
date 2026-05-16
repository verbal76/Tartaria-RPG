import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Modal, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import { useGameStore } from '../state/gameStore';
import { OTA_BUILD_ID } from '../buildInfo';
import { SimpleSlider } from '../components/SimpleSlider';
import { getAudioSettings, setAudioSettings, onAudioSettingsChange, type AudioSettings } from '../audio/audioSettings';
import { forceReapplyAudioFromState } from '../audio/AudioController';
import { disposeAudio } from '../audio/AudioManager';

export function AboutScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const cognitiveStatus = useGameStore((s) => s.cognitiveStatus);
  const cognitiveFraction = useGameStore((s) => s.cognitiveFraction);
  const cognitiveError = useGameStore((s) => s.cognitiveError);
  const cognitiveLastResponse = useGameStore((s) => s.cognitiveLastResponse);
  const cognitiveModelInfo = useGameStore((s) => s.cognitiveModelInfo);
  const gameLogLength = useGameStore((s) => s.gameLog.length);
  const player = useGameStore((s) => s.player);

  const [copied, setCopied] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('Idle');
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [audio, setAudio] = useState<AudioSettings>(() => getAudioSettings());

  useEffect(() => {
    setAudio(getAudioSettings());
    return onAudioSettingsChange(setAudio);
  }, []);

  const [applyFlash, setApplyFlash] = useState(false);
  const toggleMusic = () => { void setAudioSettings({ enabled: !audio.enabled }); };
  const setMusicVolume = (v: number) => { void setAudioSettings({ volume: v }); };
  const applyMusic = () => {
    void forceReapplyAudioFromState().then(() => {
      setApplyFlash(true);
      setTimeout(() => setApplyFlash(false), 1200);
    });
  };

  async function checkForUpdate() {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateError(null);
    try {
      if (!Updates.isEnabled) {
        setUpdateStatus('Disabled (dev build / Expo Go)');
        return;
      }
      setUpdateStatus('Checking…');
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setUpdateStatus('Already up to date');
        return;
      }
      setUpdateStatus('Downloading update…');
      await Updates.fetchUpdateAsync();
      // Flush the player's progress to disk BEFORE handing control to
      // expo-updates. If reloadAsync starts while AsyncStorage is still
      // mid-write, the slot can end up persisted with player=null —
      // which is exactly what was corrupting saves across updates.
      setUpdateStatus('Saving progress…');
      try {
        await useGameStore.getState().persist();
      } catch (persistErr) {
        // Don't block the update on persist failure, but record it.
        const m = persistErr instanceof Error ? persistErr.message : String(persistErr);
        setUpdateError(`Save flush warning: ${m}`);
      }

      // Tear down native resources BEFORE reloadAsync. Both expo-av Sound
      // objects and the ONNX runtime session can hold native handles that
      // block the JS bridge from cleanly restarting — that's why
      // reloadAsync was hanging on a black screen forever. Releasing
      // these explicitly lets the bridge finish reload.
      setUpdateStatus('Releasing resources…');
      try {
        await disposeAudio();
      } catch { /* ignore */ }
      try {
        await useGameStore.getState().shutdownCognitive();
      } catch { /* ignore */ }

      setUpdateStatus('Restarting to apply…');
      // Await reloadAsync directly + log if it throws. The old fire-and-
      // forget setTimeout swallowed reload errors and gave us no signal
      // when reload simply didn't happen.
      try {
        await Updates.reloadAsync();
      } catch (reloadErr) {
        const m = reloadErr instanceof Error ? reloadErr.message : String(reloadErr);
        setUpdateStatus('Restart failed');
        setUpdateError(`reloadAsync error: ${m}. Please restart the app manually — your progress was saved.`);
      }
    } catch (err) {
      // Capture as much detail as possible — name, message, stack head,
      // any wrapped code property. expo-updates' generic 'Failed to check
      // for update' isn't actionable on its own; we surface everything
      // available so the next playtest screenshot is diagnostic.
      let detail: string;
      if (err instanceof Error) {
        const code = (err as Error & { code?: string }).code;
        const parts = [err.name, code ? `[${code}]` : '', err.message]
          .filter(Boolean)
          .join(' ');
        const stackHead = err.stack ? err.stack.split('\n').slice(0, 2).join(' | ') : '';
        detail = stackHead ? `${parts}\n      ${stackHead}` : parts;
      } else {
        detail = String(err);
      }
      setUpdateStatus('Error');
      setUpdateError(detail);
    } finally {
      setUpdateBusy(false);
    }
  }

  const info = useMemo(() => {
    const expoConfig = Constants.expoConfig;
    const version = expoConfig?.version ?? '0.0.0';
    const mb = (bytes: number | null | undefined) =>
      bytes != null ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : 'unknown';

    // Native APK build number — versionCode baked at gradle build time by
    // the build-apk.yml workflow. Cannot be overridden by OTA, so this
    // always tells you which APK is actually installed.
    const apkBuildNumber = Application.nativeBuildVersion ?? '(unknown)';
    const apkAppVersion = Application.nativeApplicationVersion ?? version;

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

    const lines = [
      `Tartaria Realms`,
      `App version: ${apkAppVersion}`,
      `APK build: ${apkBuildNumber}`,
      `OTA build ID: ${OTA_BUILD_ID}`,
      ``,
      `OTA status`,
      `  Channel: ${updChannel}`,
      `  Runtime version: ${updRuntimeVersion}`,
      `  Last OTA applied: ${otaApplied}`,
      `  OTA published at: ${updCreatedAt || '(none)'}`,
      `  Updates enabled: ${updIsEnabled}`,
      `  Last check: ${updateStatus}${updateError ? `\n    Error: ${updateError}` : ''}`,
      ``,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Hermes: ${typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !== 'undefined' ? 'yes' : 'no'}`,
      ``,
      `Cognitive layer`,
      `  Status: ${cognitiveStatus}`,
      `  Progress: ${(cognitiveFraction * 100).toFixed(0)}%`,
      `  Error: ${cognitiveError ?? 'none'}`,
      cognitiveLastResponse
        ? `  Last response: ${cognitiveLastResponse.inferredEmotions.join(',') || '-'} / ${cognitiveLastResponse.inferredIntentions.join(',') || '-'} (${cognitiveLastResponse.embeddingMs.toFixed(1)}ms embed, ${cognitiveLastResponse.inferenceMs.toFixed(1)}ms infer)`
        : `  Last response: none yet`,
      ``,
      `Model`,
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
  }, [cognitiveStatus, cognitiveFraction, cognitiveError, cognitiveLastResponse, cognitiveModelInfo, player, gameLogLength, updateStatus, updateError]);

  async function handleCopy() {
    await Clipboard.setStringAsync(info);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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
        <Text style={styles.title}>ABOUT</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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
            <View style={{ flex: 1 }}>
              <SimpleSlider value={audio.volume} onChange={setMusicVolume} />
            </View>
            <Text style={styles.musicValue}>{Math.round(audio.volume * 100)}%</Text>
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
        <Text style={styles.mono}>{info}</Text>
      </ScrollView>

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

      <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
        <Text style={styles.copyText}>{copied ? 'COPIED' : 'COPY ALL'}</Text>
      </TouchableOpacity>

      {/* OTA UPDATE OVERLAY — covers the screen while the update is being
          downloaded / saved / applied. Without it, the screen freezes on
          reloadAsync() and the player thinks the app crashed. The spinner
          + status line keeps them informed through the tear-down gap. */}
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
  musicCard: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    marginBottom: 14,
    backgroundColor: '#1a1714',
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
  copyBtn: {
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  copyText: { color: '#0a0908', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
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
});

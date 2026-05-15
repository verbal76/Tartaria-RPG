import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import { useGameStore } from '../state/gameStore';
import { OTA_BUILD_ID } from '../buildInfo';

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
      setUpdateStatus('Restarting to apply…');
      setTimeout(() => { void Updates.reloadAsync(); }, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUpdateStatus('Error');
      setUpdateError(msg);
    } finally {
      setUpdateBusy(false);
    }
  }

  const info = useMemo(() => {
    const expoConfig = Constants.expoConfig;
    const version = expoConfig?.version ?? '0.0.0';
    const runtimeVersion =
      typeof expoConfig?.runtimeVersion === 'string'
        ? expoConfig.runtimeVersion
        : JSON.stringify(expoConfig?.runtimeVersion ?? null);
    const channel = (expoConfig?.updates as { requestHeaders?: Record<string, string> } | undefined)
      ?.requestHeaders?.['expo-channel-name'] ?? 'unknown';
    const mb = (bytes: number | null | undefined) =>
      bytes != null ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : 'unknown';

    // Runtime values from expo-updates — what the *installed binary* thinks
    // the OTA config is, vs what app.json declares. If these don't line up,
    // OTAs silently no-op. This is the smoking gun for diagnosing publish
    // vs apply mismatches.
    const updRuntimeVersion = safeUpdates(() => Updates.runtimeVersion);
    const updChannel = safeUpdates(() => Updates.channel);
    const updUpdateId = safeUpdates(() => Updates.updateId);
    const updIsEmbedded = safeUpdates(() => Updates.isEmbeddedLaunch);
    const updIsEnabled = safeUpdates(() => Updates.isEnabled);

    const lines = [
      `Tartaria Realms`,
      `Version: ${version}`,
      `OTA build: ${OTA_BUILD_ID}`,
      `Runtime config (app.json): ${runtimeVersion}`,
      `Runtime live (Updates): ${updRuntimeVersion}`,
      `Channel config (app.json): ${channel}`,
      `Channel live (Updates): ${updChannel}`,
      `Update ID: ${updUpdateId || '(embedded)'}`,
      `Updates enabled: ${updIsEnabled}`,
      `Embedded launch: ${updIsEmbedded}`,
      `Update status: ${updateStatus}${updateError ? `\n  Error: ${updateError}` : ''}`,
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
        <TouchableOpacity onPress={() => setScreen(player ? 'exploration' : 'title')}>
          <Text style={styles.back}>← back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ABOUT</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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
  back: { color: '#7a705c', fontSize: 12, letterSpacing: 1, paddingHorizontal: 4 },
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
  copyBtn: {
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  copyText: { color: '#0a0908', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
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

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';

export function AboutScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const cognitiveStatus = useGameStore((s) => s.cognitiveStatus);
  const cognitiveFraction = useGameStore((s) => s.cognitiveFraction);
  const cognitiveError = useGameStore((s) => s.cognitiveError);
  const cognitiveLastResponse = useGameStore((s) => s.cognitiveLastResponse);
  const gameLogLength = useGameStore((s) => s.gameLog.length);
  const player = useGameStore((s) => s.player);

  const [copied, setCopied] = useState(false);

  const info = useMemo(() => {
    const expoConfig = Constants.expoConfig;
    const version = expoConfig?.version ?? '0.0.0';
    const runtimeVersion =
      typeof expoConfig?.runtimeVersion === 'string'
        ? expoConfig.runtimeVersion
        : JSON.stringify(expoConfig?.runtimeVersion ?? null);
    const channel = (expoConfig?.updates as { requestHeaders?: Record<string, string> } | undefined)
      ?.requestHeaders?.['expo-channel-name'] ?? 'unknown';
    const lines = [
      `Tartaria Realms`,
      `Version: ${version}`,
      `Runtime: ${runtimeVersion}`,
      `OTA channel: ${channel}`,
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
      `Session`,
      `  Player: ${player?.name ?? 'none'}`,
      `  Log entries in memory: ${gameLogLength}`,
    ];
    return lines.join('\n');
  }, [cognitiveStatus, cognitiveFraction, cognitiveError, cognitiveLastResponse, player, gameLogLength]);

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

      <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
        <Text style={styles.copyText}>{copied ? 'COPIED' : 'COPY ALL'}</Text>
      </TouchableOpacity>
    </View>
  );
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
    marginTop: 12,
  },
  copyText: { color: '#0a0908', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
});

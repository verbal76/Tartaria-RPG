import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import { readFullLog } from '../engine/saveSystem';

export function LogScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [diskLog, setDiskLog] = useState<string>('Loading…');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    readFullLog().then((text) => setDiskLog(text || '(no log yet)'));
  }, []);

  async function handleCopy() {
    // OTA 200 — full disk log copied to clipboard (no cap).
    // Playtester reversed the 500-line clipboard cap from OTA 199:
    // "uncap log limits so it always records every event and I
    // can copy it and paste it into another program when needed."
    // Live LogScreen now copies the entire disk log, same as the
    // dead-slot Copy Log button on TitleScreen. The disk log
    // grows unbounded (appendLogToDisk has no cap); the only hard
    // ceiling is AsyncStorage's per-key size, which on this
    // Android default is ~6 MB ≈ 52k lines — beyond any
    // realistic single-session need.
    await Clipboard.setStringAsync(diskLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>FULL GAME LOG</Text>
        <View style={{ width: 80 }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.body}>{diskLog}</Text>
      </ScrollView>
      <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
        <Text style={styles.copyText}>{copied ? 'COPIED' : 'COPY ALL'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
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
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#e6d8b3', letterSpacing: 4, fontSize: 14 },
  scroll: { flex: 1, backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 8 },
  content: { paddingBottom: 24 },
  body: { color: '#cdbf99', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, lineHeight: 16 },
  copyBtn: {
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  copyText: { color: '#0a0908', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
});

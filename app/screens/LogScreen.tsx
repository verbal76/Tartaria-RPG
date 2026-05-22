import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import { readFullLog, flushLogWrites, getLastLogWriteError, clearLastLogWriteError } from '../engine/saveSystem';

export function LogScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [diskLog, setDiskLog] = useState<string>('Loading…');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  // OTA 017 — if the disk log dropped a write (cap hit), surface it
  // as a banner above the COPY ALL button so the player knows the
  // copy may be incomplete.
  const [writeFailure, setWriteFailure] = useState<string | null>(null);

  // OTA 215 — re-read on focus and after a small interval while the
  // screen is open. The previous version captured a single snapshot
  // at mount; if the player came in mid-write or the game generated
  // new entries while LogScreen was visible, those lines didn't
  // appear unless the user navigated away and back. Now the view
  // refreshes every second so what you see is what you'd copy.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const text = await readFullLog();
      if (!cancelled) setDiskLog(text || '(no log yet)');
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // OTA 215 — always re-read from disk at the moment of copy. The
  // previous version copied the captured-at-mount state, which could
  // miss writes that landed between mount and tap. flushLogWrites()
  // drains any in-flight appendLogToDisk chain first so the read
  // sees every line that fired.
  async function handleCopy() {
    await flushLogWrites();
    const fresh = await readFullLog();
    await Clipboard.setStringAsync(fresh);
    setDiskLog(fresh || '(no log yet)');
    setCopied(true);
    // OTA 017 — surface persisted write failures so the player knows
    // when AsyncStorage dropped a recent entry (e.g. log size cap).
    const writeErr = getLastLogWriteError();
    if (writeErr) {
      setWriteFailure(writeErr);
      clearLastLogWriteError();
    } else {
      setWriteFailure(null);
    }
    setTimeout(() => setCopied(false), 1500);
  }

  // OTA 215 — share-sheet path. Android's Share intent doesn't go
  // through the system clipboard, so destinations that silently
  // truncate long pastes (some chat apps, email composers) are
  // bypassed. The user picks where the log goes — file, email, chat.
  async function handleShare() {
    await flushLogWrites();
    const fresh = await readFullLog();
    setDiskLog(fresh || '(no log yet)');
    try {
      await Share.share({ message: fresh, title: 'Tartaria-RPG game log' });
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      // User-cancelled or unsupported on this platform — no-op.
    }
  }

  // Character count gives the player visual confirmation that the
  // buffer matches what lands in their paste target. If the paste
  // destination silently truncates, the discrepancy is easy to spot.
  const charCount = diskLog === 'Loading…' || diskLog === '(no log yet)'
    ? 0
    : diskLog.length;

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
        {/* selectable={true} so long-press → Select All works as a
            third fallback alongside COPY / SHARE. iOS+Android both
            honor it. */}
        <Text style={styles.body} selectable>{diskLog}</Text>
      </ScrollView>
      {writeFailure ? (
        <Text style={styles.writeFailure}>
          ⚠ Disk write failed: {writeFailure}. Some recent entries may be missing — use SHARE for a complete export.
        </Text>
      ) : null}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
          <Text style={styles.copyText}>
            {copied ? `COPIED ${charCount.toLocaleString()} CHARS` : `COPY ALL · ${charCount.toLocaleString()}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.7}>
          <Text style={styles.shareText}>{shared ? 'SHARED' : 'SHARE'}</Text>
        </TouchableOpacity>
      </View>
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
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  copyBtn: {
    flex: 2,
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  copyText: { color: '#0a0908', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  shareBtn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareText: { color: '#c9a86a', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  writeFailure: {
    color: '#e07a5f',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
    paddingHorizontal: 4,
    fontStyle: 'italic',
  },
});

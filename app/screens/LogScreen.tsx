import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Platform, Share } from 'react-native';
import { TScreenHeader, tartariaKitStyles as kit } from '../ui/tartariaKit';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import { readFullLog, flushLogWrites, getLastLogWriteError, clearLastLogWriteError } from '../engine/saveSystem';
import { stampLogExport } from '../diagnostics/aboutSummary';

// OTA 024 — chunk size for the chunked-copy path. 25 KB is well
// under the silent-truncation limit of the strictest common chat
// app (~30 KB observed). Player paste tests can lower this if a
// specific destination still cuts mid-line.
const CHUNK_SIZE = 25_000;

/* ⚠⚠⚠ PHASE 3 — THE PLANES ARE THE DEPTH; the kit style is only the material.
 * Each fragment below belongs to ONE physical family, and which one a control
 * gets is decided by its INTERACTION CONTRACT, never by what its style key is
 * called: CTL for a thing you strike, TAB for a thing you switch between, ROW
 * for a thing you select or open. A full-width list row wearing the command
 * key's sidewall is the same category error as a button with no depth at all.
 *
 * ⚠⚠ They are absolutely positioned, `pointerEvents="none"` children inside a
 * box the control already owns, so adopting them moves nothing by a pixel, and
 * any SEMANTIC colour the call site already carries layers on top and still
 * wins. Construction is what the object IS; state is what it is IN. */
/** ⚠⚠⚠ OTA-1806 — THE PLANES ARE A FUNCTION OF THE FINGER NOW.
 *  Pressed, the sidewall collapses and crosses to the TOP, the light catches
 *  BELOW the face, and the contact band is not drawn — a key pushed home is not
 *  standing on anything. Frozen at their resting heights, as these were, a key
 *  could travel 3dp and never lose height, which is most of a depression. */
const ctlPlanes = (pressed: boolean) => (
  <>
    <View style={pressed ? kit.controlPlaneTopPressed : kit.controlPlaneTop} pointerEvents="none" />
    <View style={pressed ? kit.controlPlaneBottomPressed : kit.controlPlaneBottom} pointerEvents="none" />
    {pressed ? null : <View style={kit.controlPlaneContact} pointerEvents="none" />}
  </>
);
/** The resting planes, for a surface that has no press to report. */
const CTL_PLANES = ctlPlanes(false);

export function LogScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [diskLog, setDiskLog] = useState<string>('Loading…');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  // OTA 017 — if the disk log dropped a write (cap hit), surface it
  // as a banner above the COPY ALL button so the player knows the
  // copy may be incomplete.
  const [writeFailure, setWriteFailure] = useState<string | null>(null);
  // OTA 024 — chunked-copy cursor. Index is 1-based for display
  // ("PART 2 of 4"). chunkCopiedAt drives the brief flash.
  const [chunkIndex, setChunkIndex] = useState(1);
  const [chunkCopiedAt, setChunkCopiedAt] = useState<number | null>(null);

  const totalChunks = Math.max(1, Math.ceil(diskLog.length / CHUNK_SIZE));

  async function handleChunk() {
    const start = (chunkIndex - 1) * CHUNK_SIZE;
    const end = start + CHUNK_SIZE;
    const slice = diskLog.slice(start, end);
    // OTA-101 — stampLogExport wraps the envelope + appends
    // the basic device/install summary so playtester reports
    // always carry build context.
    const stamped = stampLogExport(slice, { chunk: { index: chunkIndex, total: totalChunks } });
    await Clipboard.setStringAsync(stamped);
    setChunkCopiedAt(Date.now());
    // Advance to next part on the next tap; wrap to 1 after the last.
    setChunkIndex((i) => (i >= totalChunks ? 1 : i + 1));
    setTimeout(() => setChunkCopiedAt(null), 2500);
  }

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
    // OTA 018 — same HEADER / FOOTER envelope as the exploration
    // screen copy button. Lets us diagnose paste-side truncation
    // unambiguously (if FOOTER is missing, the buffer was clipped
    // somewhere between Clipboard.setStringAsync and the paste).
    // OTA-101 — also appends buildBasicDeviceSummary so every
    // capture carries platform + build info.
    const stamped = stampLogExport(fresh);
    await Clipboard.setStringAsync(stamped);
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
    // OTA 018 — envelope so paste-side truncation is visible.
    // OTA-101 — appends buildBasicDeviceSummary via stampLogExport.
    const stamped = stampLogExport(fresh);
    try {
      await Share.share({ message: stamped, title: 'Tartaria-RPG game log' });
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
      <TScreenHeader
        title="FULL GAME LOG"
        onBack={() => setScreen('exploration')}
      />
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
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.copyText}>
            {copied ? `COPIED ${charCount.toLocaleString()} CHARS` : `COPY ALL · ${charCount.toLocaleString()}`}
          </Text>
        </TouchableOpacity>
        <Pressable style={({ pressed }) => [kit.ctl, styles.shareBtn, pressed && kit.controlPressed]} onPress={handleShare} accessibilityRole="button">
{({ pressed }) => (<>
          <Text style={styles.shareText}>{shared ? 'SHARED' : 'SHARE'}</Text>
          {ctlPlanes(pressed)}
        </>)}
</Pressable>
      </View>
      {/* OTA 024 — chunked copy. Most chat apps cap pastes at
          ~30-60KB, silently truncating beyond that. Player's
          51,914-char log proved this: the BEGIN marker arrived,
          the END marker didn't. The chunk button cycles through
          ~25KB pieces of the log; each piece has its own
          BEGIN/END PART markers so receiver can reassemble. */}
      {diskLog.length > CHUNK_SIZE && (
        <TouchableOpacity style={styles.chunkBtn} onPress={handleChunk} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.chunkText}>
            {chunkCopiedAt != null && Date.now() - chunkCopiedAt < 2500
              ? `COPIED PART ${chunkIndex} / ${totalChunks} — TAP FOR NEXT`
              : `COPY IN PARTS · ${totalChunks} pieces (next: ${chunkIndex} / ${totalChunks})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ⚠⚠ OTA-1780 — `header`, `backBtn`, `backText` and `title` moved to the kit
  // (`TScreenHeader`). Cover was written FIRST, in OTA-1776, so the diff below
  // is measured rather than hoped: see that suite for exactly which of these
  // four values already matched the kit and which move.
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
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
  // OTA 024 — chunk button. Distinct color from COPY/SHARE so
  // the player notices the new path; sits below the main button
  // row only when the log is large enough to need chunking.
  chunkBtn: {
    marginTop: 8,
    backgroundColor: '#9ec96a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  chunkText: { color: '#0a0908', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },
  writeFailure: {
    color: '#e07a5f',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
    paddingHorizontal: 4,
    fontStyle: 'italic',
  },
});

// TTSController — subscribes to the game store and feeds new log
// lines + streaming Arbiter narration to TTSManager.speak.
//
// Channel rules (matches the plan):
//   - SPEAK: world, arbiter, combat, reward
//   - SKIP:  player (don't echo), system (mechanics meta),
//            cognitive / debug (diagnostic)
//
// Streaming Arbiter sentence buffering:
//   Qwen narration writes to gameStore.partialArbiterText token-by-
//   token. We watch that field, accumulate, and ship completed
//   sentences to TTSManager as soon as a `.`, `!`, `?`, or `\n` lands.
//   On stream completion (partialArbiterText → null) we flush the
//   buffer remainder. The completed line will ALSO arrive on the
//   arbiter channel via appendLog — we suppress that to avoid
//   reading the same line twice (sentence-by-sentence already
//   covered the whole response).

import { useGameStore } from '../state/gameStore';
import { speak, stopAndClear } from './TTSManager';
import { getVoiceSettings, onVoiceSettingsChange } from './voiceSettings';
import { splitSentences } from './sentenceSplitter';
import type { GameLogEntry, LogChannel } from '../engine/types';

// Re-exported so the test file (and any future caller) can import it
// from this module too. The implementation lives in sentenceSplitter
// so it can be tested without the native-module transitive imports.
export { splitSentences };

type GameState = ReturnType<typeof useGameStore.getState>;

const SPOKEN_CHANNELS: ReadonlySet<LogChannel> = new Set([
  'world', 'arbiter', 'combat', 'reward',
]);

let unsub: (() => void) | null = null;
let unsubSettings: (() => void) | null = null;
let lastLogIndex = 0;
/** Id of the last log entry we processed. Used to detect bulk
 *  replacement of gameLog (save-load): if the entry at the previous
 *  position no longer matches this id, the log was wholesale replaced
 *  and we must NOT re-speak the saved backlog. Only the next new
 *  entry (typically the "you step back into..." resume line) should
 *  be voiced. */
let lastSpokenEntryId: string | null = null;
let streamBuffer = '';
/** Ids of arbiter entries we already voiced via the streaming buffer.
 *  When the matching final entry lands on the arbiter channel via
 *  appendLog, we skip it (already spoken sentence-by-sentence). The
 *  matching is best-effort: we record the substring of streamed text
 *  and a window of recent appendLog ids, and skip if the new entry's
 *  text falls within the streamed window. */
let recentStreamedTexts: string[] = [];
const RECENT_STREAM_WINDOW = 4;

function rememberStreamed(text: string): void {
  recentStreamedTexts.push(text);
  if (recentStreamedTexts.length > RECENT_STREAM_WINDOW) {
    recentStreamedTexts.shift();
  }
}

function wasAlreadyStreamed(text: string): boolean {
  const trimmed = text.trim();
  return recentStreamedTexts.some((streamed) => {
    const s = streamed.trim();
    return s === trimmed || s.includes(trimmed) || trimmed.includes(s);
  });
}

function flushStreamBuffer(): void {
  const trimmed = streamBuffer.trim();
  if (trimmed) {
    speak(trimmed, 'arbiter');
    rememberStreamed(trimmed);
  }
  streamBuffer = '';
}

function syncToCurrent(state: GameState): void {
  lastLogIndex = state.gameLog.length;
  const last = state.gameLog[state.gameLog.length - 1];
  lastSpokenEntryId = last ? last.id : null;
  streamBuffer = '';
}

function onState(state: GameState): void {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) {
    // Keep state synced so a mid-game toggle ON doesn't re-speak
    // old entries.
    syncToCurrent(state);
    return;
  }

  // 1) New log entries — only ones added since the last tick. Detect
  // bulk replacement (save-load): there are two signals.
  //   (a) ID mismatch: the entry that USED to sit at lastLogIndex - 1
  //       is no longer there → the log was wholesale replaced.
  //   (b) Cold-boot bulk arrival: the log was empty when we last
  //       synced (lastLogIndex === 0), and suddenly contains multiple
  //       entries in a single tick. Normal new-character play appends
  //       one entry per tick (each appendLog is its own zustand set);
  //       only a wholesale replacement (e.g. loadSlotIntoGame setting
  //       gameLog to the saved array) lands many at once.
  // In either case we resync silently — the next legitimate appendLog
  // (e.g. "you step back into ...") falls through the speak path.
  const log = state.gameLog;
  const expectedPrev = lastLogIndex > 0 ? log[lastLogIndex - 1] : null;
  const idMismatch =
    lastSpokenEntryId != null &&
    (lastLogIndex > log.length ||
      !expectedPrev ||
      expectedPrev.id !== lastSpokenEntryId);
  const coldBootBulk = lastLogIndex === 0 && log.length >= 2;
  if (idMismatch || coldBootBulk) {
    // Realign to current tail without speaking anything. The next
    // appendLog after this tick (e.g. the "you step back into ..."
    // resume cue) will fall through the normal speak path.
    syncToCurrent(state);
    return;
  }

  if (log.length > lastLogIndex) {
    for (let i = lastLogIndex; i < log.length; i++) {
      const entry = log[i] as GameLogEntry | undefined;
      if (!entry) continue;
      if (!SPOKEN_CHANNELS.has(entry.channel)) continue;
      // Suppress the arbiter follow-up if we already spoke it
      // sentence-by-sentence via the streaming buffer.
      if (entry.channel === 'arbiter' && wasAlreadyStreamed(entry.text)) continue;
      speak(entry.text, entry.channel);
    }
    lastLogIndex = log.length;
    const tail = log[log.length - 1];
    if (tail) lastSpokenEntryId = tail.id;
  }

  // 2) Streaming Arbiter narration — accumulate the buffer, ship
  // completed sentences immediately so TTS doesn't wait for the full
  // 200-token response.
  const partial = state.partialArbiterText;
  if (partial == null) {
    // Stream ended — flush remainder (if any) and reset.
    if (streamBuffer) flushStreamBuffer();
  } else if (partial.length > streamBuffer.length) {
    // New tokens arrived — replace the buffer with the latest snapshot.
    // (gameStore stores the cumulative partial text, not the delta.)
    streamBuffer = partial;
    const { sentences, remainder } = splitSentences(streamBuffer);
    for (const s of sentences) {
      speak(s, 'arbiter');
      rememberStreamed(s);
    }
    streamBuffer = remainder;
  } else if (partial.length < streamBuffer.length) {
    // The store reset the partial text (e.g. submitPlayerAction
    // cancelled the in-flight generation). Drop our buffer.
    streamBuffer = partial;
  }
}

/** Bind the controller to the game store + settings observer. Call
 *  once at app boot, AFTER initTTSManager(). */
export function startTTSController(): void {
  if (unsub) return;
  syncToCurrent(useGameStore.getState());
  unsub = useGameStore.subscribe(onState);
  unsubSettings = onVoiceSettingsChange((s) => {
    if (!s.ttsEnabled) {
      // Settings flipped OFF — manager handles the queue (keeps the
      // current sentence, drops the rest); we just resync indices so
      // an OFF→ON toggle doesn't replay anything.
      syncToCurrent(useGameStore.getState());
    }
  });
}

export function stopTTSController(): void {
  if (unsub) { unsub(); unsub = null; }
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  stopAndClear();
}

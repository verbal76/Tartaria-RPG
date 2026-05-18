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

function onState(state: GameState): void {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) {
    // Keep lastLogIndex synced so a mid-game toggle ON doesn't
    // re-speak old entries.
    lastLogIndex = state.gameLog.length;
    streamBuffer = '';
    return;
  }

  // 1) New log entries — only ones added since the last tick.
  const log = state.gameLog;
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
  lastLogIndex = useGameStore.getState().gameLog.length;
  streamBuffer = '';
  unsub = useGameStore.subscribe(onState);
  unsubSettings = onVoiceSettingsChange((s) => {
    if (!s.ttsEnabled) {
      // Settings flipped OFF — manager handles the queue (keeps the
      // current sentence, drops the rest); we just resync indices so
      // an OFF→ON toggle doesn't replay anything.
      lastLogIndex = useGameStore.getState().gameLog.length;
      streamBuffer = '';
    }
  });
}

export function stopTTSController(): void {
  if (unsub) { unsub(); unsub = null; }
  if (unsubSettings) { unsubSettings(); unsubSettings = null; }
  stopAndClear();
}

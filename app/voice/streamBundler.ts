// streamBundler — pure incremental sentence-bundler for streaming Qwen
// narration. Pulled out of TTSController so it can be unit-tested without the
// native TTS / AsyncStorage import chain.
//
// THE BUG THIS FIXES (OTA-622 — playtester: "Kokoro said the same thing five
// times"): gameStore.partialArbiterText is CUMULATIVE (the whole response so
// far). The old controller reset its working buffer to the FULL partial every
// tick and re-split it — so once a sentence had shipped, every later tick where
// the partial hadn't grown (or had only grown a little) re-split the same text
// and re-bundled the already-spoken sentence, piling copies into ever-longer
// bundles that slipped past the exact-match "spoken recently" guard. Kokoro then
// read the line N times. Here we track consumedLen and ONLY ever process the new
// tail; a steady (unchanged) partial is a no-op.

import { splitSentences } from './sentenceSplitter';

export interface StreamBundleState {
  /** Unshipped remainder — the incomplete trailing sentence. */
  buffer: string;
  /** Complete sentences bundled and awaiting the char threshold. */
  pending: string;
  /** Whether the first sentence of this stream has shipped (it goes out
   *  immediately so audio starts fast). */
  shippedFirst: boolean;
  /** Chars of the cumulative partial already merged into the pipeline. */
  consumedLen: number;
}

export function emptyStreamState(): StreamBundleState {
  return { buffer: '', pending: '', shippedFirst: false, consumedLen: 0 };
}

export interface StreamAdvance {
  /** Text chunks to speak, in order (first sentence, then ~bundleChars
   *  bundles, then the flush remainder on stream end). */
  utterances: string[];
  /** Individual sentences seen this tick — record these so the final
   *  full-line appendLog is recognised as already-spoken (substring dedup). */
  streamed: string[];
  state: StreamBundleState;
}

/** Advance the bundler by one store tick.
 *  @param prev    previous state (start from emptyStreamState()).
 *  @param partial cumulative partialArbiterText, or null when the stream ends.
 */
export function advanceStream(
  prev: StreamBundleState,
  partial: string | null,
  bundleChars = 180,
): StreamAdvance {
  const utterances: string[] = [];
  const streamed: string[] = [];

  // Stream ended — flush bundled + remainder as one final chunk, then reset.
  if (partial == null) {
    const tail = [prev.pending, prev.buffer.trim()].filter(Boolean).join(' ').trim();
    if (tail) { utterances.push(tail); streamed.push(tail); }
    return { utterances, streamed, state: emptyStreamState() };
  }

  // Store reset the partial (cancelled generation) — drop buffer + bundle and
  // realign the cursor so we don't re-read anything.
  if (partial.length < prev.consumedLen) {
    return { utterances, streamed, state: { ...emptyStreamState(), consumedLen: partial.length } };
  }

  // No new tokens since last tick — the no-op that kills the re-read repeat.
  if (partial.length === prev.consumedLen) {
    return { utterances, streamed, state: prev };
  }

  // New tokens: append ONLY the delta, then split the working buffer.
  const delta = partial.slice(prev.consumedLen);
  const working = prev.buffer + delta;
  let pending = prev.pending;
  let shippedFirst = prev.shippedFirst;
  const { sentences, remainder } = splitSentences(working);
  for (const s of sentences) {
    streamed.push(s);
    if (!shippedFirst) {
      utterances.push(s);
      shippedFirst = true;
    } else {
      pending = pending ? `${pending} ${s}` : s;
      if (pending.length >= bundleChars) {
        utterances.push(pending);
        pending = '';
      }
    }
  }
  return {
    utterances,
    streamed,
    state: { buffer: remainder, pending, shippedFirst, consumedLen: partial.length },
  };
}

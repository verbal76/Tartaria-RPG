// KokoroTTSManager — bundled neural TTS via react-native-executorch.
//
// Replaces the post-revert PiperTTSManager stub. ExecuTorch's
// TextToSpeechModule loads Kokoro-82M and exposes:
//   - forward(text)  → Float32Array (full audio waveform)
//   - stream({speed}) → AsyncGenerator<Float32Array> for streaming chunks
//
// Why ExecuTorch + Kokoro instead of sherpa-onnx + Piper:
//   - ExecuTorch uses Meta's PyTorch mobile runtime via XNNPACK (CPU).
//     No ONNX runtime in the picture → no libonnxruntime.so collision
//     with our existing onnxruntime-react-native (used for MiniLM).
//   - Kokoro-82M is the current SOTA for lightweight neural TTS;
//     quality is noticeably better than Piper at similar model size.
//   - Built-in phonemizer (espeak-style) handles OOV / lore words.
//   - Software Mansion maintains the package, so update cadence is solid.
//
// Audio playback: Kokoro emits raw 22.05 kHz mono float32 PCM. We
// convert to 16-bit int PCM, wrap a WAV header around it, base64-
// encode, and feed the data URI to expo-av's Sound.createAsync.
//
// All errors are swallowed → if the model fails to load, the caller
// (TTSManager) falls back to expo-speech transparently.

import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { getVoiceSettings } from './voiceSettings';
import { applyLoreLexicon, cleanForSpeech } from './loreLexicon';
import { splitSentences } from './sentenceSplitter';
import { padSilence } from './audioPad';
import { setMusicDuck } from '../audio/AudioManager';
import {
  runExclusiveNativeMl, ML_PRIORITY_VOICE, ML_PRIORITY_HOMEWORK,
  reserveVoiceSlot, releaseVoiceSlot, nativeMlSnapshot,
} from '../ai/nativeMlLock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exec = require('react-native-executorch') as {
  TextToSpeechModule: any;
  KOKORO_MEDIUM: any;
  KOKORO_VOICE_AF_HEART: any;
  KOKORO_VOICE_AF_RIVER: any;
  KOKORO_VOICE_AF_SARAH: any;
  KOKORO_VOICE_AM_ADAM: any;
  KOKORO_VOICE_AM_MICHAEL: any;
  KOKORO_VOICE_BF_EMMA: any;
  KOKORO_VOICE_BM_DANIEL: any;
};

const KOKORO_SAMPLE_RATE = 22050;

// arb7 prosody — bundle consecutive sentences in a single speak() call
// up to this many characters before handing them to Kokoro. Kokoro reads
// flat/robotic on tiny strings and pays a fresh inference + playback-join
// gap per chunk; merging gives sentence-to-sentence context and one
// continuous waveform. Well under Kokoro's ~510-token cap (≈ 260 chars is
// ~200 phonemes, leaving generous headroom).
const MERGE_TARGET_CHARS = 200;

// arb8 crossfade — adjacent same-voice chunks whose audio is already
// inferred are concatenated into ONE waveform with a short equal-power
// crossfade at each join, so the queue plays as continuous speech instead
// of separate click/gap-prone clips. CROSSFADE_LOOKAHEAD = how many chunks
// to infer ahead of playback (so a batch can form without blocking);
// CROSSFADE_MAX_BATCH caps one playback buffer's size; CROSSFADE_MS is the
// overlap length. First-audio stays fast because a batch only forms from
// chunks that prefetch already finished during the prior chunk's playback.
const CROSSFADE_LOOKAHEAD = 2;
const CROSSFADE_MAX_BATCH = 4;
const CROSSFADE_MS = 12;
// arb165 — player ask: "put a slight pause after a '.' — Kokoro runs the
// sentences together." Each sentence is now its own chunk (see speak()), and at
// a sentence boundary the batch is joined with SENTENCE_PAUSE_MS of real silence
// instead of the gap-removing crossfade. EDGE_FADE_MS tapers each chunk into and
// out of that silence so the join stays click-free.
// ⚠ OTA-1136 — 160 → 280. The owner, on the welcome-back line: *"there should
// be a slight delay after the name, like how we use a comma to pause a
// sentence."* 160 ms is under the ~200 ms a listener reads as a deliberate
// beat, so a full stop landed as a breath and the two sentences ran together.
// 280 ms is a period. (The single-chunk path gets the same beat below — it used
// to depend on whether the batcher happened to bundle the line, which meant the
// same sentence paused or did not depending on how fast Kokoro was that second.)
const SENTENCE_PAUSE_MS = 280;
const EDGE_FADE_MS = 6;
// OTA-790 — how long to keep a finished expo-av Sound alive before releasing it.
// didJustFinish fires when the decoder finishes FEEDING the audio sink, not when
// the speaker finishes playing; releasing immediately discards whatever the
// hardware AudioTrack still holds (~100-250ms on Pixel-class devices), which
// clipped the tail of every spoken line.
const UNLOAD_DRAIN_MS = 300;

// ⚠⚠⚠ OTA-1675 — THE VOICE NAMES ITS STEP.
//
// Task #180, kai's SM-S942U (Samsung, SM8850, Android 16), a cold 66-second
// life on the title screen, OTA-1658:
//
//   PROCESS KILLED — no JS ran · stage native:voice:done
//   last checkpoint: native:voice:done [q0] · 66228ms into the action · alive 0ms after it
//   Voice (TTS) guard: ⚠ VOICE CRASH detected on previous launch — last voice: kokoro:bf_emma
//
// Read together those three lines corner the death to a window a few
// milliseconds wide. `native:voice:done` is stamped by the lock the instant
// `model.forward` settles; `markTTSDone` (which would have cleared the guard)
// runs in drain's finally, AFTER playback. The process died between the two —
// and 66 s into the life, `q0`, with the model ledger at o0/r0, that was the
// FIRST utterance this device ever played: the title line `ReadyFlash` speaks
// the moment Kokoro comes online. Nothing native runs in that window except
// what this file does with the samples: the WAV encode, `Audio.Sound.createAsync`
// on a `data:` URI (expo-av → ExoPlayer → AudioTrack, the one step that is
// pure platform media code), the playback itself, and the deferred
// `unloadAsync`. OTA-1546 stamped the lock and nothing stamped these, so the
// ledger could say "the synth finished" and no more. The owner's own two voice
// deaths (08-30 `native:voice:done (+11080ms)`, 08-31 `native:voice:start
// [q1]`) sit in the same blind spot.
//
// So the playback path stamps its own checkpoints — `voice:play:encode`,
// `voice:play:create`, `voice:play:started`, `voice:play:done`,
// `voice:play:unload`, and `voice:stop` — with the utterance's ordinal in this
// life and its length as the detail (`#1 1.9s`), because "the first line after
// a fresh model load" is the fact that separates a one-off from a device that
// cannot play at all. The next voice-path death reads which step it died in.
// Measure the cause, or ship an instrument. This is the instrument; the cause
// is still open, and no exemption is bought with it.
//
// ⚠ THE UNLOAD STAMP YIELDS TO AN IN-FLIGHT NATIVE OP. It fires 300 ms after
// the line ends, by which time the lock may be inside the NEXT synth or a Qwen
// job. Overwriting `native:llm:start` with `voice:play:unload` would file a
// death inside inference as a death in a player release — the same blind-spot
// trade OTA-1377 and OTA-1413 refused. When the lock is running, the crumb it
// wrote stands; when it is idle, the release is the only native thing
// happening and the stamp is honest. Lazy-required and wrapped, as the lock's
// own stamp is: an instrument may never break the thing it measures.
let utterancesThisLife = 0;
function stampVoicePhase(step: string, detail?: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { stampBreadcrumbPhase } = require('../engine/saveSystem') as typeof import('../engine/saveSystem');
    stampBreadcrumbPhase(`voice:${step}`, detail);
  } catch { /* an instrument may never break the thing it measures */ }
}

interface QueuedUtterance {
  id: number;
  text: string;
  /** Resolved Kokoro voice id for this utterance. null = use the
   *  current Arbiter voice (player's kokoroVoice setting). Vendor
   *  lines pass their assigned voice; the pool spins up an instance
   *  for that voice on demand. */
  voiceId: string | null;
  /** Log channel that produced this line, when known. Used by the
   *  spam-collapse rule: when the player rapid-taps a direction the
   *  Arbiter queues 5-10 flavor lines and chain-reads them all. On
   *  push, the queue drops any prior QUEUED (not currently speaking)
   *  utterances on the same channel so only the newest survives —
   *  the line being spoken now finishes naturally, then the most
   *  recent queued line plays. Other channels (world / combat /
   *  reward) are unaffected. */
  channel?: string;
  /** arb5 — the parent speak() call id. A single arbiter line is split
   *  into multiple sentence chunks that all share one lineId, so the
   *  queue cap can drop or keep WHOLE lines instead of truncating one
   *  mid-line. */
  lineId?: number;
  /** arb165 — true when this chunk's text ends on a sentence terminator
   *  (. ! ?). drain() inserts a short silence after such a chunk so the
   *  next sentence doesn't run straight into it. */
  endsSentence?: boolean;
  /** Prefetched samples + the rate they were inferred at. drain()
   *  pre-runs forward() on the NEXT queued utterance while the
   *  current one is still playing, so the next sentence's audio is
   *  ready to play the instant didJustFinish fires. Without this, the
   *  inter-sentence gap was 0.75–1.25s (next chunk's inference time +
   *  expo-av's 500ms status poll). With prefetch + 50ms poll the gap
   *  drops to ~100ms. */
  prefetch?: Promise<Float32Array | null>;
  /** arb8 — samples stamped onto the item when its prefetch resolves, so
   *  drain() can synchronously tell whether a queued chunk is ready to
   *  fold into a crossfade batch (undefined = still inferring). */
  resolvedSamples?: Float32Array | null;
  /** OTA 013 — the voiceId the prefetch was inferred with. Drain
   *  validates this at consumption time: if the player switched
   *  voices between prefetch-start and consume, the prefetched
   *  audio is the wrong voice and gets discarded; we re-run
   *  forward() with the current voice instead. */
  prefetchVoiceId?: string | null;
  /** OTA-1132 — true for the first chunk of a line. Only the head reports the
   *  text-to-audio gap; later chunks are waiting on their own predecessor, not
   *  on the delay the player experienced. */
  lineHead?: boolean;
  /** ⚠ OTA-1130 — WHEN THIS LINE WENT ON SCREEN. The player has already read it
   *  by the time we get here; this is the clock against which "you read it then
   *  hear it 10 seconds later" is measured. Stamped at enqueue, because that is
   *  the same instant `appendLog` put the text in the feed. */
  queuedAt?: number;
}

/** ⚠ OTA-1130 — HOW LATE IS TOO LATE. Owner: *"that's what makes the voice feel
 *  late sometimes, you read it then hear it 10 seconds later."* Past this point
 *  speaking the line is worse than silence: the player has read it, moved on,
 *  and the audio arrives as an echo of something they already know, laid over
 *  whatever is happening now.
 *
 *  Six seconds sits just past a normal synth — a one-sentence line takes ~1-3 s
 *  to infer and start, so an ordinary line is never at risk. Only lines that
 *  lost a real fight for the lock get dropped, which is exactly the set being
 *  complained about.
 *
 *  ⚠ AND THIS IS WHAT LICENSES THE PRIORITY REVERSAL in nativeMlLock. The voice
 *  now outranks the LLM, so OTA-634's fear — a voice backlog making responses
 *  feel slow — needs an answer. This is it: the backlog cannot grow old,
 *  because old lines are never spoken at all. */
const STALE_LINE_MS = 6_000;

// Voice pool. Holds at most POOL_MAX loaded Kokoro instances. The
// Arbiter slot is sticky (never evicted) — the player hears it most.
// The remaining slots cycle through vendor voices on an LRU basis,
// disposed when the player walks away from the vendor or another
// vendor needs the slot. Memory cost: ~80-150 MB per loaded instance;
// POOL_MAX=2 keeps peak around 200 MB on Pixel-class hardware.
interface LoadedVoice {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: any;
  lastUsedAt: number;
  /** True only for the Arbiter slot; sticky entries don't evict. */
  sticky: boolean;
}
const POOL_MAX = 2;
// arb5/arb15/OTA-634 — most queued spoken lines kept at once (see the cap in
// speak()). Keyed by lineId so whole lines are dropped, never truncated mid-line.
// OTA-634 — this cap was arbiter-ONLY, so world/combat speech accumulated
// uncapped and the voice fell rounds behind a fast player / verbose fight (the
// "said welcome back five rounds late" symptom). Now it caps the TOTAL queued
// lines across ALL channels: keep the newest few, drop the oldest queued line
// (never the currently-speaking one), so the voice stays current.
const MAX_QUEUED_TOTAL_LINES = 3;
const VOICE_POOL: Map<string, LoadedVoice> = new Map();
// In-flight loads keyed by voiceId so concurrent ensureLoaded() calls
// (e.g. beginScene's warm + the vendor's first line both hitting at
// once) share one fromModelName promise instead of double-loading.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LOADING: Map<string, Promise<any | null>> = new Map();

// ⚠⚠ OTA-1360 — THE VENDOR-LOAD COOLDOWN, born from two tombstones. Freeze #4's
// crash record (tombstone_12, 07:37:38) and the 09:05:21 one both die SIGABRT on
// an RN_ET_Worker thread INSIDE the Kokoro model load — fromModelName → native
// Kokoro ctor → phonemis Lexicon build — the second with the abort message
// 'Scudo ERROR: internal map failure (error desc=Out of memory)'. The load is a
// hundreds-of-MB native allocation storm, and when the device is already tight
// it first wedges the whole process (the owner's "input dead, scroll works"
// freeze) and then aborts it (the crash to home). A device that just refused
// this allocation must NOT be asked again in two seconds — vendor loads stand
// down for a cooldown after any load failure, and gameStore's memoryWarning
// listener calls noteMemoryPressureForVoiceLoads so an OS memory warning opens
// the same quiet window. The STICKY Arbiter voice is exempt: its load drives
// the visible state machine and its own retry UX, and it is one resident
// instance, not churn.
const VENDOR_LOAD_COOLDOWN_MS = 120_000;
let vendorLoadCooldownUntil = 0;
/** Called by gameStore's memoryWarning listener (lazy require — no import
 *  cycle): the OS is asking for memory back, so do not START a vendor-voice
 *  load for `quietMs`. Extends, never shortens, an existing window. */
export function noteMemoryPressureForVoiceLoads(quietMs: number): void {
  vendorLoadCooldownUntil = Math.max(vendorLoadCooldownUntil, Date.now() + quietMs);
}
/** Tests only. */
export function _vendorLoadCooldownForTest(): number { return vendorLoadCooldownUntil; }
export function _resetVendorLoadCooldownForTest(): void { vendorLoadCooldownUntil = 0; }

let nextId = 1;
const queue: QueuedUtterance[] = [];
// arb15 — inference serializer. Kokoro's native module isn't reentrant:
// two forward() calls in flight at once reject with a native error object
// (surfaced as "[speak] [object Object]") and the affected chunks get
// skipped — the "skipping sentences" report. The crossfade look-ahead
// prefetch fires inference for upcoming chunks while one is playing, which
// could overlap the next chunk's inference. arb159 — funnel ALL forward() calls
// through the SHARED native-ML lock (runExclusiveNativeMl) so prefetch-ahead
// still happens during playback, never two synths run at once, AND a synth
// never overlaps a Qwen completion (the two together crashed Tensor G5 —
// CONFIRMED: with the lock, a full session ran with zero crashes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const endsOnTerminator = (s: string): boolean => /[.!?]['")\]]*$/.test(s.trim());

/** ⚠ OTA-1130 — EXTRACTED SO TWO CALLERS SPLIT IDENTICALLY. `speak()` has always
 *  chunked here; `presynthesize()` now has to produce the SAME chunks, because
 *  the pre-synthesis cache is keyed per chunk and read at enqueue. A split that
 *  differed by one character between the two would miss every single time, and
 *  miss SILENTLY — the feature would simply appear not to help, with nothing in
 *  any log to say why. One function, one answer.
 *
 *  The behaviour below is unchanged from what `speak()` did:
 *
 *  Split into sentence-sized chunks so the first audio plays as soon as one
 *  sentence finishes inference — without this, a big intro paragraph would take
 *  10-30 seconds to phonemize + run through Kokoro before ANY sound starts.
 *  Subsequent sentences queue behind the first and stream as they're produced.
 *
 *  arb165 — ONE sentence per chunk. The old arb7 merge bundled sentences up to
 *  MERGE_TARGET_CHARS into a single Kokoro read so they flowed as one breath —
 *  but that is exactly what made them "run together", with no pause at the
 *  periods. Now a piece is glued onto the previous chunk only when that previous
 *  chunk is NOT already a finished sentence (i.e. a stray, terminator-less
 *  fragment), so a real sentence boundary is never buried inside a chunk and
 *  drain() can drop a pause after it. */
function chunkForSpeech(prepared: string): string[] {
  const { sentences, remainder } = splitSentences(prepared);
  const rawChunks = sentences.length > 0 ? [...sentences] : [];
  if (remainder.trim()) rawChunks.push(remainder.trim());
  // Fallback: if the text has zero terminators (rare — usually a status line),
  // speak it as one chunk.
  if (rawChunks.length === 0) rawChunks.push(prepared);
  const chunks: string[] = [];
  for (const piece of rawChunks) {
    const last = chunks.length > 0 ? chunks[chunks.length - 1]! : null;
    if (last !== null && !endsOnTerminator(last)
        && last.length + 1 + piece.length <= MERGE_TARGET_CHARS) {
      chunks[chunks.length - 1] = `${last} ${piece}`;
    } else {
      chunks.push(piece);
    }
  }
  return chunks;
}

// ⚠ OTA-1130 — THE PRE-SYNTHESIS CACHE, and why it exists at all.
//
// OTA-1129 banked scene intros so the TEXT lands the instant the player walks
// in. That made the read-then-hear gap MORE visible, not less: the words became
// free while the voice still had to be synthesised on arrival. The bank is also
// what makes the real fix possible for the first time — if the line exists
// before it is needed, so can its audio.
//
// So a banked line is spoken from PCM that was computed during the same idle
// window that wrote it. Text and voice land together, which is the answer to
// the owner's actual question — *"do we need to see the text and then hear
// it?"* No. They should arrive at once.
//
// Keyed by voice AND chunk text, because the player can change the Arbiter's
// voice at any time and audio in the wrong voice is worse than a short wait.
// Small on purpose: PCM is bulky (~24 kHz float, so a six-second line is well
// over half a megabyte) and this is a latency buffer, not a sound library.
const presynth: Map<string, Float32Array> = new Map();
const PRESYNTH_CAP = 6;
const presynthKey = (voiceId: string, chunk: string): string => `${voiceId}::${chunk}`;

/** Take (and remove) pre-synthesised audio for a chunk, or undefined. One-shot,
 *  matching the text bank above it — a line is spent once. */
function takePresynth(voiceId: string, chunk: string): Float32Array | undefined {
  const k = presynthKey(voiceId, chunk);
  const hit = presynth.get(k);
  if (!hit) return undefined;
  presynth.delete(k);
  return hit;
}

/** ⚠ Synthesise a line AHEAD of being asked for it, at HOMEWORK priority.
 *
 *  The priority is the whole safety argument. This runs during idle time and
 *  must never delay a line the player is waiting on, so it sits below both the
 *  live voice and the LLM — and OTA-1123's harness cuts it short the moment
 *  either arrives. Failure is free: the cache simply misses and the line is
 *  synthesised the ordinary way.
 *
 *  Chunked exactly as `speak()` chunks it, because the cache is read per-chunk
 *  at enqueue. A different split here would miss every time, silently, which is
 *  the kind of bug that looks like "the feature just doesn't help". */
export async function presynthesize(text: string, voiceId?: string | null): Promise<boolean> {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return false;
  // ⚠ OTA-1140 (pressure test) — EVICT, DON'T WEDGE. The cap used to REFUSE
  // when full, and nothing but an exact-key hit ever removed an entry — so six
  // orphans (a voice change invalidates every key; a bank eviction strands its
  // audio; a duplicate-skip leaves one unspent) made pre-synthesis a permanent
  // no-op for the rest of the session with ~3 MB of PCM pinned. Insertion order
  // IS age on a JS Map, so dropping the oldest turns the same six slots into a
  // rolling window that self-heals from every orphan class at once.
  while (presynth.size >= PRESYNTH_CAP) {
    const oldest = presynth.keys().next().value;
    if (oldest === undefined) break;
    presynth.delete(oldest);
  }
  const prepared = cleanForSpeech(applyLoreLexicon(text)).trim();
  if (!prepared) return false;
  const resolvedVoice = voiceId ?? arbiterVoiceId();
  const model = await ensureLoaded(resolvedVoice);
  if (!model) return false;
  let wrote = false;
  for (const chunk of chunkForSpeech(prepared)) {
    while (presynth.size >= PRESYNTH_CAP) {
      const oldest = presynth.keys().next().value;
      if (oldest === undefined) break;
      presynth.delete(oldest);
    }
    const k = presynthKey(resolvedVoice, chunk);
    if (presynth.has(k)) continue;
    try {
      const samples = await runExclusiveNativeMl(
        () => model.forward(chunk, settings.rate),
        ML_PRIORITY_HOMEWORK,
      ) as Float32Array | null;
      if (samples && samples.length > 0) { presynth.set(k, asFloat32(samples)); wrote = true; }
    } catch { return wrote; /* fail closed — a miss costs a normal synth */ }
  }
  return wrote;
}

/** Tests only — the cache is module state. */
export function _resetPresynth(): void { presynth.clear(); }
export function _presynthSize(): number { return presynth.size; }

/** ⚠ OTA-1132 — THE VOICE LOG SINK. The owner, after clocking the gap by hand:
 *  *"are the text lines and spoken lines timestamped when they fire? this would
 *  help measure the gap."* They were not — `appendLog` timestamps the TEXT, and
 *  nothing at all fired when audio actually began, so the only instrument was a
 *  human with a stopwatch. This is the missing half.
 *
 *  A settable sink rather than a direct store import: this module is the
 *  low-level native layer and must not depend on the store (TTSController owns
 *  that edge and installs the sink at boot). No sink → silence, which is the
 *  right behaviour under test. */
let voiceLogSink: ((line: string) => void) | null = null;
export function setVoiceLogSink(fn: ((line: string) => void) | null): void {
  voiceLogSink = fn;
}
function logv(line: string): void {
  try { voiceLogSink?.(line); } catch { /* a broken sink must never break audio */ }
}

/** OTA-1132 — split the lock WAIT from the synthesis itself. Both are "why the
 *  voice was late", but they have completely different fixes: waiting means
 *  something else held the native-ML lock (a Qwen job), while a slow synth means
 *  the line was long or the device was busy. Reporting one number for both would
 *  hide which. */
function inferSerial(
  model: any,
  text: string,
  rate: number,
  timing?: { waitMs: number },
): Promise<Float32Array | null> {
  // arb159 — route Kokoro synthesis through the SHARED native-ML lock so a synth
  // never overlaps a Qwen completion. The lock STAYS (it's what stopped the
  // crash); the arb161 fix is on the Qwen side — a generation cooldown so Qwen
  // doesn't grab this lock on every beat and starve the voice.
  // OTA-1130 — voice now runs ABOVE the LLM (reversing OTA-634): a narration
  // delayed two seconds is invisible, a voice delayed ten is the most obvious
  // defect in the game. The lock still guarantees one-at-a-time.
  const enqueuedAt = Date.now();
  return runExclusiveNativeMl(() => {
    if (timing) timing.waitMs = Date.now() - enqueuedAt;
    return model.forward(text, rate);
  }, ML_PRIORITY_VOICE) as Promise<Float32Array | null>;
}

// arb159/OTA — free a native voice module THROUGH the shared native-ML lock. A
// synth (model.forward, above) runs under this SAME lock; calling module.delete()
// unsynchronized while a forward pass is in flight frees native memory the compute
// is mid-read on — the exact SIGSEGV class the Qwen release-during-completion fix
// closed (LlamaRuntime.dispose). Serializing the free behind any running synth shuts
// the window. Best-effort — never throws (the native side may already be torn down).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lockedDeleteModule(module: any): Promise<void> {
  if (!module || typeof module.delete !== 'function') return Promise.resolve();
  return runExclusiveNativeMl(() => Promise.resolve(module.delete()), ML_PRIORITY_VOICE)
    .then(() => undefined)
    .catch(() => { /* native may already be torn down */ });
}
let currentlySpeaking: QueuedUtterance | null = null;
let currentSound: Audio.Sound | null = null;
// Backwards-compat: TTSController checks isPiperAvailable / getKokoroState
// which both read from setKokoroState. The state machine now tracks the
// ARBITER slot's status specifically — that's the voice the player
// downloads + warms on engine-on, and the "ready" UI signal is gated on
// that one being loaded.
let availabilityCache: boolean | null = null;
let lastDownloadProgress = 0;
const downloadListeners = new Set<(p: number) => void>();

/** Public install/load state machine. The settings UI subscribes to
 *  these so the player can SEE what's happening instead of guessing
 *  whether the bundled voice is downloading, loading, ready, or failed. */
export type KokoroState =
  | { phase: 'idle' }
  | { phase: 'downloading'; fraction: number }
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

let state: KokoroState = { phase: 'idle' };
const stateListeners = new Set<(s: KokoroState) => void>();

export function getKokoroState(): KokoroState {
  return state;
}

export function onKokoroStateChange(fn: (s: KokoroState) => void): () => void {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}

function setKokoroState(next: KokoroState): void {
  state = next;
  for (const l of stateListeners) {
    try { l(next); } catch { /* ignore */ }
  }
}

// OTA 23-017 — diagnostic capture for the wife's phone (and any
// other tester) seeing "Failed to load model" with no actionable
// info. The state machine's `message` field is truncated to 240
// chars for UI display; the full diagnostic — untruncated error,
// stack, which step failed, free disk at the time, voice id, and
// timestamp — lives here, with a small ring buffer so re-attempts
// don't overwrite the previous failure. AboutScreen reads this
// to populate COPY VOICE INFO so the tester can paste it back.
export interface KokoroErrorRecord {
  /** ISO timestamp at the moment the error was captured. */
  at: string;
  /** Which step failed — narrows the root cause without grepping
   *  the stack. */
  step: 'download' | 'load' | 'warmup' | 'unknown';
  /** Voice id being loaded when it failed. */
  voiceId: string;
  /** Full untruncated error message. */
  message: string;
  /** JS error stack if available. */
  stack: string | null;
  /** Free internal storage at attempt time, in MB. -1 means we
   *  couldn't read it. The Kokoro model is ~100 MB; anything
   *  under that is the most likely root cause. */
  diskFreeMB: number;
}

const KOKORO_ERROR_HISTORY: KokoroErrorRecord[] = [];
const KOKORO_ERROR_HISTORY_MAX = 5;

export function getKokoroErrorHistory(): readonly KokoroErrorRecord[] {
  return KOKORO_ERROR_HISTORY;
}

async function captureFreeDiskMB(): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system');
    const bytes = await FS.getFreeDiskStorageAsync();
    return typeof bytes === 'number' ? Math.round(bytes / (1024 * 1024)) : -1;
  } catch {
    return -1;
  }
}

/** Human-readable message for any thrown value. Native rejections are
 *  often plain objects, which String() renders as a useless
 *  "[object Object]"; pull a .message/.code or JSON instead so the
 *  diagnostic actually says what failed. */
function describeErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = err as any;
    if (typeof o.message === 'string' && o.message) return o.code ? `${o.code}: ${o.message}` : o.message;
    try { return JSON.stringify(err); } catch { /* fall through */ }
  }
  return String(err);
}

function recordKokoroError(
  step: KokoroErrorRecord['step'],
  voiceId: string,
  err: unknown,
  diskFreeMB: number,
): void {
  const message = describeErr(err);
  const stack = err instanceof Error && err.stack ? err.stack : null;
  KOKORO_ERROR_HISTORY.unshift({
    at: new Date().toISOString(),
    step,
    voiceId,
    message,
    stack,
    diskFreeMB,
  });
  while (KOKORO_ERROR_HISTORY.length > KOKORO_ERROR_HISTORY_MAX) {
    KOKORO_ERROR_HISTORY.pop();
  }
}

// Voice id → executorch constant lookup. Default AF_HEART (American
// female, natural-sounding default per the Kokoro docs).
const VOICES: Record<string, unknown> = {
  af_heart: exec?.KOKORO_VOICE_AF_HEART,
  af_river: exec?.KOKORO_VOICE_AF_RIVER,
  af_sarah: exec?.KOKORO_VOICE_AF_SARAH,
  am_adam: exec?.KOKORO_VOICE_AM_ADAM,
  am_michael: exec?.KOKORO_VOICE_AM_MICHAEL,
  bf_emma: exec?.KOKORO_VOICE_BF_EMMA,
  bm_daniel: exec?.KOKORO_VOICE_BM_DANIEL,
};

export function listKokoroVoices(): string[] {
  return Object.keys(VOICES);
}

export function onDownloadProgress(fn: (p: number) => void): () => void {
  downloadListeners.add(fn);
  fn(lastDownloadProgress);
  return () => downloadListeners.delete(fn);
}

function pickVoice(): unknown {
  const id = getVoiceSettings().kokoroVoice ?? 'am_michael';
  return VOICES[id] ?? exec.KOKORO_VOICE_AM_MICHAEL;
}

/** True once the model has been loaded into memory at least once. */
export async function isPiperAvailable(): Promise<boolean> {
  // Function name kept for API compatibility with the parked Piper stub
  // — TTSManager imports this. Returns whether Kokoro is loaded + usable.
  if (availabilityCache !== null) return availabilityCache;
  // Just check if the module is importable. Actual model load happens
  // lazily on first speak() so toggling BUNDLED in settings doesn't
  // trigger a ~100MB download until the player commits.
  availabilityCache = typeof exec?.TextToSpeechModule?.fromModelName === 'function';
  return availabilityCache;
}

export function resetPiperAvailability(): void {
  availabilityCache = null;
}

let prewarmStarted = false;

/** Kick off model download + load + a tiny silent warm-up inference
 *  in the background. Idempotent — first call starts the work, later
 *  calls just resolve when the in-flight load finishes. The warm-up
 *  forward() ensures the executorch graph is compiled so the player's
 *  first real speak() doesn't pay the cold-start tax.
 *
 *  Called at app boot from TTSManager when engine='bundled', and
 *  also when the player flips engine to bundled mid-session. Safe
 *  to call when the model is already ready (returns immediately). */
export async function prewarmKokoro(): Promise<void> {
  if (prewarmStarted) return;
  // ⚠⚠ OTA-1228 — NOT ON DESKTOP. THIS IS THE 51% FREEZE.
  //
  // Owner, on the PC build: *"I think the arbiter first time setup has frozen,
  // it did this before on my Steam Deck. it's been a few minutes and it's
  // hanging at 51%."* It had not frozen for a few minutes; it was never going
  // to finish.
  //
  // MEASURED, not reasoned about — the web bundle run headless against the same
  // export the owner installed:
  //     BOOT_STAGE = qwen:failed
  //     kokoro     = {"phase":"loading"}      ← still, at t=8s, 20s and 35s
  //     exec.TextToSpeechModule.fromModelName exists → true
  // and the owner's own copied diagnostic from the desktop build agrees:
  //     Platform: web · Boot stage: qwen:failed
  //
  // That is the whole bug, and 51% is its arithmetic. The title bar averages the
  // two engines: Qwen fails fast on desktop (0.10, correct — llama.rn is a native
  // module and the Arbiter narrates from templates there) and Kokoro sits on
  // 'loading' (0.92) forever. (0.10 + 0.92) / 2 = 51%, to the digit, permanently.
  //
  // WHY IT HANGS: react-native-executorch's JS resolves in a web bundle, so the
  // `fromModelName` guard below passes — but the call behind it reaches for a
  // native runtime that isn't there and neither resolves NOR rejects. A promise
  // that never settles cannot be caught, so no error state was ever reached.
  //
  // WHY IT IS PURE WASTE ANYWAY: on web, TTSManager.speak() does not use this
  // pool at all — it routes to the ONNX kokoro-js engine. So the desktop voice
  // never needed this prewarm; it only ever needed it not to run.
  //
  // ⚠ MOBILE IS UNTOUCHED: Platform.OS is 'ios'/'android' on the HAL line, so
  // this returns false and the prewarm runs exactly as it always has. Leaving
  // the state on 'idle' (rather than faking 'ready') is deliberate — speak()
  // gates on `phase !== 'error'`, so the desktop voice route stays open.
  if (Platform.OS === 'web') return;
  prewarmStarted = true;
  try {
    // Load the Arbiter voice — sticky, drives the public state machine
    // (download progress + ready signal). ensureLoaded does its own
    // warm-up forward() so this single call covers both pieces.
    await ensureLoaded(arbiterVoiceId());
    // If the load failed (network blip, metered-data refusal, etc.)
    // ensureLoaded returns null silently. Reset the latch so a
    // subsequent toggle / retry can fire fresh; otherwise the player
    // is stuck with engine=bundled + no download + no retry path
    // until they hit the UPDATE button.
    if (!VOICE_POOL.has(arbiterVoiceId())) {
      prewarmStarted = false;
    }
  } catch {
    prewarmStarted = false;
    /* state machine surfaced the error */
  }
}

export function isSpeaking(): boolean {
  return currentlySpeaking !== null || queue.length > 0;
}

export function getModelDir(): string {
  // ExecuTorch manages its own model cache; this path is informational.
  return 'executorch-cache://kokoro/';
}

function arbiterVoiceId(): string {
  return getVoiceSettings().kokoroVoice ?? 'am_michael';
}

function voiceRefFor(voiceId: string): unknown {
  return VOICES[voiceId] ?? exec.KOKORO_VOICE_AM_MICHAEL;
}

// Evict the least-recently-used non-sticky voice from the pool when
// at capacity. Sticky (Arbiter) is never selected.
function evictLRU(): void {
  if (VOICE_POOL.size < POOL_MAX) return;
  const candidates = Array.from(VOICE_POOL.entries())
    .filter(([, v]) => !v.sticky)
    .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
  const victim = candidates[0];
  if (!victim) return;
  const [vid, entry] = victim;
  try {
    if (typeof entry.module?.delete === 'function') entry.module.delete();
  } catch { /* ignore */ }
  VOICE_POOL.delete(vid);
}

/** Ensure a Kokoro instance is loaded for the given voice. Returns
 *  the loaded module, or null on failure. Concurrent calls for the
 *  same voiceId share one in-flight load promise. The Arbiter voice
 *  is loaded as sticky (never evicted); all other voices are
 *  evictable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureLoaded(voiceId: string): Promise<any | null> {
  const existing = VOICE_POOL.get(voiceId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.module;
  }
  const inFlight = LOADING.get(voiceId);
  if (inFlight) return inFlight;
  // ⚠ OTA-1228 — the second half of the desktop guard, and the load-bearing one.
  // The prewarm is the only caller at boot, but a vendor voice swap reaches here
  // too, and one un-awaited executorch call is all it takes to re-wedge the state
  // machine at 'loading'. The existing `fromModelName` check below does NOT cover
  // it: that symbol EXISTS in a web bundle (measured: true) — it just never
  // settles when called.
  if (Platform.OS === 'web') return null;
  if (!exec?.TextToSpeechModule?.fromModelName) return null;
  const sticky = voiceId === arbiterVoiceId();
  // ⚠ OTA-1360 — the cooldown gate (see the block above VENDOR_LOAD_COOLDOWN_MS).
  // A vendor load is refused while the window is open; the line falls back to
  // silence (drain's existing null-model path) and the process stays alive.
  if (!sticky && Date.now() < vendorLoadCooldownUntil) return null;
  // Evict BEFORE registering the new in-flight load so two concurrent
  // ensureLoaded calls don't both pass the capacity gate. Audit caught
  // a race where two vendor swaps in the same tick both saw size=1 +
  // LOADING=0, both skipped eviction, both loaded → pool hit 3.
  // Counting the new load in advance closes the window.
  while (VOICE_POOL.size + LOADING.size + 1 > POOL_MAX) {
    const evictableExists = Array.from(VOICE_POOL.values()).some((v) => !v.sticky);
    if (!evictableExists) break; // pool only has sticky entries — accept overflow rather than infinite-loop
    evictLRU();
  }
  const promise = (async () => {
    // OTA 23-017 — track which step we're in so the diagnostic
    // record tells us whether the download finished and the load
    // / warmup is what blew up. That's the single most useful
    // datum for triaging "Failed to load model" reports.
    let step: KokoroErrorRecord['step'] = 'download';
    try {
      // First-time load on the Arbiter voice drives the public state
      // machine (download progress, ready signal). Vendor voices load
      // silently — players don't need a UI for every vendor swap.
      //
      // Time-based gate distinguishes cache hits from real downloads:
      // cache reads fully resolve in <2s; a real 100 MB download takes
      // 30–60s. Initial phase is 'loading' (banner reads "Waking up
      // the Arbiter…"). If the load is still in flight 4s in AND the
      // progress callback is still reporting fraction < 0.99, we
      // escalate to phase 'downloading' so the player sees the real
      // percentage during a genuine first-time fetch. Cache hits never
      // trip the gate and stay on the calmer loading copy throughout.
      if (sticky) setKokoroState({ phase: 'loading' });
      const loadStartedAt = Date.now();
      let downloadEscalated = false;
      // ⚠⚠ OTA-1360 — THE LOAD JOINS THE NATIVE-ML LOCK. arb159 put every
      // forward() under runExclusiveNativeMl because Qwen + Kokoro running
      // concurrently crashed the Tensor G5 — but the LOAD stayed outside, and
      // the load is the single heaviest native-ML op in the app: model mmap +
      // graph compile + the phonemizer's dictionary build, on executorch's own
      // worker pool. Both Aug-18 tombstones die exactly there, mid-load, while
      // other native work could still be in flight. Same rule for every native
      // ML engine now: create AND run go through the one lock. Post-first-boot
      // loads are cache hits (the ~100MB model downloads once, at prewarm), so
      // holding the lock here costs the compile time, not a download.
      const m = await runExclusiveNativeMl(() => exec.TextToSpeechModule.fromModelName(
        { model: exec.KOKORO_MEDIUM, voice: voiceRefFor(voiceId) },
        (p: number) => {
          if (sticky) {
            lastDownloadProgress = p;
            if (!downloadEscalated) {
              const elapsed = Date.now() - loadStartedAt;
              // 2000ms gate: cache hits report p≈1 well before this (and
              // the p<0.99 guard skips them anyway), so only a genuine
              // first-time download trips it. Lowered from 4000ms so the
              // percentage surfaces nearer the true start of the ramp —
              // at 4s a fast download was already ~37% in, which read as
              // "the bar starts at 37% then jumps to done".
              if (elapsed >= 2000 && p < 0.99) {
                downloadEscalated = true;
              }
            }
            if (downloadEscalated) {
              setKokoroState({ phase: 'downloading', fraction: p });
            }
            for (const l of downloadListeners) {
              try { l(p); } catch { /* ignore */ }
            }
          }
        },
      ), ML_PRIORITY_VOICE);
      step = 'load';
      if (sticky) setKokoroState({ phase: 'loading' });
      step = 'warmup';
      // Warm-up forward — compiles the graph so the player's first real line
      // doesn't pay cold-start latency. Output discarded.
      // arb70 — warm up at the CONFIGURED rate, not a hardcoded 1.0, with a
      // realistic-length phrase. Kokoro's native forward(text, speed) pays a
      // cold cost on the first call AT A GIVEN SPEED that TRUNCATES the head of
      // that utterance. The old warm-up ran at 1.0; for two weeks the default
      // rate was also 1.0 so it covered the real line — but once the default
      // was raised to 1.2 (Plasma/Copper Cask) the warm-up no longer warmed
      // the 1.2 path, so the title line (the first real forward at 1.2) came
      // out with its head clipped ("Choose your character" → "aracter").
      // Warming at the real rate + a real-length phrase pays that cost HERE
      // (discarded) so the first user-facing line is clean.
      // Captured here too — the executorch native graph compile is the single
      // most likely OOM site on low-RAM devices.
      const warmRate = getVoiceSettings().rate ?? 1.0;
      try {
        const samples = await inferSerial(m, 'The Arbiter stirs, and takes a breath.', warmRate);
        void samples;
      }
      catch (warmupErr) {
        const diskFreeMB = await captureFreeDiskMB();
        recordKokoroError('warmup', voiceId, warmupErr, diskFreeMB);
        // Treat warm-up failure as terminal — the model is loaded
        // but can't actually run on this device. Re-throw so the
        // outer catch surfaces it.
        throw warmupErr;
      }
      VOICE_POOL.set(voiceId, { module: m, lastUsedAt: Date.now(), sticky });
      if (sticky) setKokoroState({ phase: 'ready' });
      return m;
    } catch (err) {
      const msg = describeErr(err);
      // ⚠ OTA-1360 — a failed load, whatever the step, means the device just
      // refused (or choked on) the allocation. Open the cooldown so the next
      // vendor scene doesn't immediately re-attempt the exact operation that
      // failed — on a memory-tight device the retry is the one that kills.
      vendorLoadCooldownUntil = Math.max(vendorLoadCooldownUntil, Date.now() + VENDOR_LOAD_COOLDOWN_MS);
      // Avoid double-recording: warmup catch already wrote a
      // detailed record. For everything else, capture here.
      if (step !== 'warmup') {
        const diskFreeMB = await captureFreeDiskMB();
        recordKokoroError(step, voiceId, err, diskFreeMB);
      }
      // Prefix the step so the status line / COPY VOICE INFO says WHERE it
      // failed: '[warmup] undefined is not a function' points at the native
      // generate() call (APK/native mismatch — needs a rebuild), whereas a
      // '[speak]' failure (drain catch) points at the JS post-processing.
      if (sticky) setKokoroState({ phase: 'error', message: `[${step}] ${msg}`.slice(0, 240) });
      return null;
    } finally {
      LOADING.delete(voiceId);
    }
  })();
  LOADING.set(voiceId, promise);
  return promise;
}

/** Pre-load a vendor voice without speaking. Called by beginScene
 *  when a vendor appears so the model graph is compiled by the time
 *  the vendor's first line lands. Idempotent — no-op if already
 *  loaded. */
export async function warmVoice(voiceId: string): Promise<void> {
  await ensureLoaded(voiceId);
}

/** Explicitly evict a vendor voice from the pool. Called when the
 *  player leaves a scene with a vendor / the vendor walks off, so
 *  memory drops to the Arbiter slot only. Sticky (Arbiter) voices
 *  are protected — pass-through no-op. */
export function disposeVoice(voiceId: string): void {
  const entry = VOICE_POOL.get(voiceId);
  if (!entry || entry.sticky) return;
  const mod = entry.module;
  VOICE_POOL.delete(voiceId);
  // Free through the shared lock so a running synth isn't cut out from under.
  void lockedDeleteModule(mod);
}

/** Drop the currently-loaded Arbiter voice (and clear sticky flag).
 *  Called by the voice-settings observer when the player changes
 *  their kokoroVoice setting — without this, the old sticky entry
 *  is unevictable and the pool leaks ~100 MB per swap. The new
 *  voice loads on the next speak() call. */
export function disposeStickyArbiterVoice(): void {
  // Snapshot the sticky entries first, then remove + free — freeing each native
  // module THROUGH the shared lock so it can't race a running synth.
  const sticky: Array<[string, unknown]> = [];
  for (const [vid, entry] of VOICE_POOL) {
    if (entry.sticky) sticky.push([vid, entry.module]);
  }
  for (const [vid, mod] of sticky) {
    VOICE_POOL.delete(vid);
    void lockedDeleteModule(mod);
  }
  // Reset the latch so prewarmKokoro can re-fire for the new voice.
  prewarmStarted = false;
}

export function speak(text: string, voiceId?: string | null, channel?: string, opts?: { front?: boolean }): number {
  const settings = getVoiceSettings();
  if (!settings.ttsEnabled) return -1;
  // Lexicon respellings (Aetheric, Tartarian, etc.) + symbol cleanup
  // (arrows → "to", "-N" → "negative N"). Pure transform on the
  // engine-bound copy; the visible log keeps the original symbols.
  const prepared = cleanForSpeech(applyLoreLexicon(text)).trim();
  if (!prepared) return -1;
  const id = nextId++;
  // OTA-635 — front: the welcome-back greeting jumps the queue. Clear the queued
  // backlog so it plays immediately; currentlySpeaking isn't in `queue`, so the
  // chunk in progress finishes (no mid-word cut) and this is next.
  if (opts?.front) queue.length = 0;
  // OTA 226 + arb5 — Arbiter queue cap. Playtester: "if somebody spams
  // a direction the Arbiter fires off a bunch of flavor lines and talks
  // for 5 minutes afterwards." The original rule dropped EVERY queued
  // arbiter chunk on each new line — but that also ate intentional short
  // sequences (a pickup acknowledgement immediately followed by the next
  // beat's prompt), cutting the first line off (later playtester report).
  // Instead, cap the queue at MAX_QUEUED_ARBITER_LINES *whole lines*
  // (oldest dropped first), keyed by lineId so a multi-chunk line is
  // never truncated mid-sentence. currentlySpeaking is never touched;
  // orphaned prefetch promises on dropped chunks GC harmlessly.
  // OTA-634 — global cap across ALL channels (was arbiter-only). Drop the oldest
  // QUEUED lines so the voice can't fall more than MAX_QUEUED_TOTAL_LINES behind.
  // currentlySpeaking is never in `queue`, so it's never cut off; orphaned
  // prefetch promises on dropped chunks GC harmlessly.
  {
    const queuedLineIds: number[] = [];
    for (const q of queue) {
      if (q.lineId != null && !queuedLineIds.includes(q.lineId)) queuedLineIds.push(q.lineId);
    }
    // We're about to add one more line, so drop until there's room for it.
    while (queuedLineIds.length >= MAX_QUEUED_TOTAL_LINES) {
      const dropId = queuedLineIds.shift()!;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.lineId === dropId) queue.splice(i, 1);
      }
    }
  }
  const chunks = chunkForSpeech(prepared);
  const resolvedVoice = voiceId ?? arbiterVoiceId();
  // ⚠ OTA-1144 — does this line need the native-ML lock at all? A banked
  // (pre-synthesised) chunk plays straight from memory; only a chunk we still
  // have to infer will contend with a Qwen job, and only that case may reserve.
  let needsSynth = false;
  for (const [ci, chunk] of chunks.entries()) {
    const banked = takePresynth(resolvedVoice, chunk);
    if (!banked) needsSynth = true;
    queue.push({
      id: nextId++, text: chunk, voiceId: resolvedVoice, channel, lineId: id,
      endsSentence: endsOnTerminator(chunk),
      // OTA-1130 — the read-clock starts now; see STALE_LINE_MS. Stamped on
      // EVERY chunk so the stale sweep can price any of them.
      queuedAt: Date.now(),
      // OTA-1132 — but only the FIRST chunk reports the gap. A three-sentence
      // line would otherwise log three times and the second and third would be
      // measuring the wrong thing entirely — the wait for their own turn behind
      // the sentence before them, not the delay the player felt.
      lineHead: ci === 0,
      // ⚠ OTA-1130 — PRE-SYNTHESISED AUDIO, if this line was banked ahead of
      // time. When it hits, drain() plays without inferring at all and the
      // voice lands with the text instead of behind it.
      resolvedSamples: banked,
    });
  }
  // ⚠ OTA-1144 — CLAIM THE SLOT NOW, not when drain() finally reaches the lock.
  // Between this push and that call, drain awaits the voice model and a durable
  // crash breadcrumb; the device log caught an item synthesis taking the lock
  // inside exactly that gap and holding it for 3.5 s of uninterruptible prefill
  // while the greeting the player had already read waited to be spoken.
  if (needsSynth) reserveVoiceSlot();
  void drain();
  return id;
}

async function drain(): Promise<void> {
  if (currentlySpeaking) return;
  // ⚠ OTA-1130 — DON'T READ ME SOMETHING I FINISHED READING. Drop whole lines
  // whose text has been on screen longer than STALE_LINE_MS before a syllable
  // of them ever played. Keyed by lineId so a line is dropped ENTIRE — never
  // half-spoken, which would be worse than either extreme.
  //
  // Deliberately checked here, at the moment of speaking, rather than at
  // enqueue: a line that waits three seconds and then plays is fine, and only
  // the lock knows in advance which lines will lose that fight.
  {
    const now = Date.now();
    const staleLineIds = new Set<number>();
    for (const q of queue) {
      if (q.queuedAt != null && now - q.queuedAt > STALE_LINE_MS && q.lineId != null) {
        staleLineIds.add(q.lineId);
      }
    }
    if (staleLineIds.size > 0) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.lineId != null && staleLineIds.has(queue[i]!.lineId!)) queue.splice(i, 1);
      }
    }
  }
  const next = queue.shift();
  if (!next) {
    // Nothing left to speak — restore music to full volume.
    void setMusicDuck(false);
    // OTA-1144 — the queue drained (every line spoken, or the stale sweep took
    // them). Nothing is coming to claim the reservation, so drop it now.
    releaseVoiceSlot();
    return;
  }
  currentlySpeaking = next;
  // A line is about to play — duck the music under the Arbiter's voice.
  void setMusicDuck(true);
  const targetVoice = next.voiceId ?? arbiterVoiceId();
  const model = await ensureLoaded(targetVoice);
  if (!model) {
    currentlySpeaking = null;
    void drain();
    return;
  }
  // OTA-413 — voice crash breadcrumb. Flush a marker (naming the voice) before the
  // native synth + playback, so a SIGSEGV mid-utterance is detected AND named on the
  // next boot (the diagnostic's "Voice (TTS) guard" line), instead of being
  // indistinguishable from a Qwen crash. Cleared in the finally whether the
  // utterance succeeds or a JS error is caught (both mean the process survived).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ml = require('../diagnostics/mlHealth') as typeof import('../diagnostics/mlHealth');
  await ml.markTTSStart(`kokoro:${targetVoice}`);
  try {
    const settings = getVoiceSettings();
    // Use the prefetched samples if drain's previous iteration already
    // kicked off inference for this chunk AND the prefetched voice
    // still matches what we're about to play with. OTA 013 — if the
    // player switched the Arbiter voice between prefetch-start and
    // consume, the prefetched audio is the wrong voice; discard and
    // re-infer with the current model.
    const prefetchStillValid = !!next.prefetch
      && (next.prefetchVoiceId === undefined || next.prefetchVoiceId === targetVoice);
    // ⚠ OTA-1132 — MEASURE THE GAP THE OWNER WAS TIMING BY HAND.
    // Three separate numbers, because they have three different fixes:
    //   gap   — text on screen → first audio. The thing actually complained
    //           about ("5-6 second delay between welcome back text and when
    //           kokoro fired the same line").
    //   wait  — of that, how long the native-ML lock was held by something
    //           else. A Qwen job in front of us.
    //   synth — how long Kokoro itself took once it had the lock.
    // Plus whether the audio came from OTA-1130's pre-synthesis cache, which is
    // the one case where the gap should be near zero — if `cached` shows and
    // the gap is still large, the cache is not the win it was meant to be.
    const timing = { waitMs: 0 };
    const preSynthed = next.resolvedSamples != null && next.resolvedSamples.length > 0;
    const tBeforeInfer = Date.now();
    const firstSamples: Float32Array = asFloat32(
      preSynthed
        ? next.resolvedSamples
        : prefetchStillValid ? await next.prefetch! : await inferSerial(model, next.text, settings.rate, timing),
    );
    // ⚠ OTA-1144 — the audio for this chunk is in hand (banked, prefetched, or
    // just synthesised under the lock), so the reservation has done its job.
    // Released HERE rather than left to expire so an LLM job waits the real
    // handoff — a few hundred ms — and never the whole deadline.
    releaseVoiceSlot();
    const synthMs = Date.now() - tBeforeInfer - timing.waitMs;
    if (next.queuedAt != null && next.lineHead) {
      const source = preSynthed ? 'cached' : prefetchStillValid ? 'prefetch' : 'live';
      logv(
        `voice⏱ gap ${Date.now() - next.queuedAt}ms`
        + ` (wait ${timing.waitMs}ms + synth ${synthMs}ms, ${source})`
        + ` "${next.text.slice(0, 40)}${next.text.length > 40 ? '…' : ''}"`,
      );
    }
    if (!firstSamples || firstSamples.length === 0) {
      currentlySpeaking = null;
      void drain();
      return;
    }
    // arb8 — assemble a crossfade batch: this chunk plus any following
    // same-voice chunks whose audio is ALREADY inferred (prefetch
    // resolved). We never block on inference here, so first-audio stays
    // fast; the batch only grows once prefetch has run ahead during the
    // previous chunk's playback.
    const batch: Float32Array[] = [firstSamples];
    // arb165 — parallel to `batch`: did each member end on a sentence
    // terminator? Drives the silence-gap-vs-crossfade choice in joinBatch.
    const batchEndsSentence: boolean[] = [!!next.endsSentence];
    while (batch.length < CROSSFADE_MAX_BATCH) {
      const peek = queue[0];
      if (!peek) break;
      // Only crossfade chunks of the SAME line. Merging across separate
      // lines made discrete beats (e.g. tutorial acks) run together and
      // feel laggy; intra-line bundling keeps long narration smooth while
      // distinct lines stay responsive. (Prefetch still pipelines across
      // lines below, so the inter-line gap stays small.)
      if (peek.lineId !== next.lineId) break;
      const peekVoice = peek.voiceId ?? arbiterVoiceId();
      if (peekVoice !== targetVoice) break;                 // stop at a voice change
      if (peek.resolvedSamples === undefined) break;        // not inferred yet → don't block
      if (peek.prefetchVoiceId !== undefined && peek.prefetchVoiceId !== targetVoice) break; // stale voice
      queue.shift();
      if (peek.resolvedSamples && peek.resolvedSamples.length) {
        batch.push(peek.resolvedSamples);
        batchEndsSentence.push(!!peek.endsSentence);
      }
    }
    // Prime inference for the next few chunks (same voice only) so future
    // drains can keep forming batches. Switching voices mid-queue would
    // force a model swap and defeat the win, so prefetch stops there.
    primePrefetch(model, targetVoice, settings.rate);

    let combined: Float32Array;
    if (batch.length === 1) {
      // Single chunk — playPcm trims + fades it.
      combined = firstSamples;
      // ⚠ OTA-1136 — AND IT STILL OWES THE SENTENCE ITS BEAT. The gap above is
      // applied by joinBatch, which only runs when two or more chunks were
      // bundled — and bundling depends on whether the NEXT chunk happened to be
      // inferred yet. So the identical line paused after the full stop or did
      // not, according to how fast Kokoro was that second. When this chunk ends
      // a sentence and more of the SAME line is still queued behind it, pad the
      // beat here so the pause is a property of the punctuation, not of timing.
      if (next.endsSentence && queue[0] && queue[0].lineId === next.lineId) {
        try { combined = padSilence(combined, KOKORO_SAMPLE_RATE, 0, SENTENCE_PAUSE_MS); } catch { /* unpadded */ }
      }
    } else {
      // Trim each member's pad-silence first, then join: a short silence after
      // any member that ends a sentence (arb165), an equal-power crossfade
      // otherwise. Never let post-processing break playback — fall back to the
      // first chunk.
      try {
        const trimmedBufs = batch.map((b) => trimSilenceLeadTrail(b, KOKORO_SAMPLE_RATE));
        combined = joinBatch(trimmedBufs, batchEndsSentence, KOKORO_SAMPLE_RATE);
      } catch {
        combined = firstSamples;
      }
    }
    await playPcm(combined, KOKORO_SAMPLE_RATE);
  } catch (err) {
    const msg = describeErr(err);
    // OTA 23-017 — runtime-speak failure (model loaded, ready,
    // but a specific utterance blew up). Record so the diagnostic
    // captures it instead of just showing the truncated UI msg.
    const diskFreeMB = await captureFreeDiskMB();
    recordKokoroError('unknown', currentlySpeaking?.voiceId ?? 'unknown', err, diskFreeMB);
    setKokoroState({ phase: 'error', message: `[speak] ${msg}`.slice(0, 240) });
  } finally {
    // OTA-413 — the process survived this utterance (success or JS-caught error),
    // so clear the voice crash breadcrumb; only a native SIGSEGV leaves it behind.
    void ml.markTTSDone();
    currentlySpeaking = null;
    void drain();
  }
}

export async function stopAndClear(): Promise<void> {
  queue.length = 0;
  currentlySpeaking = null;
  void setMusicDuck(false);
  if (currentSound) {
    // OTA-1675 — a live player is about to be stopped and released natively.
    stampVoicePhase('stop');
    try { await currentSound.stopAsync(); } catch { /* ignore */ }
    try { await currentSound.unloadAsync(); } catch { /* ignore */ }
    currentSound = null;
  }
}

export async function disposePiperEngine(): Promise<void> {
  await stopAndClear();
  // Drop every loaded voice in the pool — Arbiter + any vendor still resident.
  // Snapshot the modules and clear the pool FIRST so no new speak() reuses a slot
  // we're about to free, then free each native module THROUGH the shared lock so a
  // free never races an in-flight synth. The next prewarm() re-loads the Arbiter.
  const mods = Array.from(VOICE_POOL.values()).map((e) => e.module);
  VOICE_POOL.clear();
  LOADING.clear();
  prewarmStarted = false;
  await Promise.all(mods.map((m) => lockedDeleteModule(m)));
}

/** Force a model refresh: dispose the loaded engine, wipe the
 *  adapter's executorch cache, and reset state to idle. The next
 *  speak() call will trigger a fresh download — which fetches the
 *  current model URLs (so if Software Mansion ships a newer
 *  kokoro-medium build the player picks it up).
 *
 *  Called by the UPDATE button on the Voice settings tab. */
export async function refreshPiperEngine(): Promise<void> {
  await disposePiperEngine();
  try {
    // Adapter writes downloads to this directory; clearing it forces
    // the next fetch to re-pull from the source URL.
    const FileSystem = require('expo-file-system');
    const dir = (FileSystem.documentDirectory ?? '') + 'tartaria-executorch/';
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    /* swallow — UPDATE is best-effort */
  }
  availabilityCache = null;
  lastDownloadProgress = 0;
  setKokoroState({ phase: 'idle' });
}

// ── PCM → WAV → expo-av playback ────────────────────────────────────

/** Wrap a Float32Array PCM buffer in a WAV header and play it via
 *  expo-av Sound. Returns once playback finishes (so the queue drains
 *  in order). */
async function playPcm(samples: Float32Array, sampleRate: number): Promise<void> {
  // Smooth the head + tail of the waveform to eliminate the audible
  // click between sentences. Kokoro's PCM output starts / ends at
  // non-zero amplitude on most utterances; cutting playback on
  // didJustFinish then immediately starting the next utterance
  // produces a sharp transient at the join. Originally 10ms ramp,
  // but playtest reported the first / last word of each sentence
  // getting clipped — 10ms (~220 samples) is long enough to touch
  // real phoneme content. Dropped to 3ms (~66 samples at 22.05 kHz),
  // which is well under any single phoneme and still kills the
  // click.
  // arb7 prosody — strip the 30-150ms of near-silence Kokoro pads onto
  // the head + tail of each utterance before fading. Concatenated in the
  // queue these dead spans stack into the stuttering inter-sentence gap;
  // trimming them (with a guard pad so soft attacks survive) tightens the
  // join so consecutive chunks read as continuous speech.
  // Normalize first (native bridges sometimes return a non-Float32Array),
  // then trim + fade — but never let post-processing throw and silence the
  // voice: on any failure, play the raw samples.
  const src = asFloat32(samples);
  // OTA-1675 — which utterance of this life, and how long. `#1` on a fresh
  // model load is the shape of kai's death; `#40` is a different fact.
  utterancesThisLife += 1;
  const utteranceTag = `#${utterancesThisLife} ${(src.length / sampleRate).toFixed(1)}s`;
  stampVoicePhase('play:encode', utteranceTag);
  let buf = src;
  try {
    buf = trimSilenceLeadTrail(src, sampleRate);
    applyFadeEnvelope(buf, sampleRate, 3);
  } catch {
    buf = src;
  }
  // arb68 — light silent lead/tail guard so trimSilenceLeadTrail's strip + the
  // didJustFinish/unload timing don't shave a soft attack/decay. Kept SHORT so
  // it doesn't reintroduce the inter-line latency arb7/arb8 tightened. (The
  // earlier 1300ms "first-utterance" lead was removed: the title-line clip is
  // upstream of playback — the buffer itself arrives truncated — so padding the
  // playback buffer never addressed it. Fixed at the source instead.)
  // OTA-790 — tail raised 70 → 200ms: a player heard the end of EVERY Arbiter
  // line clipped. The release is now also deferred (UNLOAD_DRAIN_MS below), but
  // the tail must still outlast the deepest hardware buffer a device may hold
  // when didJustFinish fires, so the shave only ever eats silence.
  try { buf = padSilence(buf, sampleRate, 90, 200); } catch { /* play unpadded */ }
  const wavBase64 = encodeWav(buf, sampleRate);
  // progressUpdateIntervalMillis defaults to 500ms in expo-av, which
  // means didJustFinish fires up to half a second AFTER the audio
  // actually ends — that latency is the bulk of the inter-sentence
  // gap players described as too long. Drop to 50ms so the queue
  // advances within one frame of playback finishing.
  // OTA-285 — apply master TTS volume from voiceSettings. Read fresh
  // per playback so a slider change between utterances takes effect
  // on the next sentence (no need to rebuild the queue). Clamp 0..1
  // defensively even though setVoiceSettings clamps on write.
  const ttsVolume = Math.max(0, Math.min(1, getVoiceSettings().volume ?? 1));
  // OTA-1675 — the one platform-media step in the window kai's process died
  // in: expo-av builds the player and decodes the data: URI natively here.
  stampVoicePhase('play:create', utteranceTag);
  const { sound } = await Audio.Sound.createAsync(
    { uri: `data:audio/wav;base64,${wavBase64}` },
    { shouldPlay: true, progressUpdateIntervalMillis: 25, volume: ttsVolume },
  );
  currentSound = sound;
  stampVoicePhase('play:started', utteranceTag);
  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        stampVoicePhase('play:done', utteranceTag);
        // OTA-790 — DEFER the release. didJustFinish means the decoder finished
        // feeding the sink, not that the speaker finished playing: Android can
        // still hold ~100-250ms in the hardware AudioTrack, and an immediate
        // unloadAsync() discarded it — clipping the tail of every line. Resolve
        // now (queue pacing unchanged) and release after the sink has drained.
        // stopAndClear() may unload this sound first; the timer's second unload
        // rejects harmlessly into its catch.
        setTimeout(() => {
          // OTA-1675 — see the note on `stampVoicePhase`: never overwrite the
          // crumb of a native op that is running right now.
          if (!nativeMlSnapshot().running) stampVoicePhase('play:unload', utteranceTag);
          try { void sound.unloadAsync().catch(() => { /* already unloaded */ }); } catch { /* ignore */ }
          if (currentSound === sound) currentSound = null;
        }, UNLOAD_DRAIN_MS);
        resolve();
      }
    });
  });
}

/** Normalize whatever the native `generate()` bridge returns into a real
 *  Float32Array. Some bridges hand back an array-like or ArrayBuffer that
 *  lacks the TypedArray methods (.subarray/.set) the trim + crossfade
 *  post-processing relies on; calling them would throw "undefined is not a
 *  function" and drop the whole bundled voice to system TTS. Never throws;
 *  returns an empty buffer on anything unusable. */
function asFloat32(x: unknown): Float32Array {
  if (x instanceof Float32Array) return x;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = x as any;
  try {
    if (v instanceof ArrayBuffer) return new Float32Array(v);
    if (v && v.buffer instanceof ArrayBuffer && typeof v.byteOffset === 'number' && typeof v.length === 'number') {
      return new Float32Array(v.buffer, v.byteOffset, v.length);
    }
    if (v && typeof v.length === 'number') return Float32Array.from(v as ArrayLike<number>);
  } catch { /* fall through to empty */ }
  return new Float32Array(0);
}

/** Trim leading/trailing near-silence from a Kokoro waveform. Scans in
 *  from each end to the first sample above an amplitude threshold, then
 *  keeps a small guard pad so a soft consonant attack/decay is never
 *  clipped, and caps how much can be removed per end so a genuinely
 *  quiet line can't be gutted. Returns a subarray VIEW (no copy); never
 *  returns empty — if the whole buffer is below threshold it's left as-is. */
function trimSilenceLeadTrail(samples: Float32Array, sampleRate: number): Float32Array {
  const n = samples.length;
  if (n === 0) return samples;
  const THRESHOLD = 0.01;                            // |amp| counted as "sound"
  // ⚠ OTA-1148 — HEAD GUARD 8ms → 45ms. Owner: *"there has been a few times
  // where the arbiter has started speaking and has either skipped his first
  // word or started partway through it."*
  //
  // This is OTA-790's bug at the other end of the buffer, and the fix is the
  // same shape. That OTA widened the TAIL guard 8 → 40ms because "a fading
  // fricative sits well under the 0.01 threshold" and was being trimmed to
  // within 8ms of the last loud sample. An ONSET is the same physics in
  // reverse, and the Arbiter's own vocabulary is full of the worst cases:
  // "Welcome" opens on a /w/ glide that ramps up from near zero, "The" on a
  // weak voiced /ð/, and /h/ /s/ /f/ are breath before they are sound. The
  // scan walks straight past all of them to the first sample over 0.01 — the
  // vowel — and only 8ms was handed back, so the word began mid-vowel, or the
  // whole consonant vanished and it sounded like a skipped word.
  //
  // 45ms rather than the tail's 40: onsets run longer than decays, because
  // aspiration and frication precede voicing. `maxTrim` still bounds the other
  // direction, and the 90ms playback pad below is added AFTER this, so a wider
  // guard costs nothing but a few tens of ms of leading silence that the
  // hardware ramp wants anyway.
  const guardLead = Math.floor(sampleRate * 0.045);
  // OTA-790 — tail guard widened 8 → 40ms: a soft trailing decay (a fading
  // fricative sits well under the 0.01 threshold) was trimmed to within 8ms of
  // the last loud sample, running speech right up to the buffer edge and making
  // the unload shave audible. 40ms keeps the natural decay.
  const guardTail = Math.floor(sampleRate * 0.04);
  const maxTrim = Math.floor(sampleRate * 0.2); // never cut > 200ms per end
  let first = 0;
  while (first < n && Math.abs(samples[first]!) < THRESHOLD) first++;
  let last = n - 1;
  while (last > first && Math.abs(samples[last]!) < THRESHOLD) last--;
  if (first >= last) return samples;            // all-silence / lone spike
  const start = Math.min(Math.max(0, first - guardLead), maxTrim);
  const end = Math.max(Math.min(n - 1, last + guardTail), n - 1 - maxTrim);
  if (start <= 0 && end >= n - 1) return samples;
  return samples.subarray(start, end + 1);
}

/** arb8 — start inference for up to CROSSFADE_LOOKAHEAD chunks ahead of
 *  playback (same voice only), stamping each item's resolvedSamples when
 *  its forward() settles so drain() can fold ready chunks into a crossfade
 *  batch without blocking. Idempotent: skips items already prefetching. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function primePrefetch(model: any, voice: string, rate: number): void {
  let ahead = 0;
  for (const item of queue) {
    if (ahead >= CROSSFADE_LOOKAHEAD) break;
    const v = item.voiceId ?? arbiterVoiceId();
    if (v !== voice) break;                 // stop at a voice change
    if (!item.prefetch) {
      // OTA 013 — stamp the voice we inferred with so the consume side
      // can discard stale audio after a mid-stream voice switch.
      item.prefetchVoiceId = voice;
      item.prefetch = inferSerial(model, item.text, rate)
        .then((s: unknown) => { const f = asFloat32(s); item.resolvedSamples = f; return f; })
        .catch(() => { item.resolvedSamples = null; return null; });
    }
    ahead++;
  }
}

/** arb8 — concatenate PCM buffers into one waveform, overlapping each join
 *  by CROSSFADE_MS with an equal-power (constant-power) crossfade so the
 *  transition is smooth and click-free without a mid-fade amplitude dip.
 *  Inputs should already be silence-trimmed so the overlap is over real
 *  audio. Returns a fresh buffer. */
function concatWithCrossfade(buffers: Float32Array[], sampleRate: number): Float32Array {
  if (buffers.length === 1) return buffers[0]!;
  const xfadeMax = Math.max(1, Math.floor((sampleRate * CROSSFADE_MS) / 1000));
  // Per-join overlap is capped by the shorter of the two neighbours.
  const overlaps: number[] = [];
  let total = buffers[0]!.length;
  for (let i = 1; i < buffers.length; i++) {
    const ov = Math.min(xfadeMax, buffers[i - 1]!.length, buffers[i]!.length);
    overlaps.push(ov);
    total += buffers[i]!.length - ov;
  }
  const out = new Float32Array(total);
  out.set(buffers[0]!, 0);
  let pos = buffers[0]!.length;
  for (let i = 1; i < buffers.length; i++) {
    const buf = buffers[i]!;
    const ov = overlaps[i - 1]!;
    const start = pos - ov;
    for (let j = 0; j < ov; j++) {
      const t = (j + 1) / (ov + 1);                 // 0..1 across the overlap
      const gPrev = Math.cos((t * Math.PI) / 2);     // equal-power fade-out
      const gNext = Math.sin((t * Math.PI) / 2);     // equal-power fade-in
      out[start + j] = out[start + j]! * gPrev + buf[j]! * gNext;
    }
    out.set(buf.subarray(ov), pos);
    pos += buf.length - ov;
  }
  return out;
}

/** arb165 — join a same-line batch with a SLIGHT silence after every sentence
 *  (Kokoro otherwise runs sentences together), crossfading only the rare
 *  non-terminal join (a stray fragment). `endsSentence[i]` = did member i end
 *  on a terminator. Members are copied before edge-fading so cached/prefetched
 *  sample buffers are never mutated. */
function joinBatch(
  buffers: Float32Array[],
  endsSentence: boolean[],
  sampleRate: number,
): Float32Array {
  if (buffers.length === 1) return buffers[0]!;
  const gapLen = Math.max(0, Math.floor((sampleRate * SENTENCE_PAUSE_MS) / 1000));
  const xfadeMax = Math.max(1, Math.floor((sampleRate * CROSSFADE_MS) / 1000));
  const fadeLen = Math.max(1, Math.floor((sampleRate * EDGE_FADE_MS) / 1000));
  const segs = buffers.map((b) => b.slice());
  // Per-join plan: gap (after a sentence) or crossfade overlap.
  const gapJoin: boolean[] = [];
  const overlaps: number[] = [];
  let total = segs[0]!.length;
  for (let i = 1; i < segs.length; i++) {
    const gap = !!endsSentence[i - 1];
    gapJoin.push(gap);
    if (gap) {
      overlaps.push(0);
      total += gapLen + segs[i]!.length;
    } else {
      const ov = Math.min(xfadeMax, segs[i - 1]!.length, segs[i]!.length);
      overlaps.push(ov);
      total += segs[i]!.length - ov;
    }
  }
  // Taper each side of a gap so the silence join is click-free.
  for (let i = 0; i < segs.length; i++) {
    if (i < segs.length - 1 && gapJoin[i]) fadeEdge(segs[i]!, fadeLen, false);     // tail → silence
    if (i > 0 && gapJoin[i - 1]) fadeEdge(segs[i]!, fadeLen, true);                // silence → head
  }
  const out = new Float32Array(total);
  out.set(segs[0]!, 0);
  let pos = segs[0]!.length;
  for (let i = 1; i < segs.length; i++) {
    if (gapJoin[i - 1]) {
      pos += gapLen;                                  // leave zeros = the pause
      out.set(segs[i]!, pos);
      pos += segs[i]!.length;
    } else {
      const ov = overlaps[i - 1]!;
      const start = pos - ov;
      for (let j = 0; j < ov; j++) {
        const t = (j + 1) / (ov + 1);
        out[start + j] = out[start + j]! * Math.cos((t * Math.PI) / 2) + segs[i]![j]! * Math.sin((t * Math.PI) / 2);
      }
      out.set(segs[i]!.subarray(ov), pos);
      pos += segs[i]!.length - ov;
    }
  }
  return out;
}

/** Linear fade on one end of a buffer (head=true → fade-in, else fade-out).
 *  Mutates in place; used on the per-batch copies in joinBatch. */
function fadeEdge(samples: Float32Array, fadeLen: number, head: boolean): void {
  const n = Math.min(fadeLen, samples.length);
  for (let i = 0; i < n; i++) {
    const g = (i + 1) / (n + 1);
    if (head) samples[i] = samples[i]! * g;
    else samples[samples.length - 1 - i] = samples[samples.length - 1 - i]! * g;
  }
}

/** Apply a linear fade-in to the first `fadeMs` and fade-out to the
 *  last `fadeMs` of the buffer. Mutates the array in place. */
function applyFadeEnvelope(samples: Float32Array, sampleRate: number, fadeMs: number): void {
  const fadeSamples = Math.min(
    Math.floor((sampleRate * fadeMs) / 1000),
    Math.floor(samples.length / 2),
  );
  if (fadeSamples <= 1) return;
  for (let i = 0; i < fadeSamples; i++) {
    const g = i / fadeSamples;
    samples[i] = samples[i]! * g;
    samples[samples.length - 1 - i] = samples[samples.length - 1 - i]! * g;
  }
}

/** Convert Float32Array PCM samples [-1, 1] to a 16-bit mono WAV file,
 *  then return the file as a base64 string. */
function encodeWav(samples: Float32Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeString(view, 8, 'WAVE');

  // fmt subchunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLen, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]!;
    if (s > 1) s = 1; else if (s < -1) s = -1;
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return bytesToBase64(new Uint8Array(buf));
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Base64 encoder that handles the large ArrayBuffer we get from
 *  Kokoro without exceeding String.fromCharCode's argument-list limit. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  // global.btoa is available in Hermes.
  return globalThis.btoa(parts.join(''));
}

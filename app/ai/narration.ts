/**
 * app/ai/narration.ts — NARRATION AND THE ARBITER'S VOICE.
 *
 * OTA-1398 (slice 7 of the gameStore split). Everything that decides whether the
 * local model writes a line instead of the authored template, what it is allowed
 * to say, whether the line it produced is still true by the time it arrives, and
 * how often the Arbiter may speak unasked. ~1,250 lines.
 *
 * The reactive path (`narrateViaArbiter`) answers something the player just did,
 * so a stale result is WRONG and gets discarded by epoch. The ambient path
 * (`maybeGenerateAmbientArbiter`) answers nothing, so it is never stale in that
 * sense — but it can be composed for a situation that no longer exists, which is
 * what the ambient STAMP measures. Both banks (musings, scene intros) exist
 * because generating on demand costs the player a visible wait.
 *
 * ⚠⚠ THIS IS THE FIRST SLICE THAT HAD TO MOVE THINGS DOWN BEFORE IT COULD MOVE
 * ITSELF — three of them, and each for the same reason.
 *
 *   • `playerIsSprinting` → `app/state/sprint.ts`
 *   • `playerGridCell`    → `app/state/playerGrid.ts`
 *   • the visible-log counter → `app/state/visibleLogCount.ts`
 *
 * Every one is read by this file AND by gameStore. Two of the three carry
 * mutable state, so they could not travel with either owner — assigning to an
 * imported binding is a compile error. The third (`playerGridCell`) is pure but
 * has twenty-four call sites in the store, so importing it back from here would
 * have been the cycle in the other direction. The rule that decided all three is
 * the one slice 5 wrote down: SINGLE-OWNER STATE MOVES WITH ITS OWNER; SHARED
 * STATE MOVES DOWN BEHIND ACCESSORS.
 *
 * ⚠⚠ AND `cancelGeneration` STILL DID NOT MOVE — the plan said it would, and
 * measuring says it should not. It has been waiting since slice 2 with the note
 * "it travels with the narration slice", because it mutates
 * `arbiterGenerationEpoch`. But that epoch has TWO writers: this file bumps it
 * on every fresh narration, and `cancelGeneration` bumps it to discard one in
 * flight. Shared mutable state, therefore, moves DOWN — the epoch lives here,
 * behind `bumpArbiterGeneration()` / `arbiterGeneration()`, and the store action
 * stays a store action. The plan assumed slice 7 would be a store SLICE with a
 * deps object; measuring made it a leaf, and a leaf cannot hold a store action.
 * That is the fifth time in seven slices that measuring has corrected the plan.
 *
 * ⚠ NO VALUE IMPORT FROM gameStore, the rule every slice follows. Four test
 * seams that called `useGameStore.getState()` stayed behind for exactly that
 * reason — see the note beside `_AMBIENT_STALE_LINES`.
 *
 * ⚠ WHAT DID NOT CHANGE. Not one prompt, threshold, cooldown, guard or log
 * string. The proof is the suites that covered this code before the move and
 * cover it unchanged after — ota1031, ota1051, ota1122, ota1129, ota1131,
 * ota1258, ota663, ota609 and the arbiter dedup/entity-guard families.
 */
import type { GameStore } from '../state/gameStore';
import type { Location, Intent, PlayerCharacter, Enemy } from '../engine/types';
import { cognitive, qwen } from './engines';
import { spokenName } from '../engine/npcMemory';
import { stripForeignWords, repairGluedNarration, looksLikeInstructionEcho, isSecondPersonActionOpener } from '../engine/foreignText';
import { sentenceNamesOffCanonEntity, buildEntityAllowList, normalizeEntity } from '../engine/entityGuard';
import { getLocationById } from '../engine/encounter';
import { QWEN_ALLOWED_INTENTS } from '../engine/narrativeGenerator';
import { pick, chance } from '../engine/rng';
import { noteQwenDiscarded, lastQwenCallPreempted } from './generation/qwenTelemetry';
import { buildLlmContext, buildSystemPrompt, type SceneSlice } from '../engine/contextInjector';
import { deedsHereLine } from '../engine/deeds';
import { findMicroMicroAnywhere } from '../engine/worldLadder';
import { isRepetitiveArbiterLine } from '../engine/arbiterDedup';
import { canonicalLocationAtCell, clampGridCell } from '../engine/worldMap';
import { TUTORIAL_STEPS } from '../components/tutorialSteps';
import locationsData from '../data/locations/locations.json';
import conceptsData from '../data/lore/concepts.json';
// ⚠ THE THREE THAT HAD TO MOVE DOWN FIRST. See the header.
import { playerIsSprinting } from '../state/sprint';
import { playerGridCell } from '../state/playerGrid';
import { visibleLogTotal } from '../state/visibleLogCount';
// OTA-1571 — the scene-intro slot's strike ledger; see sceneIntroRefusals for
// why the homework scan needs one and what it cost not to have it.
import { noteIntroFillMiss, noteIntroFillHit } from '../engine/sceneIntroRefusals';

const allLocations = locationsData as Location[];

/**
 * How the Arbiter addresses the player in a line it is about to speak — their
 * first name, or the caller's generic fallback.
 *
 * ⚠ OTA-1404 — MOVED HERE FROM gameStore. This is the Arbiter choosing what to
 * call someone, which is this file's whole subject; it only ever sat in the
 * store because that is where its first caller happened to be. It moved because
 * the combat resolver's low-HP warning needs it, and a leaf may never import a
 * VALUE from the store. Nothing outside gameStore imported it, so the move costs
 * one import line and no re-export.
 */
export function arbiterAddress(player: PlayerCharacter | null | undefined, fallback: string): string {
  if (!player?.name) return fallback;
  // OTA-635 — name the player MORE often (was 0.34). Player ask: "I want to hear
  // the name of the character more often — that brings them in." 0.6 leans into the
  // name for immersion without it reading robotic (still ~40% the generic address).
  if (Math.random() < 0.6) {
    // OTA-1441 — the ONE spoken-name rule (engine/npcMemory.spokenName): a
    // short name is said whole ("Great Scott"), a long one is clipped to its
    // first word ("Verbal of the Tartarian Giants" → "Verbal"). It was a bare
    // first-token split here, which greeted the owner's tester as "Great".
    return spokenName(player.name) ?? fallback;
  }
  return fallback;
}

/** ⚠⚠ THE GENERATION EPOCH, AND WHY IT LIVES HERE RATHER THAN WITH ITS OTHER
 *  WRITER. Monotonic counter, incremented every time a new Arbiter generation
 *  begins. Each call captures the epoch at start; if it has moved by the time
 *  the stream completes — because a fresh narration started, or because the
 *  player's next action called `cancelGeneration` — the result is discarded.
 *
 *  `cancelGeneration` is a STORE ACTION and stays one. It has been carrying a
 *  note since slice 2 saying it would travel with the narration slice; slice 7
 *  turned out to be a leaf rather than a slice, and a leaf cannot hold a store
 *  action. So the shared `let` moves down instead and both writers reach it
 *  through these two functions — the same answer the memory latches got in
 *  slice 5. Keep this surface at two. */
export function bumpArbiterGeneration(): void {
  arbiterGenerationEpoch += 1;
}

/** ⚠⚠ OTA-1405 — BURNED ONCE, BACK OFF. When was the last LIVE narration thrown
 *  away because the player had already moved on?
 *
 *  The sprint gate needs three actions inside four seconds before it trips, so
 *  the FIRST generation of any burst always starts — and by the time the third
 *  action arrives that generation is sixteen seconds into a native call it
 *  cannot be pulled out of. OTA-1368's `shouldAbort` closes the door and stops
 *  the writing, but says so itself: it CANNOT interrupt a prompt read already in
 *  flight. So the first one of every burst is paid for in full.
 *
 *  This is the cheap complement: the discard we just filed is itself evidence
 *  that the player is moving faster than the model. One wasted generation per
 *  burst is a fair price for a gate that stays quiet for readers; nine of ten,
 *  which is what the owner's log measured, is not.
 *
 *  ⚠ LIVE ONLY, and the asymmetry is the same one OTA-1258 established: a fill
 *  that arrives late still goes to the bank and is re-vetted when it is spent,
 *  so late text is free text later. Only a line with a reader waiting on it can
 *  be wasted by being late. */
const NARRATION_BURN_BACKOFF_MS = 4_000;
let lastLiveNarrationBurnedAt = 0;
export function _resetNarrationBurnForTest(): void { lastLiveNarrationBurnedAt = 0; }
export function arbiterGeneration(): number {
  return arbiterGenerationEpoch;
}

// Async Arbiter narration helper — bridges the game engine to the Qwen LLM.
//
// Call this from any site that would otherwise do
//   `get().appendLog('arbiter', someTemplateString)`
// to give Qwen a chance to write the line instead. Fire-and-forget — the
// action that called it returns immediately. Streaming tokens populate
// `partialArbiterText` for tail rendering; the final assembled text gets
// appended to the log on completion.
//
// Falls back to the template string in three cases:
//   1. Qwen isn't ready yet (cold boot, model still downloading, or boot
//      skipped).
//   2. Another generation is already in flight — we don't queue, because the
//      template fallback is already perfectly atmospheric.
//   3. Generation throws for any reason (model corrupt, OOM, etc).
//
// The `templateFallback` param is the same string the call site would have
// used pre-Qwen, computed eagerly so the failure path is instantaneous.
// Monotonic counter — incremented every time a new Arbiter generation begins.
// Each call captures the epoch at start; if the epoch has moved by the time
// the stream completes (because cancelGeneration was called, or a fresh
// narration started), the result is discarded. Mirrors the AudioManager
// fade-epoch pattern.
let arbiterGenerationEpoch = 0;

// arb161 — Qwen generation cooldown. The OTA-578 native-ML lock (which stopped
// the Qwen↔Kokoro contention crash — confirmed: a full session ran crash-free)
// serializes the two, so while Qwen generates the voice WAITS. With the OTA-577
// intent widening Qwen fired on nearly every investigate, holding the lock
// back-to-back and STARVING the voice (it barely spoke). This cooldown spaces
// generations out so the lock is free for the voice the vast majority of the
// time — Qwen narration stays an occasional AI flourish, the voice reads every
// line (Qwen or template) freely, and the two never run at once. Tunable.
// arb162 — Qwen fires at most once per this window (its "AC roll" spacing). With
// canned flavor lines now mostly SILENT (arb162), the shared native-ML lock has
// headroom, so Qwen can run a bit more often and — since Qwen lines ARE voiced —
// the player hears mostly fresh AI lines with the canned ones read sparingly.
// Tight balance: short enough to feel present, long enough not to starve voice.
const QWEN_GEN_COOLDOWN_MS = 10000;
let lastQwenGenStartMs = 0;
// arb163 — ambient companion lines fire at most this often. They're the
// reflective, unprompted asides (not tied to any action), so they can run to
// completion in the background and speak whenever ready. Spaced wide so the
// shared voice lock is mostly free for the instant canned reactions.
// OTA-634 — widened 45s → 90s. On a slow / thermally-throttled phone each musing
// is a 20-55s LLM call on the shared native-ML lock; halving how often they fire
// frees that lock for interactive narration + voice. (Still muzzled in combat.)
const AMBIENT_GEN_COOLDOWN_MS = 90000;
let lastAmbientGenStartMs = 0;

// OTA-1051 — ARBITER COOLDOWN DISCIPLINE. Owner: interjections that don't
// follow from the last action.
//
// ROOT CAUSE. Every guard on the ambient path runs at generation START — no
// combat, not in the tutorial, cooldown expired. None of them run at EMIT, and
// on device a musing takes 14-20s to generate (owner's 4.28.79 log:
// `arbiter: ambient ✓ 14080ms`). In fourteen seconds of tapping the player has
// crossed a room, opened a fight, or looted three things. The line was composed
// for a moment that no longer exists and is delivered into whatever is on
// screen now.
//
// This was DELIBERATE, and the comment above says so — ambient asides "can run
// to completion in the background and speak whenever ready". The reactive path
// (narrateViaArbiter) already has the discipline this one lacks: it stamps
// arbiterGenerationEpoch at start and discards its own result if the epoch
// moved. Ambient was exempted from it.
//
// The fix is NOT the epoch. Every reactive generation bumps that counter, so
// reusing it here would discard nearly every ambient line and silently kill a
// feature that only just started working (OTA-1031). What makes an ambient
// musing read wrong is not that time passed — it is unprompted by design — but
// that the SITUATION changed underneath it. So stamp the situation, and check
// the stamp before speaking.

export interface AmbientStamp {
  locationId: string | undefined;
  roomId: string | null | undefined;
  microId: string | null | undefined;
  inCombat: boolean;
  logLen: number;
}

/** Player-visible lines that may pass before a musing stops following from
 *  anything the player did. Generous — ambient is meant to be unprompted; this
 *  catches "a great deal has happened since", not "one more turn". */
const AMBIENT_STALE_LINES = 12;

export function takeAmbientStamp(get: () => GameStore): AmbientStamp {
  const scene = get().currentScene;
  return {
    locationId: scene?.location?.id,
    roomId: get().player?.hubRoomId,
    microId: scene?.microMicroId,
    inCombat: (scene?.enemies?.length ?? 0) > 0,
    // OTA-1055 — a MONOTONIC counter, not the log length. This read
    // gameLog.length, and gameLog is `.slice(-500)` on every append — so past
    // ~500 entries (about ten minutes of play) the length is pinned and the
    // difference is permanently zero. `log-moved-on` was dead in every real
    // session, and it is the ONLY one of the five checks that catches the
    // OTA's own stated case: a player standing still who "looted three things"
    // while the musing generated. Filtering channels did not fix that; at the
    // cap, lines added ≈ lines pushed off the front either way.
    logLen: visibleLogTotal(),
  };
}

/** null when the line still belongs to the moment; otherwise WHY it doesn't.
 *  The reason string rides the existing `arbiter: ambient …` debug marker so a
 *  pasted log shows the drop and its cause, the same way OTA-1034 surfaced the
 *  ∅ reasons. */
/** OTA-1055 — test seams for the staleness pair.
 *
 *  A review found that the OTA's own headline fix — pointing the stamp at the
 *  monotonic counter instead of the capped log — was guarded ONLY by a grep for
 *  its own source line. The two behavioural tests exercised the counter in
 *  isolation and never checked that takeAmbientStamp CONSUMES it, so pointing
 *  it back at gameLog.length re-killed `log-moved-on` with the suite green. */
// ⚠⚠ FOUR TEST SEAMS STAYED IN gameStore, AND THE REASON IS THE RULE ITSELF.
// `_takeAmbientStampForTest`, `_ambientStaleReasonForTest`,
// `_takeBankedMusingForTest` and `_takeBankedSceneIntroForTest` each did
// `useGameStore.getState()` — a VALUE read of the store, which is exactly the
// import this file may never make. Their job is "call the real thing with the
// LIVE store", so the store is where they belong; the real things are exported
// from here and gameStore wraps them in one line each. No test call site
// changed, and the dependency stays one-way.
export const _AMBIENT_STALE_LINES = AMBIENT_STALE_LINES;

/** ⚠ OTA-1122 — THE BANK. Step two of the headroom track.
 *
 *  The economics of an ambient musing were upside down. It is generated ON
 *  DEMAND, takes 8–16 seconds, and is then checked against the world it was
 *  composed for — and the OTA-1107 telemetry says two of three came back
 *  unusable, ~16.6 seconds of model time for lines nobody read. The single
 *  biggest killer is `stale`: the player kept playing while the model wrote,
 *  so by the time the line existed it no longer belonged to the moment.
 *
 *  That is a race we were never going to win by generating faster. So stop
 *  racing. A musing is UNPROMPTED by construction — AMBIENT_INSTRUCTION
 *  forbids it from reacting to the last action — which is exactly the property
 *  that makes it pre-generatable. Write them when the world is standing still,
 *  spend them when it isn't.
 *
 *  ⚠ AND A STALE LINE IS NOT A WASTED LINE. `stale` almost always means
 *  "you walked somewhere else" — the line is still perfectly good FOR THE PLACE
 *  IT WAS WRITTEN ABOUT. Banking it against its own stamp means walking back
 *  into that room spends it instantly instead of paying for it twice. The
 *  discard that used to be the headline waste becomes the stock.
 *
 *  Validity is `ambientStaleReason` unchanged — the same five checks the live
 *  path already ran, just asked at SPEND time instead of at finish time. That
 *  is the whole trick: a banked line cannot go stale between being wanted and
 *  being spoken, because there is no gap. */
interface BankedMusing {
  text: string;
  stamp: AmbientStamp;
  at: number;
}
/** Session-scoped, like the telemetry. Deliberately NOT persisted: a musing is
 *  worth seconds, not a save-file migration, and a cold start has no lock
 *  contention to relieve anyway. */
const musingBank: BankedMusing[] = [];
/** Small on purpose. This is a latency buffer, not a content store — every
 *  entry is a generation someone's battery paid for. */
const MUSING_BANK_CAP = 3;

/** Tests only — the bank is module state, and the deposit/withdraw pair is the
 *  behaviour worth exercising directly rather than through a mocked model. */
export function _resetMusingBank(): void { musingBank.length = 0; }
export function _musingBankSize(): number { return musingBank.length; }
export function _bankMusingForTest(text: string, stamp: AmbientStamp): void {
  bankMusing(text, stamp);
}
export const _MUSING_BANK_CAP = MUSING_BANK_CAP;

/** ⚠ OTA-1129 — THE SCENE-INTRO BANK. The owner's call, taken with the numbers
 *  in front of them: OTA-1128 measured `scene_intro` at 19.3 s = 3.7 wait +
 *  11.0 read + 3.5 write, and showed that even a ZERO-token prompt leaves ~8 s.
 *  Trimming could not fix it. The only fix is to stop the player waiting.
 *
 *  So the same trick as the musing bank, aimed at a different beat. An intro is
 *  pre-generatable for exactly the reason a musing is: it is about a PLACE, and
 *  the place is knowable before the player gets there. `stepInDirection` is a
 *  pure grid lookup, so the destinations of all four cardinal steps can be read
 *  for free — and most steps land on unnamed ground, where the player stays in
 *  the location they are already in, which is why the current location is a
 *  candidate too and the most frequently spent one.
 *
 *  ⚠ KEYED BY LOCATION, NOT BY STAMP, and that difference is deliberate. A
 *  musing is about the player and goes stale when they move; an intro is about
 *  a room and is only ever spent in that room, so there is nothing to go stale.
 *  What it CAN do is repeat, which is why entries are one-shot and the
 *  near-duplicate check runs again at spend time. */
interface BankedIntro { text: string; at: number; }
/** Session-scoped like the musing bank, and for the same reason: a pre-written
 *  line is worth seconds, not a save migration. */
export const sceneIntroBank = new Map<string, BankedIntro[]>();
/** Two per location — enough that re-entering a room twice does not fall back
 *  to a cold generation, few enough that the battery cost stays proportionate. */
export const INTRO_BANK_PER_LOC = 2;
/** …and a ceiling across all locations, so a player criss-crossing a junction
 *  cannot accumulate an unbounded set of rooms' worth of prose. */
const INTRO_BANK_TOTAL = 6;

/** Tests only — the bank is module state and the deposit/withdraw pair is the
 *  behaviour worth exercising directly. */
export function _resetSceneIntroBank(): void { sceneIntroBank.clear(); }
export function _sceneIntroBankSize(): number {
  let n = 0;
  for (const v of sceneIntroBank.values()) n += v.length;
  return n;
}
export function _bankSceneIntroForTest(locId: string, text: string): void {
  bankSceneIntro(locId, text);
}
/** ⚠ OTA-1258 (N1) — exported so the suite exercises the REAL key builder rather
 *  than re-deriving the `loc#room` format, which is exactly the kind of second
 *  copy that drifts. */
export function _introBankKeyForTest(locId: string, hubRoomId: string | null): string {
  return introBankKey(locId, hubRoomId);
}
export const _INTRO_BANK_PER_LOC = INTRO_BANK_PER_LOC;
export const _INTRO_BANK_TOTAL = INTRO_BANK_TOTAL;

/** ⚠⚠ OTA-1258 (N1) — THE BANK KEY CARRIES THE ROOM, NOT JUST THE TILE.
 *
 *  Every room inside an outpost shares one location id — the owner's log shows
 *  the Atrium, the Court, the Arsenal and the Workshop all reporting
 *  `loc=monarch_waystation`. Keyed by location alone, a line written while the
 *  player stood in one room was SPENT on arrival in another, which is how
 *  `"You climb down the arch, feeling the weight of the city's collapse before
 *  you"` came out of the Arbiter's mouth at the Court of Standards — four rooms
 *  and forty seconds after the climb, which happened in the Atrium.
 *
 *  ⚠ THE PREFETCH WRITES FOR TILES, so hub rooms simply have no bank and fall
 *  through to the live path. That is the honest outcome: **we never wrote a line
 *  about the Court, so we should not speak one there.** Losing instant arrival
 *  inside outposts is the correct price for not describing the wrong room. */
export function introBankKey(locId: string, hubRoomId: string | null | undefined): string {
  return hubRoomId ? `${locId}#${hubRoomId}` : locId;
}

function bankSceneIntro(locId: string, text: string): void {
  if (!locId || !text) return;
  const rows = sceneIntroBank.get(locId) ?? [];
  if (rows.some((r) => r.text === text)) return;
  if (rows.length >= INTRO_BANK_PER_LOC) rows.shift();
  rows.push({ text, at: Date.now() });
  sceneIntroBank.set(locId, rows);
  // ⚠ OTA-1130 — AND WRITE THE AUDIO WHILE WE ARE HERE. OTA-1129 made the text
  // free and, in doing so, made the read-then-hear gap MORE visible: the words
  // became instant while the voice still had to be synthesised on arrival. The
  // owner named the symptom exactly — "you read it then hear it 10 seconds
  // later" — and a banked line is the one case where both halves can be ready
  // at once. Fire-and-forget at homework priority: if it never finishes, the
  // line is still spoken the ordinary way and nothing is lost but the head start.
  //
  // Lazily required, like every other voice touch in this file: the TTS module
  // pulls in native audio, and importing it at module scope would drag that
  // into every consumer of the store — including the test suites that never
  // speak a word.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const piper = require('../voice/PiperTTSManager') as typeof import('../voice/PiperTTSManager');
    // ⚠ OTA-1139 (audit) — presynthesize what will actually be SPOKEN. The live
    // path runs every arbiter line through stripArbiterFrame before Kokoro sees
    // it (TTSController), but the bank was pre-synthesizing the RAW text — so
    // for any intro carrying quoted dialogue, the cache key could never match
    // the chunks speak() looks up: the homework audio was computed, paid for,
    // and unreachable. Quote-free prose passes through the strip unchanged, so
    // this is a no-op for the common case and the fix for the rest.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { stripArbiterFrame: safStrip } = require('../voice/arbiterFrame') as typeof import('../voice/arbiterFrame');
    void piper.presynthesize(safStrip(text)).catch(() => { /* a miss costs one normal synth */ });
  } catch { /* voice unavailable (tests, or TTS off) — the text bank still works */ }
  // Total ceiling — evict from the location holding the OLDEST entry, which is
  // the one the player is least likely to walk back into.
  while (_sceneIntroBankSize() > INTRO_BANK_TOTAL) {
    let oldestLoc: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of sceneIntroBank) {
      const head = v[0];
      if (head && head.at < oldestAt) { oldestAt = head.at; oldestLoc = k; }
    }
    if (oldestLoc === null) break;
    const victim = sceneIntroBank.get(oldestLoc)!;
    victim.shift();
    if (victim.length === 0) sceneIntroBank.delete(oldestLoc);
  }
}

/** Spend a pre-written intro for this location, or null. One-shot, so the same
 *  sentence never greets the player twice, and the near-duplicate check runs
 *  again here because a banked line may have sat through a dozen others since
 *  it was written. */
export function takeBankedSceneIntro(get: () => GameStore, locId: string): string | null {
  const rows = sceneIntroBank.get(locId);
  if (!rows || rows.length === 0) return null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (generatedLineRepeatsRecent(get, r.text)) continue;
    rows.splice(i, 1);
    if (rows.length === 0) sceneIntroBank.delete(locId);
    return r.text;
  }
  return null;
}

/** ⚠ OTA-1129 — WHERE THE PLAYER CAN BE ONE STEP FROM NOW. The current location
 *  comes FIRST, and not as a formality: a cardinal step onto unnamed ground
 *  rebuilds the scene right where the player stands, and that is the common
 *  case by a wide margin — most tiles carry no named location at all. Then any
 *  named location sitting on one of the four adjacent cells.
 *
 *  Reads only. It goes through `playerGridCell` (the one source of truth for
 *  where the player is, legacy saves included) and `canonicalLocationAtCell`
 *  (a plain index lookup), so nothing is built, rolled, or mutated to find out
 *  where the player might go. */
export function introPrefetchCandidates(get: () => GameStore): Location[] {
  const st = get();
  const player = st.player;
  const scene = st.currentScene;
  if (!player || !scene) return [];
  const out: Location[] = [scene.location];
  const here = playerGridCell(player);
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const cell = clampGridCell(here.x + dx, here.y + dy);
    const named = canonicalLocationAtCell(cell.x, cell.y);
    if (!named) continue;
    if (out.some((l) => l.id === named.locationId)) continue;
    try { out.push(getLocationById(named.locationId)); } catch { /* unknown id — skip */ }
  }
  return out;
}

function bankMusing(text: string, stamp: AmbientStamp): void {
  if (!text) return;
  if (musingBank.some((m) => m.text === text)) return;
  // Oldest out when full — a musing written six rooms ago is the least likely
  // to match anything the player is about to do.
  if (musingBank.length >= MUSING_BANK_CAP) musingBank.shift();
  musingBank.push({ text, stamp, at: Date.now() });
}

/** Spend the first banked musing that still belongs to this moment, or null.
 *  Re-runs BOTH gates the live path uses: staleness against the entry's own
 *  stamp, and the near-duplicate check against what the Arbiter has said
 *  recently — the second matters more here, because a banked line may have sat
 *  through a dozen other lines since it was written. */
export function takeBankedMusing(get: () => GameStore): string | null {
  for (let i = 0; i < musingBank.length; i++) {
    const m = musingBank[i]!;
    if (ambientStaleReason(get, m.stamp) !== null) continue;
    if (generatedLineRepeatsRecent(get, m.text)) continue;
    musingBank.splice(i, 1);
    return m.text;
  }
  return null;
}

export function ambientStaleReason(get: () => GameStore, at: AmbientStamp): string | null {
  const now = takeAmbientStamp(get);
  // A fight is the loudest possible change of subject. The start-of-generation
  // guard already refuses to BEGIN in combat; this refuses to finish into one.
  if (now.inCombat && !at.inCombat) return 'combat-started';
  if (now.locationId !== at.locationId) return 'moved-location';
  if (now.roomId !== at.roomId) return 'moved-room';
  if (now.microId !== at.microId) return 'moved-scene';
  if (now.logLen - at.logLen > AMBIENT_STALE_LINES) return 'log-moved-on';
  return null;
}

// Trim Qwen output back to the last sentence-terminating punctuation so we
// don't display fragments like "...echoing in the". Looks for the final
// ., !, ?, ", or — followed (optionally) by trailing space/quote and keeps
// everything up to and including that character. Falls back to the raw
// text if nothing terminal is present (rare — would only happen on a
// single-fragment generation that never landed a punctuation mark).
// OTA-663 — cached allow-list of every canon entity name the Qwen narrator may
// legitimately say: locations, factions (+ subtitles), races, and lore-concept
// titles + keywords. Built once from static world data; the per-call set adds the
// live player name + current scene entities. Feeds the entityGuard so an INVENTED
// multi-word place/faction name gets dropped from the model's prose (which then
// falls back to the authored template).
let _narrationAllowStatic: Set<string> | null = null;
function narrationAllowStatic(): Set<string> {
  if (_narrationAllowStatic) return _narrationAllowStatic;
  const names: string[] = [];
  for (const l of allLocations) if (l?.name) names.push(l.name);
  try {
    const fjson = require('../data/factions/factions.json') as { factions?: Array<{ name?: string; subtitle?: string }> } | Array<{ name?: string; subtitle?: string }>;
    const farr = Array.isArray(fjson) ? fjson : (fjson.factions ?? []);
    for (const f of farr) { if (f.name) names.push(f.name); if (f.subtitle) names.push(f.subtitle); }
  } catch { /* factions optional */ }
  try {
    const races = require('../data/races/races.json') as Array<{ name?: string }>;
    for (const r of races) if (r.name) names.push(r.name);
  } catch { /* races optional */ }
  try {
    const conceptsData = require('../data/lore/concepts.json') as { concepts?: Array<{ title?: string; keywords?: string[] }> };
    for (const c of (conceptsData.concepts ?? [])) {
      if (c.title) names.push(c.title);
      for (const k of (c.keywords ?? [])) names.push(k);
    }
  } catch { /* concepts optional */ }
  // ⚠ OTA-1155 — THE WORLD LADDER NAMES PLACES TOO, and leaving it out meant the
  // narrator could not say the name of the room it was standing in.
  //
  // `allLocations` is locations.json only — 36 entries. Biomes, districts and
  // sub-rooms live in worldLadder.json, and those are the names the context
  // injector actually hands the model. Device log, three of eight ambient
  // generations killed by `off-canon-entity`, every one of them real content:
  //   21:00:50  "…the journey back to Etheric Engine Chamber…"   (a sub-room)
  //   00:29:30  "…the ancient halls of Etheric Engine Chamber…"  (same room)
  //   03:24:36  "You've traversed the Silt Wastes…"              (a top biome)
  // The player was in Etheric Engine Chamber at the time — look-around said so.
  // We told the model where it was, then threw away every sentence that repeated
  // it back. That is a large share of the long-running "ambient is always empty"
  // complaint (OTA-1031/1057/1147), and it cost 6-11s of on-device model time per
  // discarded line. Built once and cached with the rest of this set.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MACRO_LOCATIONS } = require('../engine/worldLadder') as typeof import('../engine/worldLadder');
    for (const macro of MACRO_LOCATIONS) {
      if (macro?.name) names.push(macro.name);
      for (const micro of (macro.microLocations ?? [])) {
        if (micro?.name) names.push(micro.name);
        for (const mm of (micro.microMicroLocations ?? [])) if (mm?.name) names.push(mm.name);
      }
    }
  } catch { /* ladder optional */ }
  names.push('Tartaria', 'Aether', 'Aetheric', 'Aetherstone', 'the Arbiter', 'Arbiter');
  _narrationAllowStatic = buildEntityAllowList(names);
  return _narrationAllowStatic;
}
function narrationEntityAllow(get: () => GameStore): ReadonlySet<string> {
  const base = narrationAllowStatic();
  const p = get().player;
  const scene = get().currentScene;
  const dyn: string[] = [];
  if (p?.name) dyn.push(p.name);
  if (scene?.location?.name) dyn.push(scene.location.name);
  // ⚠ OTA-1155 — AND THE SUB-ROOM, not just its parent Location. `location.name`
  // was "Ostragar" while the player stood in "Etheric Engine Chamber" — the name
  // the context injector hands the model, and the name look-around prints. We
  // told it where it was and then binned every sentence that said so.
  if (scene?.microMicroId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { findMicroMicroAnywhere } = require('../engine/worldLadder') as typeof import('../engine/worldLadder');
      const room = findMicroMicroAnywhere(scene.microMicroId);
      if (room?.microMicro?.name) dyn.push(room.microMicro.name);
    } catch { /* ladder optional */ }
  }
  for (const e of (scene?.enemies ?? [])) if (e?.name) dyn.push(e.name);
  if (scene?.vendor?.name) dyn.push(scene.vendor.name);
  if (dyn.length === 0) return base;
  const set = new Set(base);
  for (const n of dyn) { const nn = normalizeEntity(n); if (nn.length >= 2) set.add(nn); }
  return set;
}

// Exported for the OTA-1543 regression suite (a capped run-on must yield '').
export function trimToLastSentence(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  // Iterate backwards looking for terminal punctuation followed by either
  // end-of-string or a space + capital letter (i.e. an actual sentence
  // boundary, not an abbreviation period).
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i]!;
    if (c === '.' || c === '!' || c === '?') {
      // Allow a closing quote to immediately follow.
      const tail = s[i + 1];
      if (tail === undefined || tail === ' ' || tail === '\n' || tail === '"' || tail === "'") {
        return s.slice(0, i + 1).trim();
      }
    }
  }
  // ⚠⚠⚠ OTA-1543 — NO COMPLETE SENTENCE MEANS NOTHING TO SAY. This used to
  // return the raw text, and the owner's log shows what that prints: a
  // generation that hit the token cap mid-run-on ("…each one a testament to
  // the rich tapestry of") went to the feed BEHEADED, because a single
  // sentence with no terminal punctuation sailed past the loop above
  // untouched. The whole point of this function is that the player never
  // sees a partial ending; the fallback was the function disagreeing with
  // its own contract. Empty is honest: the live path falls back to its
  // authored template, and ambient (which has no template on purpose)
  // discards as ∅ — a silence, never a fragment.
  return '';
}

/** ⚠⚠ OTA-1543 — THE REGISTER GATE, built from MEASURED slips only. The owner
 *  has now caught the 0.5B model drifting into stock fantasy-filler three
 *  times: "You find yourself at the bazaar", and tonight "You had traversed
 *  the borders of the ancient lands, navigating through the labyrinthine
 *  streets of the bustling markets, each one a testament to the rich tapestry
 *  of". Tartaria is a drowned mud-world; none of that register exists here,
 *  and the off-canon entity guard cannot catch it because nothing in it is a
 *  NAMED place. This is deliberately a small list of the exact clichés that
 *  have appeared — the OTA-1124 note's warning stands: policing generic
 *  scenery wholesale needs a content system, and guessing at one is how
 *  OTA-1031 ate the feature. Grow it one measured slip at a time. */
const STOCK_LLM_FILLER: readonly RegExp[] = [
  /\brich tapestry\b/i,
  /\ba testament to\b/i,
  /\blabyrinthine\b/i,
  /\bbustling (?:market|street|bazaar|city|town)/i,
  /\byou find yourself\b/i,
  // Past-perfect travelogue opener — ambient is a present-tense aside about
  // the PERSON; "You had traversed/wandered/journeyed…" is the model
  // recapping a road trip that never happened.
  /^\s*you had \w+ed\b/i,
];
// Exported for the OTA-1543 regression suite.
export function sentenceIsStockLlmFiller(sentence: string): boolean {
  return STOCK_LLM_FILLER.some((p) => p.test(sentence));
}

/**
 * Hard-cap a generated paragraph to the first `maxSentences` sentences.
 * The peaceful prompt asks for ~2 sentences and combat asks for 1, but
 * Qwen 0.5B routinely produces 3–4 when it gets going. The post-generation
 * trim already lops trailing fragments — this enforces the count.
 *
 * Playtest log triggered this: a 4-sentence hallucination naming
 * "Aetherstone Deep" / "Grand Hall" / "Ash Storm" — none of which
 * matched the actual scene. Capping won't stop hallucination on its own,
 * but it shortens the surface area the LLM can fill with invention.
 */
function clampSentences(raw: string, maxSentences: number): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '.' || c === '!' || c === '?') {
      // Skip ellipses ("..." counts as one boundary, not three).
      while (i + 1 < s.length && (s[i + 1] === '.' || s[i + 1] === '!' || s[i + 1] === '?')) {
        i++;
      }
      count++;
      if (count >= maxSentences) {
        // Include any immediately following closing quote.
        const next = s[i + 1];
        const cut = next === '"' || next === "'" ? i + 2 : i + 1;
        return s.slice(0, cut).trim();
      }
    }
  }
  return s;
}

/** ⚠ OTA-1131 — THE ARBITER STOPS BEING A CHATTY KATHY.
 *
 *  Straight from the device log. Ten seconds, one tile, five `investigate`
 *  taps, five unrelated lore lines:
 *
 *    00:14:43  "You saw the traveler … That memory will rot if you leave it."
 *    00:14:45  "Black, polished, magnetic. They were aimed at something…"
 *    00:14:47  "The observatory beneath the Pillars charted skies that…"
 *    00:14:51  "Walk between two Pillars and your compass forgets you…"
 *    00:14:53  "Birds will not perch here. Birds are wise."
 *
 *  Every one is `reason=intent-not-allowed:investigate` — the TEMPLATE path,
 *  which fires a flavor line unconditionally on every call. Owner:
 *
 *    *"if he has multiple lines and they don't have a gap of time in between
 *     and they are unrelated topics then he just sounds like he is rambling. I
 *     don't want the arbiter to be a chatty Kathy … forcing him to repeatedly
 *     say multiple things in one tile comes across as too much."*
 *
 *  ⚠ THE FIX IS A BUDGET, NOT A FILTER, and the distinction matters. Each of
 *  those five lines is fine on its own — the problem is only that they came
 *  together. Nothing here judges a line's quality; it rations HOW OFTEN the
 *  Arbiter volunteers something unasked.
 *
 *  Two limits, because the owner named two different things:
 *   · ONE PER TILE — "multiple things in one tile comes across as too much".
 *     The arrival beat is normally the one that spends it, which is right:
 *     that is the line with something to say about where you now are.
 *   · A SHARED CLOCK — "they don't have a gap of time in between". Crossing
 *     into a new tile resets the per-tile count but NOT the clock, so
 *     sprinting through four tiles still cannot produce four asides.
 *
 *  ⚠ WHAT IS DELIBERATELY *NOT* RATIONED. The owner drew the line himself:
 *  *"lore flavor lines are good advice on how to play. like what weapon to
 *  choose or he notices that they're resistant to something is good."* Those
 *  are ANSWERS to something the player did — combat cues, resist callouts,
 *  refusals, mission beats — and they do not come through here at all. This
 *  budget covers only the unsolicited ambience. */
let lastArbiterFlavorAt = 0;
let arbiterFlavorTile = '';
let arbiterFlavorThisTile = 0;
/** Gap between UNSOLICITED Arbiter asides. Wide on purpose: at 25s a player
 *  thumbing through a tile's nouns gets one remark, not five, and a player who
 *  lingers still hears from their companion. */
const ARBITER_FLAVOR_GAP_MS = 25_000;
const ARBITER_FLAVOR_PER_TILE = 1;

/** ⚠ THE CLOCK IS SHARED BY EVERY ARBITER LINE, not just the budgeted ones.
 *  The owner's complaint was about GAPS — "they don't have a gap of time in
 *  between" — and a gap does not care which code path produced the neighbours.
 *  In the same ten seconds of that log an ambient musing landed BETWEEN the
 *  investigate asides; had only the asides been rationed, the Arbiter would
 *  still have spoken twice in a breath. So a generated line stamps the clock
 *  too, and the next unsolicited aside waits behind it. */
function noteArbiterSpoke(): void {
  lastArbiterFlavorAt = Date.now();
}
/** True when enough silence has passed for another unsolicited line. Read-only,
 *  for the paths that have their own reason to speak and need the SPACING but
 *  not the per-tile cap. */
function arbiterHasBeenQuiet(): boolean {
  return Date.now() - lastArbiterFlavorAt >= ARBITER_FLAVOR_GAP_MS;
}

/** Tests only — module state. */
export function _resetArbiterFlavorBudget(): void {
  lastArbiterFlavorAt = 0;
  arbiterFlavorTile = '';
  arbiterFlavorThisTile = 0;
}
export const _ARBITER_FLAVOR_GAP_MS = ARBITER_FLAVOR_GAP_MS;
export const _ARBITER_FLAVOR_PER_TILE = ARBITER_FLAVOR_PER_TILE;

/** The tile the player is standing on, for budget purposes. Location plus room,
 *  so moving between rooms of one location counts as moving — each is a place
 *  with its own things to remark on. */
function arbiterFlavorTileKey(get: () => GameStore): string {
  const sc = get().currentScene;
  return `${sc?.location?.id ?? '-'}|${sc?.microMicroId ?? '-'}`;
}

/** True when the Arbiter may volunteer an unasked line right now. Consumes the
 *  budget when it says yes — callers do not have to remember to. */
export function takeArbiterFlavorBudget(get: () => GameStore): boolean {
  const tile = arbiterFlavorTileKey(get);
  if (tile !== arbiterFlavorTile) {
    arbiterFlavorTile = tile;
    arbiterFlavorThisTile = 0;
  }
  if (arbiterFlavorThisTile >= ARBITER_FLAVOR_PER_TILE) return false;
  if (Date.now() - lastArbiterFlavorAt < ARBITER_FLAVOR_GAP_MS) return false;
  arbiterFlavorThisTile += 1;
  lastArbiterFlavorAt = Date.now();
  return true;
}

/** The ONE door every unsolicited Arbiter aside goes through. Having a single
 *  choke point is the whole reason the budget can be trusted: the five lines in
 *  the log came from one code path called five times, and a rule applied at
 *  three of the four call sites would have left the fifth to ramble. */
function speakArbiterFlavor(get: () => GameStore, text: string): void {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return;
  if (!takeArbiterFlavorBudget(get)) {
    get().appendLog('debug', 'arbiter: flavor held (budget — one per tile, 25s apart)');
    return;
  }
  // arb166 — the line always SHOWS; `silent` only thins how many are voiced.
  get().appendLog('arbiter', trimmed, chance(30) ? undefined : { silent: true });
}

export async function narrateViaArbiter(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  templateFallback: string,
  /**
   * Intent that triggered this narration. Used as the routing key for the
   * Qwen allowlist (see QWEN_ALLOWED_INTENTS). Intents outside the
   * allowlist take the template path even when Qwen is ready — this is
   * Phase 4 §1.1, "kill the randomizer." The synthetic 'scene_intro'
   * intent lets the scene-entry path through.
   */
  intent: string = 'scene_intro',
  /** ⚠ OTA-1129 — PRE-GENERATION, and it is the same trick OTA-1122 used for
   *  ambient. `bankOnly` writes the finished line into the scene-intro bank
   *  instead of speaking it; `forLocation` narrates a place the player is not
   *  standing in yet. Everything between — model readiness, prompt assembly,
   *  streaming, and the whole vetting chain — is shared, because a banked line
   *  that skipped the filters would be a second, quietly different narrator. */
  opts?: { bankOnly?: boolean; forLocation?: Location },
): Promise<void> {
  const trimmed = (templateFallback ?? '').trim();
  const scene = get().currentScene;
  // Phase 4 §1.2 — the Combat Muzzle. Any hostile entity in the scene
  // forces template-only narration regardless of Qwen readiness or the
  // configured intent. The model has been observed to hallucinate trap
  // sequences and tour-guide prose during combat; the deterministic
  // template path is faster AND safer here.
  const inCombat = !!scene && scene.enemies.length > 0;
  // Phase 4 §1.1 — Intent allowlist. Outside the small whitelist
  // (travel, diplomacy, scene_intro), the deterministic templates
  // carry the narration. Random Qwen chatter on attack / rest / dig /
  // equip etc. is gone.
  const intentAllowsQwen = QWEN_ALLOWED_INTENTS.has(intent);
  // arb161 — cooldown: don't grab the native-ML lock again until enough time has
  // passed, so the voice (which shares the lock) isn't starved by back-to-back
  // generations on every investigate.
  // ⚠ OTA-1129 — THE COOLDOWN IS A RATION ON THE *VOICE LOCK*, so background
  // fill is not subject to it. A homework generation already sits below voice
  // in the lock queue and is cut short the moment a real call arrives
  // (OTA-1123), which is a stronger guarantee than a timer. Applying the
  // cooldown here as well would mean the bank could only ever fill in the gaps
  // between the very generations it exists to eliminate.
  const cooldownActive = !opts?.bankOnly
    && (Date.now() - lastQwenGenStartMs) < QWEN_GEN_COOLDOWN_MS;
  // ⚠⚠ OTA-1358 — THE SPRINT GATE. A player landing 3+ actions in 4 seconds
  // will not read a 15-second generation — the fourth-freeze receipt showed 9
  // of 10 scene intros discarded and the native layer degrading under the
  // churn. While sprinting, nothing STARTS: live lines take the template path
  // and bank fills simply wait for a pause. Applies to bankOnly too, on
  // purpose — homework riding a 4-second lull mid-sprint is the exact
  // generation that gets thrown away.
  const sprinting = playerIsSprinting();
  // ⚠⚠ OTA-1405 — AND THE ONE THE SPRINT GATE STRUCTURALLY CANNOT CATCH. The
  // sprint gate needs three actions to trip, so the first generation of a burst
  // is always already running by then. This one is evidence-driven rather than
  // predictive: the LAST live line was thrown away unread, so the next one waits
  // for a pause instead of guessing. Fills are exempt — see the constant.
  const burnedRecently = !opts?.bankOnly
    && (Date.now() - lastLiveNarrationBurnedAt) < NARRATION_BURN_BACKOFF_MS;
  // ⚠⚠ OTA-1411 — AN OUTPOST ROOM NEVER GETS A LIVE SCENE INTRO, and the owner's
  // 4.31.5 log is unambiguous about why:
  //
  //   narration:scene_intro n9 avg9.5s max13.1s read8.6s/write0.2s
  //                         in748t→out4t ⏸8 ✂8/72.8s
  //
  //   ⚠ Native queue: 13 generations thrown away (92.2s)
  //
  // NINE started, EIGHT preempted and discarded, 72.8 seconds of the one native
  // lock spent on lines nobody read — and every one of them fired in an outpost
  // interior. That is a structural mismatch, not bad luck:
  //
  //   · Hub rooms have NO BANK. `introPrefetchCandidates` returns [] inside a
  //     hub (OTA-1258), so every room entry falls through to the LIVE path and
  //     pays a full ~9-12s prefill on an ~840-token prompt.
  //   · Hub rooms are where the player moves FASTEST. His corridor cadence was
  //     1.4 seconds a room. The slowest path in the game is wired to the
  //     quickest movement in the game.
  //   · And the room already has authored prose. Every outpost room prints a
  //     hand-written description ("Architect's Cell — The Pump Room. Old
  //     Aetheric pumps churn the silt-water out of the lower floors…") before
  //     the Arbiter says anything. The model was being asked to add an aside to
  //     a room that is already described, and losing 89% of them.
  //
  // ⚠ THE ONE THAT LANDED WAS WRONG ANYWAY. The single scene_intro that survived
  // in the previous session narrated the Unaligned Poacher — a man dead 51
  // seconds and a tile away (OTA-1409). So the measured value of this path in
  // two logs is: eight discards, one wrong line, seventy-plus seconds.
  //
  // ⚠ THE PLAYER STILL GETS AN ARBITER LINE. This routes to the template, which
  // is the authored `buildArbiterSceneIntro` output — the gate below appends it
  // exactly as it does for cooldown or sprinting. Nothing goes quiet; what stops
  // is paying twelve seconds for a sentence that gets thrown away.
  //
  // ⚠ SCENE INTROS ONLY. A travel or diplomacy narration inside an outpost is a
  // REACTION the player is waiting on, and those keep the model.
  const inOutpostRoom = intent === 'scene_intro' && !!get().player?.hubRoomId;
  if (!qwen.isReady() || get().isGenerating || inCombat || !intentAllowsQwen || cooldownActive || sprinting || burnedRecently || inOutpostRoom) {
    // OTA-1129 — a background fill has no line to fall back to and no player
    // waiting on it. It simply does not run this tick, silently, and the next
    // tick asks again.
    if (opts?.bankOnly) return;
    // arb134 — name WHY this turn took the template path, so a pasted log shows
    // unambiguously which Arbiter lines are AI-generated vs template (and why the
    // rest weren't). qwen-not-ready / busy / combat / intent-not-allowed:<intent> /
    // cooldown.
    const reason = !qwen.isReady() ? 'qwen-not-ready'
      : get().isGenerating ? 'busy'
      : inCombat ? 'combat'
      : !intentAllowsQwen ? `intent-not-allowed:${intent}`
      : cooldownActive ? 'cooldown'
      : sprinting ? 'sprinting' // OTA-1358 — the device log's proof the gate is working
      : burnedRecently ? 'burned-recently' // OTA-1405 — the last live line was discarded unread
      : 'outpost-room'; // OTA-1411 — authored prose already describes it; 8 of 9 were binned
    get().appendLog('debug', `arbiter: template (reason=${reason})`);
    // arb166 — CANNED flavor line: voiced ~30% of the time. (Was 60% — but once
    // arb164 tripled the pools the 30s repeat-guard stopped suppressing dupes,
    // so nearly every 60% roll actually spoke and Kokoro "wouldn't shut up", ~20
    // lines/min.) The line still appears on-screen every time; this only thins
    // how many are SPOKEN. `silent` → TTSController skips voicing it.
    speakArbiterFlavor(get, trimmed);
    return;
  }
  const state = get();
  const player = state.player;
  if (!player || !scene) {
    if (opts?.bankOnly) return;
    get().appendLog('debug', 'arbiter: template (reason=no-scene)');
    speakArbiterFlavor(get, trimmed);
    return;
  }
  // ⚠ OTA-1129 — NARRATING A PLACE THE PLAYER HAS NOT REACHED YET. The slice
  // carries the destination's STATIC facts only: its name, its type tags, its
  // authored description. Weather, hazards, enemies and the vendor are rolled
  // at arrival by beginScene and cannot be known now — so they are left out
  // rather than guessed, and the pre-written line simply does not mention
  // them. That is a real constraint on the writing, not a bug: an intro that
  // says nothing about the sky can never contradict the sky.
  const forLoc = opts?.forLocation ?? null;
  const sceneSlice: SceneSlice = forLoc
    ? { location: forLoc, weather: null, hazard: null, enemies: [], enemyHps: [], vendor: null }
    : {
      location: scene.location,
      weather: scene.weather,
      hazard: scene.hazard,
      enemies: scene.enemies,
      enemyHps: scene.enemyHps,
      vendor: scene.vendor
        ? { name: scene.vendor.name, affiliation: scene.vendor.faction ?? undefined }
        : null,
    };
  // World-ladder override — when beginScene picked a Micro-Micro for this
  // visit, fold it into the context so the Arbiter narrates at the room
  // tier instead of the flat Location tier.
  // OTA-1129 — never for a pre-generated destination: the room the ladder
  // would pick is chosen fresh on arrival, so borrowing the CURRENT room's
  // ladder would write about the wrong room entirely.
  const ladder = scene.microMicroId && !forLoc
    ? findMicroMicroAnywhere(scene.microMicroId)
    : null;
  const ctx = buildLlmContext({
    player,
    scene: sceneSlice,
    gameLog: state.gameLog,
    ladder,
    // ⚠⚠ OTA-1409 — the scene boundary, so "recent history" stops at the door.
    // ⚠ NOT passed when narrating a place the player has not reached (`forLoc`):
    // a pre-generated intro has no scene of its own to be bounded by, and the
    // history it would then see belongs to wherever they are actually standing.
    // Omitting the stamp there keeps the old unscoped behaviour rather than
    // filtering to an empty history — but the intro prompt does not lean on
    // history anyway, which is why this was safe to leave alone.
    sceneStartedAt: forLoc ? undefined : state.sceneStartedAt,
    // OTA-1688 — the deed ledger's line for the ground being narrated (never
    // for a pre-generated destination: its deeds belong to where the player is).
    deedsHere: forLoc ? null : deedsHereLine(state.worldMemory, player?.currentLocationId),
  });
  const messages = buildSystemPrompt(ctx);
  // ⚠ OTA-1129 — A BACKGROUND FILL DOES NOT OWN THE EPOCH. The epoch exists so
  // the player's next action CANCELS an in-flight reaction, because a stale
  // reaction is wrong. A pre-written intro is never stale in that sense — it is
  // about a place, not about a keystroke — so bumping the epoch here would do
  // two harmful things: cancel a live narration the player IS waiting on, and
  // then cancel itself the moment they act, throwing away the very work the
  // bank exists to keep. It reads the epoch it was born under and stops if that
  // changes, which is the weaker claim it is entitled to make.
  const myEpoch = opts?.bankOnly ? arbiterGenerationEpoch : ++arbiterGenerationEpoch;
  const t0 = Date.now(); // arb134 — Qwen generation latency for the debug marker
  // OTA-1129 — background fill does not arm the voice cooldown either; see the
  // note on `cooldownActive`. It DOES take `isGenerating`, because that is the
  // one-job-at-a-time flag and a fill is a job.
  if (!opts?.bankOnly) lastQwenGenStartMs = t0;
  // ⚠ AND NO STREAMING PREVIEW. `partialArbiterText` renders live under "The
  // Arbiter:". A fill is writing about a room the player is not standing in —
  // mirroring its tokens would show them a description of somewhere else,
  // which is worse than any latency this OTA saves.
  set(opts?.bankOnly ? { isGenerating: true } : { isGenerating: true, partialArbiterText: '' });
  try {
    // arb162 — Token budgets are kept TIGHT on purpose. Qwen and Kokoro share
    // one native-ML lock, and on the Tensor G5 kernel each token costs ~256ms,
    // so the old 90-token cap meant a single remark held the lock for ~23s —
    // during which Kokoro could not speak and the 2-line voice queue dropped
    // everything else (the player "only heard Kokoro twice"). A one-line
    // Arbiter aside does not need 90 tokens. Cap it so a generation lands in
    // ~6-8s: the lock frees fast, the line is punchy, and — since Qwen lines
    // are voiced — the player actually hears it before the action scrolls off.
    //   combat:   1 short sentence ≈ 20 words ≈ 28 tokens → cap 30
    //   peaceful: 1 short sentence ≈ 20 words ≈ 28 tokens → cap 34
    const maxTokens = ctx.in_combat ? 30 : 34;
    // OTA-1030 — the streaming tail is VETTED now. It used to mirror raw model
    // tokens straight to the screen, so when the model recited its own brief the
    // player read the prompt under "The Arbiter:" for the whole generation. The
    // post-generation filters below could only ever clean the FINAL line — by
    // then the raw text had already been on screen for seconds. Accumulate
    // locally and stop mirroring the moment the output turns into meta-text;
    // the tail falls back to an empty "thinking" frame.
    let streamed = '';
    let previewBlocked = false;
    const text = await qwen.stream(
      messages,
      (token: string) => {
        // Only update the buffer if we're still the active generation.
        if (myEpoch !== arbiterGenerationEpoch) return;
        streamed += token;
        // OTA-1129 — a fill accumulates but never mirrors. See above.
        if (opts?.bankOnly || previewBlocked) return;
        if (looksLikeInstructionEcho(streamed)) {
          previewBlocked = true;
          set({ partialArbiterText: '' });
          return;
        }
        set({ partialArbiterText: streamed });
      },
      {
        maxNewTokens: maxTokens,
        // OTA-1129 — the fill is labelled separately so the telemetry can price
        // it apart from the narration it is meant to replace, and it rides
        // OTA-1123's homework priority: below the voice, and cut short the
        // instant a real call is enqueued.
        job: opts?.bankOnly ? `narration:${intent}_fill` : `narration:${intent}`,
        homework: opts?.bankOnly === true,
        // ⚠⚠ OTA-1368 — DECLINE WORK THAT IS ALREADY DEAD. The epoch check
        // below has always discarded a superseded narration; until now it ran
        // AFTER the generation, so a line the player had already walked away
        // from still held the one native-ML lock for its full read+write. The
        // predicate is the same comparison, asked early enough to matter: at
        // the door (nothing starts) and per token (writing ends).
        //
        // ⚠ FILLS ARE EXEMPT, on purpose. OTA-1258 established that a preempted
        // fill KEEPS its text — it goes to the bank and is re-vetted at spend
        // time, so late text is still free text later. Aborting one would throw
        // away the only kind of output that survives being late.
        shouldAbort: opts?.bankOnly === true
          ? undefined
          : () => myEpoch !== arbiterGenerationEpoch,
      },
    );
    // ⚠⚠ OTA-1258 (N3) — A PREEMPTED FILL KEEPS ITS TEXT INSTEAD OF BINNING IT.
    // The runtime has ALWAYS returned the tokens that had already assembled
    // (`const text = (assembled || result.text || '')` in LlamaRuntime) — this
    // function then threw them away on the epoch check, before any of the
    // cleaning below had run. For a LIVE narration that is correct: the player
    // has moved on and the line must not be spoken. **For a FILL there is nothing
    // to speak** — it goes into the bank and is re-vetted again at spend time, so
    // late text is still free text later. That was the entire premise of the bank
    // (OTA-1129); the preempt path just never got the memo.
    const preemptedFill = opts?.bankOnly === true && myEpoch !== arbiterGenerationEpoch;
    if (myEpoch !== arbiterGenerationEpoch && !preemptedFill) {
      // ⚠ OTA-1405 — remember that this happened. See NARRATION_BURN_BACKOFF_MS:
      // the discard is the evidence, and the next live generation reads it.
      if (!opts?.bankOnly) lastLiveNarrationBurnedAt = Date.now();
      noteQwenDiscarded('cancelled:player-acted-again');
      return;
    }
    // Trim to the last complete sentence so we never display a partial
    // ending like "...each stroke echoing in the". Falls back to the raw
    // text only when nothing terminal-punctuated is present, then to the
    // template if that's empty.
    // OTA-488 — drop any foreign-language word the local model code-switched
    // into the English narration (playtester saw "huà" — romanized Chinese — in
    // the feed). Done FIRST so sentence-capping / trimming operate on the cleaned
    // English; if it empties the line, the `|| trimmed` fallback below restores
    // the template.
    const deforeigned = repairGluedNarration(stripForeignWords(text));
    // Cap sentences before trimming so we never emit the 4-sentence
    // hallucination paragraphs the playtest log caught.
    const capped = clampSentences(deforeigned, ctx.in_combat ? 1 : 2);
    // Anti-third-person filter. Qwen still occasionally writes "The
    // player paused..." despite the prompt. Drop those sentences and
    // fall back to the template if NOTHING usable survives, so the
    // arbiter feed never reads as a recap about someone else.
    // OTA-663 — off-canon entity guard: drop any sentence naming a multi-word
    // place/faction the model INVENTED; nothing survives → `|| trimmed` restores
    // the authored template, so the feed never logs a fake place.
    const narrationAllow = narrationEntityAllow(get);
    const survivors = capped
      .split(/(?<=[.!?])\s+/)
      .filter((s) => !/\b(the player|the adventurer|the explorer|the figure)\b/i.test(s))
      .filter((s) => !/^\s*they\s/i.test(s))
      // OTA-1030 — drop a sentence that is the brief coming back rather than a
      // line. Nothing survives → the `|| trimmed` fallback restores the template.
      .filter((s) => !looksLikeInstructionEcho(s))
      .filter((s) => !sentenceNamesOffCanonEntity(s, narrationAllow))
      // OTA-1543 — the register gate: measured stock-LLM clichés never print.
      .filter((s) => !sentenceIsStockLlmFiller(s))
      .join(' ')
      .trim();
    let finalText = trimToLastSentence(survivors) || trimmed;
    // OTA-609 — if the generated line just rewords something the Arbiter said
    // recently (long-journey travel musings repeating), fall back to the canned
    // template, which carries its own exact-match dedup. Skip when the model
    // already fell through to the template (finalText === trimmed).
    let repDup = false;
    if (finalText !== trimmed && generatedLineRepeatsRecent(get, finalText)) {
      finalText = trimmed;
      repDup = true;
    }
    // arb134 — mark the AI-generated line + its latency so a pasted log shows it
    // outright (a Qwen line lands hundreds-to-thousands of ms after its trigger;
    // a template lands in the same millisecond). `usedFallback` flags the rare
    // case where the cleaned model output was empty and the template carried it.
    const usedFallback = finalText === trimmed;
    // ⚠ OTA-1129 — THE ONLY LINE THAT DIFFERS. Everything above ran exactly as
    // it does for a live narration, which is the point: the bank stores VETTED
    // prose, not raw model output, so a spent line has already passed the
    // foreign-word strip, the sentence cap, the third-person filter, the echo
    // detector and the off-canon entity guard.
    if (opts?.bankOnly) {
      // A fill that fell through to the template banked nothing — the template
      // is already free and already available at arrival.
      // ⚠⚠ OTA-1258 (N1) — A BANKED LINE MUST NOT NARRATE AN ACTION. The bank is
      // the one channel where TIME PASSES between writing and speaking, so a
      // sentence about what the player is DOING is true only in the instant it was
      // generated. `"You climb down the arch…"` was written while the owner was on
      // the arch and spoken four rooms later. The ambient channel has filtered this
      // shape since it was built; the intro bank never did. **One checker, both
      // channels** — a second copy of the rule would drift from the first.
      const introOpener = finalText.split(/(?<=[.!?])\s+/)[0] ?? '';
      const narratesAction = isSecondPersonActionOpener(introOpener);
      // ⚠⚠ OTA-1258 (N3) — A PREEMPTED PARTIAL MUST END IN A WHOLE SENTENCE.
      // `trimToLastSentence` returns its input UNCHANGED when it finds no terminal
      // punctuation ("no terminal punctuation found — keep the raw text"), which is
      // right for a completed generation and wrong for one cut mid-word: banking
      // that would store `"…a single chair faces"` and speak it later as if it were
      // finished. Only the preempted path can produce that, so only it pays the
      // check.
      const endsWhole = /[.!?]["']?$/.test(finalText);
      const truncated = preemptedFill && !endsWhole;
      if (usedFallback || repDup || narratesAction || truncated) {
        noteQwenDiscarded(
          truncated ? 'intro-fill:preempted-partial'
            : narratesAction ? 'intro-fill:action-opener'
              : repDup ? 'intro-fill:near-dup' : 'intro-fill:∅',
        );
        // ⚠⚠⚠ OTA-1571 — AND THE LOCATION TAKES A STRIKE. Without this the
        // homework scan re-picks the same hungry bank forever: the owner's log
        // shows twelve fills for "Builders' Survey Camp", eight discarded, 57.9s
        // burned, and NO other location banked while it ran. See
        // sceneIntroRefusals — this is OTA-1465's starvation bug in the slot
        // that never got its guard.
        //
        // ⚠ A PREEMPTED fill is NOT a strike. It was cut off by the player
        // acting, which says nothing about whether this place can be written;
        // counting it would retire locations for being visited at a busy moment.
        if (!truncated) noteIntroFillMiss(forLoc?.id ?? scene.location.id);
      } else {
        // A location that banks a line has proved it can be written — see
        // noteIntroFillHit for why the count must not survive a success.
        noteIntroFillHit(forLoc?.id ?? scene.location.id);
        bankSceneIntro(
          forLoc
            ? introBankKey(forLoc.id, null)
            : introBankKey(scene.location.id, get().player?.hubRoomId ?? null),
          finalText,
        );
      }
      get().appendLog('debug',
        `homework: scene_intro "${forLoc?.name ?? scene.location.name}"`
        + ` ${usedFallback || repDup ? '∅' : '✓'} ${Date.now() - t0}ms`);
      return;
    }
    get().appendLog('arbiter', finalText);
    // OTA-1131 — a generated line is still the Arbiter talking; it starts the
    // quiet period the same as an aside does.
    noteArbiterSpoke();
    if (repDup) noteQwenDiscarded('near-duplicate→template');
    else if (usedFallback) noteQwenDiscarded('empty→template');
    get().appendLog('debug', `arbiter: qwen ✓ ${Date.now() - t0}ms (intent=${intent}${repDup ? ', near-dup→template' : usedFallback ? ', empty→template' : ''})`);
  } catch {
    // OTA-1129 — a failed fill is silent. There is no template to fall back to
    // because nobody asked for a line yet, and a debug line per failure would
    // be noise on a path that runs unattended.
    if (opts?.bankOnly) return;
    if (myEpoch === arbiterGenerationEpoch) {
      get().appendLog('debug', `arbiter: qwen-error ${Date.now() - t0}ms → template`);
      // arb162 — generation failed → canned fallback; voice it only ~1 in 4.
      speakArbiterFlavor(get, trimmed);
    }
  } finally {
    // Only clear flags if we're still the active generation; otherwise the
    // newer generation owns them.
    // OTA-1129 — a fill never bumped the epoch, so it must release
    // `isGenerating` on its own terms; leaving it set would wedge every later
    // generation behind a background job that has already finished.
    if (opts?.bankOnly) set({ isGenerating: false });
    else if (myEpoch === arbiterGenerationEpoch) {
      set({ isGenerating: false, partialArbiterText: null });
    }
  }
}

/**
 * arb163 — AMBIENT companion narration. The reflective counterpart to
 * narrateViaArbiter: instead of reacting to an action, the Arbiter makes an
 * unprompted aside about the journey. Because it answers nothing, its latency
 * is invisible — it streams + voices whenever it finishes, however late.
 *
 * Crucially it is NOT cancelled by the player's next action (no epoch check).
 * narrateViaArbiter cancels mid-flight because a stale REACTION is wrong; an
 * ambient reflection is never stale, so we let it complete. The shared
 * `isGenerating` flag still serialises it against reactive scene-intro
 * generations and the voice lock — only one native-ML job runs at a time.
 */

// Last fully-scripted beat of the outpost tutorial. Everything from the
// name prompt through INVESTIGATE is canned, so Qwen has nothing to add —
// only Kokoro voices the scripted Arbiter lines. Qwen switches back on at
// the explore/leave choice that immediately follows investigate.
const SCRIPTED_TUTORIAL_LAST_IDX = TUTORIAL_STEPS.findIndex((s) => s.id === 'investigate');

/** True while the player is in the fully-scripted prefix of the outpost
 *  tutorial (name → investigate). Used to fully muzzle every Qwen path —
 *  reactive narration, ambient musings, and cognitive enrichment — so the
 *  scripted onboarding plays clean (Kokoro only). Returns false the moment
 *  the player reaches the post-investigate explore/leave choice, so normal
 *  free-roam narration resumes there. (Player: "we don't need qwen doing
 *  anything … this is all scripted until the player makes their choice
 *  after investigate.") */
export function inScriptedTutorialPhase(get: () => GameStore): boolean {
  const step = get().tutorialStep;
  return step !== null && SCRIPTED_TUTORIAL_LAST_IDX >= 0 && step <= SCRIPTED_TUTORIAL_LAST_IDX;
}


// OTA-609 — near-duplicate suppression for GENERATED Arbiter lines (see
// engine/arbiterDedup.ts). Pulls the recent Arbiter-channel texts and asks the
// pure helper whether `text` just rewords one of them.
function generatedLineRepeatsRecent(get: () => GameStore, text: string): boolean {
  // OTA-610 — last N ARBITER lines (not total entries), so interleaved combat/
  // debug entries can't push a recent repeat out of the comparison window.
  const recent = get().gameLog.filter((e) => e.channel === 'arbiter').slice(-15).map((e) => e.text);
  return isRepetitiveArbiterLine(text, recent);
}

/** OTA-1122 — the rest-window filler. Deliberately a thin wrapper rather than
 *  its own generation path: a second copy of the vetting pipeline would drift
 *  from the live one, and the filters ARE the feature (five OTAs of register,
 *  echo and off-canon work live in them). One extra musing per rest, capped. */
export async function fillMusingBank(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
): Promise<void> {
  if (musingBank.length >= MUSING_BANK_CAP) return;
  await maybeGenerateAmbientArbiter(get, set, { bankOnly: true });
}

export async function maybeGenerateAmbientArbiter(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  // OTA-1122 — bankOnly: write the musing into the bank instead of speaking it.
  // Everything upstream (muzzles, model readiness, prompt, vetting) is shared;
  // only the last step differs.
  opts?: { bankOnly?: boolean },
): Promise<void> {
  const scene = get().currentScene;
  const player = get().player;
  // Muzzle in combat (no idle musing mid-fight), require the model + a free
  // lock, and respect the wide ambient spacing.
  if (!scene || !player || scene.enemies.length > 0) return;
  // Stay silent through the scripted prefix of the outpost tutorial. A ~10s
  // ambient musing fired mid-onboarding clutters the feed and backs up the
  // voice queue between coached beats — that's the "massive gap" a player
  // feels between climbing down and the INVESTIGATE prompt. Resumes at the
  // post-investigate explore/leave choice (see inScriptedTutorialPhase).
  if (inScriptedTutorialPhase(get)) return;
  // ⚠ OTA-1122 — SPEND BEFORE YOU GENERATE. A banked musing is spoken with
  // zero model time, so this sits ABOVE the readiness and cooldown gates: the
  // bank works even while Qwen is reloading, and a line that costs nothing
  // should not be rationed by a cooldown that exists to ration generations.
  // It stays below the combat and tutorial muzzles, which are about whether a
  // musing is WANTED at all.
  // ⚠ OTA-1131 — AND NOT ON TOP OF SOMETHING HE JUST SAID. In the log that
  // motivated the budget, an ambient musing landed in the middle of five
  // investigate asides. Ambient keeps its own wide cooldown and its own
  // reasons; what it gains here is only the SHARED silence, so two Arbiter
  // lines from different systems cannot arrive in one breath.
  if (!arbiterHasBeenQuiet()) {
    get().appendLog('debug', 'arbiter: ambient held (he just spoke)');
    return;
  }
  if (!opts?.bankOnly) {
    const banked = takeBankedMusing(get);
    if (banked) {
      get().appendLog('arbiter', banked);
      noteArbiterSpoke();
      get().appendLog('debug', `arbiter: ambient ✓ 0ms (banked, ${musingBank.length} left)`);
      return;
    }
  }
  if (!qwen.isReady() || get().isGenerating) return;
  if (Date.now() - lastAmbientGenStartMs < AMBIENT_GEN_COOLDOWN_MS) return;

  const sceneSlice: SceneSlice = {
    location: scene.location,
    weather: scene.weather,
    hazard: scene.hazard,
    enemies: scene.enemies,
    enemyHps: scene.enemyHps,
    vendor: scene.vendor
      ? { name: scene.vendor.name, affiliation: scene.vendor.faction ?? undefined }
      : null,
  };
  const ladder = scene.microMicroId ? findMicroMicroAnywhere(scene.microMicroId) : null;
  const ctx = buildLlmContext({
    player,
    scene: sceneSlice,
    gameLog: get().gameLog,
    ladder,
    ambient: true,
    deedsHere: deedsHereLine(get().worldMemory, player?.currentLocationId),
  });
  const messages = buildSystemPrompt(ctx);
  const t0 = Date.now();
  // OTA-1051 — the situation this line is being composed FOR. Checked again
  // before it speaks; see ambientStaleReason.
  const stamp = takeAmbientStamp(get);
  lastAmbientGenStartMs = t0;
  // Arm the reactive cooldown too, so a scene-intro generation doesn't pile on
  // the lock the instant this one finishes.
  lastQwenGenStartMs = t0;
  set({ isGenerating: true, partialArbiterText: '' });
  try {
    // OTA-1030 — same vetted tail as the reactive path. THIS is the generation the
    // owner caught: the ambient brief came back verbatim, streamed raw to the
    // screen, and was then correctly filtered to nothing — the log shows
    // "arbiter: ambient ∅", a line that never existed as far as the feed knew.
    let streamed = '';
    let previewBlocked = false;
    const text = await qwen.stream(
      messages,
      (token: string) => {
        streamed += token;
        if (previewBlocked) return;
        if (looksLikeInstructionEcho(streamed)) {
          previewBlocked = true;
          set({ partialArbiterText: '' });
          return;
        }
        set({ partialArbiterText: streamed });
      },
      // OTA-1123 — THE BANK'S FILLER IS THE FIRST HOMEWORK JOB, and it is the
      // right one: a rest-window fill is by definition work nobody asked for.
      // As homework it queues below voice and is cut short the instant the
      // player acts, so filling the bank can never be the reason a tap waits.
      //
      // ⚠⚠⚠ OTA-1634 — AND SO IS THE LIVE ASIDE. OTA-1123 kept it at LLM
      // priority ("the player is owed that line"); the owner's 2026-09-02 log
      // priced that call. A 22.3 s live ambient held the one native lock while
      // FIVE classifier calls waited behind it (23.5 s, 24.1 s, 10.2 s, 10.6 s,
      // 11.0 s — the classifier normally answers in ~300 ms) and the lore for
      // "investigate dust trail" waited 24.1 s of its 27.0 s — then the aside
      // itself came back stale (combat had started) and went to the bank. The
      // second live ambient of the night, 9.9 s, was discarded as stale too.
      // Nobody is owed a line that will not be spoken: the aside is a 35%-chance
      // musing kicked off AFTER the action resolved, decoupled from it by design
      // (arb163). It yields like homework — below the voice, cut the instant the
      // player acts or a real call arrives — and a cut aside is discarded below,
      // because the thing that cut it is the thing that made it stale.
      { maxNewTokens: 32, job: opts?.bankOnly ? 'ambient_fill' : 'ambient', homework: true },
    );
    // OTA-663 — off-canon entity guard (ambient path). A dropped line just stays
    // silent (ambient has no template fallback), which is the safe outcome.
    const ambientAllow = narrationEntityAllow(get);
    const survivors = clampSentences(repairGluedNarration(stripForeignWords(text)), 1)
      .split(/(?<=[.!?])\s+/)
      .filter((s) => !/\b(the player|the adventurer|the explorer|the figure)\b/i.test(s))
      .filter((s) => !/^\s*they\s/i.test(s))
      // ⚠ OTA-1124 — FIRST-PERSON OPENER. Owner's log: a musing came back about
      // "my eyes". The Arbiter is a companion and may certainly say "I" inside
      // a line addressed to the player — but a sentence whose SUBJECT is the
      // narrator has stopped being a reflection on the PLAYER and become one
      // about itself, which is not the beat this is.
      //
      // ⚠ DELIBERATELY NARROW, AND OTA-1031 IS WHY. That OTA's filter dropped
      // every sentence starting with "You" — which the voice rules order the
      // model to do — and silently ate the whole feature: every ambient in the
      // owner's logs was ∅ across four builds. So this mirrors the `they`
      // opener directly above and tests the OPENER only. "The road behind is
      // longer than the one ahead" survives; so does "You have come far, and
      // my eyes have seen worse." Only "My eyes have seen worse" is dropped.
      // ⚠ OTA-1125 — RETARGETED THE MOMENT THE LOG ARRIVED. OTA-1124 shipped
      // an OPENER test and the very next device log carried the actual line:
      //   "As I walk through the shadows of the Obsidian Pillars, my eyes
      //    follow the ancient trees that seem to whisper secrets to the wind."
      // It opens with "As". The opener test would have let it straight through
      // — I had matched the shape I imagined rather than the shape that
      // happened, and a filter that misses its own motivating example is worth
      // nothing.
      //
      // The real rule is about WHO THE SENTENCE IS ABOUT: it speaks of the
      // narrator and never of the player. So — first person present AND second
      // person absent. That is still narrow, and it still cannot eat the
      // feature the way OTA-1031's version did:
      //   · "As I walk … my eyes …"            → I/my, no you  → DROPPED
      //   · "You have come far; my eyes…"       → has "you"     → kept
      //   · "The road behind is longer…"        → neither       → kept
      .filter((s) => {
        const firstPerson = /\b(i|i'm|i've|i'll|my|mine|me|myself)\b/i.test(s);
        const secondPerson = /\b(you|your|you're|you've|yours|yourself)\b/i.test(s);
        return !(firstPerson && !secondPerson);
      })
      // ⚠⚠ OTA-1409 — THE NARRATOR CALLING THE PLAYER BY ITS OWN JOB TITLE.
      // Twice in two of the owner's logs, one day apart:
      //   "You, a companion, have walked a long road, traversing the Borderlands…"
      //   "You, my companion, have traveled far and wide, traversing through the
      //    winding streets of the Borderlands."
      // AMBIENT_RULES opens *"Speak as a companion who has travelled a long road
      // at their side"* and the model folds that word straight into the line —
      // addressing the PLAYER as the companion, which inverts who is who.
      //
      // ⚠ It slipped every existing guard, and each one for a good reason. The
      // voice rules demand a sentence starting with "You", so the opener test
      // passes it. It contains both "my" and "you", so OTA-1125's first-person
      // filter keeps it. It names no off-canon entity. Nothing was broken — the
      // shape simply had not been seen before, so it goes in beside the others
      // rather than being folded into one of them.
      //
      // ⚠ NARROW ON PURPOSE, the OTA-1031 lesson: this tests the APPOSITION ONLY.
      // "You have walked a long road, my friend" survives — that is the Arbiter
      // addressing the player warmly, which is the beat working. Only the form
      // that RE-LABELS them is dropped.
      .filter((s) => !/^\s*(?:and\s+)?you\s*,\s*(?:my|a|an|the|our)?\s*(companion|friend|traveller|traveler|wanderer|comrade|partner|stranger)\s*,/i.test(s))
      // Ambient is the narrator's own idle musing, not world narration — a
      // second-person ACTION opener ("You step back, surveying...") reads as
      // scene text in the arbiter channel and in practice is an off-scene
      // hallucination (log 2026-07-13: alleyways + stone pillars narrated
      // inside a flooded-house kitchen). Drop those sentences; an empty
      // result just stays silent (ambient has no template fallback).
      // OTA-1031 — this used to drop EVERY "You …" sentence, which silently
      // guaranteed the empty result: VOICE_RULES orders the model to start
      // sentences with "You", so the filter ate the whole feature (every
      // ambient in the owner's logs is ∅, never ✓). Now it splits on register —
      // an action opener is still scene text, a reflection is what we asked for.
      .filter((s) => !isSecondPersonActionOpener(s))
      // OTA-1030 — the brief recited back is not a line. Empty → stays silent.
      .filter((s) => !looksLikeInstructionEcho(s))
      .filter((s) => !sentenceNamesOffCanonEntity(s, ambientAllow))
      // OTA-1543 — the register gate: measured stock-LLM clichés never print.
      .filter((s) => !sentenceIsStockLlmFiller(s))
      .join(' ')
      .trim();
    const finalText = trimToLastSentence(survivors);
    // Ambient lines are ALWAYS voiced (no silent flag) — they're the fresh ones
    // the player wants to hear. An empty result (model produced nothing usable)
    // just logs and stays silent; there's no template fallback for ambient.
    // OTA-609 — also drop a near-duplicate of a recent Arbiter line (the model
    // rephrasing the same thought on a long journey) so it can't repeat 5-6×.
    // OTA-1051 — has the world moved on while this was generating? Checked
    // here rather than at the appendLog site so the debug marker can name the
    // reason, and checked BEFORE the dup test because a stale line should read
    // as stale in the log even when it also happens to be a repeat.
    // OTA-1122 — the fill path never speaks. It banks whatever survived the
    // filters and says so in the debug channel; the stamp it carries is the one
    // taken at generation start, so validity is decided at SPEND time by the
    // same five checks the live path uses.
    if (opts?.bankOnly) {
      if (finalText) bankMusing(finalText, stamp);
      get().appendLog('debug',
        `arbiter: ambient-fill ${finalText ? `banked (${musingBank.length}/${MUSING_BANK_CAP})` : '∅'} ${Date.now() - t0}ms`);
      if (!finalText) noteQwenDiscarded('ambient:fill-∅');
      return;
    }
    // ⚠ OTA-1634 — a CUT aside is a stale aside. The live path is homework now,
    // so a player action, a classifier call or a voice line ends it early; the
    // partial is not vetted for speech (it may end mid-word) and the world has
    // already moved past the moment it was written for. The fill path above is
    // exempt on purpose (OTA-1258: a preempted fill keeps its text for the bank).
    if (lastQwenCallPreempted()) {
      get().appendLog('debug', `arbiter: ambient cut short ${Date.now() - t0}ms — yielded to the player`);
      noteQwenDiscarded('ambient:preempted');
      return;
    }
    const staleReason = ambientStaleReason(get, stamp);
    const ambientUsable = !staleReason && !!finalText && !generatedLineRepeatsRecent(get, finalText);
    if (ambientUsable) get().appendLog('arbiter', finalText);
    // ⚠ OTA-1122 — A STALE LINE GOES IN THE BANK, NOT THE BIN. It is stale
    // because the world moved WHILE we wrote it — almost always because the
    // player walked on — and it is still a perfectly good musing for the place
    // it was written about. Banked against its own stamp, walking back into
    // that room spends it instantly instead of paying for it a second time.
    // Only the stale class: a `∅` produced nothing, and a `dup-dropped` line is
    // one the Arbiter has effectively already said.
    if (staleReason && finalText) bankMusing(finalText, stamp);
    const ambientMark = staleReason ? `stale:${staleReason}${finalText ? '→banked' : ''}`
      : ambientUsable ? '✓'
      : finalText ? 'dup-dropped'
      : '∅';
    // A banked line is deferred work, not wasted work — the waste ledger is the
    // number that decides whether a job is worth keeping, so it must not count
    // a generation the player is still going to hear.
    if (!ambientUsable && !(staleReason && finalText)) noteQwenDiscarded(`ambient:${ambientMark}`);
    get().appendLog('debug', `arbiter: ambient ${ambientMark} ${Date.now() - t0}ms`);
    // ⚠ OTA-1124 — LOG THE RAW TEXT OF LINES THAT PASSED, TOO.
    // OTA-1034 added raw logging for FAILURES, and it has paid for itself
    // repeatedly. But the owner's latest slip was a line that passed every
    // filter and was still wrong twice over: first person ("my eyes") and
    // invented scenery ("ancient trees" in the Obsidian Pillars, which has
    // none). A line that is accepted and bad leaves no trace at all, so the
    // only evidence is the owner noticing and typing it out by hand.
    //
    // ⚠ AND THE SCENERY HALF IS DELIBERATELY NOT "FIXED" HERE. The off-canon
    // guard covers named ENTITIES; policing generic scenery would need a
    // whitelist of what may exist in each biome, which is a content system, not
    // a filter — and guessing at one is how OTA-1031 ate the feature. Measure
    // how often it happens first. This is the line that will tell us.
    if (ambientUsable) {
      get().appendLog('debug', `arbiter: ambient-said "${finalText.slice(0, 160)}"`);
    }
    // OTA-1034 — WHY it was empty. The owner's logs show ∅ on every ambient
    // attempt across four builds, including one that carries the OTA-1054
    // register fix — so the register filter was NOT the whole story, and the ∅
    // line never said which of the five filters ate the line (or whether the
    // model returned anything at all). Name the culprit so the next pasted log
    // answers it instead of another round of guessing. Debug channel only; no
    // behaviour change.
    if (!ambientUsable) {
      const rawOut = (text ?? '').trim();
      if (!rawOut) {
        get().appendLog('debug', 'arbiter: ambient-empty reason=model-returned-nothing');
      } else {
        const firstCut = clampSentences(repairGluedNarration(stripForeignWords(rawOut)), 1)
          .split(/(?<=[.!?])\s+/)[0] ?? '';
        const why = !firstCut ? 'cleaners-emptied-it'
          : /\b(the player|the adventurer|the explorer|the figure)\b/i.test(firstCut) ? 'third-person'
          : /^\s*they\s/i.test(firstCut) ? 'they-opener'
          : isSecondPersonActionOpener(firstCut) ? 'action-opener'
          : looksLikeInstructionEcho(firstCut) ? 'instruction-echo'
          : sentenceNamesOffCanonEntity(firstCut, ambientAllow) ? 'off-canon-entity'
          : finalText ? 'near-duplicate-of-recent'
          : 'unknown';
        get().appendLog('debug', `arbiter: ambient-empty reason=${why} raw="${rawOut.slice(0, 120)}"`);
      }
    }
  } catch {
    get().appendLog('debug', `arbiter: ambient-error ${Date.now() - t0}ms`);
  } finally {
    set({ isGenerating: false, partialArbiterText: null });
  }
}

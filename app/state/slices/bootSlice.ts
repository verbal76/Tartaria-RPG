/**
 * OTA-1395 — SLICE 4 OF THE gameStore SPLIT: boot and birth.
 *
 * The two ways a playable session comes into existence:
 *
 *   • `hydrate()` — 547 lines. Everything the app does once, at launch, before
 *     anything is on screen: read the active slot, promote a surviving crash
 *     breadcrumb, run migrations, wire the telemetry sinks, warm the intro bank.
 *   • `startNewGame()` — 89 lines. A character is created and a world is seeded.
 *
 * ⚠⚠ THESE ARE THE OTHER HALF OF SLICE 3, AND THE SPLIT WAS MEASURED, NOT
 * CHOSEN. Slice 3 took the eight slot-management actions out of the same
 * ten-action cluster and left these two, because the two groups share ZERO
 * unexported dependencies. That prediction held exactly: these two reach the
 * scene-intro bank, the tutorial phase check and the narrator, and touch none of
 * the welcome-back beat, patrol simulation or memorable-event ledger that went
 * with the eight.
 *
 * ⚠ NO MUTABLE STATE AT ALL. Unlike every slice so far, these two own no `let`
 * of their own — so nothing had to travel with them, and the compiler had
 * nothing to refuse. That makes this the largest move yet and, mechanically, the
 * least dangerous.
 *
 * ⚠ SEVEN FUNCTIONS HANDED IN, all of them private to gameStore and all still
 * used there. Injecting keeps the dependency one-way — gameStore → slice, never
 * back — because a value import from gameStore would be a module cycle that
 * resolves to `undefined` on whichever side the bundler reaches second. The
 * failure would land in `hydrate`, i.e. on launch, before anything renders.
 *
 * ⚠ WHAT DID NOT CHANGE: two bodies, same code, same order, same comments.
 */
import { qwen } from '../../ai/engines';
import { setContextLedgerSink } from '../../ai/generation/contextLedger';
import {
  qwenCallCount,
  qwenJobStats,
  qwenTelemetrySummary,
  // ⚠ OTA-1405 — the ONE answer to "can this timing be true?", shared with the
  // rollup so the printed line and the average cannot disagree about one call.
  qwenTimingsArePossible,
  setQwenDiscardSink,
  setQwenTelemetrySink,
} from '../../ai/generation/qwenTelemetry';
import { OTA_BUILD_ID } from '../../buildInfo';
import { loadLastCrash } from '../../diagnostics/lastCrash';
import { setLastBootBreadcrumb } from '../../diagnostics/runtimePressure';
import { getCrashedSlotIds, loadSaveLoadHealth } from '../../diagnostics/saveLoadHealth';
import { createCharacter, type CreateCharacterInput } from '../../engine/character';
import { buildArbiterSceneIntro, buildOpening } from '../../engine/narrativeGenerator';
import { profileOf } from '../../engine/pressure';
import { pick } from '../../engine/rng';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { canonicalItemTags } from '../../engine/crafting';
import {
  clearLiveBreadcrumb,
  ensureFirstInstallSeed,
  listSlots,
  loadActiveSlotId,
  loadGlobalStash,
  migrateLegacySlotIfPresent,
  newSlotId,
  readLiveBreadcrumb,
  setActiveSlot,
  stampBreadcrumbPhase,
} from '../../engine/saveSystem';
import { introPagesFor } from '../../engine/story';
import { discoverLocation, emptyMemory } from '../../engine/worldMemory';
import type { InventoryItem } from '../../engine/types';

/** ⚠ Fully erased at compile time — see slice 3 for why `typeof Store.fn` is the
 *  right way to type injected deps: a signature change in gameStore breaks
 *  compilation here rather than being silently accepted. */
import type * as Store from '../gameStore';

type GameStore = Store.GameStore;
type SetState = (
  partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>),
) => void;

/** The slice's public surface — exactly the store keys this file owns. */
export interface BootSlice {
  hydrate: () => Promise<void>;
  startNewGame: (input: CreateCharacterInput) => Promise<void>;
}

/**
 * ⚠⚠ SEVEN PRIVATE FUNCTIONS OF gameStore, HANDED IN.
 *
 * None of these is exported, and all seven are still called from inside
 * gameStore as well as here — so neither moving them nor importing them was an
 * option. `deps.sceneIntroBank` is a shared Map mutated in place; the reference is
 * passed, so both sides go on writing to the same object exactly as before.
 */
export interface BootSliceDeps {
  // ⚠ `startRuntimePressureWatch` is NOT here, though the dependency scan flagged
  // it. Its only appearance in these 636 lines is a comment explaining that one
  // particular sink must be live BEFORE that watcher starts — the watcher itself
  // is started by `bootQwen`, which went to slice 2. An injected dep nothing
  // calls is a lie about coupling, so it was dropped once the compiler agreed
  // nothing referenced it. Same call as `arbiterAddress` in slice 3.
  INTRO_BANK_PER_LOC: typeof Store.INTRO_BANK_PER_LOC;
  inScriptedTutorialPhase: typeof Store.inScriptedTutorialPhase;
  introPrefetchCandidates: typeof Store.introPrefetchCandidates;
  narrateViaArbiter: typeof Store.narrateViaArbiter;
  sceneIntroBank: typeof Store.sceneIntroBank;
  setHomeworkTick: typeof Store.setHomeworkTick;
}

export const createBootSlice = (
  set: SetState,
  get: () => GameStore,
  deps: BootSliceDeps,
): BootSlice => ({
  async hydrate() {
    // ⚠⚠ OTA-1276 — READ THE SURVIVOR FIRST, then clear it. A breadcrumb still
    // on disk at boot means the LAST session died while it was live: no orderly
    // background, no clean exit. That is the swipe-kill the owner has had to do
    // after every hard freeze, and it is the only record of what the app was
    // doing at the moment the JS thread stopped — the batched disk log cannot
    // say, because its pending lines never drain through a wedge.
    try {
      const crumb = await readLiveBreadcrumb();
      if (crumb) {
        setLastBootBreadcrumb(crumb);
        get().appendLog('debug',
          `freeze forensics: last boot ended mid-action — ${crumb.what} @ ${crumb.room ?? '?'} (${new Date(crumb.at).toISOString()})`);
        // ⚠⚠ OTA-1380 — AND IT IS PROMOTED TO A CRASH, which is the whole point.
        // This crumb was ALREADY the evidence of a B9-class death: the process
        // was killed while an action was live, so no JS handler ran, nothing
        // wrote `@tartaria/lastCrash`, and the crash existed only as one debug
        // line that scrolled away. Recording it means a native kill finally
        // shows up where every other crash does — in the ledger, in About, and
        // in the bug report — instead of needing the owner to read a log at
        // exactly the right moment.
        //
        // ⚠ Recorded BEFORE the clear, so a failure to clear cannot cost the
        // record. Deduped on id (`ts_kind`), so a second hydrate in the same
        // session cannot invent a second crash from one crumb.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require('../diagnostics/crashLedger') as typeof import('../../diagnostics/crashLedger')).recordCrash({
          kind: 'native-death',
          ts: crumb.at,
          stage: crumb.phase ?? 'mid-action',
          message: `Process died with no orderly exit while: ${crumb.what}`,
          isFatal: true,
          breadcrumb: crumb,
        });
        await clearLiveBreadcrumb();
      }
    } catch { /* forensics must never block a boot */ }
    // OTA-1105 — Qwen telemetry sink. Every generation records at the runtime
    // boundary (qwenTelemetry.ts); this surfaces each call in the debug log —
    // `qwen⏱ <job> <outcome> <total>ms` with the lock-wait share when it is a
    // real share — plus a per-job rollup every tenth call, so a single device
    // log answers WHERE the 29-second outliers live (slow generation vs queue
    // behind TTS) without a second capture session. Assignment is idempotent;
    // a throwing sink can never break a generation (the recorder swallows).
    setQwenTelemetrySink((r) => {
      const wait = r.waitMs >= 250 ? ` wait ${r.waitMs}ms` : '';
      // OTA-1107 — the read/write split llama.cpp hands us. `read` is prefill
      // (ingesting the prompt) and `write` is generation: the single most
      // useful pair of numbers in this log, because they point at completely
      // different fixes (trim the prompt vs cut the token budget).
      // ⚠⚠ OTA-1405 — AND THE RAW PAIR OBEYS THE RULE ITS OWN DERIVED FIGURE
      // ALREADY DID. This is the third time this defect has been fixed and the
      // first time it has been fixed HERE. OTA-1139 guarded the ms/tok range;
      // OTA-1263 guarded the ms/tok figure printed on this very line and wrote
      // down that the ungurded number had already cost it a wrong finding. Both
      // left `read Xms/write Yms` — the number a reader actually looks at —
      // printing whatever the native side said. The owner's 2026-08-20 log then
      // carried `read 49256ms` on a call that finished in 5.4 seconds, and he
      // read it as real, because nothing on the line suggested otherwise.
      //
      // ⚠ MARKED, NOT DELETED. Hiding an impossible split would hide the fact
      // that llama.rn is reporting one, which is itself a finding worth keeping
      // — and the numbers stay legible for whoever eventually chases it. The
      // `⚠` and the trailing tag are there so no future rollup, and no future
      // reader, mistakes it for a measurement of this call.
      const timingsOk = qwenTimingsArePossible(r);
      const split = r.prefillMs != null || r.decodeMs != null
        ? (timingsOk
          ? ` read ${r.prefillMs ?? '?'}ms/write ${r.decodeMs ?? '?'}ms`
          : ` read ⚠${r.prefillMs ?? '?'}ms/write ⚠${r.decodeMs ?? '?'}ms NOT-PER-CALL`)
        : '';
      const sizes = r.promptTokens != null ? ` in ${r.promptTokens}t→out ${r.outTokens ?? '?'}t` : '';
      // ⚠⚠ OTA-1259 (N4) — THE `reuse Nt` NUMBER WAS STRUCTURALLY ZERO AND IS GONE.
      //
      // OTA-1108 derived it as `cachedTokens - promptTokens - outTokens` and read
      // the resulting zero as a finding: "a stable prompt PREFIX is still entirely
      // on the table." **That conclusion was built on a wrong premise about the
      // field.** llama.rn reports `tokens_cached` as `llama->n_past`
      // (android/src/main/jni.cpp:748), and after a completion `n_past` is the
      // sequence position — prompt tokens PLUS generated tokens — whether or not
      // any prefix was reused. Reuse changes what has to be COMPUTED, not what
      // ends up in the cache. So the subtraction yields ~0 BY CONSTRUCTION and the
      // metric could never have shown reuse, in any run, ever.
      //
      // ⚠⚠ AND THE UNDERLYING WORRY WAS BACKWARDS. llama.rn already does prefix
      // reuse — `n_past = common_part(embd, prompt_tokens)` in rn-llama.cpp — and
      // MEASURED, our prompts share 53–85% of their characters with the previous
      // one (same room 84–85%, two rooms of one tile 53%, ambient-vs-ambient 71%).
      // The owner's 2026-08-14 log shows two `scene_intro_fill` calls at
      // 12.2 ms/prompt-token and 3.67 ms/prompt-token on near-identical prompt
      // sizes: a 3.3× spread that is exactly what a warm prefix looks like.
      //
      // ⚠ THE HONEST SIGNAL IS PREFILL PER PROMPT TOKEN, so it rides every line
      // now instead of only the ten-call rollup (OTA-1127 added it there). A cold
      // call and a warm one are then two visibly different numbers.
      // **A metric that cannot move is worse than no metric: it reads as evidence.**
      // ⚠⚠ OTA-1263 — AND IT OBEYS THE SAME SANITY GUARD THE AGGREGATE DOES.
      // OTA-1139 already found that llama.rn's native `prompt_ms` is not always
      // per-call: the range rejects any sample whose prefill exceeds the whole
      // call, because a 54-second prefill inside a 5-second call is not a
      // measurement. OTA-1259 added this per-call figure and DID NOT copy that
      // guard, so the line printed numbers the rollup deliberately refuses.
      //
      // ⚠⚠ AND IT COST A WRONG FINDING IMMEDIATELY. OTA-1259 filed
      // `investigate_lore` at "64.7 ms/prompt-token — where the prefill money
      // actually is". That row was `ok 6863ms read 8286ms/write 4020ms`: twelve
      // seconds of reported work inside a seven-second call. **The number was
      // impossible and I built a finding on it.** The next log settled the real
      // behaviour — three consecutive `investigate_lore` calls at 59.2 (cold, and
      // itself impossible), then **2.4 and 2.5 ms/t** — which is prefix reuse
      // working, exactly as OTA-1259 concluded from the source.
      // ⚠ OTA-1405 — the inline arithmetic that used to live here is now the
      // shared `qwenTimingsArePossible`, so this figure, the raw pair above and
      // the rollup's average cannot drift apart again. They had.
      const prefillIsPossible = timingsOk && (r.promptTokens ?? 0) > 0;
      const msPerTok = prefillIsPossible
        ? ` ${(r.prefillMs! / r.promptTokens!).toFixed(1)}ms/t`
        : '';
      const stop = r.stop === 'limit' ? ' HIT-CAP' : '';
      get().appendLog('debug', `qwen⏱ ${r.job} ${r.outcome} ${r.totalMs}ms${wait}${split}${sizes}${msPerTok}${stop} (${r.chars}ch)`);
      if (qwenCallCount() % 10 === 0) {
        get().appendLog('debug', `qwen⏱ stats — ${qwenTelemetrySummary()}`);
      }
    });
    // OTA-1107 — wasted work, named as it happens. A discarded line cost the
    // same CPU as a delivered one; until this existed the stats called it a
    // clean success.
    setQwenDiscardSink((job, reason, ms) => {
      get().appendLog('debug', `qwen⏱ ✂ DISCARDED ${job} after ${ms}ms — ${reason}`);
    });
    // ⚠⚠ OTA-1177 — MODEL-CONTEXT LEDGER SINK. Installed HERE, beside the other two, and
    // not in startRuntimePressureWatch: this must be live before anything can load a
    // context, and the very first load is the one most likely to race a dispose. A sink
    // armed after the fact would miss the event we built this to catch.
    setContextLedgerSink((line) => {
      get().appendLog('debug', line);
    });
    // One-shot migration from the v1 single-slot save, if present.
    await migrateLegacySlotIfPresent();
    // arb38 — read the save-load crash breadcrumb BEFORE any slot can
    // be loaded. If last session died mid-load (native abort on a
    // stale cross-version save), this flags the offending slot so the
    // title screen can offer Retry / Delete instead of re-crashing.
    let crashedSlotIds: string[] = [];
    try {
      await loadSaveLoadHealth();
      await loadLastCrash(); // arb172 — cache last JS crash for the diagnostic export
      crashedSlotIds = getCrashedSlotIds();
    } catch { /* health is best-effort — never block boot on it */ }
    const activeId = await loadActiveSlotId();
    const slots = await listSlots();
    // OTA 454 — first-install Resurrection Gem seed. Idempotent: only
    // fires once per install. The seed lands in the global stash
    // before loadGlobalStash reads it so the resulting count
    // includes the gem.
    const seedResult = await ensureFirstInstallSeed();
    const stash = await loadGlobalStash();
    // OTA-189 — STT diagnostic wiring dropped along with the rest of
    // the STT surface (mic button, toggle, handler). No consumer is
    // left for the diag callback, so the lazy require + setSTTDiag
    // hookup have nothing to do.
    // Item-defaults inference flag. The engine falls back to
    // synthesized stats whenever an inventory item has no catalog
    // row (Mud-Rend Blade, Aetheric Locket, Golemstone Stabilizer,
    // OTA-196 — silence the inferred-stats debug spam. OTA-192 stopped
    // advertising "field-inferred" in user-facing descriptions, but the
    // setOnInferred hook was still pushing a debug-channel log line
    // every time an unknown name was synthesized. The player saw
    // `[debug] inferred-stats: gear:Mud Cloth — engine guessed stats`
    // in their feed on every render of those items. The information
    // is still useful for backfill, so we route it to console.log
    // (visible in dev tools / `adb logcat`) instead of appendLog.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const itemDefaults = require('../engine/itemDefaults');
      if (typeof itemDefaults.setOnInferred === 'function') {
        itemDefaults.setOnInferred((label: string) => {
          try { console.log(`[Tartaria][inferred-stats] ${label}`); } catch { /* ignore */ }
        });
      }
    } catch { /* ignore — module is small + always present */ }

    // OTA-191 — load the Qwen-synthesis cache so inferred-gear lookups
    // can pick up previously-balanced overlays without firing the
    // LLM again. The cache survives app restarts (AsyncStorage) so a
    // tester who synthesized 30 unique item names on day 1 doesn't
    // re-spend the model on day 2.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const synthCache = require('../engine/itemSynthesisCache');
      if (typeof synthCache.loadSynthCache === 'function') {
        await synthCache.loadSynthCache();
      }
    } catch { /* ignore — cache stays empty + the LLM path no-ops */ }

    // OTA-191 — wire the fire-and-forget Qwen synth requester. When
    // inferGear sees an item it can't classify confidently (no
    // food/drink/light/rope/etc. keyword) AND no cache entry exists,
    // it calls this with (name, hintTags). We dispatch a Qwen call
    // in the background — the result lands in the cache for the NEXT
    // lookup. The player's immediate use of the item still gets the
    // static-inference row; the enrichment shows up on the next
    // inventory open. Throttled per-name so a 30-item drop doesn't
    // spam the LLM with duplicates.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const itemDefaults = require('../engine/itemDefaults');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const synth = require('../engine/itemSynthesisQwen');
      if (typeof itemDefaults.setQwenSynthRequester === 'function') {
        const pending = new Set<string>();
        // ⚠ OTA-1109 — A PRIORITY INVERSION, MEASURED. The per-name `pending`
        // set stops the same item being synthesised twice, and stops nothing
        // else: a salvage haul of five curios fires five calls, and each one
        // takes the shared native-ML lock for as long as it wants. The
        // OTA-1108 log is what that costs — `item_synthesis n3 avg13.7s
        // max19.6s`, and every other job queued behind it:
        //   investigate_lore wait 6.5s · ambient wait 4.0s
        // Ambient's prompt trim landed exactly as predicted (545→361 tokens,
        // read 5.8-9.9s→4.4s) and the line still arrived LATER than before,
        // because the saving was spent waiting for item synthesis and then
        // decoding on a device it had saturated (31 tokens took 3.2s, ~2.5×
        // its usual rate).
        //
        // The trade is indefensible stated plainly: a background enrichment
        // that shows up on the NEXT inventory open was delaying the companion
        // line and the lore flourish the player is waiting on RIGHT NOW. So
        // it yields — one at a time, with a gap between. A dropped request is
        // free: the name simply stays uncached and asks again next lookup,
        // which is the fire-and-forget contract this path already had.
        let synthInFlight = false;
        let lastSynthAt = 0;
        const SYNTH_GAP_MS = 20_000;
        // ⚠ OTA-1126 — THE FIRST HOMEWORK SLOT: ITEM DESCRIPTIONS.
        //
        // Owner's governing rule for the whole homework track, and it is the
        // thing that decided which slot goes first: *"our problem is screen
        // real estate. more just scrolls up and blends in with the chatter and
        // isn't read. I would go with faster, and only do fancy bespoke
        // writing on screens that are stationary like conversations or other
        // writing popup."*
        //
        // Item descriptions are the cleanest fit in the game. They land in a
        // POPUP the player is holding still and reading — not in the scrolling
        // feed — so the writing is seen. And the work is pure SPEED: the
        // synthesis already runs today, on demand, the moment the player opens
        // an unknown item. Doing it early changes nothing about what the game
        // contains; it only moves a 4–13 second wait out of the player's way.
        //
        // The whole slot is a scheduler. The generation, the prompt, the
        // clamps, the cache and the silent-discard-on-bad-row are the existing
        // path untouched — which is the point, because those are five OTAs of
        // hard-won correctness and a second copy would drift from them.
        // ⚠ OTA-1129 — THE EXPLORATION IDLE SIGNAL, and why it is a different
        // one. `uiIdleSince` is stamped by STATIONARY SCREENS (the pack, the
        // map) — exactly right for item descriptions, and exactly wrong here,
        // because a scene intro is needed while the player is out walking,
        // which is the one time that stamp is never set. So the intro slot
        // reads the other honest signal: time since the last player action.
        // Standing in a room for six seconds without typing is reading time,
        // and reading time is when the next room should be written.
        //
        // ⚠ THIS DELIBERATELY LETS HOMEWORK RUN DURING NORMAL PLAY, which is
        // only defensible because OTA-1123 built the harness first: the fill
        // queues BELOW the voice and is cut short the instant a real
        // generation is enqueued, and `submitPlayerAction` clears the stamp at
        // the one door every action passes through. Without those two, this
        // would be the item-synthesis mistake of OTA-1123's own commentary —
        // background enrichment delaying the line the player is waiting on.
        let lastIntroFillAt = 0;
        /** Six seconds of stillness. Long enough that stepping through a
         *  corridor never triggers it, short enough that a player reading the
         *  room description has already paid for the next one. */
        const INTRO_IDLE_FLOOR_MS = 6_000;
        /** ⚠ A ceiling, so a single pathological sample cannot switch the feature
         *  off. Twenty seconds of stillness is already a player who has put the
         *  phone down. */
        const INTRO_IDLE_CEIL_MS = 20_000;
        /** ⚠⚠ OTA-1258 (N2) — THE TRIGGER WAS SHORTER THAN THE JOB IT ARMS, SO
         *  PREEMPTION WAS THE EXPECTED OUTCOME RATHER THAN THE EXCEPTION.
         *
         *  The floor is 6s. This job's own telemetry reports ~9s typical — 9009ms
         *  in the owner's 2026-08-14 log, and an earlier full-session sweep
         *  measured avg 9.5s / max 11.4s. A fill armed at six seconds of stillness
         *  is therefore started with a THREE-SECOND HOLE in it: any action in that
         *  window kills it, and the same log shows exactly that (one intro
         *  preempted at 5555ms, discarded, zero tokens out).
         *
         *  ⚠ READ FROM THE TELEMETRY, NOT HARDCODED. A second constant claiming
         *  "the job takes about N" is a copy of a number that already exists and
         *  will drift from it — this session has paid for a rule computed twice
         *  six times over. `avgMs` is the same figure the debug rollup prints, so
         *  the threshold and the log can never disagree.
         *
         *  ⚠ IT IS A PROXY, NOT A GUARANTEE. Past stillness predicts future
         *  stillness; it does not promise it. The win is the RATE, and the next
         *  device log is what says whether it moved — which is why the chosen
         *  value is printed beside the fill. */
        // ⚠⚠ OTA-1263 — OTA-1258's VERSION OF THIS NEVER FIRED. It looked up
        // `j.job === 'scene_intro'`, but the telemetry label for this job is
        // `narration:scene_intro_fill` (`job: opts?.bankOnly ?
        // \`narration:${intent}_fill\` : \`narration:${intent}\``). The find never
        // matched, `st` was always undefined, and every fill fell back to the 6s
        // floor — the exact behaviour N2 set out to change.
        //
        // ⚠⚠ AND THE DEVICE LOG SAID SO PLAINLY, THREE TIMES: `homework: intro-fill
        // armed after 6000ms idle`, in a session carrying several 6–9s
        // `scene_intro_fill` samples. **The line I added to prove the change had
        // worked is the line that proved it had not.** Print the number a change
        // depends on, then read it.
        const introIdleMs = (): number => {
          const st = qwenJobStats().find((j) => j.job === 'narration:scene_intro_fill');
          // Fewer than three samples is not a measurement — hold the old floor.
          if (!st || st.count < 3 || st.avgMs <= 0) return INTRO_IDLE_FLOOR_MS;
          return Math.min(
            INTRO_IDLE_CEIL_MS,
            Math.max(INTRO_IDLE_FLOOR_MS, Math.round(st.avgMs * 1.25)),
          );
        };
        /** Wider than the item gap: an intro costs a full narration-sized
         *  generation, and two banked lines per room is the whole target. */
        const INTRO_FILL_GAP_MS = 45_000;
        let introFillInFlight = false;
        /** Returns true when it STARTED a fill, so the tick stops there and the
         *  item slot waits for the next one — never two model jobs at once. */
        const introFillTick = (): boolean => {
          if (introFillInFlight) return false;
          if (Date.now() - lastIntroFillAt < INTRO_FILL_GAP_MS) return false;
          const lastAct = get().lastPlayerActionAt;
          const idleNeeded = introIdleMs();
          if (lastAct === null || Date.now() - lastAct < idleNeeded) return false;
          const target = deps.introPrefetchCandidates(get)
            .find((l) => (deps.sceneIntroBank.get(l.id)?.length ?? 0) < deps.INTRO_BANK_PER_LOC);
          if (!target) return false;
          const scene = get().currentScene;
          const pl = get().player;
          if (!scene || !pl) return false;
          introFillInFlight = true;
          lastIntroFillAt = Date.now();
          // OTA-1356 — background model work stamps the dying breath too: a
          // crumb frozen at this phase indicts the homework path, not the
          // player's action.
          stampBreadcrumbPhase('homework:intro-fill', target.id);
          void deps.narrateViaArbiter(
            get,
            set,
            // The template is only a fallback signal here — a fill that lands
            // on it banks nothing. Built for the DESTINATION so the two paths
            // agree about which place is being written about.
            buildArbiterSceneIntro({
              location: target,
              enemy: null,
              player: pl,
              worldMemory: get().worldMemory,
            }),
            'scene_intro',
            { bankOnly: true, forLocation: target },
          ).catch(() => { /* fail closed — the live path still works */ })
            .finally(() => {
              introFillInFlight = false;
              stampBreadcrumbPhase('homework-done'); // OTA-1356
            });
          // ⚠ The threshold this fill was armed at, so a device log can tell a
          // preemption caused by a bad threshold from one caused by a busy player.
          get().appendLog('debug', `homework: intro-fill armed after ${idleNeeded}ms idle`);
          return true;
        };
        let lastHomeworkAt = 0;
        /** Spacing between homework generations. Deliberately much wider than
         *  the interactive gap: this is battery the player did not ask to
         *  spend, and one description per half-minute of reading is plenty to
         *  stay ahead of someone thumbing through a pack. */
        const HOMEWORK_GAP_MS = 30_000;
        /** ⚠ Pick the item most likely to be OPENED NEXT, not merely the first
         *  uncached one. Someone reading their pack works down the list, so the
         *  head of the inventory is the best guess available without tracking
         *  scroll position — and guessing badly costs a generation, not
         *  correctness. */
        const nextHomeworkItem = (): { name: string; tags: readonly string[] } | null => {
          const inv = get().player?.inventory ?? [];
          for (const it of inv) {
            const key = it.name.toLowerCase();
            if (pending.has(key)) continue;
            if (synth.readSynthCache(it.name)) continue;
            return { name: it.name, tags: canonicalItemTags(it) };
          }
          return null;
        };
        /** ⚠ THE IDLE GATE. Owner chose the windows: menu / inventory / map
         *  time ("you're reading, not waiting on the engine") and charging-and-
         *  idle — explicitly NOT while actively moving. `uiIdleSince` is
         *  stamped by the screens that qualify; anything else leaves it null
         *  and no homework runs. Combat and the tutorial are hard-muzzled the
         *  same way ambient is, because a free line is still the wrong line
         *  mid-fight. */
        const homeworkTick = (): void => {
          if (!qwen.isReady() || get().isGenerating) return;
          if ((get().currentScene?.enemies?.length ?? 0) > 0) return;
          if (deps.inScriptedTutorialPhase(get)) return;
          // ⚠ OTA-1129 — SLOT 2: THE SCENE-INTRO BANK, and it runs BEFORE the
          // item slot on purpose. An item description is read on the next
          // inventory open, minutes away; a scene intro is spent on the very
          // next step. When both are hungry the one with the nearer deadline
          // wins. (It sits above the `witholdIdentity` gate too — that dial is
          // about not solving a hard run's CURIOS for it, and has nothing to
          // say about narrating a room.)
          if (introFillTick()) return;
          if (profileOf(get().player).witholdIdentity) return;
          if (synthInFlight) return;
          if (Date.now() - lastHomeworkAt < HOMEWORK_GAP_MS) return;
          const idleSince = get().uiIdleSince;
          if (idleSince === null || Date.now() - idleSince < 1500) return;
          const target = nextHomeworkItem();
          if (!target) return;
          const key = target.name.toLowerCase();
          synthInFlight = true;
          lastHomeworkAt = Date.now();
          pending.add(key);
          stampBreadcrumbPhase('homework:item-desc', key); // OTA-1356
          void Promise.resolve().then(async () => {
            const t0 = Date.now();
            let got: unknown = null;
            try {
              got = await synth.synthesizeItemViaQwen(target.name, target.tags, qwen, { homework: true });
            } catch { /* fail closed — the static row is already in hand */ }
            pending.delete(key);
            synthInFlight = false;
            stampBreadcrumbPhase('homework-done'); // OTA-1356
            lastSynthAt = Date.now();
            get().appendLog('debug',
              `homework: item_desc "${target.name}" ${got ? '✓' : '∅'} ${Date.now() - t0}ms`);
          });
        };
        deps.setHomeworkTick(homeworkTick);
        itemDefaults.setQwenSynthRequester((name: string, hintTags: readonly string[]) => {
          const key = name.toLowerCase();
          if (pending.has(key)) return;
          // OTA-1117 — the `witholdIdentity` RULE dial. A hard run does not get
          // its curios worked out for it: the synthesis that writes a curio's
          // description and effect simply does not run, and the item stays what
          // its STATIC row says it is until the player figures the rest out.
          //
          // ⚠ WHY THE GATE IS HERE AND NOT DEEPER. The static inference in
          // itemDefaults is what makes an unknown item FUNCTION at all — gating
          // that would not withhold identity, it would hand the player a broken
          // row. What this dial removes is the free enrichment on top, which is
          // exactly what pressure.ts describes it as: the identification system
          // already exists; this decides whether it runs for free. Fail-closed
          // is also already this path's contract — a dropped request leaves the
          // name uncached and the static row in the player's hands — so
          // withholding needs no second code path and can break nothing.
          if (profileOf(get().player).witholdIdentity) return;
          // Status gate — don't bother spawning the call if Qwen isn't
          // ready. The static row is already in the player's hands.
          if (!qwen.isReady()) return;
          if (synthInFlight) return;
          if (Date.now() - lastSynthAt < SYNTH_GAP_MS) return;
          // ⚠ OTA-1145 — ONLY WHILE SOMEONE IS ACTUALLY READING. This is the
          // defect the owner's load log caught, and it is a JS-side scheduling
          // bug, not a native one: `inferGear` runs over the WHOLE INVENTORY
          // during save-load hydration, so a save with one unclassifiable item
          // fired an interactive-priority generation ~160 ms into the load —
          // and then held the native-ML lock through 3.5 s of uninterruptible
          // prefill while the greeting the player had already read waited to
          // be spoken.
          //
          // Nobody was waiting on it. This path's own contract is that the
          // result "lands in the cache for the NEXT lookup" (the current render
          // keeps its static row, and OTA-192 restamps later), so it was never
          // interactive work — OTA-1134's note that "a player who opened an
          // unknown item IS waiting on it" is true of the POPUP, not of this
          // requester. Gating on `uiIdleSince` — the owner's own homework
          // signal, stamped only by stationary screens (pack / map / menu) —
          // makes it fire exactly when someone is reading and never during a
          // load, when that stamp is null.
          if (get().uiIdleSince === null) return;
          synthInFlight = true;
          lastSynthAt = Date.now();
          pending.add(key);
          // Defer to the next microtask so the synchronous caller
          // (a stat resolution inside inventory render) returns first.
          void Promise.resolve().then(async () => {
            try {
              // ⚠ OTA-1145 — and it runs as HOMEWORK, which is what it always
              // was: below voice, and cut short the instant real work arrives.
              // Priority alone never fixed this (a started job cannot be
              // outranked) but it is the honest label, and it stops this path
              // ever queueing ahead of a line the player is waiting to hear.
              await synth.synthesizeItemViaQwen(name, hintTags, qwen, { homework: true });
            } catch { /* ignore — fail closed, static row stays */ }
            pending.delete(key);
            // OTA-1109 — the gap is measured from COMPLETION, not from the
            // start: a 19-second call must not be followed instantly by the
            // next one just because the clock ran while it held the lock.
            synthInFlight = false;
            lastSynthAt = Date.now();
          });
        });
      }
    } catch { /* ignore — synth opt-in */ }

    // OTA-192 — live in-session restamp. When a Qwen synthesis lands
    // for an item the player already holds, the cache-merge in
    // inferGear updates future lookups, but the InventoryItem stored
    // on the player keeps its old tags + description until the next
    // save-load. That meant a Qwen correction (e.g., extra material
    // tag that lights up SCRAP) only took effect after restart. We
    // listen for cache writes and re-stamp the matching entries in
    // place so the inventory screen reflects the upgrade immediately.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const synthCache = require('../engine/itemSynthesisCache');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const backfill = require('../engine/itemBackfill');
      if (typeof synthCache.onSynthLanded === 'function'
        && typeof backfill.restampInventoryForName === 'function') {
        synthCache.onSynthLanded((name: string) => {
          const p = get().player;
          if (!p) return;
          const { inventory, changed } = backfill.restampInventoryForName(
            p.inventory,
            name,
          );
          if (!changed) return;
          set((s) => s.player ? { player: { ...s.player, inventory } } : s);
        });
      }
    } catch { /* ignore — listener wire-up is opt-in */ }

    // Just-updated detection. checkAndApplyOTA → Updates.reloadAsync
    // can yank the app to a new bundle mid-stride and reading the
    // result feels like a crash. Compare current OTA_BUILD_ID against
    // the value stored last time we hydrated; if different (and a
    // value was stored — fresh installs skip), surface the previous
    // build via justUpdatedFromBuild and TitleScreen pops a one-shot
    // modal explaining the system was just updated.
    let justUpdatedFromBuild: string | null = null;
    try {
      const LAST_BUILD_KEY = 'tartaria.lastSeenOTA.v1';
      const lastSeen = await AsyncStorage.getItem(LAST_BUILD_KEY);
      if (lastSeen && lastSeen !== OTA_BUILD_ID) {
        justUpdatedFromBuild = lastSeen;
      }
      await AsyncStorage.setItem(LAST_BUILD_KEY, OTA_BUILD_ID);
    } catch { /* AsyncStorage hiccup — silently skip the popup. */ }
    // ALWAYS land on the title screen at app launch, regardless of what
    // currentScreen the active slot was last saved at. Tapping a character
    // in the slot list is one tap away — but the player chooses, not the
    // last session.
    set({
      slots,
      activeSlotId: activeId,
      resurrectionGems: stash.resurrectionGems,
      currentScreen: 'title',
      hydrated: true,
      crashedSlotIds,
      justUpdatedFromBuild,
      // OTA-100 — parallel flag with the same source value but
      // a different lifecycle. justUpdatedFromBuild gets cleared
      // on popup dismiss (correct — popup shouldn't refire).
      // pendingOtaAppliedFrom is consumed exclusively by
      // loadSlotIntoGame's debug-log path so the OTA-applied
      // marker survives the popup dismiss.
      pendingOtaAppliedFrom: justUpdatedFromBuild,
    });
  },

  async startNewGame(input) {
    // Cut the title's "Choose your character" line so the name prompt isn't
    // queued behind it in Kokoro (same delay as the welcome-back on resume).
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      void require('../voice/TTSManager').stopAndClear();
    } catch { /* TTS not loaded yet — fine */ }
    // Tungsten Spire — accept an empty name. The Arbiter asks the
    // player for their name in the outpost (tutorial beat 0). For
    // the brief window between createCharacter and the player's
    // first input, player.name is an empty string; opening narration
    // weaves around it via buildOpening. Character creation itself
    // doesn't care — createCharacter writes player.name = '' and
    // the tutorial overrides it on the first input.
    const player = createCharacter({ ...input, name: input.name ?? '' });
    const memory = discoverLocation(emptyMemory(), player.currentLocationId);
    const slotId = newSlotId();
    await setActiveSlot(slotId);
    set({
      player,
      worldMemory: memory,
      gameLog: [],
      currentScreen: 'exploration',
      currentScene: null,
      pendingRolls: null,
      pendingHookContinue: null,
      pendingGolemNaming: false,
      activeSlotId: slotId,
      // Tungsten Spire — reset tutorial-props ledger for the new
      // character. Old characters loaded via loadSlotIntoGame don't
      // hit this path; their hasSeenIntro stays true and the tutorial
      // never fires.
      tutorialPropsConsumed: { cudgel: false, rope: false, chestPlate: false, note: false, vest: false },
      awaitingTutorialName: false,
      tutorialExploreChosen: false,
      activeBuildingId: null,
      activeBuildingRoomId: null,
      buildingRevealed: [],
      // arb119 — a fresh game must not inherit a stale open call-dog modal
      // (a transient UI flag that otherwise survives from a prior session).
      callDogModalOpen: false,
      pendingGift: null, // OTA-1060 — and any half-finished gift
      pendingTalk: null, // OTA-1058 — and any stale conversation
      pendingParley: null, // OTA-808 — clear any stale parley on a fresh game
      pendingPayoff: null, // OTA-1081 — and any stale shakedown
      // OTA-1018 — THE OPENING CRAWL. A brand-new character opens on the
      // reason they came down: three universal pages (the flood, the thousand
      // years, the nine hearts), two for their motive, one for the faction
      // that took them in, and the closing hand-off. Assembled per-character;
      // the StoryIntroOverlay shows it over the first scene.
      storyIntro: introPagesFor(player.storyMotive, player.factionId),
      chapterCard: null, // OTA-1020 — no stale card from a prior character
      dedicationCard: null,
      pendingFork: null, // OTA-1065
      motivePickerPending: false, // OTA-1022 — creation chose; nothing owed
    });
    try {
      get().appendLog('debug', `APK session start: ${OTA_BUILD_ID}.`);
    } catch { /* never block character creation on a debug log */ }
    // Arm the tutorial BEFORE beginScene so its scene-entry Arbiter hints
    // (danger assessment, ask-the-Arbiter, hub-travel — each gated on
    // tutorialStep === null) stay suppressed during the opening. They were
    // firing ahead of the name prompt because, on a brand-new game, the
    // tutorial wasn't "started" yet when beginScene ran, so tutorialStep was
    // still null and the guards let them through.
    if (!player.hasSeenIntro) {
      set({ tutorialStep: 0, awaitingTutorialName: true });
    }
    // beginScene paints the opening narration (location + weather +
    // hub-room description). The Arbiter name prompt lands AFTER
    // those via startTutorial below.
    get().beginScene({ openingPrefix: buildOpening(), isOpening: true });
    await get().persist();
    const slots = await listSlots();
    set({ slots });
    // First-time tutorial — only on brand-new characters. OTA-1019 — THE
    // ARBITER HOLDS HIS TONGUE. Owner: "the arbiter says his tutorial
    // opening line over top of the new origin text screens — it needs to
    // hold until you are in the tutorial." startTutorial() used to fire
    // HERE, printing "Your name, traveler..." into the feed while the
    // OTA-1018 crawl was still covering the screen. The tutorial STATE is
    // already armed above (so the scene-entry hints stay suppressed); the
    // spoken name prompt now waits for dismissStoryIntro() — the moment
    // the crawl closes and the player is actually looking at the feed.
    // The immediate call survives only as a fallback for the no-crawl case.
    if (!player.hasSeenIntro && !get().storyIntro) {
      get().startTutorial();
    }
  },
});

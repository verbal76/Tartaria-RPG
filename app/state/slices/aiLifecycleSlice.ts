/**
 * OTA-1393 — SLICE 2 OF THE gameStore SPLIT: the AI engines' lifecycle.
 *
 * Boot, shut down and resume the two on-device engines — the MiniLM classifier
 * (`cognitive`) and the generative Arbiter narrator (`qwen`).
 *
 * ⚠⚠ THIS SLICE WAS IMPOSSIBLE UNTIL THE SINGLETONS MOVED. Both engines were
 * constructed at module scope inside `gameStore.ts`. A slice cannot import a
 * value from gameStore — gameStore imports every slice, so the cycle resolves to
 * `undefined` for whichever module the bundler reaches second, and
 * `qwen.isReady is not a function` happens on a device rather than in CI. So
 * OTA-1393 first moved both instances DOWN to `app/ai/engines.ts`, a leaf both
 * sides import, and only then could these five actions follow. That ordering —
 * shared value down first, actions second — is the shape every remaining slice
 * will take, because the store's mutable and singleton state is what actually
 * binds it together.
 *
 * ⚠ WHY THESE FIVE AND NOT SIX. `cancelGeneration` reads as part of this family
 * and is deliberately left behind: it mutates `arbiterGenerationEpoch`, a `let`
 * shared with the narration path. Moving it would either strand that variable in
 * gameStore (a compile error — you cannot assign to an imported binding) or
 * steal it from narration. It moves with the narration slice, where the epoch
 * counter can travel as one piece.
 *
 * ⚠ WHAT DID NOT CHANGE: the five bodies are the same code, in the same order,
 * with the same comments. Two module-scope helpers they call —
 * `startQwenWatchdog` and `startRuntimePressureWatch` — are handed in as deps
 * rather than imported, for the same cycle reason as above. Both already take
 * `(get, set)`, so nothing about how they run changes either.
 */
import { cognitive, qwen } from '../../ai/engines';

/**
 * ⚠ Type-only, therefore erased at compile time and not a runtime cycle. Any
 * VALUE import from gameStore here would be one — see `app/ai/engines.ts`.
 */
import type { GameStore } from '../gameStore';
// OTA-1704 — the crash guard's own answer, read at the one door every load uses.
import { shouldAttemptQwen, qwenGateReason } from '../../diagnostics/mlHealth';

/** The slice's public surface — exactly the store keys this file owns. */
export interface AiLifecycleSlice {
  bootCognitive: () => Promise<void>;
  shutdownCognitive: () => Promise<void>;
  resumeCognitive: () => Promise<void>;
  bootQwen: () => Promise<void>;
  shutdownQwen: () => Promise<void>;
}

type SetState = (
  partial: Partial<GameStore> | ((state: GameStore) => Partial<GameStore>),
) => void;

/**
 * ⚠⚠ THE TWO WATCHDOG STARTERS ARE HANDED IN, NOT IMPORTED.
 *
 * `startQwenWatchdog` and `startRuntimePressureWatch` are defined in
 * `gameStore.ts`. Importing them here as values would make the two modules
 * import each other, and `bootQwen` would then call `undefined` the first time
 * an engine finished loading — on a phone, after a multi-minute download, in the
 * exact path nobody re-runs to reproduce.
 *
 * Passing them keeps the dependency one-way: gameStore → slice, never back.
 * Both already take `(get, set)` and own their own timers, so handing them over
 * changes nothing about when or how often they fire.
 */
export interface AiLifecycleSliceDeps {
  startQwenWatchdog: (get: () => GameStore, set: SetState) => void;
  startRuntimePressureWatch: (get: () => GameStore, set: SetState) => void;
}

/** ⚠ OTA-1635 — a Qwen load still in `downloading` / `loading` this long after
 *  bootQwen began writes ONE stall line to the log. Generous: a cold load on a
 *  Tensor G5 is ~20-30 s; a session that is still loading at a minute and a
 *  half is the shape that left the 2026-09-03 log with no qwen line at all. */
const QWEN_LOAD_STALL_MS = 90_000;

export const createAiLifecycleSlice = (
  set: SetState,
  get: () => GameStore,
  deps: AiLifecycleSliceDeps,
): AiLifecycleSlice => ({
  async bootCognitive() {
    const current = get().cognitiveStatus;
    if (current !== 'idle' && current !== 'failed') return;
    set({ cognitiveStatus: 'downloading', cognitiveFraction: 0, cognitiveError: null });
    try {
      await cognitive.boot({
        onProgress: (stage, fraction) => {
          set({ cognitiveStatus: stage, cognitiveFraction: fraction });
        },
      });
      const info = await cognitive.getModelInfo();
      set({ cognitiveStatus: 'ready', cognitiveFraction: 1, cognitiveModelInfo: info });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ cognitiveStatus: 'failed', cognitiveError: message });
    }
  },

  async shutdownCognitive() {
    try {
      await cognitive.shutdown();
    } catch {
      // ignore — best effort
    }
  },

  async resumeCognitive() {
    if (get().cognitiveStatus !== 'ready') return;
    try {
      await cognitive.resume();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ cognitiveStatus: 'failed', cognitiveError: message });
    }
  },

  async bootQwen() {
    const current = get().qwenStatus;
    if (current !== 'idle' && current !== 'failed') return;
    // ⚠⚠⚠ OTA-1704 — THE GUARD THAT COUNTS HAS TO BE THE GUARD THAT STOPS, AND
    // THIS IS THE DOOR EVERY LOAD COMES THROUGH.
    //
    // App.tsx checks `shouldAttemptQwen()` at its two boot warms. It does NOT
    // check it at the settled-foreground re-warm — `qwen: re-warming after
    // 8000ms settled foreground` then calls this function directly — and the
    // watchdog's revival lands here too. On the owner's old iPhone that is the
    // recurring ~400MB: the app is put away and brought back all day, and every
    // return bought another doomed load of a model whose own health record read
    // "auto-disabled after 8 crashes". One check here covers the boot warms, the
    // re-warm and the watchdog at once, and it costs one cached boolean.
    //
    // ⚠ RELOAD AI still works: the About screen calls resetMLHealth() first,
    // which zeroes the counters this reads, and an unloaded health cache reads
    // as permissive — the gate can never be the reason a healthy device is
    // benched.
    //
    // ⚠ And the early return leaves the watchdog UNSTARTED (it is started at the
    // foot of this function and nowhere else), so a gated device stops asking
    // entirely instead of retrying on a timer.
    if (!shouldAttemptQwen()) {
      set({ qwenStatus: 'skipped', qwenFraction: 0, qwenError: null });
      try {
        get().appendLog(
          'debug',
          `qwen: SKIPPED — ${qwenGateReason()}. The Arbiter speaks templates; tap RELOAD AI on the About screen to try again.`,
        );
      } catch { /* ignore */ }
      return;
    }
    set({ qwenStatus: 'downloading', qwenFraction: 0, qwenError: null });
    // ⚠⚠ OTA-1635 — SAY THAT THE LOAD STARTED, AND SAY IF IT NEVER ENDS. The
    // owner's 2026-09-03 session ran fifty minutes on template narration —
    // every Arbiter line `template (reason=qwen-not-ready)`, the trailer
    // `Model contexts Opened: 0 · Narration engine: idle` — and the log carried
    // NOT ONE qwen line. This function logs a failure and a cancellation and
    // nothing else, and the boot path's skip branches only console.warn. So the
    // log could not say whether the warm was skipped, started and hung, or
    // never released. Now the start is a line, and a load that has not settled
    // ninety seconds later is a line too — once, with the status it is stuck in.
    try { get().appendLog('debug', `qwen: loading (was ${current}) — the Arbiter speaks templates until it is ready`); } catch { /* ignore */ }
    const stallTimer = setTimeout(() => {
      const st = get().qwenStatus;
      if (st === 'downloading' || st === 'loading') {
        try {
          get().appendLog('debug', `qwen: ⚠ still ${st} after ${QWEN_LOAD_STALL_MS / 1000}s (fraction ${Math.round((get().qwenFraction ?? 0) * 100)}%) — the load has not settled; the Arbiter is still on templates`);
        } catch { /* ignore */ }
      }
    }, QWEN_LOAD_STALL_MS);
    try {
      await qwen.initialize({
        onProgress: (status, fraction) => {
          set({ qwenStatus: status, qwenFraction: fraction });
        },
      });
      // qwen.initialize() swallows errors and sets its own internal status to
      // 'failed' rather than throwing — mirror that onto the store.
      if (qwen.isReady()) {
        set({
          qwenStatus: 'ready',
          qwenFraction: 1,
          qwenError: null,
          qwenModelId: qwen.getModelId(),
        });
      } else if (qwen.getStatus() === 'failed') {
        const why = qwen.getLastError() ?? 'Qwen failed to initialize';
        set({ qwenStatus: 'failed', qwenError: why });
        // ⚠⚠ OTA-1182 — SAY IT IN THE LOG, NOT ONLY IN STATE. OTA-1181 put this reason in
        // the bug-report header, which requires the player to get far enough to send one.
        // The owner needs the game working on Apple for TestFlight testers, and a tester
        // who never files a report is the common case — but the log ships with any report,
        // including one about something else entirely. This is the single line that says
        // whether the narration engine is missing, out of memory, or out of disk.
        try { get().appendLog('debug', `qwen: LOAD FAILED — ${why}`); } catch { /* ignore */ }
      } else {
        // ⚠⚠ OTA-1405 — A CANCELLED LOAD IS NOT A FAILED ONE, and calling it one
        // cost the owner a wrong reading of his own log. From the 2026-08-20
        // capture: `qwen: LOAD FAILED — Qwen failed to initialize`, with no cause
        // attached, at 20:31:02. Nothing had failed. He had switched away from the
        // app mid-load, `dispose()` bumped the lifecycle generation, and
        // `runInitialize` did exactly what OTA-1084 built it to do: it threw the
        // straggler context away and left `status: 'idle'` with `lastError: null`.
        //
        // ⚠ THE TELL WAS RIGHT THERE AND WE READ PAST IT. `getLastError()` returned
        // null — the engine had no complaint to make — and this branch invented one
        // with `?? 'Qwen failed to initialize'`. **A default reason is a lie whenever
        // the absence of a reason is the actual information.** The made-up string
        // then read as a real diagnosis in the log and in the bug-report header.
        //
        // ⚠ AND IT STUCK THE STORE, which is the part the player feels. Writing
        // `qwenStatus: 'failed'` put "✗ AI LOAD FAILED — SEE BELOW" on the About
        // screen for a model that was merely parked, and left it there. `'idle'` is
        // both true and useful: App.tsx's settled-foreground re-warm calls bootQwen()
        // again, and its guard admits 'idle', so the load resumes on its own.
        const st = qwen.getStatus();
        set({ qwenStatus: 'idle', qwenFraction: 0, qwenError: null });
        try {
          get().appendLog('debug', `qwen: LOAD CANCELLED (status=${st}) — app moved on mid-load; will re-warm`);
        } catch { /* ignore */ }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ qwenStatus: 'failed', qwenError: message });
      // OTA-1182 — the throwing path says so too. `initialize()` mostly swallows, but a
      // missing native module throws outright, and that is the one answer that no OTA can
      // fix: it means llama.rn is not in the installed build.
      try { get().appendLog('debug', `qwen: LOAD THREW — ${message}`); } catch { /* ignore */ }
    }
    clearTimeout(stallTimer); // OTA-1635 — settled one way or the other; the line is only for a load that never does
    // OTA-223 — start the background dormancy watchdog after the
    // first successful boot. The watchdog polls every 60s; if Qwen
    // is dormant (status==='ready' but the native runtime is gone,
    // typically because Android OOM-killed it), it kicks
    // forceReinitialize() in the background so Qwen is warm by the
    // next time the player triggers narration or fusion. Idempotent —
    // starting twice replaces the timer cleanly.
    deps.startQwenWatchdog(get, set);
    // OTA-1172 — instruments alongside the watchdog: same lifecycle, same teardown rules.
    deps.startRuntimePressureWatch(get, set);
  },

  async shutdownQwen() {
    try {
      await qwen.dispose();
    } catch {
      // best effort
    }
    set({ qwenStatus: 'idle', qwenFraction: 0, partialArbiterText: null, isGenerating: false });
  },
});

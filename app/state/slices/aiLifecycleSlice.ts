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
    set({ qwenStatus: 'downloading', qwenFraction: 0, qwenError: null });
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
      } else {
        const why = qwen.getLastError() ?? 'Qwen failed to initialize';
        set({ qwenStatus: 'failed', qwenError: why });
        // ⚠⚠ OTA-1182 — SAY IT IN THE LOG, NOT ONLY IN STATE. OTA-1181 put this reason in
        // the bug-report header, which requires the player to get far enough to send one.
        // The owner needs the game working on Apple for TestFlight testers, and a tester
        // who never files a report is the common case — but the log ships with any report,
        // including one about something else entirely. This is the single line that says
        // whether the narration engine is missing, out of memory, or out of disk.
        try { get().appendLog('debug', `qwen: LOAD FAILED — ${why}`); } catch { /* ignore */ }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ qwenStatus: 'failed', qwenError: message });
      // OTA-1182 — the throwing path says so too. `initialize()` mostly swallows, but a
      // missing native module throws outright, and that is the one answer that no OTA can
      // fix: it means llama.rn is not in the installed build.
      try { get().appendLog('debug', `qwen: LOAD THREW — ${message}`); } catch { /* ignore */ }
    }
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

/**
 * The two on-device AI engines, as single shared instances — OTA-1393.
 *
 * ⚠⚠ WHY THEY LIVE HERE AND NOT IN gameStore.
 *
 * Both were constructed at module scope inside `gameStore.ts`, where they are
 * referenced 73 (`qwen`) and 28 (`cognitive`) times. That was fine while the
 * store was one file. It is the thing that blocks the store being more than one:
 * a slice cannot reach a value defined in gameStore without importing it back,
 * and gameStore already imports every slice. That cycle resolves to `undefined`
 * for whichever module the bundler reaches second — `qwen.isReady is not a
 * function`, on a device, in a path a one-sided unit test never runs.
 *
 * So they move DOWN to a leaf both sides import, the same answer
 * `app/state/saveLimits.ts` gave for `MAX_LOG_IN_MEMORY`. That is the general
 * rule for this whole segmentation: when a slice and the store share a value,
 * the value moves down to something neither of them owns — never sideways.
 *
 * ⚠⚠ WHY MOVING THEM IS SAFE, checked rather than assumed.
 *
 * Relocating a module-scope singleton changes WHEN it is constructed relative to
 * everything else. If either constructor did real work — started a download,
 * touched a native module, opened a session — that shift would change boot
 * behaviour on a device and show up as a crash report, not a red test.
 *
 * Neither does:
 *   • `QwenGenerativeEngine` has no constructor at all. Field initialisers only.
 *   • `CognitiveOrchestrator`'s constructor allocates four sub-objects —
 *     `ModelDownloader`, `SemanticEmbeddingService`, `EmotionInferenceEngine`,
 *     `IntentInferenceEngine`. All four were read: no I/O, no native calls, no
 *     timers. `SemanticEmbeddingService` builds a tokenizer and an LRU cache;
 *     the two inference engines store a threshold number.
 *
 * Every expensive thing is behind an explicit call — `cognitive.boot()`,
 * `qwen.initialize()` — which `slices/aiLifecycleSlice.ts` owns. Construction is
 * inert, so its timing carries no meaning and the move cannot change behaviour.
 *
 * ⚠ ONE INSTANCE EACH, AND THAT IS LOAD-BEARING. Both are stateful — a loaded
 * model, a native context, a download in progress. A second instance would mean
 * a second multi-hundred-MB model load on a phone whose signature crash is an
 * out-of-memory kill. Nothing outside gameStore ever constructed one (checked:
 * `new QwenGenerativeEngine` and `new CognitiveOrchestrator` appear nowhere
 * else in `app/`), and this file is now the only place that does.
 */
import { CognitiveOrchestrator } from './CognitiveOrchestrator';
import { QwenGenerativeEngine } from './generation/QwenGenerativeEngine';

/**
 * The MiniLM classifier — emotion / intent inference over player input.
 *
 * Module-level singleton: class instances don't belong in zustand state.
 */
export const cognitive = new CognitiveOrchestrator();

/**
 * The generative Arbiter narrator.
 *
 * Loaded lazily on demand; initialisation is slow (~hundreds of MB download on
 * first launch), so it sits on a separate boot path from the MiniLM classifier
 * above. Until it reports ready the narrative pipeline keeps using the authored
 * template pools — there is no degraded mode.
 */
export const qwen = new QwenGenerativeEngine();

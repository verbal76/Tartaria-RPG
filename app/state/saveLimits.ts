/**
 * Shared save/log limits — OTA-1392, the first piece of the gameStore split.
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL, for one constant.
 *
 * `MAX_LOG_IN_MEMORY` is used by the persist path (which moved out to
 * `slices/persistSlice.ts`) AND by eight places still inside `gameStore.ts`.
 * Leaving it in gameStore and importing it from the slice would make the two
 * files import each other — gameStore needs the slice to build the store, and
 * the slice would need gameStore for the constant. A value cycle like that
 * resolves to `undefined` at module-init time depending on which file the
 * bundler reaches first, and `gameLog.slice(-undefined)` returns the WHOLE log:
 * every save would carry the full in-memory history and grow without bound. It
 * would not throw. It would just quietly stop being capped.
 *
 * So the constant moves to a leaf both sides import. That is the general rule
 * for this whole segmentation: when a slice and the store share a value, the
 * value moves DOWN to something neither of them owns — never sideways.
 */

/**
 * How many log entries the in-memory buffer keeps, and therefore how many ride
 * along in a saved slot.
 *
 * 500 bounds the slot blob to ~150 KB of log, far under the AsyncStorage cursor
 * limit, while still giving generous on-screen scrollback.
 *
 * ⚠ The FULL history is unaffected. `COPY LOG` reads the dedicated on-disk log
 * key via `readFullLog()`, not this buffer — so capping here loses nothing for
 * diagnostics. That distinction is the reason this number can be small.
 */
export const MAX_LOG_IN_MEMORY = 500;

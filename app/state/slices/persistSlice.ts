/**
 * OTA-1392 — SLICE 1 OF THE gameStore SPLIT: the save-write path.
 *
 * `gameStore.ts` is 45,050 lines, 76 exports, imported by 473 files, and one
 * `create<GameStore>(...)` call accounts for roughly 28,000 of those lines. This
 * is the first piece taken out of it.
 *
 * ⚠⚠ WHY THIS PIECE FIRST, AND NOT A BIGGER ONE.
 *
 * Before cutting anything I measured what the save/system cluster actually
 * touches inside gameStore: 2,144 lines referencing 48 module-level symbols, 40
 * of them unexported — and **eight of those are mutable `let` variables**. That
 * is the fact that shapes this entire refactor:
 *
 *     You cannot assign to an imported binding from another module.
 *
 * `persistInFlight = null` inside a moved `persist()` is a compile error, not a
 * runtime surprise. So a slice cannot leave its mutable state behind, and it
 * must not steal state other code shares. The file does not cut along
 * "save / combat / items"; it cuts along WHO OWNS THE MUTABLE STATE.
 *
 * `persist()` is the one clean island in that cluster. Its four `let`s and four
 * constants are referenced by nothing else in gameStore — the only occurrences
 * outside this function were the declarations themselves. So it moves whole,
 * with its state, and nothing else in the file has to change.
 *
 * That smallness is the point. This slice proves the mechanism end to end — a
 * Zustand slice spread into the same store, the same `GameStore` shape, 473
 * importers untouched — on the one piece that cannot drag anything with it.
 * The larger clusters need shared state given homes first, and that is better
 * learned here than on two thousand lines.
 *
 * ⚠ WHAT DID NOT CHANGE: the function body is the same code, in the same order,
 * with the same comments. This commit moves it; it does not improve it. Mixing a
 * move with an edit is how a refactor becomes a bug hunt.
 */
import type { PlayerCharacter } from '../../engine/types';
import {
  saveSlot,
  getLastSaveWriteError,
  consumeSaveReclaimedFlag,
} from '../../engine/saveSystem';
import {
  trimSaveStateToFit,
  saveSizeBreakdown,
  pruneRegenerableRoomTables,
  SAFE_BLOB_CHARS,
} from '../../engine/saveTrim';
import { MAX_LOG_IN_MEMORY } from '../saveLimits';
/**
 * ⚠ OTA-1396 — IMPORTED DIRECTLY NOW, and that is a dependency this slice LOST.
 * `noteSaveKb` used to be handed in, because it lived in gameStore and a value
 * import back would have been a cycle. Slice 5 moved the runtime-pressure
 * instruments — and their save-size field with them — into a leaf under
 * `diagnostics/`, so it can simply be imported. The deps object shrank by one
 * without anything being redesigned, which is the point of moving shared things
 * DOWN rather than sideways: each move makes the next one smaller.
 */
import { noteSaveKb } from '../../diagnostics/runtimePressureWatch';

/**
 * ⚠ The store's own type, imported TYPE-ONLY and deliberately so. gameStore
 * imports this file to build the store; this file naming `GameStore` as a type
 * is erased at compile time, so no runtime cycle exists. Importing any VALUE
 * from gameStore here would create one — see the note in `saveLimits.ts` for
 * what that costs.
 */
import type { GameStore } from '../gameStore';

/** The slice's public surface — exactly the store keys this file owns. */
export interface PersistSlice {
  /** Write the active slot. Resolves `true` when the atomic save landed and
   *  verified, `false` when it was skipped (no slot / no player) or the write
   *  failed (truncated / storage full). Most callers fire-and-forget; the
   *  manual SAVE button awaits the result to report success honestly. */
  persist: () => Promise<boolean>;
}

// OTA-397 — save-size telemetry. persist() logs the per-part byte breakdown on
// failure, on a trim, AND every Nth persist as a heartbeat, so the slot blob's
// size is VISIBLE in the log as it grows (instead of only surfacing once it's
// already too big to save). Module-level so it counts across persist calls.
const PERSIST_SIZE_SAMPLE_EVERY = 10;
let persistSizeSampleCounter = 0;

// OTA-627 — persist concurrency guard. persist() is fired `void`-style from ~120
// call sites, and a single user action (e.g. crafting) can trip several in one
// tick. With no serialization, those concurrent saveSlot() writes raced on the 8
// rotating temp keys: each one's verify read back a DIFFERENT concurrent writer's
// bytes → "readback mismatch (got N vs M)" → emergencyReclaimDiskSpace() (a heavy
// getAllKeys + multiRemove) → retry → and the failures kept re-staging in a tight
// loop that hammered AsyncStorage hard enough to ANR the app (player report: app
// "dropped to desktop" after crafting Spark Strike). Serializing so only ONE write
// runs at a time means each stage verifies its OWN bytes (no concurrent writer),
// which removes the mismatch, the reclaim, and the storm. A burst of calls
// coalesces to the in-flight write plus at most ONE trailing write (which captures
// the latest state), so nothing is lost.
let persistInFlight: Promise<boolean> | null = null;
let persistTrailingQueued = false;

// OTA-440 — [audit #25] proactive save-size warning. trimSaveStateToFit only
// acts at 100% of SAFE_BLOB_CHARS (and silently sheds data); the player never
// learns their save is bloating until items start vanishing from the saved
// copy. We surface a single in-feed heads-up the first time the pre-trim blob
// crosses WARN fraction of the budget, with light hysteresis (re-arm once it
// falls back under CLEAR) so a genuine later regrowth can warn again.
const SAVE_SIZE_WARN_FRACTION = 0.70;
const SAVE_SIZE_CLEAR_FRACTION = 0.55;
let saveSizeWarnedThisSession = false;

/**
 * ⚠ TEST-ONLY RESET. The four `let`s above are module state, so they survive
 * between tests in one jest worker — a suite that trips the size warning would
 * otherwise silently suppress it for every suite after it in the same file.
 * Inside gameStore this state was equally sticky and equally unreachable; making
 * it resettable is the one capability this move adds, and it adds nothing to the
 * shipped app (nothing but tests calls it).
 */
export function _resetPersistStateForTest(): void {
  persistSizeSampleCounter = 0;
  persistInFlight = null;
  persistTrailingQueued = false;
  saveSizeWarnedThisSession = false;
}

/** ⚠ Read-only peek for tests, so an assertion about the guard does not have to
 *  reach into module scope or infer it from timing. */
export function _persistStateForTest(): {
  sampleCounter: number;
  inFlight: boolean;
  trailingQueued: boolean;
  sizeWarned: boolean;
} {
  return {
    sampleCounter: persistSizeSampleCounter,
    inFlight: persistInFlight !== null,
    trailingQueued: persistTrailingQueued,
    sizeWarned: saveSizeWarnedThisSession,
  };
}

/**
 * ⚠⚠ THE FUNCTION THAT IS HANDED IN RATHER THAN IMPORTED.
 *
 * (It was two until OTA-1396 — see the note on the `noteSaveKb` import above.)
 *
 * Both `makeRoomKey` and `noteSaveKb` are defined in `gameStore.ts` and both are
 * already exported — so importing them here would compile. It would also make
 * the two modules import each other as VALUES, and at module-init time whichever
 * one the bundler reaches second sees `undefined` for the other's bindings.
 * `makeRoomKey` would throw "is not a function" the first time a scene exists;
 * `noteSaveKb` the first time a save-size heartbeat fired. Both on a real
 * device, neither in a unit test that imports only one side.
 *
 * Passing them keeps the dependency strictly one-way — gameStore → slice — which
 * is the invariant this whole segmentation rests on. Each new slice may take
 * FROM the store; none may reach back into it.
 *
 * ⚠ Both are pure w.r.t. this file: `makeRoomKey` is a pure function of its
 * arguments, and `noteSaveKb` only stashes a number for the memory-pressure
 * reporter. Neither reads store state, so handing them over changes nothing
 * about when or how they run.
 */
export interface PersistSliceDeps {
  makeRoomKey: (
    locationId: string,
    microMicroId: string | null | undefined,
    mapX: number | null | undefined,
    mapY: number | null | undefined,
    hubRoomId?: string | null | undefined,
  ) => string;
}

export const createPersistSlice = (
  set: (
    partial:
      | Partial<GameStore>
      | ((state: GameStore) => Partial<GameStore> | GameStore),
  ) => void,
  get: () => GameStore,
  deps: PersistSliceDeps,
): PersistSlice => ({
  async persist() {
    // OTA-627 — coalescing guard (see persistInFlight note above). If a write is
    // already running, request ONE trailing write (to capture any state that
    // changes before it finishes) and return the in-flight promise instead of
    // starting a racing saveSlot() on the shared rotating temp keys.
    if (persistInFlight) {
      persistTrailingQueued = true;
      return persistInFlight;
    }
    const runPersistOnce = async (): Promise<boolean> => {
    const { player, worldMemory, gameLog, currentScreen, currentScene, activeSlotId, wastelandStepsSinceEncounter } = get();
    if (!activeSlotId) return false; // No active slot — nothing to write to.
    // CRITICAL: refuse to overwrite a save with player=null. This guards
    // against transient states (mid-load, mid-death-cleanup, mid-OTA-
    // reload) where activeSlotId is still set but player has been
    // cleared. Writing player=null silently here was a major source of
    // "save file is missing the character record" errors across updates.
    if (!player) return false;
    // OTA-368 — structural integrity guard. Beyond player=null, refuse to
    // overwrite a slot when the in-memory player is missing its core
    // identity (name / raceId / stats) — a sign of a half-constructed or
    // corrupt record (mid-migration, a backfill that produced a stub,
    // etc.). Writing such a record would blow out a good save on disk;
    // skipping leaves the last-good save intact. A real character always
    // has all three.
    if (!player.name || !player.raceId || !player.stats) {
      get().appendLog(
        'debug',
        `persist: skipped — player record missing core identity (name=${player.name ? '✓' : '∅'}, raceId=${player.raceId ? '✓' : '∅'}, stats=${player.stats ? '✓' : '∅'}); slot ${activeSlotId} left intact`,
      );
      return false;
    }
    // 2026-05-25 OTA-046 — stamp the player's lastSessionEndedAt at
    // every persist so a slot-load round trip can compute "real-time
    // since last play" for the while-you-were-away beat. persist
    // fires on every meaningful action, so this approximates session-
    // end well enough for the 6-hour bucket the load path tests for.
    // Update in-memory too so other code paths reading the field see
    // the fresh value without waiting for a reload.
    const stampNow = Date.now();
    const playerForSave: PlayerCharacter = { ...player, lastSessionEndedAt: stampNow };
    set((s) => (s.player ? { player: { ...s.player, lastSessionEndedAt: stampNow } } : s));
    // OTA-395/396 — slot-blob size guard. AsyncStorage reads a value back
    // through a SQLite cursor window; a blob over it returns truncated, the
    // staged save fails to verify, and progress silently stops saving.
    // trimSaveStateToFit sheds the cheapest-to-lose data (regenerable lore
    // tables → oldest rooms → old memos → the saved scene) ONLY when over budget,
    // so a normal-size save is unchanged. In-memory state is untouched.
    const builtState = {
      version: 1 as const,
      savedAt: stampNow,
      player: playerForSave,
      worldMemory,
      gameLog: gameLog.slice(-MAX_LOG_IN_MEMORY),
      currentScreen,
      // Snapshot the live scene so resume picks up exactly where the player left
      // off. Skipped only when currentScene is null (title / mid-load), and shed
      // by the trim's last resort when the blob is otherwise too big.
      currentScene: currentScene ?? undefined,
      // 2026-05-25 — persist the wasteland encounter step counter so a save-load
      // round trip can't reset it (cheese).
      wastelandStepsSinceEncounter,
    };
    // OTA-413 — PROACTIVELY drop regenerable per-room lore tables from every room
    // except the one the player is standing in, on EVERY save. visitedRooms's
    // roomInvestigationTable is the dominant grower (a playtest hit rooms=156 KB);
    // it re-seeds on demand and isn't anti-farm state, so pruning it keeps the
    // blob small instead of letting it creep toward the 800K trim / the save
    // self-heal. The current room's table is kept so an immediate resume reads the
    // same text. In-memory state is untouched (this only shapes the saved copy).
    const currentRoomKey = currentScene
      ? deps.makeRoomKey(playerForSave.currentLocationId, currentScene.microMicroId, playerForSave.mapX, playerForSave.mapY, playerForSave.hubRoomId)
      : null;
    const pruned = pruneRegenerableRoomTables(builtState, currentRoomKey);
    const trim = trimSaveStateToFit(pruned.state);
    if (trim.trimmed) {
      get().appendLog(
        'debug',
        `persist: trimmed to fit (${trim.charsBefore}→${trim.charsAfter} chars; -${trim.tablesStripped} room tables, -${trim.roomsDropped} rooms${trim.memosCapped ? ', capped memos' : ''}${trim.sceneDropped ? ', dropped scene' : ''})`,
      );
    }
    // OTA-440 — [audit #25] proactive save-size heads-up. Warn once when the
    // pre-trim blob crosses 70% of the budget, BEFORE the silent trim begins
    // shedding rooms/scene at 100%. Re-arm if it falls back under 55%.
    {
      const pct = trim.charsBefore / SAFE_BLOB_CHARS;
      if (pct >= SAVE_SIZE_WARN_FRACTION && !saveSizeWarnedThisSession) {
        saveSizeWarnedThisSession = true;
        get().appendLog(
          'system',
          `⚠ This character's save is getting large (${Math.round(pct * 100)}% of the safe size). The game auto-trims regenerable lore + old rooms to keep saving reliably, but consider scrapping or selling junk you don't need to keep your pack lean.`,
        );
      } else if (pct < SAVE_SIZE_CLEAR_FRACTION) {
        saveSizeWarnedThisSession = false;
      }
    }
    await saveSlot(activeSlotId, trim.state);
    // OTA-354 — persist health on-device, FAILURE-ONLY. saveSlot is atomic and
    // never throws; it records getLastSaveWriteError() on a failed write.
    const saveErr = getLastSaveWriteError();
    if (saveErr) {
      get().appendLog('debug', `persist: slot ${activeSlotId} FAILED — ${saveErr}`);
    }
    // OTA-406 — if saveSlot had to emergency-purge the on-disk copy-log to land
    // the save (a DB the pre-398 unbounded log had stuffed full), record that the
    // self-heal fired. OTA-415 — this goes on the DEBUG channel (diagnostic log
    // only), NOT a player-facing line: "storage was full / diagnostic log" is
    // dev-speak that shouldn't surface in the world feed. The save was rescued
    // silently; the log still captures that it happened for triage.
    if (consumeSaveReclaimedFlag()) {
      get().appendLog(
        'debug',
        'persist: emergency-purged the on-disk copy-log to free storage; save landed on retry (self-heal).',
      );
    }
    // OTA-396/397 — per-part byte breakdown so we never guess what's oversized.
    // Logged on a FAILED write, on a trim, AND as a periodic heartbeat so the
    // blob size is visible as it climbs toward the limit, not just at the cliff.
    persistSizeSampleCounter += 1;
    if (saveErr || trim.trimmed || persistSizeSampleCounter % PERSIST_SIZE_SAMPLE_EVERY === 0) {
      // OTA-413 — report the ACTUALLY-SAVED (pruned + trimmed) blob, not the raw
      // in-memory builtState, so the heartbeat reflects what landed on disk.
      const rpBreakdown = saveSizeBreakdown(trim.state);
      // OTA-1172 — bank the size so a memory-warning line can name it without rebuilding
      // the blob; allocating to measure while the OS asks for memory back is exactly the
      // wrong move.
      const rpKb = /total=(\d+)/.exec(rpBreakdown);
      if (rpKb) noteSaveKb(parseInt(rpKb[1]!, 10));
      get().appendLog('debug', rpBreakdown);
    }
    return !saveErr;
    };
    // Run serialized: one write at a time. Drain trailing requests that piled up
    // during the write, but collapse them — at most one extra write per quiescent
    // gap. The cap is a safety valve against a pathological infinite caller: after
    // it, release the lock and let the next call restart rather than livelock the
    // promise forever.
    persistInFlight = (async () => {
      let result = await runPersistOnce();
      let drained = 0;
      while (persistTrailingQueued && drained < 64) {
        persistTrailingQueued = false;
        drained += 1;
        result = await runPersistOnce();
      }
      return result;
    })();
    try {
      return await persistInFlight;
    } finally {
      persistInFlight = null;
    }
  },
});

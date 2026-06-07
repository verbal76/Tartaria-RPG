// arb38 — Save-load crash guard (sibling to mlHealth.ts).
//
// Player context: a tester who installed this build as an *update*
// over an older APK (rather than a clean reinstall) kept their old
// character's on-disk save. When they tapped that character on the
// title screen, the app closed instantly — every time — until they
// deleted the character, after which it opened perfectly. Diagnostic
// confirmed it was NOT an ML-init crash (ML healthy, crashCount 0,
// qwen:done): the app died *while loading the stale cross-version
// save* into the live engine.
//
// Why JS try/catch isn't enough: loadSlotIntoGame already wraps
// hydration in a try/catch that falls back to the title screen with
// a slotLoadError. That handles JavaScript exceptions. But a save
// shaped by an older build can drive newer code into a NATIVE abort
// (SIGSEGV / SIGABRT) — the process dies before any JS catch runs,
// so the player is stuck in an involuntary crash loop with no way
// out except uninstalling.
//
// Mechanism (identical philosophy to mlHealth's breadcrumb):
//   1. BEFORE loading a slot into the game, write
//      `loadInProgress = {slotId, at}` to AsyncStorage and AWAIT it
//      (so it is durably flushed before the risky hydration runs).
//   2. On the success path AND in the JS catch path, REMOVE the
//      breadcrumb — any JS-reachable exit clears it.
//   3. A native abort skips both, so the breadcrumb survives. ON THE
//      NEXT BOOT, loadSaveLoadHealth() sees a `loadInProgress` that
//      was never cleared and concludes "the slot we were loading
//      crashed the process." It bumps that slot's crash count and
//      clears the breadcrumb.
//
// What the count buys us: the title screen reads slotCrashCount()
// and, for a slot that crashed last time, intercepts the tap to show
// the EXISTING slot-load recovery modal (Retry / Refresh / Delete)
// BEFORE re-running the load — so the player gets a deliberate choice
// (most importantly, Delete) instead of an instant re-crash. One
// crash is enough to flag, because a stale-save native crash is
// deterministic: it will close the app every single time.
//
// A successful load (or deleting the slot) clears the flag, so a slot
// that loads cleanly after a retry stops being flagged.
//
// False-positive note: if the player force-kills the app DURING a
// legitimate load, the breadcrumb survives and the slot is flagged
// next boot. That is the safe direction — the player simply taps
// Retry and it loads, clearing the flag. We err toward offering an
// escape hatch, never toward hiding one.
//
// saveLoadHealthSummary() is wired into the bug-report / COPY-LOG
// output via app/diagnostics/aboutSummary.ts, so a tester's report
// shows which (if any) slot has been crashing on load and how often.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureCrashSaveFromDisk } from './crashSave';

const KEY_LOADING = 'tartaria.save.loadInProgress';
const KEY_CRASH_MAP = 'tartaria.save.crashSlots.v1';

interface SlotCrashRecord {
  count: number;
  lastAt: string;
}

type CrashMap = Record<string, SlotCrashRecord>;

interface SaveLoadHealthState {
  crashMap: CrashMap;
  /** Slot id detected as having crashed on THIS boot (informational
   *  for the summary line); null if no fresh crash was detected. */
  detectedThisBoot: string | null;
}

let cached: SaveLoadHealthState | null = null;

function parseCrashMap(raw: string | null): CrashMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as CrashMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function persistCrashMap(map: CrashMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_CRASH_MAP, JSON.stringify(map));
  } catch {
    // best-effort — flag stays in-memory and re-detects next launch
  }
}

/**
 * Read save-load health from AsyncStorage. Called once on boot
 * (from gameStore.hydrate), BEFORE any slot is loaded into the
 * game. If a previous session left a `loadInProgress` breadcrumb,
 * the slot it names crashed the process: we bump its crash count
 * and clear the breadcrumb. Subsequent calls return the cached
 * value without re-reading AsyncStorage.
 */
export async function loadSaveLoadHealth(): Promise<SaveLoadHealthState> {
  if (cached) return cached;

  let loadingRaw: string | null = null;
  let mapRaw: string | null = null;
  try {
    [loadingRaw, mapRaw] = await Promise.all([
      AsyncStorage.getItem(KEY_LOADING),
      AsyncStorage.getItem(KEY_CRASH_MAP),
    ]);
  } catch {
    // AsyncStorage failed — default to "all clean."
  }

  const crashMap = parseCrashMap(mapRaw);
  let detectedThisBoot: string | null = null;

  if (loadingRaw) {
    // A load was in progress and never completed → native crash.
    let slotId: string | null = null;
    try {
      const parsed = JSON.parse(loadingRaw) as { slotId?: string };
      slotId = typeof parsed?.slotId === 'string' ? parsed.slotId : null;
    } catch {
      // Older / corrupt breadcrumb — treat the raw value as the id.
      slotId = loadingRaw || null;
    }
    if (slotId) {
      const prev = crashMap[slotId];
      crashMap[slotId] = {
        count: (prev?.count ?? 0) + 1,
        lastAt: new Date().toISOString(),
      };
      detectedThisBoot = slotId;
      await persistCrashMap(crashMap);
      // OTA-343 — the breadcrumb survived ⇒ this slot crashed the
      // process while loading. Its on-disk bytes are STILL on disk
      // (the player is stuck, hasn't deleted it), so snapshot them now
      // into the crash-save buffer. The title screen's COPY CRASHED
      // SAVE button then exports the exact brick for repro — closing
      // the gap COPY SAVE can't reach (a save that bricks the app can
      // never be loaded, so it can never be COPY-SAVE'd).
      await captureCrashSaveFromDisk(slotId, 'slot-load-native-crash');
    }
    try {
      await AsyncStorage.removeItem(KEY_LOADING);
    } catch {
      // ignore — re-detected next boot if it lingers
    }
  }

  cached = { crashMap, detectedThisBoot };
  return cached;
}

/**
 * Call BEFORE loading a slot into the game. Writes (and awaits) a
 * breadcrumb that, if not followed by markSlotLoadDone before the
 * next launch, marks this slot as a load-crash on the next boot.
 */
export async function markSlotLoadStart(slotId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY_LOADING,
      JSON.stringify({ slotId, at: new Date().toISOString() }),
    );
  } catch {
    // best-effort — if the write fails we simply lose crash detection
    // for this one load attempt; the load itself proceeds normally.
  }
}

/**
 * Call when a slot load reaches any JS-observable conclusion —
 * success OR a caught error. Clears the in-progress breadcrumb so a
 * clean (or merely JS-failed) load is never mistaken for a crash.
 */
export async function markSlotLoadDone(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_LOADING);
  } catch {
    // ignore — best effort
  }
}

/** How many times this slot has crashed the app on load. 0 if never
 *  (or if health hasn't been loaded yet). Synchronous — reads the
 *  boot-populated cache. */
export function slotCrashCount(slotId: string): number {
  return cached?.crashMap[slotId]?.count ?? 0;
}

/** Ids of every slot currently flagged as a load-crash risk. */
export function getCrashedSlotIds(): string[] {
  if (!cached) return [];
  return Object.keys(cached.crashMap).filter(
    (id) => (cached!.crashMap[id]?.count ?? 0) > 0,
  );
}

/**
 * Clear a slot's crash flag. Called after a slot loads successfully
 * (it's healthy now) and after a slot is deleted (it's gone). Updates
 * both the cache and AsyncStorage; returns the remaining crashed-slot
 * ids so the caller can refresh UI state without a reboot.
 */
export async function clearSlotCrash(slotId: string): Promise<string[]> {
  if (cached && cached.crashMap[slotId]) {
    delete cached.crashMap[slotId];
    await persistCrashMap(cached.crashMap);
  } else if (!cached) {
    // Health not yet loaded (defensive) — clear straight on disk.
    let mapRaw: string | null = null;
    try {
      mapRaw = await AsyncStorage.getItem(KEY_CRASH_MAP);
    } catch {
      /* ignore */
    }
    const map = parseCrashMap(mapRaw);
    if (map[slotId]) {
      delete map[slotId];
      await persistCrashMap(map);
    }
  }
  return getCrashedSlotIds();
}

/**
 * Multi-line summary for the bug-report / COPY-LOG export. Wired in
 * via aboutSummary.ts so every shared report shows whether a save
 * has been crashing on load — the single most useful triage signal
 * for the "app closes when I open my character" class of report.
 */
export function saveLoadHealthSummary(): string {
  const map = cached?.crashMap ?? {};
  const ids = Object.keys(map).filter((id) => (map[id]?.count ?? 0) > 0);
  if (ids.length === 0) {
    return ['Save-load health', '  Status: clean (no load-crash flags)'].join('\n');
  }
  const lines = ['Save-load health', `  Flagged slots: ${ids.length}`];
  for (const id of ids) {
    const rec = map[id]!;
    lines.push(`  ${id}: ${rec.count} load-crash(es), last ${rec.lastAt}`);
  }
  if (cached?.detectedThisBoot) {
    lines.push(`  Detected crash on THIS boot: ${cached.detectedThisBoot}`);
  }
  return lines.join('\n');
}

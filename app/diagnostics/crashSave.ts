// OTA-343 — crash-save capture. Sibling to saveSnapshot.ts (COPY SAVE) and
// saveLoadHealth.ts (the load-crash flag).
//
// Player ask: *"we added a button to copy save files for logs, we need to
// make it so if we have a crash it copies the save file that crashed on the
// previous attempt so we can troubleshoot it."*
//
// Born from the OTA-338 brick: a corrupted save closed the app on ~90% of
// cold opens, and the only way out was deleting the character — which
// destroyed the exact fatal bytes before we could capture them. COPY SAVE
// (OTA-341) lets the player export a LOADABLE save, but a save that bricks
// the app can never be loaded, so COPY SAVE can't reach it. This module
// closes that gap: on a crash, it stashes the EXACT on-disk save bytes of
// the slot that crashed into a dedicated buffer, and the NEXT launch's title
// screen surfaces a COPY CRASHED SAVE button so the brick reaches us verbatim
// for repro through loadSlotIntoGame in a test.
//
// Two capture paths feed one buffer:
//   1. Native crash DURING slot load — detected on the next boot by
//      saveLoadHealth (the loadInProgress breadcrumb survived). It calls
//      captureCrashSaveFromDisk() with the slot it flagged. THE 338 case.
//   2. JS fatal / render crash mid-session — App.tsx's global ErrorUtils
//      handler, the hydrate-failure catch, and ScreenErrorBoundary call
//      captureActiveCrashSave(), which reads whichever slot is active.
//
// Every function is best-effort and NEVER throws — they run from crash
// handlers that must not double-fault.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACTIVE_SLOT_KEY, slotSaveKey } from '../engine/saveSystem';
import { buildSaveSnapshot, stampSaveExport } from './saveSnapshot';
import type { SaveState } from '../engine/types';

export const CRASH_SAVE_KEY = '@tartaria/lastCrashSave';

export interface CrashSaveCapture {
  /** Boot stage / crash origin tag (mirrors @tartaria/lastCrash's stage). */
  stage: string;
  /** Slot whose bytes were captured; null if no active slot was known. */
  slotId: string | null;
  /** The raw on-disk save string — captured VERBATIM so a corrupt
   *  (unparseable) save still reaches us exactly as it bricked. */
  raw: string | null;
  capturedAt: number;
}

async function writeCapture(capture: CrashSaveCapture): Promise<void> {
  try {
    await AsyncStorage.setItem(CRASH_SAVE_KEY, JSON.stringify(capture));
  } catch {
    /* swallow — crash capture must never crash */
  }
}

/** Capture the on-disk save bytes of a SPECIFIC slot — the slot
 *  saveLoadHealth flagged as having crashed the process on load.
 *  Best-effort; never throws. */
export async function captureCrashSaveFromDisk(slotId: string, stage: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(slotSaveKey(slotId));
    await writeCapture({ stage, slotId, raw, capturedAt: Date.now() });
  } catch {
    /* swallow */
  }
}

/** Capture the CURRENTLY-ACTIVE slot's on-disk save bytes — for a mid-session
 *  JS / render crash where the active slot is the one in play. No-op if no
 *  slot is active (e.g. a crash on the title screen with no character loaded).
 *  Best-effort; never throws. */
export async function captureActiveCrashSave(stage: string): Promise<void> {
  try {
    const slotId = await AsyncStorage.getItem(ACTIVE_SLOT_KEY);
    if (!slotId) return;
    const raw = await AsyncStorage.getItem(slotSaveKey(slotId));
    await writeCapture({ stage, slotId, raw, capturedAt: Date.now() });
  } catch {
    /* swallow */
  }
}

/** Read the captured crashed save, if any. Returns null when none exists or
 *  the buffer is unreadable. */
export async function loadCrashSave(): Promise<CrashSaveCapture | null> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CrashSaveCapture;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Clear the crashed-save buffer (after the player copies + dismisses it). */
export async function clearCrashSave(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Format the captured crashed-save bytes into a pasteable export, reusing the
 * COPY SAVE envelope (stampSaveExport) so the dev's existing triage flow
 * recognizes it. If the raw bytes parse, the HIGHLIGHTS block surfaces the
 * brick-suspect fields; if they DON'T (corrupt save — the whole reason this
 * exists), the raw bytes are emitted verbatim under a PARSE-FAILED marker so
 * the exact fatal state reaches us untouched.
 */
export function buildCrashSaveExport(capture: CrashSaveCapture, deviceSummary: string): string {
  const head = [
    '--- CRASHED SAVE (captured at crash time, previous attempt) ---',
    `stage: ${capture.stage} · slot: ${capture.slotId ?? '?'} · captured: ${new Date(capture.capturedAt).toISOString()}`,
  ].join('\n');

  if (!capture.raw) {
    return stampSaveExport(
      `${head}\n(no save bytes on disk for the crashing slot — the slot key was empty or already removed)`,
      deviceSummary,
    );
  }

  let parsed: SaveState | null = null;
  try {
    parsed = JSON.parse(capture.raw) as SaveState;
  } catch {
    parsed = null;
  }

  if (parsed && parsed.player) {
    const snapshot = buildSaveSnapshot(parsed.player, parsed.worldMemory);
    const body = `${head}\n(raw parsed OK — ${capture.raw.length} bytes)\n\n${snapshot}`;
    return stampSaveExport(body, deviceSummary, parsed.player.name);
  }

  // Corrupt / unparseable — THE brick case. Emit raw verbatim.
  const body = [
    head,
    `!!! RAW PARSE FAILED — corrupt save (${capture.raw.length} bytes). This is the brick we want; raw bytes follow verbatim:`,
    capture.raw,
  ].join('\n');
  return stampSaveExport(body, deviceSummary);
}

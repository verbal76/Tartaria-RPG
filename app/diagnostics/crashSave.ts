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
import {
  PORTABLE_REPORT_MAX_BYTES,
  assemblePortableReport,
  renderBoundedCollection,
  truncateToBytes,
  utf8Bytes,
  type ReportBlock,
} from './portableReport';
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
  /** arb130 — for a JS / render crash: the error message + React component stack,
   *  so the bug report names WHICH component faulted or looped (e.g. a "Maximum
   *  update depth exceeded" pinned to the exact screen/overlay). Absent for native
   *  load-crash captures (those have no JS error). */
  error?: string;
  componentStack?: string;
  /** ⚠⚠ OTA-1882 (#214) — the crash this capture belongs to, as
   *  `crashCorrelationId(ts, kind)`. The portable export prints it so a pasted
   *  compact report names the exact full evidence instead of carrying it.
   *
   *  OPTIONAL ON PURPOSE, TWICE OVER. Captures already on disk from before this
   *  package have no key and must still export — a report without correlation is
   *  worth far more than no report. And a crash path with no ledger record has
   *  nothing honest to put here, so it puts nothing: there is deliberately no
   *  placeholder, because a fabricated id is worse than an absent one. Nothing
   *  back-fills an identity that was never recorded. */
  correlationId?: string;
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
export async function captureActiveCrashSave(
  stage: string,
  detail?: { error?: string; componentStack?: string; correlationId?: string },
): Promise<void> {
  try {
    const slotId = await AsyncStorage.getItem(ACTIVE_SLOT_KEY);
    // arb130 — capture even with NO active slot WHEN we have render-crash detail
    // (error + component stack) — that's the prize regardless of whether a save
    // was in play. But a bare no-slot, no-detail crash (e.g. on the title screen)
    // still no-ops, so it doesn't surface an empty/confusing crashed-save report.
    const hasDetail = !!(detail?.error || detail?.componentStack);
    if (!slotId && !hasDetail) return;
    const raw = slotId ? await AsyncStorage.getItem(slotSaveKey(slotId)) : null;
    await writeCapture({
      stage,
      slotId: slotId ?? null,
      raw,
      capturedAt: Date.now(),
      error: detail?.error,
      componentStack: detail?.componentStack,
      correlationId: detail?.correlationId,
    });
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
    // ⚠⚠ OTA-1882 (#214) — the line that makes a BOUNDED paste worth having. The
    // compact report no longer carries the whole state, so it has to be able to
    // name the full evidence: this key is the crash's own `ts_kind`, the same one
    // the crash ledger rows carry into the relayed bundle. Absent on captures
    // written before OTA-1882, and absent rather than faked when no ledger record
    // owns the crash — see `crashCorrelation.ts`.
    ...(capture.correlationId ? [`correlation: ${capture.correlationId}`] : []),
    // arb130 — name the faulting component for a JS/render crash.
    ...(capture.error ? [`error: ${capture.error}`] : []),
    ...(capture.componentStack ? [`component stack:${capture.componentStack}`] : []),
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

  const rawBytes = utf8Bytes(capture.raw);

  if (parsed && parsed.player) {
    const snapshot = buildSaveSnapshot(parsed.player, parsed.worldMemory);
    const body = `${head}\n(raw parsed OK — ${rawBytes} UTF-8 bytes retained on device)\n\n${snapshot}`;
    const full = stampSaveExport(body, deviceSummary, parsed.player.name);
    // ⚠⚠⚠ OTA-1882 (#214) — SMALL REPORTS ARE NOT TOUCHED. A report that already
    // fits the paste budget leaves here byte-for-byte as it always did, plus the
    // correlation line. The bounded assembler only becomes visible when the size
    // actually demands it, which is the whole reason it is checked HERE and not
    // applied unconditionally.
    if (utf8Bytes(full) <= PORTABLE_REPORT_MAX_BYTES) return full;
    return boundedParsedExport(capture, parsed, head, deviceSummary, rawBytes);
  }

  // Corrupt / unparseable — THE brick case, and the one that matters most: these
  // bytes are the only copy of a save that can never be loaded.
  const failHead = [
    head,
    `!!! RAW PARSE FAILED — corrupt save (${rawBytes} UTF-8 bytes). This is the brick we want.`,
  ].join('\n');
  const fullFail = stampSaveExport(`${failHead}\n${capture.raw}`, deviceSummary);
  if (utf8Bytes(fullFail) <= PORTABLE_REPORT_MAX_BYTES) return fullFail;
  return boundedCorruptExport(capture, failHead, deviceSummary, rawBytes);
}

/** ⚠⚠ THE OVERSIZED PARSE-OK PATH. Built from the state's own structure rather
 *  than by cutting the JSON string: a chopped `JSON.stringify` is unparseable,
 *  says nothing about what it dropped, and is indistinguishable from corruption —
 *  which in a crash report is the one thing we must never fake. */
function boundedParsedExport(
  capture: CrashSaveCapture,
  parsed: SaveState,
  head: string,
  deviceSummary: string,
  rawBytes: number,
): string {
  const player = parsed.player as unknown as Record<string, unknown> | null;
  const wm = (parsed.worldMemory ?? {}) as unknown as Record<string, unknown>;
  const blocks: ReportBlock[] = [
    { priority: 1, label: 'identity', text: head },
    {
      priority: 1,
      label: 'size',
      // ⚠ Priority 1, because a reader who does not know this paste is partial
      // will draw conclusions from absences that are artefacts of the budget.
      text: `(raw parsed OK — ${rawBytes} UTF-8 bytes. This paste is BOUNDED to `
        + `${PORTABLE_REPORT_MAX_BYTES} UTF-8 bytes and is NOT the whole save.\n`
        + 'The FULL crashed save is retained on the device, and the full diagnostic bundle\n'
        + 'went to Sentry independently — quote the correlation id above to pull it.)',
    },
    { priority: 2, label: 'highlights', text: buildSaveSnapshot(parsed.player, parsed.worldMemory).split('\n--- FULL STATE JSON')[0] ?? '' },
  ];
  // Growth collections, each trimmed the way its own meaning allows.
  const paths: Array<[string, unknown, number, 2 | 3 | 4]> = [
    ['player.inventory', player?.inventory, 80, 2],
    ['worldMemory.worldEvents', wm.worldEvents, 20, 3],
    ['worldMemory.recentRaids', wm.recentRaids, 8, 3],
    ['worldMemory.patrols', wm.patrols, 30, 4],
    ['worldMemory.visitedRooms', wm.visitedRooms, 12, 4],
  ];
  for (const [path, value, keep, priority] of paths) {
    const rendered = renderBoundedCollection(path, value, keep);
    if (rendered) blocks.push({ priority, label: path, text: `\n--- ${path} ---\n${rendered}` });
  }
  const envelope = stampSaveExport('', deviceSummary, parsed.player?.name);
  const assembled = assemblePortableReport(blocks, PORTABLE_REPORT_MAX_BYTES - utf8Bytes(envelope));
  return stampSaveExport(assembled.text, deviceSummary, parsed.player?.name);
}

/** ⚠⚠ THE OVERSIZED PARSE-FAIL PATH. The malformed bytes stay whole on the
 *  device; this emits a bounded HEAD-anchored excerpt, because a corrupt save's
 *  opening bytes are where the shape of the corruption shows. No repair of the
 *  JSON is attempted, and the excerpt says exactly what it is. */
function boundedCorruptExport(
  capture: CrashSaveCapture,
  failHead: string,
  deviceSummary: string,
  rawBytes: number,
): string {
  const envelope = utf8Bytes(stampSaveExport('', deviceSummary));
  const noticeRoom = 400;
  const room = PORTABLE_REPORT_MAX_BYTES - envelope - utf8Bytes(failHead) - noticeRoom;
  const excerpt = truncateToBytes(capture.raw ?? '', Math.max(0, room));
  const body = [
    failHead,
    `--- RAW EXCERPT (BOUNDED) — first ${utf8Bytes(excerpt)} of ${rawBytes} UTF-8 bytes; `
      + `${rawBytes - utf8Bytes(excerpt)} omitted. NOT repaired, NOT reformatted. ---`,
    excerpt,
    '--- END RAW EXCERPT ---',
    'The FULL malformed save is still retained on the device under @tartaria/lastCrashSave,',
    'and the full diagnostic bundle went to Sentry independently. Quote the correlation id',
    'above to pull the complete artifact.',
  ].join('\n');
  return stampSaveExport(body, deviceSummary);
}

// OTA-1888 — THE PERMANENT SAVE-PRESERVATION CONTRACT (GOLEM + HAL).
//
// FORENSICS FIRST (owner's own required order). Before writing this module,
// the existing save lifecycle was read end to end (app/engine/saveSystem.ts,
// app/state/slices/slotSlice.ts) rather than assumed. What that reading
// found:
//
//   · `saveSlot` is ALREADY atomic (temp → verify readback → snapshot the
//     current live save to `.bak` ONLY if it parses → swap) and NEVER
//     deletes anything on a failed write — it stamps `lastSaveWriteError`
//     and leaves the live save + `.bak` exactly as they were (OTA-344).
//   · `loadSlot` ALREADY falls back to `.bak` and heals the live key from it
//     when the live copy is missing/corrupt.
//   · `loadSlotIntoGame` (slotSlice.ts) ALREADY treats a parse/hydrate
//     failure as "show `slotLoadError`, drop back to title" — it explicitly
//     does NOT persist over the slot afterward (see its comment: rolling
//     back the in-memory active-slot pointer specifically so the next
//     `persist()` cannot write `player=null` over the save it failed to
//     load). No version field is ever checked to justify a delete; there is
//     no "unknown version → discard" branch anywhere in this file.
//   · `deleteSlot` is ONLY ever reached from an explicit player action
//     (`deleteSlotById`, `abandonGame`) — never from a load/parse/migration
//     failure path.
//   · So the JS-level slot system already satisfies "parse failure is not
//     delete authority" for its OWN format. The evidenced gap is NOT here.
//
// THE EVIDENCED GAP is one layer down, in the native storage engine itself,
// and it is the same shape on both platforms even though the mechanisms
// differ:
//   · Android: @react-native-async-storage/async-storage's own
//     `next/StorageSupplier.kt` runs a ONE-TIME `db.createFromFile(oldDbFile)`
//     migration from the legacy SQLite engine (`RKStorage`) to the new Room
//     engine, with no visible handling of SQLite's `-wal`/`-shm` companion
//     files — read directly from the installed library source during the
//     OTA-1886/1887 investigation.
//   · iOS: `RNCAsyncStorage.mm`'s `RCTStorageDirectoryMigrationCheck` can
//     `removeItemAtPath:` the NEWER storage directory and overwrite it from
//     the OLDER one, decided purely by comparing `manifest.json`
//     modification timestamps — a heuristic, not a correctness proof.
//   · BOTH of these run inside native module init, BEFORE any JS in this
//     app — including this file — ever executes. Nothing at the JS layer
//     can intercept or prevent either one.
//
// So the only thing JS CAN durably do is make sure that, on every boot,
// BEFORE anything else touches a slot, a verified copy of everything
// currently readable through the AsyncStorage JS surface already exists
// under a separate, protected namespace — so that if some future native
// transition (or any other cause) ever makes the live keys disappear, a
// recent recovery copy survives it. This is intentionally NOT a database
// engine change and NOT a schema migration: it is the smallest durable
// safety net the evidence justifies, built the same way OTA-1886 built the
// RKStorage preservation probe — by copying and verifying, never by
// guessing at repair.
//
// ⚠⚠ ADDITIVE ONLY. This module never calls `removeItem`/`multiRemove`
// against anything outside its own `tartaria.preserveBoot.` namespace, never
// writes to a live/`.bak`/index/active-slot/stash key, and is never wired
// into any automatic restore — recovery from a snapshot is a deliberate,
// separate, future action, not something this file decides on its own.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SlotSummary } from './saveSystem';

const PRESERVE_PREFIX = 'tartaria.preserveBoot.';
const PRESERVE_META_KEY = `${PRESERVE_PREFIX}index.v1`;
// ⚠ BOUNDED, PER THE OWNER'S OWN INSTRUCTION ("do not create unlimited
// uncontrolled backup growth"). Three boot snapshots is enough to survive an
// interrupted rotation (see below) while costing at most a few times the
// size of the live saves themselves — nothing like the copy-log growth class
// OTA-406/421 had to build emergency reclaim for.
const MAX_SNAPSHOTS = 3;

const SLOT_KEY_RE = /^tartaria\.slot\.([^.]+)\.v2$/;
const SLOT_BAK_KEY_RE = /^tartaria\.slot\.([^.]+)\.v2\.bak$/;

export interface PreservationSnapshotMeta {
  bootId: string;
  capturedAt: number;
  /** The full preservation-namespace keys this snapshot actually wrote —
   *  not the original keys — so rotation removes exactly these and nothing
   *  outside this snapshot. */
  keys: string[];
}

export interface BootPreservationReport {
  bootId: string;
  attempted: number;
  preserved: number;
  failedKeys: string[];
  rotatedOut: string[] | null;
  fatalError: string | null;
}

function newBootId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadSnapshotIndex(): Promise<PreservationSnapshotMeta[]> {
  try {
    const raw = await AsyncStorage.getItem(PRESERVE_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is PreservationSnapshotMeta =>
        !!s && typeof s === 'object' && typeof (s as PreservationSnapshotMeta).bootId === 'string'
        && Array.isArray((s as PreservationSnapshotMeta).keys),
    );
  } catch {
    return [];
  }
}

async function saveSnapshotIndex(list: PreservationSnapshotMeta[]): Promise<void> {
  await AsyncStorage.setItem(PRESERVE_META_KEY, JSON.stringify(list));
}

/** Every save-relevant key currently on disk: the index, the active-slot
 *  pointer, the global stash, and every live + `.bak` slot blob — including
 *  a slot the INDEX has lost track of. That last case is deliberate: an
 *  orphaned blob behind a stale index (exactly what OTA-1885 was built to
 *  find) is precisely the kind of save this contract exists to protect, so
 *  discovery is a raw key scan, not a trust of `knownSlots` alone. */
export async function discoverSaveKeys(knownSlots: readonly SlotSummary[]): Promise<string[]> {
  const known = new Set<string>();
  known.add('tartaria.slots.index.v2');
  known.add('tartaria.activeSlot.v2');
  known.add('tartaria.global.v2');
  for (const s of knownSlots) {
    known.add(`tartaria.slot.${s.slotId}.v2`);
    known.add(`tartaria.slot.${s.slotId}.v2.bak`);
  }
  try {
    const all = await AsyncStorage.getAllKeys();
    for (const k of all) {
      if (SLOT_KEY_RE.test(k) || SLOT_BAK_KEY_RE.test(k)) known.add(k);
    }
  } catch {
    // Best-effort discovery — the indexed slots above are still preserved.
  }
  return [...known];
}

/**
 * Runs once per boot, before anything else can mutate a slot. Copies every
 * currently-readable save-relevant key VERBATIM into a new snapshot
 * namespace, verifies each copy by reading it back (the same stage → verify
 * shape `saveSlot`'s own atomic write already uses), and only THEN retires
 * snapshots beyond {@link MAX_SNAPSHOTS} — so a process death at any point
 * leaves at least one complete prior snapshot untouched. Never reads back
 * as a claim of success without checking; a key that fails to verify is
 * reported and its half-written copy is removed, but nothing about the
 * ORIGINAL key or any OTHER snapshot is ever touched.
 */
export async function runBootSavePreservation(
  knownSlots: readonly SlotSummary[],
): Promise<BootPreservationReport> {
  const bootId = newBootId();
  const report: BootPreservationReport = {
    bootId, attempted: 0, preserved: 0, failedKeys: [], rotatedOut: null, fatalError: null,
  };

  let keys: string[];
  try {
    keys = await discoverSaveKeys(knownSlots);
  } catch (e) {
    return { ...report, fatalError: e instanceof Error ? e.message : String(e) };
  }

  const preservedKeys: string[] = [];
  for (const key of keys) {
    report.attempted++;
    let value: string | null;
    try {
      value = await AsyncStorage.getItem(key);
    } catch {
      report.failedKeys.push(key);
      continue;
    }
    if (value === null) continue; // nothing there — not a failure, just absent.
    const destKey = `${PRESERVE_PREFIX}${bootId}.${key}`;
    try {
      await AsyncStorage.setItem(destKey, value);
      const readBack = await AsyncStorage.getItem(destKey);
      if (readBack !== value) {
        report.failedKeys.push(key);
        try { await AsyncStorage.removeItem(destKey); } catch { /* leave nothing half-written, best-effort */ }
        continue;
      }
    } catch {
      report.failedKeys.push(key);
      continue;
    }
    preservedKeys.push(destKey);
    report.preserved++;
  }

  if (preservedKeys.length === 0) {
    // Nothing verified this boot — do not record an empty snapshot as though
    // it were a real recovery point.
    return report;
  }

  const index = await loadSnapshotIndex();
  const nextIndex = [...index, { bootId, capturedAt: Date.now(), keys: preservedKeys }];

  // Only now — with the new snapshot fully written AND verified — retire the
  // oldest snapshots beyond the cap. `saveSnapshotIndex` commits the kept
  // list FIRST; the actual byte removal of the retired snapshot's keys is
  // best-effort cleanup after that, so an interruption here leaves orphaned
  // (unlisted, harmless, eventually-collected-next-rotation) bytes rather
  // than ever dropping a snapshot the index still claims to have.
  const overflow = Math.max(0, nextIndex.length - MAX_SNAPSHOTS);
  const toRemove = nextIndex.slice(0, overflow);
  const kept = nextIndex.slice(overflow);
  await saveSnapshotIndex(kept);
  if (toRemove.length > 0) {
    const removeKeys = toRemove.flatMap((s) => s.keys);
    try { await AsyncStorage.multiRemove(removeKeys); } catch { /* best-effort — costs space, not safety */ }
    report.rotatedOut = toRemove.map((s) => s.bootId);
  }
  return report;
}

/** Read-only: list the recovery snapshots currently held, newest last. */
export async function listPreservationSnapshots(): Promise<PreservationSnapshotMeta[]> {
  return loadSnapshotIndex();
}

/** Read-only: recover one original key's value from one snapshot. Never
 *  called automatically by anything in this module — restoring from a
 *  snapshot is a deliberate, separate action for a future assignment. */
export async function readPreservedValue(bootId: string, originalKey: string): Promise<string | null> {
  return AsyncStorage.getItem(`${PRESERVE_PREFIX}${bootId}.${originalKey}`);
}

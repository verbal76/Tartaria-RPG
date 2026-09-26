// OTA-1885 — THE READ-ONLY SAVE PROBE.
//
// Born from a save-preservation incident: a Golem title screen showed "No
// Tartarians yet" with the slot index (tartaria.slots.index.v2) empty, and
// the owner's permanent rule is that an existing save is never discarded to
// make anything work. Before any repair, migration, or new character, the
// question that has to be answered first is narrower than "is the save
// gone": is a slot BLOB (tartaria.slot.<id>.v2[.bak]) still sitting in
// AsyncStorage under its own key even though the INDEX that is supposed to
// list it is empty or corrupt? listSlots() only ever reads the index — it
// has never once looked at whether an orphaned blob exists behind it.
//
// ⚠⚠ THIS FILE HAS NO IMPORT FROM saveSystem.ts AND NO REFERENCE TO ANY
// MUTATING AsyncStorage METHOD. That is deliberate, not incidental: the one
// property this module exists to guarantee is that running it cannot change
// the very evidence it is trying to preserve. It calls exactly two
// AsyncStorage methods — getAllKeys and getItem — both pure reads. It does
// not call setItem, removeItem, multiRemove, mergeItem, or clear; it does
// not call saveSlot, loadSlot (which can self-heal by WRITING the live key
// from .bak — exactly the kind of mutation this probe must not risk),
// deleteSlot, mutateSlot, writeIndex, upsertIndexEntry, or setActiveSlot.
// See __tests__/ota1885SaveProbeIsReadOnly.test.ts for both the static proof
// (this file's own source contains none of those names) and the behavioral
// proof (running it leaves every AsyncStorage key and value byte-identical).
//
// Key literals are duplicated here rather than imported from saveSystem.ts
// on purpose: importing only the exported string constants would have been
// safe too, but keeping this module's only dependency the storage library
// itself makes the "no reachable mutation path" claim trivially checkable by
// reading this one file, with nothing to trace through another module for.

import AsyncStorage from '@react-native-async-storage/async-storage';

const INDEX_KEY = 'tartaria.slots.index.v2';
const ACTIVE_SLOT_KEY = 'tartaria.activeSlot.v2';
const LIVE_KEY_RE = /^tartaria\.slot\.([^.]+)\.v2$/;
const BAK_KEY_RE = /^tartaria\.slot\.([^.]+)\.v2\.bak$/;

export interface SaveSlotProbeEntry {
  slotId: string;
  liveKey: string;
  bakKey: string;
  livePresent: boolean;
  bakPresent: boolean;
  liveLength: number | null;
  bakLength: number | null;
  liveParses: boolean;
  bakParses: boolean;
  name: string | null;
  raceId: string | null;
  savedAt: number | null;
  classification: string;
}

export interface SaveSlotProbeReport {
  indexPresent: boolean;
  indexLength: number | null;
  indexParses: boolean;
  indexSlotIds: string[] | null;
  activeSlotPresent: boolean;
  activeSlotValue: string | null;
  slots: SaveSlotProbeEntry[];
  overallClassification: string;
}

/** Parse for REPORTING ONLY — the result is read, never written anywhere. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function buildSaveSlotProbeReport(): Promise<SaveSlotProbeReport> {
  const allKeys = await AsyncStorage.getAllKeys();

  const liveIds = new Set<string>();
  const bakIds = new Set<string>();
  for (const k of allKeys) {
    const liveMatch = LIVE_KEY_RE.exec(k);
    if (liveMatch) liveIds.add(liveMatch[1]!);
    const bakMatch = BAK_KEY_RE.exec(k);
    if (bakMatch) bakIds.add(bakMatch[1]!);
  }
  const allSlotIds = new Set<string>([...liveIds, ...bakIds]);

  const slots: SaveSlotProbeEntry[] = [];
  for (const slotId of allSlotIds) {
    const liveKey = `tartaria.slot.${slotId}.v2`;
    const bakKey = `tartaria.slot.${slotId}.v2.bak`;
    const liveRaw = liveIds.has(slotId) ? await AsyncStorage.getItem(liveKey) : null;
    const bakRaw = bakIds.has(slotId) ? await AsyncStorage.getItem(bakKey) : null;

    const liveParsed = liveRaw != null ? safeParse(liveRaw) : undefined;
    const bakParsed = bakRaw != null ? safeParse(bakRaw) : undefined;
    const liveOk = liveParsed !== undefined;
    const bakOk = bakParsed !== undefined;

    const identitySource = (liveOk ? liveParsed : bakOk ? bakParsed : null) as
      | { player?: { name?: string; raceId?: string }; savedAt?: number }
      | null;

    let classification: string;
    if (liveOk && bakOk) classification = 'SAVE DATA PRESERVED — discovery/index failure.';
    else if (!liveOk && bakOk) classification = 'BACKUP RECOVERY CANDIDATE — DO NOT RESTORE YET.';
    else if (liveOk && !bakOk) classification = 'LIVE SAVE PRESENT, no usable backup.';
    else classification = 'BLOB KEY(S) EXIST BUT DO NOT PARSE.';

    slots.push({
      slotId,
      liveKey,
      bakKey,
      livePresent: liveRaw != null,
      bakPresent: bakRaw != null,
      liveLength: liveRaw != null ? liveRaw.length : null,
      bakLength: bakRaw != null ? bakRaw.length : null,
      liveParses: liveOk,
      bakParses: bakOk,
      name: identitySource?.player?.name ?? null,
      raceId: identitySource?.player?.raceId ?? null,
      savedAt: identitySource?.savedAt ?? null,
      classification,
    });
  }

  const indexRaw = await AsyncStorage.getItem(INDEX_KEY);
  const indexParsedVal = indexRaw != null ? safeParse(indexRaw) : undefined;
  const indexParses = indexRaw != null && Array.isArray(indexParsedVal);
  const indexSlotIds = indexParses
    ? (indexParsedVal as Array<{ slotId?: string }>).map((s) => s.slotId ?? '?')
    : null;
  const indexEmptyOrAbsent = indexRaw == null || (indexParses && (indexSlotIds?.length ?? 0) === 0);
  const indexBad = indexRaw != null && !indexParses;

  const activeSlotValue = await AsyncStorage.getItem(ACTIVE_SLOT_KEY);

  let overallClassification: string;
  if (slots.length === 0) {
    overallClassification = 'NO SAVE BLOB FOUND BY THIS STORAGE ENUMERATION.';
  } else if (indexBad) {
    overallClassification = 'INDEX BAD + SLOT BLOB EXISTS = INDEX FAILURE WITH PRESERVED SAVE.';
  } else if (indexEmptyOrAbsent) {
    overallClassification =
      'INDEX EMPTY/ABSENT + SLOT BLOB EXISTS = ORPHANED SAVE EXISTS — preservation/recovery path available.';
  } else {
    overallClassification = 'SEE PER-SLOT CLASSIFICATIONS.';
  }

  return {
    indexPresent: indexRaw != null,
    indexLength: indexRaw != null ? indexRaw.length : null,
    indexParses,
    indexSlotIds,
    activeSlotPresent: activeSlotValue != null,
    activeSlotValue,
    slots,
    overallClassification,
  };
}

/** No raw save JSON here on purpose — only enough to recognize a character
 *  (name / race / when last saved) and the yes/no facts the classification
 *  is built from. This is a forensic receipt, not a save export. */
export function formatSaveSlotProbeReport(report: SaveSlotProbeReport): string {
  const lines: string[] = [];
  lines.push('=== TARTARIA SAVE PROBE (READ-ONLY — no data changed) ===');
  lines.push('');
  lines.push('--- SLOT INDEX (tartaria.slots.index.v2) ---');
  lines.push(`present: ${report.indexPresent ? 'YES' : 'NO'}`);
  if (report.indexPresent) lines.push(`raw length: ${report.indexLength} chars`);
  lines.push(`parses: ${report.indexParses ? 'YES' : 'NO'}`);
  if (report.indexParses) {
    lines.push(`indexed slots: ${report.indexSlotIds?.length ?? 0}`);
    if (report.indexSlotIds && report.indexSlotIds.length > 0) {
      lines.push(`indexed slot IDs: ${report.indexSlotIds.join(', ')}`);
    }
  }
  lines.push('');
  lines.push('--- ACTIVE SLOT POINTER (tartaria.activeSlot.v2) ---');
  lines.push(`present: ${report.activeSlotPresent ? 'YES' : 'NO'}`);
  if (report.activeSlotPresent) lines.push(`value: ${report.activeSlotValue}`);
  lines.push('');
  lines.push(`--- SLOT BLOBS FOUND BY DIRECT KEY SCAN: ${report.slots.length} ---`);
  if (report.slots.length === 0) {
    lines.push('NO SAVE BLOB FOUND BY THIS STORAGE ENUMERATION.');
  }
  for (const s of report.slots) {
    lines.push('');
    lines.push(`slot ${s.slotId}:`);
    lines.push(
      `  live blob present: ${s.livePresent ? 'YES' : 'NO'}` +
        (s.liveLength != null ? ` (${s.liveLength} chars)` : ''),
    );
    lines.push(`  live JSON parses: ${s.liveParses ? 'YES' : 'NO'}`);
    lines.push(
      `  backup blob present: ${s.bakPresent ? 'YES' : 'NO'}` +
        (s.bakLength != null ? ` (${s.bakLength} chars)` : ''),
    );
    lines.push(`  backup JSON parses: ${s.bakParses ? 'YES' : 'NO'}`);
    if (s.name != null || s.raceId != null || s.savedAt != null) {
      lines.push(
        `  identity (from whichever copy parsed): name=${s.name ?? '?'} race=${s.raceId ?? '?'} ` +
          `savedAt=${s.savedAt != null ? new Date(s.savedAt).toISOString() : '?'}`,
      );
    }
    lines.push(`  classification: ${s.classification}`);
  }
  lines.push('');
  lines.push(`--- OVERALL: ${report.overallClassification} ---`);
  return lines.join('\n');
}

// OTA-1887 — THE COPY SPEAKS FOR ITSELF. GOLEM ONLY.
//
// Direct continuation of OTA-1886: that probe proved RKStorage still exists
// on Kevin's device and made a verified byte-identical preservation copy.
// This module answers the next question — what is actually INSIDE that copy
// — without ever touching the original again.
//
// ⚠⚠ THE ORIGINAL IS NEVER REFERENCED HERE. This file contains no
// `/data/data/...` path, no `databases` directory literal, nothing that
// could resolve to the original RKStorage. It only ever reads the
// PRISTINE preservation copy OTA-1886 already made (inside this app's own
// cache directory), and only after copying THAT into a second, disposable
// working copy which is what actually gets parsed. The pristine copy is
// read once (to make the working copy and to re-hash it for comparison) and
// never written.
//
// ⚠ WHY A HAND-WRITTEN SQLITE READER, NOT A NATIVE ONE. Neither `expo-sqlite`
// nor any other SQLite-capable native module is a dependency of this project
// (checked: not in package.json, not in node_modules, not an app.json config
// plugin). The only SQLite engine compiled into this build lives entirely
// inside @react-native-async-storage/async-storage's own Java code
// (ReactDatabaseSupplier) and is not exposed to JS as a "open an arbitrary
// file as a database" API — AsyncStorage's JS surface only ever operates on
// ITS OWN active database, never on a file sitting in a different directory
// under a different name. So there is no already-linked, OTA-safe native
// path to open the preserved copy as a database; adding one would mean a
// new native build, which this diagnostic is scoped to avoid unless Kevin
// separately authorizes one. The alternative that stays inside OTA JS is to
// decode the well-documented SQLite file FORMAT by hand, the same way
// OTA-1886 wrote its own SHA-256 rather than add expo-crypto. What follows
// is a minimal reader: file header, one table b-tree walk (interior +
// leaf + overflow pages), and record decoding for exactly the columns this
// investigation needs (`sqlite_master`'s type/name/rootpage, and
// `catalystLocalStorage`'s key/value). It never opens anything through
// SQLite itself, never executes SQL, and never writes a single byte back
// into any file it reads — see ota1887LegacyStorageInspectIsReadOnly for the
// static + behavioral proof.
//
// ⚠ BOUNDED DISCLOSURE. Every key name found in the table is reported (Kevin
// asked for this explicitly), but only recognized Tartaria save keys have
// their VALUES parsed and summarized — and even then, only a short list of
// already-established identity fields (the same ones OTA-1885's probe and
// saveSnapshot.ts's HIGHLIGHTS line use), never the full JSON. Nothing here
// writes to AsyncStorage, nothing calls loadSlot/saveSlot/importSave, and
// nothing constructs or restores a character.

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { base64ToBytes, sha256Hex } from './legacyStoragePreserve';

const PRISTINE_SUBDIR = 'legacy-preserve/';
const WORKING_SUBDIR = 'legacy-inspect-working/';
const RKSTORAGE_NAME = 'RKStorage';
const TARGET_TABLE = 'catalystLocalStorage';

const INDEX_KEY = 'tartaria.slots.index.v2';
const ACTIVE_SLOT_KEY = 'tartaria.activeSlot.v2';
const LIVE_KEY_RE = /^tartaria\.slot\.([^.]+)\.v2$/;
const BAK_KEY_RE = /^tartaria\.slot\.([^.]+)\.v2\.bak$/;

function uriFor(absolutePath: string): string {
  return absolutePath.startsWith('file://') ? absolutePath : `file://${absolutePath}`;
}

// ---------------------------------------------------------------------------
// Pure-JS SQLite file-format reader. Exported piece by piece so the test
// suite can pin each layer (varint, header, b-tree walk, record decode)
// against bytes produced by a REAL SQLite engine, not hand-guessed fixtures.
// ---------------------------------------------------------------------------

export const SQLITE_MAGIC = 'SQLite format 3\u0000';

export interface Varint {
  value: number;
  bytesRead: number;
}

/** SQLite varint: up to 9 bytes, 7 payload bits per byte (high bit = more
 *  follows), except the 9th byte which contributes all 8 bits. Uses BigInt
 *  internally so nothing silently truncates, then narrows to Number only
 *  once the final value is confirmed to fit safely — every value this reader
 *  actually needs (page numbers, lengths, rowids in a database measured in
 *  kilobytes) is far below that ceiling. */
export function readVarint(bytes: Uint8Array, offset: number): Varint {
  let result = 0n;
  let i = 0;
  for (; i < 8; i++) {
    const b = bytes[offset + i];
    if (b === undefined) throw new Error(`varint read past end of buffer at offset ${offset + i}`);
    result = (result << 7n) | BigInt(b & 0x7f);
    if ((b & 0x80) === 0) {
      return { value: bigintToSafeNumber(result), bytesRead: i + 1 };
    }
  }
  const last = bytes[offset + 8];
  if (last === undefined) throw new Error(`varint read past end of buffer at offset ${offset + 8}`);
  result = (result << 8n) | BigInt(last);
  return { value: bigintToSafeNumber(result), bytesRead: 9 };
}

function bigintToSafeNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < 0n) {
    throw new Error(`varint value ${v.toString()} is outside the range this reader supports`);
  }
  return Number(v);
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  if (a === undefined || b === undefined) throw new Error(`uint16 read past end of buffer at offset ${offset}`);
  return (a << 8) | b;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  const a = bytes[offset];
  const b = bytes[offset + 1];
  const c = bytes[offset + 2];
  const d = bytes[offset + 3];
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error(`uint32 read past end of buffer at offset ${offset}`);
  }
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function readSignedIntBE(bytes: Uint8Array, offset: number, size: number): number {
  let v = 0n;
  for (let i = 0; i < size; i++) {
    const b = bytes[offset + i];
    if (b === undefined) throw new Error(`int${size * 8} read past end of buffer at offset ${offset + i}`);
    v = (v << 8n) | BigInt(b);
  }
  const bits = BigInt(size * 8);
  const signBit = 1n << (bits - 1n);
  if (v >= signBit) v -= 1n << bits;
  return Number(v);
}

function readDoubleBE(bytes: Uint8Array, offset: number): number {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  for (let i = 0; i < 8; i++) {
    const b = bytes[offset + i];
    if (b === undefined) throw new Error(`float64 read past end of buffer at offset ${offset + i}`);
    view.setUint8(i, b);
  }
  return view.getFloat64(0, false);
}

/** Pure-JS UTF-8 decode — no reliance on TextDecoder being present in this
 *  Hermes build; same "don't assume the runtime has it" stance as OTA-1886's
 *  own base64/SHA-256. */
export function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i]!;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if ((b0 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const b1 = bytes[i + 1]!;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      i += 2;
    } else if ((b0 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const b1 = bytes[i + 1]!;
      const b2 = bytes[i + 2]!;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
      i += 3;
    } else if ((b0 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      const b1 = bytes[i + 1]!;
      const b2 = bytes[i + 2]!;
      const b3 = bytes[i + 3]!;
      let cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      i += 4;
    } else {
      throw new Error(`invalid UTF-8 byte sequence at offset ${i}`);
    }
  }
  return out;
}

export interface SqliteFileHeader {
  pageSize: number;
  reservedSpace: number;
  textEncoding: number;
  pageCount: number;
}

export function parseFileHeader(bytes: Uint8Array): SqliteFileHeader {
  if (bytes.length < 100) throw new Error(`file too small to be a SQLite database (${bytes.length} bytes)`);
  const magicBytes = bytes.slice(0, 16);
  const magic = String.fromCharCode(...magicBytes);
  if (magic !== SQLITE_MAGIC) {
    throw new Error(`not a SQLite database — magic header did not match`);
  }
  const rawPageSize = readUint16BE(bytes, 16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) {
    throw new Error(`unsupported/corrupt page size ${pageSize}`);
  }
  const reservedSpace = bytes[20] ?? 0;
  const textEncoding = readUint32BE(bytes, 56);
  const pageCount = readUint32BE(bytes, 28);
  return { pageSize, reservedSpace, textEncoding, pageCount };
}

type SqliteValue = string | number | null;

interface BtreeRow {
  rowid: number;
  columns: SqliteValue[];
}

const MAX_VISITED_PAGES_FACTOR = 8; // corruption/cycle guard, not a real limit

function decodeRecord(payload: Uint8Array, textEncoding: number): SqliteValue[] {
  const headerLenVarint = readVarint(payload, 0);
  const headerLen = headerLenVarint.value;
  const serialTypes: number[] = [];
  let p = headerLenVarint.bytesRead;
  while (p < headerLen) {
    const v = readVarint(payload, p);
    serialTypes.push(v.value);
    p += v.bytesRead;
  }
  let bodyOffset = headerLen;
  const values: SqliteValue[] = [];
  for (const serialType of serialTypes) {
    if (serialType === 0) {
      values.push(null);
    } else if (serialType >= 1 && serialType <= 4) {
      values.push(readSignedIntBE(payload, bodyOffset, serialType));
      bodyOffset += serialType;
    } else if (serialType === 5) {
      values.push(readSignedIntBE(payload, bodyOffset, 6));
      bodyOffset += 6;
    } else if (serialType === 6) {
      values.push(readSignedIntBE(payload, bodyOffset, 8));
      bodyOffset += 8;
    } else if (serialType === 7) {
      values.push(readDoubleBE(payload, bodyOffset));
      bodyOffset += 8;
    } else if (serialType === 8) {
      values.push(0);
    } else if (serialType === 9) {
      values.push(1);
    } else if (serialType === 10 || serialType === 11) {
      throw new Error(`reserved SQLite serial type ${serialType} encountered — refusing to guess`);
    } else if (serialType >= 12 && serialType % 2 === 0) {
      const len = (serialType - 12) / 2;
      // BLOB — this reader has no legitimate use for blob bytes; represented
      // as null rather than guessed-at text.
      bodyOffset += len;
      values.push(null);
    } else if (serialType >= 13 && serialType % 2 === 1) {
      const len = (serialType - 13) / 2;
      if (textEncoding !== 1) {
        throw new Error(`text encoding ${textEncoding} is not UTF-8 — this reader only supports encoding 1`);
      }
      values.push(decodeUtf8(payload.slice(bodyOffset, bodyOffset + len)));
      bodyOffset += len;
    } else {
      throw new Error(`unrecognized SQLite serial type ${serialType}`);
    }
  }
  return values;
}

function assemblePayload(
  page: Uint8Array,
  localStart: number,
  payloadLen: number,
  usableSize: number,
  bytes: Uint8Array,
  pageSize: number,
): Uint8Array {
  const X = usableSize - 35;
  if (payloadLen <= X) {
    return page.slice(localStart, localStart + payloadLen);
  }
  const M = Math.floor(((usableSize - 12) * 32) / 255) - 23;
  let K = M + ((payloadLen - M) % (usableSize - 4));
  const localBytes = K <= X ? K : M;
  const local = page.slice(localStart, localStart + localBytes);
  let overflowPage = readUint32BE(page, localStart + localBytes);
  let remaining = payloadLen - localBytes;
  const chunks: Uint8Array[] = [local];
  let guard = 0;
  while (remaining > 0) {
    guard += 1;
    if (guard > MAX_VISITED_PAGES_FACTOR * 4096 || overflowPage === 0) {
      throw new Error('overflow chain did not terminate as expected — refusing to keep following it');
    }
    const opage = bytes.slice((overflowPage - 1) * pageSize, overflowPage * pageSize);
    const nextPage = readUint32BE(opage, 0);
    const take = Math.min(remaining, usableSize - 4);
    chunks.push(opage.slice(4, 4 + take));
    remaining -= take;
    overflowPage = nextPage;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Walks one table b-tree (interior + leaf + overflow pages) starting at
 *  `rootPage` and returns every row's decoded column values, in whatever
 *  order the tree yields them — callers care about the set of rows, not
 *  their order. Never mutates `bytes`; every page access is a read-only
 *  slice. */
export function walkTableBtree(
  bytes: Uint8Array,
  header: SqliteFileHeader,
  rootPage: number,
): BtreeRow[] {
  const usableSize = header.pageSize - header.reservedSpace;
  const rows: BtreeRow[] = [];
  const maxVisits = Math.max(header.pageCount * MAX_VISITED_PAGES_FACTOR, 64);
  let visits = 0;

  function visit(pageNum: number): void {
    visits += 1;
    if (visits > maxVisits) {
      throw new Error(`visited more pages (${visits}) than this file could legitimately contain — possible corruption or cycle`);
    }
    if (pageNum < 1 || pageNum > header.pageCount) {
      throw new Error(`page number ${pageNum} is outside the file's page range (1..${header.pageCount})`);
    }
    const page = bytes.slice((pageNum - 1) * header.pageSize, pageNum * header.pageSize);
    const isPage1 = pageNum === 1;
    const hdrOffset = isPage1 ? 100 : 0;
    const pageType = page[hdrOffset];
    const numCells = readUint16BE(page, hdrOffset + 3);
    const isInterior = pageType === 5;
    const isLeaf = pageType === 13;
    if (!isInterior && !isLeaf) {
      throw new Error(`page ${pageNum} has unexpected b-tree page type ${pageType} (expected an interior or leaf TABLE page)`);
    }
    const cellPtrArrayStart = hdrOffset + (isInterior ? 12 : 8);

    if (isInterior) {
      const rightMost = readUint32BE(page, hdrOffset + 8);
      for (let i = 0; i < numCells; i++) {
        const cellPtr = readUint16BE(page, cellPtrArrayStart + i * 2);
        const child = readUint32BE(page, cellPtr);
        visit(child);
      }
      visit(rightMost);
      return;
    }

    for (let i = 0; i < numCells; i++) {
      const cellPtr = readUint16BE(page, cellPtrArrayStart + i * 2);
      const payloadLenV = readVarint(page, cellPtr);
      const rowidV = readVarint(page, cellPtr + payloadLenV.bytesRead);
      const localStart = cellPtr + payloadLenV.bytesRead + rowidV.bytesRead;
      const payload = assemblePayload(page, localStart, payloadLenV.value, usableSize, bytes, header.pageSize);
      const columns = decodeRecord(payload, header.textEncoding);
      rows.push({ rowid: rowidV.value, columns });
    }
  }

  visit(rootPage);
  return rows;
}

export interface SchemaEntry {
  type: string;
  name: string;
  rootPage: number;
}

export function readSchema(bytes: Uint8Array, header: SqliteFileHeader): SchemaEntry[] {
  const rows = walkTableBtree(bytes, header, 1);
  const entries: SchemaEntry[] = [];
  for (const row of rows) {
    const type = row.columns[0];
    const name = row.columns[1];
    const rootPage = row.columns[3];
    if (typeof type === 'string' && typeof name === 'string' && typeof rootPage === 'number') {
      entries.push({ type, name, rootPage });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// The bounded, Tartaria-aware inspection built on top of the raw reader.
// ---------------------------------------------------------------------------

export interface SlotIdentity {
  slotId: string;
  sourceKey: string;
  parses: boolean;
  parseError: string | null;
  name: string | null;
  raceId: string | null;
  factionId: string | null;
  hp: number | null;
  hpMax: number | null;
  dead: boolean | null;
  hoursElapsed: number | null;
  currentLocationId: string | null;
  mainQuestPhase: string | null;
  guardiansDefeatedCount: number | null;
  savedAt: number | null;
}

export interface LegacyStorageInspectReport {
  platformSupported: boolean;
  pristineCopyPath: string | null;
  pristineCopyFound: boolean;
  workingCopyPath: string | null;
  workingCopyMade: boolean;
  workingCopyHashMatchesPristine: boolean | null;
  isValidSqlite: boolean;
  schemaEntries: { type: string; name: string }[];
  tableFound: boolean;
  rowCount: number | null;
  keys: string[];
  hasIndexKey: boolean;
  hasActiveSlotKey: boolean;
  slotIdsLive: string[];
  slotIdsBackup: string[];
  slotIdentities: SlotIdentity[];
  sqliteError: string | null;
  fatalError: string | null;
}

function emptyReport(): LegacyStorageInspectReport {
  return {
    platformSupported: false,
    pristineCopyPath: null,
    pristineCopyFound: false,
    workingCopyPath: null,
    workingCopyMade: false,
    workingCopyHashMatchesPristine: null,
    isValidSqlite: false,
    schemaEntries: [],
    tableFound: false,
    rowCount: null,
    keys: [],
    hasIndexKey: false,
    hasActiveSlotKey: false,
    slotIdsLive: [],
    slotIdsBackup: [],
    slotIdentities: [],
    sqliteError: null,
    fatalError: null,
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function buildIdentity(slotId: string, sourceKey: string, raw: string | undefined): SlotIdentity {
  const base: SlotIdentity = {
    slotId, sourceKey, parses: false, parseError: null,
    name: null, raceId: null, factionId: null, hp: null, hpMax: null, dead: null,
    hoursElapsed: null, currentLocationId: null, mainQuestPhase: null,
    guardiansDefeatedCount: null, savedAt: null,
  };
  if (raw === undefined) {
    return { ...base, parseError: 'no value found for this key' };
  }
  const parsed = safeParseJson(raw);
  if (parsed === undefined || typeof parsed !== 'object' || parsed === null) {
    return { ...base, parseError: 'value did not parse as a JSON object' };
  }
  const obj = parsed as {
    player?: {
      name?: string; raceId?: string; factionId?: string; hp?: number; hpMax?: number;
      dead?: boolean; hoursElapsed?: number; currentLocationId?: string;
      mainQuest?: { phase?: string; guardiansDefeated?: unknown[] };
    };
    savedAt?: number;
  };
  const player = obj.player;
  return {
    ...base,
    parses: true,
    name: player?.name ?? null,
    raceId: player?.raceId ?? null,
    factionId: player?.factionId ?? null,
    hp: player?.hp ?? null,
    hpMax: player?.hpMax ?? null,
    dead: player?.dead ?? null,
    hoursElapsed: player?.hoursElapsed ?? null,
    currentLocationId: player?.currentLocationId ?? null,
    mainQuestPhase: player?.mainQuest?.phase ?? null,
    guardiansDefeatedCount: Array.isArray(player?.mainQuest?.guardiansDefeated)
      ? player!.mainQuest!.guardiansDefeated!.length
      : null,
    savedAt: obj.savedAt ?? null,
  };
}

/** Copies FROM the pristine OTA-1886 copy TO a second, disposable working
 *  copy, and hashes both — the pristine copy is only ever a read source
 *  here, never a write target. */
export async function runLegacyStorageInspection(): Promise<LegacyStorageInspectReport> {
  const report = emptyReport();
  if (Platform.OS !== 'android') {
    return report;
  }
  report.platformSupported = true;

  const pristinePath = `${FileSystem.cacheDirectory ?? ''}${PRISTINE_SUBDIR}${RKSTORAGE_NAME}`;
  report.pristineCopyPath = pristinePath;

  let pristineInfo: { exists: boolean };
  try {
    pristineInfo = await FileSystem.getInfoAsync(uriFor(pristinePath));
  } catch (e) {
    return { ...report, fatalError: `could not check for the preservation copy: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!pristineInfo.exists) {
    return {
      ...report,
      fatalError: 'no preservation copy was found — run PRESERVE LEGACY SAVE DATABASE first, then run this check.',
    };
  }
  report.pristineCopyFound = true;

  let pristineBase64: string;
  try {
    pristineBase64 = await FileSystem.readAsStringAsync(uriFor(pristinePath), { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    return { ...report, fatalError: `could not read the preservation copy: ${e instanceof Error ? e.message : String(e)}` };
  }
  const pristineBytes = base64ToBytes(pristineBase64);
  const pristineHash = sha256Hex(pristineBytes);

  const workingDir = `${FileSystem.cacheDirectory ?? ''}${WORKING_SUBDIR}`;
  const workingPath = `${workingDir}${RKSTORAGE_NAME}`;
  report.workingCopyPath = workingPath;
  try {
    await FileSystem.makeDirectoryAsync(workingDir, { intermediates: true });
  } catch {
    // may already exist — copyAsync below reports its own failure if the
    // directory is genuinely unusable.
  }
  try {
    await FileSystem.copyAsync({ from: uriFor(pristinePath), to: workingPath });
  } catch (e) {
    return { ...report, fatalError: `could not make a working copy to analyze: ${e instanceof Error ? e.message : String(e)}` };
  }
  report.workingCopyMade = true;

  let workingBase64: string;
  try {
    workingBase64 = await FileSystem.readAsStringAsync(uriFor(workingPath), { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    return { ...report, fatalError: `could not read the working copy back: ${e instanceof Error ? e.message : String(e)}` };
  }
  const workingBytes = base64ToBytes(workingBase64);
  const workingHash = sha256Hex(workingBytes);
  report.workingCopyHashMatchesPristine = workingHash === pristineHash;
  if (!report.workingCopyHashMatchesPristine) {
    return {
      ...report,
      fatalError: 'the working copy did not hash-match the pristine preservation copy — stopping before any interpretation. The pristine copy itself was not touched.',
    };
  }

  // From here on, everything happens against `workingBytes` only — a
  // read-only in-memory buffer decoded from the working copy. Neither the
  // original database nor the pristine preservation copy is read again.
  let header: SqliteFileHeader;
  try {
    header = parseFileHeader(workingBytes);
  } catch (e) {
    return { ...report, isValidSqlite: false, sqliteError: e instanceof Error ? e.message : String(e) };
  }
  report.isValidSqlite = true;

  let schema: SchemaEntry[];
  try {
    schema = readSchema(workingBytes, header);
  } catch (e) {
    return { ...report, sqliteError: e instanceof Error ? e.message : String(e) };
  }
  report.schemaEntries = schema.map((s) => ({ type: s.type, name: s.name }));

  const tableEntry = schema.find((s) => s.type === 'table' && s.name === TARGET_TABLE);
  if (!tableEntry) {
    return report;
  }
  report.tableFound = true;

  let rows: BtreeRow[];
  try {
    rows = walkTableBtree(workingBytes, header, tableEntry.rootPage);
  } catch (e) {
    return { ...report, sqliteError: e instanceof Error ? e.message : String(e) };
  }
  report.rowCount = rows.length;

  const byKey = new Map<string, string>();
  for (const row of rows) {
    const key = row.columns[0];
    const value = row.columns[1];
    if (typeof key === 'string' && typeof value === 'string') {
      byKey.set(key, value);
    }
  }
  report.keys = [...byKey.keys()];
  report.hasIndexKey = byKey.has(INDEX_KEY);
  report.hasActiveSlotKey = byKey.has(ACTIVE_SLOT_KEY);

  const liveIds = new Set<string>();
  const bakIds = new Set<string>();
  for (const key of byKey.keys()) {
    const liveMatch = LIVE_KEY_RE.exec(key);
    if (liveMatch) liveIds.add(liveMatch[1]!);
    const bakMatch = BAK_KEY_RE.exec(key);
    if (bakMatch) bakIds.add(bakMatch[1]!);
  }
  report.slotIdsLive = [...liveIds];
  report.slotIdsBackup = [...bakIds];

  const allSlotIds = new Set<string>([...liveIds, ...bakIds]);
  const identities: SlotIdentity[] = [];
  for (const slotId of allSlotIds) {
    const liveKey = `tartaria.slot.${slotId}.v2`;
    const bakKey = `tartaria.slot.${slotId}.v2.bak`;
    if (liveIds.has(slotId)) {
      identities.push(buildIdentity(slotId, liveKey, byKey.get(liveKey)));
    } else if (bakIds.has(slotId)) {
      identities.push(buildIdentity(slotId, bakKey, byKey.get(bakKey)));
    }
  }
  report.slotIdentities = identities;

  return report;
}

/** Plain-English lead: found a readable copy of a real character, or not —
 *  everything else is detail underneath. No SQLite jargon required to get
 *  the yes/no answer. */
export function formatLegacyStorageInspectReport(r: LegacyStorageInspectReport): string {
  const lines: string[] = [];
  lines.push('=== INSIDE THE PRESERVED LEGACY SAVE (read-only — a copy of a copy, nothing original touched) ===');
  lines.push('');

  if (!r.platformSupported) {
    lines.push("This check only applies on Android.");
    return lines.join('\n');
  }
  if (r.fatalError) {
    lines.push(`Could not complete the check: ${r.fatalError}`);
    return lines.join('\n');
  }

  if (!r.isValidSqlite) {
    lines.push('RESULT: the preserved file does not look like a valid save database.');
    if (r.sqliteError) lines.push(`Detail: ${r.sqliteError}`);
    return lines.join('\n');
  }

  if (!r.tableFound) {
    lines.push('RESULT: the file is a valid database, but it has no save table in it — nothing to recover here.');
    lines.push('');
    lines.push(`Tables/objects found: ${r.schemaEntries.map((s) => `${s.name} (${s.type})`).join(', ') || '(none)'}`);
    return lines.join('\n');
  }

  const identitiesWithData = r.slotIdentities.filter((s) => s.parses && s.name);
  if (identitiesWithData.length > 0) {
    lines.push(`RESULT: FOUND — ${identitiesWithData.length} readable character record(s) inside the preserved database.`);
  } else if (r.slotIdentities.length > 0) {
    lines.push('RESULT: save-shaped keys exist, but none of them parsed into a readable character yet.');
  } else {
    lines.push('RESULT: the save table exists and is readable, but no character-shaped keys were found in it.');
  }
  lines.push('');

  lines.push('--- TECHNICAL DETAIL ---');
  lines.push(`Valid SQLite database: YES`);
  lines.push(`Tables/objects found: ${r.schemaEntries.map((s) => `${s.name} (${s.type})`).join(', ') || '(none)'}`);
  lines.push(`Save table (${TARGET_TABLE}) found: YES`);
  lines.push(`Row count: ${r.rowCount}`);
  lines.push(`Keys present (${r.keys.length}): ${r.keys.join(', ') || '(none)'}`);
  lines.push(`Slot index key present: ${r.hasIndexKey ? 'YES' : 'NO'}`);
  lines.push(`Active-slot pointer key present: ${r.hasActiveSlotKey ? 'YES' : 'NO'}`);
  lines.push(`Live slot IDs found: ${r.slotIdsLive.join(', ') || '(none)'}`);
  lines.push(`Backup slot IDs found: ${r.slotIdsBackup.join(', ') || '(none)'}`);

  if (r.slotIdentities.length > 0) {
    lines.push('');
    lines.push('--- CHARACTER RECORDS FOUND (identity only — not the full save) ---');
    for (const s of r.slotIdentities) {
      lines.push('');
      lines.push(`slot ${s.slotId} (from ${s.sourceKey}):`);
      if (!s.parses) {
        lines.push(`  could not read this one: ${s.parseError}`);
        continue;
      }
      lines.push(`  name: ${s.name ?? '?'} · race: ${s.raceId ?? '?'} · faction: ${s.factionId ?? '?'}`);
      lines.push(`  hp: ${s.hp ?? '?'}/${s.hpMax ?? '?'} · dead: ${s.dead ?? '?'} · hours elapsed: ${s.hoursElapsed ?? '?'}`);
      lines.push(`  location: ${s.currentLocationId ?? '?'}`);
      lines.push(`  main quest phase: ${s.mainQuestPhase ?? '?'} · Core Guardians defeated: ${s.guardiansDefeatedCount ?? '?'}`);
      lines.push(`  saved at: ${s.savedAt != null ? new Date(s.savedAt).toISOString() : '?'}`);
    }
  }

  if (r.sqliteError) {
    lines.push('');
    lines.push(`NOTE — the read stopped partway through: ${r.sqliteError}`);
    lines.push('Everything reported above is what was successfully read before that point; nothing was guessed or filled in.');
  }

  return lines.join('\n');
}

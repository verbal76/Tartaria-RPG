// OTA-1887 — reading INSIDE the preserved legacy database (GOLEM ONLY).
//
// Continuation: OTA-1886 proved RKStorage still exists on the owner's device
// and made a verified byte-identical preservation copy. This module decodes
// what is actually inside that copy — no expo-sqlite, no native SQLite
// binding is a dependency of this project, so the only OTA-safe path is a
// hand-written reader of the documented SQLite file format, exercised here
// against bytes a REAL SQLite engine produced (python's sqlite3, not
// hand-guessed fixtures) so the varint/b-tree/overflow/record decoding is
// checked against ground truth, not against itself.
//
// Two things must both be true for this to be safe to ship:
//   1. STATIC — the module's own executable source never references the
//      ORIGINAL database's location, never opens anything through a real
//      SQLite engine (no execSQL/PRAGMA/expo-sqlite), and never reaches any
//      AsyncStorage-mutating or save-repair path.
//   2. BEHAVIORAL — the two-copy-of-a-copy flow (pristine preservation copy
//      -> disposable working copy -> parse the working copy only) leaves
//      the pristine copy's bytes untouched in every scenario, including
//      every failure scenario, and a hash mismatch on the working copy
//      stops the whole inspection before any parsing is attempted.

import fs from 'fs';
import path from 'path';
import { Platform } from 'react-native';
import {
  runLegacyStorageInspection,
  formatLegacyStorageInspectReport,
  parseFileHeader,
  readSchema,
  walkTableBtree,
  readVarint,
  decodeUtf8,
  SQLITE_MAGIC,
} from '../app/diagnostics/legacyStorageInspect';

const fixtureEmpty = require('./fixtures/sqlite-empty.json') as { b64: string };
const fixtureSmall = require('./fixtures/sqlite-small.json') as { b64: string };
const fixtureOverflow = require('./fixtures/sqlite-overflow.json') as { b64: string };
const fixtureNoTarget = require('./fixtures/sqlite-notarget.json') as { b64: string };
const fixtureManyRows = require('./fixtures/sqlite-manyrows.json') as { b64: string };
const expected = require('./fixtures/sqlite-expected.json') as {
  small: [string, string][];
  overflow: [string, string][];
  manyrows: [string, string][];
};

function bytesFromB64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

jest.mock('expo-file-system/legacy', () => {
  const files = new Map<
    string,
    { bytes: Uint8Array; throwOnStat?: string; throwOnRead?: string; throwOnCopy?: string; corruptCopyBytes?: Uint8Array }
  >();

  function pathFromUri(uri: string): string {
    return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  }
  function toBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64');
  }

  return {
    cacheDirectory: 'file:///cache/',
    documentDirectory: 'file:///docs/',
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    getInfoAsync: jest.fn(async (uri: string) => {
      const p = pathFromUri(uri);
      const f = files.get(p);
      if (!f) return { exists: false, isDirectory: false };
      if (f.throwOnStat) throw new Error(f.throwOnStat);
      return { exists: true, isDirectory: false, size: f.bytes.length, uri };
    }),
    readAsStringAsync: jest.fn(async (uri: string) => {
      const p = pathFromUri(uri);
      const f = files.get(p);
      if (!f) throw new Error(`ENOENT: ${p}`);
      if (f.throwOnRead) throw new Error(f.throwOnRead);
      return toBase64(f.bytes);
    }),
    copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
      const fp = pathFromUri(from);
      const tp = pathFromUri(to);
      const f = files.get(fp);
      if (!f) throw new Error(`ENOENT: ${fp}`);
      if (f.throwOnCopy) throw new Error(f.throwOnCopy);
      const bytes = f.corruptCopyBytes ?? f.bytes;
      files.set(tp, { bytes: new Uint8Array(bytes) });
    }),
    makeDirectoryAsync: jest.fn(async () => {}),
    __setFile: (p: string, bytes: Uint8Array, opts: Record<string, unknown> = {}) => {
      files.set(p, { bytes: new Uint8Array(bytes), ...opts });
    },
    __getFile: (p: string) => files.get(p),
    __reset: () => files.clear(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockFS = require('expo-file-system/legacy');

const PRISTINE_PATH = '/cache/legacy-preserve/RKStorage';
const WORKING_PATH = '/cache/legacy-inspect-working/RKStorage';

const sourceFull: string = fs.readFileSync(
  path.join(__dirname, '../app/diagnostics/legacyStorageInspect.ts'),
  'utf8',
);

function codeLines(src: string): string[] {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    });
}
const code = codeLines(sourceFull).join('\n');

describe('OTA-1887 — never a path to the original, never a real database engine (static proof)', () => {
  const forbidden = [
    'execSQL', 'PRAGMA', 'expo-sqlite', 'openDatabase', 'SQLiteOpenHelper',
    'runAsync', 'getAllAsync', 'setItem', 'removeItem', 'multiRemove',
    'saveSlot', 'loadSlot', 'deleteSlot', 'mutateSlot', 'writeIndex',
    'upsertIndexEntry', 'setActiveSlot', 'importSave', 'deleteAsync',
    'moveAsync', 'writeAsStringAsync', '/data/data/', "'databases",
  ];
  it.each(forbidden)('never references %s in executable code', (name) => {
    expect(code.toLowerCase()).not.toContain(name.toLowerCase());
  });

  it('never imports from saveSystem.ts or @react-native-async-storage', () => {
    expect(code).not.toMatch(/from ['"].*saveSystem['"]/);
    expect(code).not.toMatch(/from ['"]@react-native-async-storage/);
  });

  it('the pristine copy path is only ever a copy SOURCE, never a copy destination', () => {
    expect(code).toContain('await FileSystem.copyAsync({ from: uriFor(pristinePath), to: workingPath })');
  });

  it('the header documents that the original is never referenced', () => {
    expect(sourceFull).toContain('THE ORIGINAL IS NEVER REFERENCED HERE');
    expect(sourceFull).toContain('It never opens anything through');
  });
});

describe('OTA-1887 — pure-JS SQLite reader, checked against a real SQLite engine\'s bytes', () => {
  it('rejects a magic header that is not SQLite\'s', () => {
    const bogus = new Uint8Array(200);
    expect(() => parseFileHeader(bogus)).toThrow(/magic/i);
  });

  it('decodes single-byte and multi-byte varints exactly (spec-defined cases)', () => {
    expect(readVarint(Uint8Array.from([0x05]), 0)).toEqual({ value: 5, bytesRead: 1 });
    expect(readVarint(Uint8Array.from([0x81, 0x00]), 0)).toEqual({ value: 128, bytesRead: 2 });
    expect(readVarint(Uint8Array.from([0xff, 0x7f]), 0)).toEqual({ value: (0x7f << 7) | 0x7f, bytesRead: 2 });
  });

  it('decodes UTF-8 including multi-byte characters', () => {
    const bytes = Uint8Array.from(Buffer.from('a€✓', 'utf8'));
    expect(decodeUtf8(bytes)).toBe('a€✓');
  });

  it('parses the real file header (magic, page size, encoding) from the empty fixture', () => {
    const bytes = bytesFromB64(fixtureEmpty.b64);
    const header = parseFileHeader(bytes);
    expect(header.pageSize * header.pageCount).toBe(bytes.length);
    expect(header.textEncoding).toBe(1); // UTF-8, SQLite's default
    expect(Buffer.from(bytes.slice(0, 16)).toString('latin1')).toBe(SQLITE_MAGIC);
  });

  it('finds the catalystLocalStorage table in the schema, and nothing claims to be it when absent', () => {
    const emptyHeader = parseFileHeader(bytesFromB64(fixtureEmpty.b64));
    const emptySchema = readSchema(bytesFromB64(fixtureEmpty.b64), emptyHeader);
    expect(emptySchema.some((s) => s.type === 'table' && s.name === 'catalystLocalStorage')).toBe(true);

    const noTargetHeader = parseFileHeader(bytesFromB64(fixtureNoTarget.b64));
    const noTargetSchema = readSchema(bytesFromB64(fixtureNoTarget.b64), noTargetHeader);
    expect(noTargetSchema.some((s) => s.name === 'catalystLocalStorage')).toBe(false);
    expect(noTargetSchema.some((s) => s.name === 'someOtherTable')).toBe(true);
  });

  it('an empty catalystLocalStorage table walks to zero rows', () => {
    const bytes = bytesFromB64(fixtureEmpty.b64);
    const header = parseFileHeader(bytes);
    const schema = readSchema(bytes, header);
    const table = schema.find((s) => s.name === 'catalystLocalStorage')!;
    const rows = walkTableBtree(bytes, header, table.rootPage);
    expect(rows).toHaveLength(0);
  });

  it('recovers every key/value pair exactly, byte for byte, from a small real database', () => {
    const bytes = bytesFromB64(fixtureSmall.b64);
    const header = parseFileHeader(bytes);
    const schema = readSchema(bytes, header);
    const table = schema.find((s) => s.name === 'catalystLocalStorage')!;
    const rows = walkTableBtree(bytes, header, table.rootPage);
    const got = new Map(rows.map((r) => [r.columns[0], r.columns[1]]));
    expect(got.size).toBe(expected.small.length);
    for (const [k, v] of expected.small) {
      expect(got.get(k)).toBe(v);
    }
  });

  it('reconstructs an overflow-spanning value exactly (the value is 12KB+, far past one 4096-byte page)', () => {
    const bytes = bytesFromB64(fixtureOverflow.b64);
    const header = parseFileHeader(bytes);
    expect(header.pageCount).toBeGreaterThan(3); // proves this fixture genuinely needed overflow pages
    const schema = readSchema(bytes, header);
    const table = schema.find((s) => s.name === 'catalystLocalStorage')!;
    const rows = walkTableBtree(bytes, header, table.rootPage);
    const got = new Map(rows.map((r) => [r.columns[0], r.columns[1]]));
    expect(got.size).toBe(expected.overflow.length);
    for (const [k, v] of expected.overflow) {
      const value = got.get(k) as string;
      expect(value).toBe(v);
      expect(value.length).toBe(v.length);
      expect(JSON.parse(value)).toEqual(JSON.parse(v));
    }
  });

  it('walks an interior (multi-leaf) table b-tree correctly across 400 rows', () => {
    const bytes = bytesFromB64(fixtureManyRows.b64);
    const header = parseFileHeader(bytes);
    const schema = readSchema(bytes, header);
    const table = schema.find((s) => s.name === 'catalystLocalStorage')!;
    const rows = walkTableBtree(bytes, header, table.rootPage);
    expect(rows).toHaveLength(400);
    const got = new Map(rows.map((r) => [r.columns[0], r.columns[1]]));
    expect(got.size).toBe(400);
    for (const [k, v] of expected.manyrows) {
      expect(got.get(k)).toBe(v);
    }
  });
});

describe('OTA-1887 — behavioral proof: the two-copy-of-a-copy flow', () => {
  const OriginalPlatformOS = Platform.OS;
  beforeEach(() => {
    mockFS.__reset();
    (Platform as { OS: string }).OS = 'android';
  });
  afterEach(() => {
    (Platform as { OS: string }).OS = OriginalPlatformOS;
  });

  it('reports platformSupported=false and touches nothing on a non-Android platform', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const report = await runLegacyStorageInspection();
    expect(report.platformSupported).toBe(false);
    expect(mockFS.getInfoAsync).not.toHaveBeenCalled();
  });

  it('reports a clear fatalError, and touches nothing, when no preservation copy exists yet', async () => {
    const report = await runLegacyStorageInspection();
    expect(report.pristineCopyFound).toBe(false);
    expect(report.fatalError).toMatch(/PRESERVE LEGACY SAVE DATABASE first/);
    expect(mockFS.copyAsync).not.toHaveBeenCalled();
  });

  it('on a genuine pristine copy, makes a SEPARATE working copy, verifies its hash, and parses only that', async () => {
    const smallBytes = bytesFromB64(fixtureSmall.b64);
    mockFS.__setFile(PRISTINE_PATH, smallBytes);

    const report = await runLegacyStorageInspection();

    expect(report.pristineCopyFound).toBe(true);
    expect(report.workingCopyMade).toBe(true);
    expect(report.workingCopyHashMatchesPristine).toBe(true);
    expect(report.isValidSqlite).toBe(true);
    expect(report.tableFound).toBe(true);
    expect(report.rowCount).toBe(expected.small.length);
    expect(report.keys.sort()).toEqual(expected.small.map(([k]) => k).sort());
    expect(report.hasIndexKey).toBe(true);
    expect(report.hasActiveSlotKey).toBe(true);
    expect(report.slotIdsLive).toEqual(['abc123']);

    const identity = report.slotIdentities.find((s) => s.slotId === 'abc123')!;
    expect(identity.parses).toBe(true);
    expect(identity.name).toBe('Verbal');
    expect(identity.raceId).toBe('mud_golem');
    expect(identity.currentLocationId).toBe('mud_seas_49_14');
    expect(identity.mainQuestPhase).toBe('core_3');
    expect(identity.guardiansDefeatedCount).toBe(2);
    expect(identity.dead).toBe(false);

    // The PRISTINE copy itself is never mutated by inspecting it.
    const pristineAfter = mockFS.__getFile(PRISTINE_PATH);
    expect(new Uint8Array(pristineAfter.bytes)).toEqual(smallBytes);
    // A distinct working copy was made — not the same path as the pristine one.
    expect(report.workingCopyPath).not.toBe(report.pristineCopyPath);
    const workingAfter = mockFS.__getFile(WORKING_PATH);
    expect(workingAfter).toBeDefined();
  });

  it('stops before parsing, and never touches the pristine copy, if the working copy fails to be made', async () => {
    const smallBytes = bytesFromB64(fixtureSmall.b64);
    mockFS.__setFile(PRISTINE_PATH, smallBytes, { throwOnCopy: 'disk full' });

    const report = await runLegacyStorageInspection();

    expect(report.pristineCopyFound).toBe(true);
    expect(report.workingCopyMade).toBe(false);
    expect(report.isValidSqlite).toBe(false);
    expect(report.fatalError).toMatch(/could not make a working copy/);
    const pristineAfter = mockFS.__getFile(PRISTINE_PATH);
    expect(new Uint8Array(pristineAfter.bytes)).toEqual(smallBytes);
  });

  it('stops before parsing if the pristine copy cannot be read', async () => {
    const smallBytes = bytesFromB64(fixtureSmall.b64);
    mockFS.__setFile(PRISTINE_PATH, smallBytes, { throwOnRead: 'permission denied' });

    const report = await runLegacyStorageInspection();

    expect(report.pristineCopyFound).toBe(true);
    expect(report.workingCopyMade).toBe(false);
    expect(report.fatalError).toMatch(/could not read the preservation copy/);
  });

  it('a hash mismatch on the working copy stops the inspection before any parsing, and never blames the pristine copy', async () => {
    const smallBytes = bytesFromB64(fixtureSmall.b64);
    const differentBytes = bytesFromB64(fixtureEmpty.b64);
    mockFS.__setFile(PRISTINE_PATH, smallBytes, { corruptCopyBytes: differentBytes });

    const report = await runLegacyStorageInspection();

    expect(report.workingCopyMade).toBe(true);
    expect(report.workingCopyHashMatchesPristine).toBe(false);
    expect(report.isValidSqlite).toBe(false);
    expect(report.fatalError).toMatch(/did not hash-match the pristine preservation copy/);
    const pristineAfter = mockFS.__getFile(PRISTINE_PATH);
    expect(new Uint8Array(pristineAfter.bytes)).toEqual(smallBytes);
  });

  it('reports tableFound=false, with the real schema names, when the database has no save table', async () => {
    mockFS.__setFile(PRISTINE_PATH, bytesFromB64(fixtureNoTarget.b64));
    const report = await runLegacyStorageInspection();
    expect(report.isValidSqlite).toBe(true);
    expect(report.tableFound).toBe(false);
    expect(report.schemaEntries.some((s) => s.name === 'someOtherTable')).toBe(true);
    expect(report.rowCount).toBeNull();
  });

  it('reports isValidSqlite=false, without throwing, for a file that is not a SQLite database at all', async () => {
    mockFS.__setFile(PRISTINE_PATH, new Uint8Array(4096)); // all zero bytes, valid length, wrong magic
    const report = await runLegacyStorageInspection();
    expect(report.workingCopyHashMatchesPristine).toBe(true);
    expect(report.isValidSqlite).toBe(false);
    expect(report.sqliteError).toMatch(/magic/i);
  });

  it('recovers an overflow-spanning character record end to end, including its bounded identity fields', async () => {
    mockFS.__setFile(PRISTINE_PATH, bytesFromB64(fixtureOverflow.b64));
    const report = await runLegacyStorageInspection();
    expect(report.tableFound).toBe(true);
    expect(report.rowCount).toBe(2);
    expect(report.slotIdsLive).toEqual(['big1']);
    expect(report.slotIdsBackup).toEqual(['big1']);
    const identity = report.slotIdentities.find((s) => s.sourceKey === 'tartaria.slot.big1.v2')!;
    expect(identity.parses).toBe(true);
    expect(identity.name).toBe('BigSave');
    expect(identity.dead).toBe(true);
    expect(identity.guardiansDefeatedCount).toBe(9);
  });

  it('formatLegacyStorageInspectReport leads with a plain-English yes/no before any SQLite detail', async () => {
    mockFS.__setFile(PRISTINE_PATH, bytesFromB64(fixtureSmall.b64));
    const report = await runLegacyStorageInspection();
    const text = formatLegacyStorageInspectReport(report);
    expect(text.indexOf('RESULT:')).toBeLessThan(text.indexOf('TECHNICAL DETAIL'));
    expect(text).toContain('FOUND — 1 readable character record');
    expect(text).toContain('Verbal');
  });

  it('formatLegacyStorageInspectReport never dumps the unrelated key\'s value, only its name', async () => {
    mockFS.__setFile(PRISTINE_PATH, bytesFromB64(fixtureSmall.b64));
    const report = await runLegacyStorageInspection();
    const text = formatLegacyStorageInspectReport(report);
    expect(text).toContain('some.unrelated.key');
    expect(text).not.toContain('some unrelated value nobody asked to see');
  });
});

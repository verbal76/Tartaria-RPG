// OTA-1886 — the legacy-database preservation probe (GOLEM ONLY).
//
// Continuation of the save-preservation incident: OTA-1885 proved the
// current AsyncStorage database has no slot records; reading the exact
// installed async-storage 2.2.0 native source showed it ships a SEPARATE
// legacy engine (RKStorage, SQLite) alongside the new one, with a one-time
// migration between them whose own code shows no handling of SQLite's
// `-wal`/`-shm` companion files. This module exists to find out, without
// risking the answer, whether RKStorage (± its companions) still physically
// exists — and if so, to make a byte-for-byte verified copy before anyone
// looks inside it.
//
// Two things must both be true for this to be safe to ship:
//   1. STATIC — the module's own executable source cannot contain a call to
//      any AsyncStorage/SQLite API, nor to any FileSystem method capable of
//      mutating a SOURCE path (deleteAsync, moveAsync, writeAsStringAsync).
//   2. BEHAVIORAL — across every file-state scenario this probe is meant to
//      handle (absent, present-alone, present-with-WAL/SHM, present-with-
//      journal, copy success, copy failure, read failure, hash mismatch),
//      running it never changes the ORIGINAL file's bytes, and correctly
//      reports what happened without ever silently "fixing" a failure.

import fs from 'fs';
import path from 'path';
import { Platform } from 'react-native';
import {
  runLegacyStoragePreservation,
  formatLegacyStorageReport,
  base64ToBytes,
  sha256Hex,
} from '../app/diagnostics/legacyStoragePreserve';

jest.mock('expo-application', () => ({
  applicationId: 'com.hotatticgames.tartarprim.golem',
}));

jest.mock('expo-file-system/legacy', () => {
  const files = new Map<string, { bytes: Uint8Array; throwOnStat?: string; throwOnRead?: string; throwOnCopy?: string; corruptCopyBytes?: Uint8Array }>();

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
    __snapshot: () => {
      const out: Record<string, string> = {};
      for (const [p, f] of files) out[p] = toBase64(f.bytes);
      return out;
    },
    __reset: () => files.clear(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockFS = require('expo-file-system/legacy');

const DB_DIR = '/data/data/com.hotatticgames.tartarprim.golem/databases';
const RK = `${DB_DIR}/RKStorage`;
const RK_WAL = `${DB_DIR}/RKStorage-wal`;
const RK_SHM = `${DB_DIR}/RKStorage-shm`;
const RK_JOURNAL = `${DB_DIR}/RKStorage-journal`;

function bytesOf(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, 'utf8'));
}

const probeSourceFull: string = fs.readFileSync(
  path.join(__dirname, '../app/diagnostics/legacyStoragePreserve.ts'), 'utf8');

function codeLines(src: string): string[] {
  return src.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
}
const probeCode = codeLines(probeSourceFull).join('\n');

describe('OTA-1886 — no reachable path can modify an original file (static proof)', () => {
  const forbidden = [
    'deleteAsync', 'moveAsync', 'writeAsStringAsync', 'setItem', 'removeItem',
    'multiRemove', 'saveSlot', 'loadSlot', 'deleteSlot', 'mutateSlot',
    'writeIndex', 'upsertIndexEntry', 'setActiveSlot', 'PRAGMA', 'sqlite',
    'expo-sqlite',
  ];
  it.each(forbidden)('never references %s in executable code', (name) => {
    expect(probeCode.toLowerCase()).not.toContain(name.toLowerCase());
  });

  it('never imports from saveSystem.ts or async-storage', () => {
    expect(probeCode).not.toMatch(/from ['"].*saveSystem['"]/);
    expect(probeCode).not.toMatch(/from ['"]@react-native-async-storage/);
  });

  it('copyAsync is only ever called with the original as the source, never the destination', () => {
    // preserveFile always builds `to` from destDir + name — the only path
    // fed into `from` is `originalProbe.path`, which is always one of the
    // four legacy candidate paths, never a preservation-directory path.
    expect(probeCode).toContain("await FileSystem.copyAsync({ from: uriFor(originalProbe.path), to: destPath });");
  });

  it('the header documents the read-only guarantee', () => {
    expect(probeSourceFull).toContain('PRESERVATION, NOT ANALYSIS');
    expect(probeSourceFull).toContain('It never calls `deleteAsync`');
  });
});

describe('OTA-1886 — SHA-256 / base64 correctness (pinned against published test vectors)', () => {
  it('SHA-256("") matches the published vector', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('SHA-256("abc") matches the published vector', () => {
    expect(sha256Hex(bytesOf('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('SHA-256 of the standard pangram matches the published vector', () => {
    expect(sha256Hex(bytesOf('The quick brown fox jumps over the lazy dog'))).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });
  it('base64ToBytes round-trips through Buffer for arbitrary bytes', () => {
    const original = bytesOf('Tartaria RKStorage preservation — 2026');
    const b64 = Buffer.from(original).toString('base64');
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(original));
  });
});

describe('OTA-1886 — behavioral proof: originals are never modified, every scenario', () => {
  const originalOS = Platform.OS;
  beforeEach(() => { (Platform as { OS: string }).OS = 'android'; });
  afterEach(() => {
    mockFS.__reset();
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = originalOS;
  });

  it('no legacy files at all: reports NOT FOUND, preserves nothing, touches nothing', async () => {
    const report = await runLegacyStoragePreservation();
    expect(report.legacyDatabaseExists).toBe(false);
    expect(report.preserved).toHaveLength(0);
    expect(mockFS.copyAsync).not.toHaveBeenCalled();
    const formatted = formatLegacyStorageReport(report);
    expect(formatted).toContain('NOT FOUND');
  });

  it('RKStorage alone: found, preserved, verified byte-identical', async () => {
    const original = bytesOf('catalystLocalStorage: a lone save row');
    mockFS.__setFile(RK, original);
    const before = mockFS.__snapshot();

    const report = await runLegacyStoragePreservation();

    const after = mockFS.__snapshot();
    expect(after[RK]).toBe(before[RK]); // original byte-identical before/after
    expect(report.legacyDatabaseExists).toBe(true);
    expect(report.legacyEvidenceSetPreserved).toBe(true);
    expect(report.byteIdenticalCopyVerified).toBe(true);
    const rkPreserved = report.preserved.find((p) => p.name === 'RKStorage')!;
    expect(rkPreserved.copied).toBe(true);
    expect(rkPreserved.hashesMatch).toBe(true);
    expect(formatLegacyStorageReport(report)).toContain('FOUND');
  });

  it('RKStorage + WAL + SHM: all three preserved together as one evidence set', async () => {
    mockFS.__setFile(RK, bytesOf('main db bytes'));
    mockFS.__setFile(RK_WAL, bytesOf('wal side-file bytes'));
    mockFS.__setFile(RK_SHM, bytesOf('shm side-file bytes'));
    const before = mockFS.__snapshot();

    const report = await runLegacyStoragePreservation();

    const after = mockFS.__snapshot();
    for (const p of [RK, RK_WAL, RK_SHM]) expect(after[p]).toBe(before[p]);
    expect(report.legacyEvidenceSetPreserved).toBe(true);
    expect(report.byteIdenticalCopyVerified).toBe(true);
    expect(report.preserved.filter((p) => p.copied)).toHaveLength(3);
    // no member of the set was decided to represent the whole on its own
    expect(report.preserved.filter((p) => p.copied).map((p) => p.name).sort()).toEqual(
      ['RKStorage', 'RKStorage-shm', 'RKStorage-wal'].sort(),
    );
  });

  it('RKStorage + journal (rollback-journal mode instead of WAL): both preserved', async () => {
    mockFS.__setFile(RK, bytesOf('main db bytes, rollback-journal mode'));
    mockFS.__setFile(RK_JOURNAL, bytesOf('journal bytes'));

    const report = await runLegacyStoragePreservation();

    expect(report.legacyEvidenceSetPreserved).toBe(true);
    expect(report.preserved.filter((p) => p.copied)).toHaveLength(2);
  });

  it('copy/hash mismatch is DETECTED and reported, never silently accepted', async () => {
    mockFS.__setFile(RK, bytesOf('the real bytes'), {
      corruptCopyBytes: bytesOf('DIFFERENT bytes landed in the copy'),
    });
    const before = mockFS.__snapshot();

    const report = await runLegacyStoragePreservation();

    expect(mockFS.__snapshot()[RK]).toBe(before[RK]); // original still untouched
    expect(report.byteIdenticalCopyVerified).toBe(false);
    const rk = report.preserved.find((p) => p.name === 'RKStorage')!;
    expect(rk.copied).toBe(true);
    expect(rk.hashesMatch).toBe(false);
    const formatted = formatLegacyStorageReport(report);
    expect(formatted).toContain('hashes DO NOT MATCH');
    expect(formatted).not.toContain('hashes MATCH'); // never reports plain success on a mismatch
  });

  it('copy failure on the original stops preservation and reports it, never retries into a mutation', async () => {
    mockFS.__setFile(RK, bytesOf('bytes that will fail to copy'), {
      throwOnCopy: 'simulated copy failure',
    });
    const before = mockFS.__snapshot();

    const report = await runLegacyStoragePreservation();

    expect(mockFS.__snapshot()[RK]).toBe(before[RK]);
    expect(report.legacyDatabaseExists).toBe(true);
    expect(report.legacyEvidenceSetPreserved).toBe(false);
    expect(report.byteIdenticalCopyVerified).toBe(false);
    const rk = report.preserved.find((p) => p.name === 'RKStorage')!;
    expect(rk.copied).toBe(false);
    expect(rk.error).toContain('simulated copy failure');
  });

  it('read failure on the original (exists but unreadable) is reported, not hidden', async () => {
    mockFS.__setFile(RK, bytesOf('exists but cannot be read'), {
      throwOnRead: 'simulated read failure',
    });

    const report = await runLegacyStoragePreservation();

    const rk = report.legacy.find((f) => f.name === 'RKStorage')!;
    expect(rk.exists).toBe(false); // probeFile's own catch treats an unreadable stat-positive file as not confirmed
    expect(rk.error).toContain('simulated read failure');
  });

  it('unexpected file state (stat throws) is reported as absent-with-error, not crashed on and not assumed present', async () => {
    mockFS.__setFile(RK, bytesOf('will never be reached'), { throwOnStat: 'simulated stat failure' });

    const report = await runLegacyStoragePreservation();

    const rk = report.legacy.find((f) => f.name === 'RKStorage')!;
    expect(rk.exists).toBe(false);
    expect(rk.error).toContain('simulated stat failure');
    expect(report.legacyDatabaseExists).toBe(false);
    expect(mockFS.copyAsync).not.toHaveBeenCalled();
  });

  it('reports the current AsyncStorage database for comparison without copying or modifying it', async () => {
    mockFS.__setFile(`${DB_DIR}/AsyncStorage`, bytesOf('current engine bytes'));
    const before = mockFS.__snapshot();

    const report = await runLegacyStoragePreservation();

    expect(mockFS.__snapshot()[`${DB_DIR}/AsyncStorage`]).toBe(before[`${DB_DIR}/AsyncStorage`]);
    const current = report.current.find((f) => f.name === 'AsyncStorage')!;
    expect(current.exists).toBe(true);
    // never appears in the preserved set — comparison only, no copy authorized for it
    expect(report.preserved.find((p) => p.name === 'AsyncStorage')).toBeUndefined();
  });

  it('non-Android platform: reports unsupported, touches nothing', async () => {
    (Platform as { OS: string }).OS = 'ios';
    mockFS.__setFile(RK, bytesOf('should never be looked at on iOS'));

    const report = await runLegacyStoragePreservation();

    expect(report.platformSupported).toBe(false);
    expect(mockFS.getInfoAsync).not.toHaveBeenCalled();
  });
});

// OTA-1886 — THE LEGACY STORAGE PRESERVATION PROBE. GOLEM ONLY.
//
// Save-preservation incident, continued: OTA-1885 proved the current
// AsyncStorage database (the "next"/Room engine, file `AsyncStorage`) has no
// slot records. Reading the exact installed native module's own source
// (@react-native-async-storage/async-storage 2.2.0) showed why that alone
// doesn't mean the data is gone: that package ships a SEPARATE legacy engine
// (`RKStorage`, SQLite, table `catalystLocalStorage`) and a one-time,
// single-file migration between them that has no visible handling of SQLite's
// `-wal`/`-shm` companion files — a known shape of data-loss bug in this
// library's own history. This module exists to answer one question, and
// answer it without disturbing the one thing that would prove or disprove
// it: does `RKStorage` (± its `-wal`/`-shm`/`-journal` companions) still
// physically exist in this app's private storage?
//
// ⚠⚠ PRESERVATION, NOT ANALYSIS. This module never opens anything as a
// database. It has no import of `AsyncStorage`, no import of `saveSystem.ts`,
// no SQL of any kind. It touches the candidate files with exactly three
// operations, every one a stat/copy primitive that cannot mutate the byte
// contents of a SOURCE path: `FileSystem.getInfoAsync` (stat),
// `FileSystem.readAsStringAsync` (read, used only to compute a hash — the
// hash is never written anywhere), and `FileSystem.copyAsync` where the
// legacy file is always the `from` and a new file inside this app's own
// cache directory is always the `to`. It never calls `deleteAsync`,
// `moveAsync`, `writeAsStringAsync`, or anything from
// `@react-native-async-storage/async-storage` — see
// ota1886LegacyStoragePreserveIsReadOnly for the static + behavioral proof of
// both halves, including that a copy failure, a hash mismatch, or a read
// failure on the ORIGINAL each stop and get reported rather than retried,
// worked around, or silently ignored.
//
// ⚠ NO NEW NATIVE MODULE. `expo-file-system` and `expo-application` are
// already compiled into the installed binary; nothing here needed a new
// native build. SHA-256 and base64-decoding are implemented in plain JS in
// this file (see the two helpers below) rather than reaching for
// `expo-crypto`, which is not currently a dependency of this project — adding
// one would have meant a new native build, which this diagnostic is
// deliberately scoped to avoid.

import * as FileSystem from 'expo-file-system/legacy';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

const LEGACY_NAMES = ['RKStorage', 'RKStorage-wal', 'RKStorage-shm', 'RKStorage-journal'] as const;
const CURRENT_NAMES = ['AsyncStorage', 'AsyncStorage-wal', 'AsyncStorage-shm', 'AsyncStorage-journal'] as const;
const PRESERVE_SUBDIR = 'legacy-preserve/';

export interface FileProbe {
  name: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  hashSha256: string | null;
  error: string | null;
}

export interface PreserveResult {
  name: string;
  originalPath: string;
  copyPath: string;
  copied: boolean;
  originalHash: string | null;
  copyHash: string | null;
  hashesMatch: boolean | null;
  error: string | null;
}

export interface LegacyStorageReport {
  platformSupported: boolean;
  packageName: string | null;
  databasesDir: string | null;
  legacy: FileProbe[];
  current: FileProbe[];
  preserved: PreserveResult[];
  legacyDatabaseExists: boolean;
  legacyEvidenceSetPreserved: boolean;
  byteIdenticalCopyVerified: boolean;
  fatalError: string | null;
}

function uriFor(absolutePath: string): string {
  return absolutePath.startsWith('file://') ? absolutePath : `file://${absolutePath}`;
}

// --- pure-JS base64 decode (no native module, no Buffer) ---
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  let outLen = (len * 3) >> 2;
  if (clean.endsWith('==')) outLen -= 2;
  else if (clean.endsWith('=')) outLen -= 1;
  const bytes = new Uint8Array(Math.max(0, outLen));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = B64_CHARS.indexOf(clean[i]!);
    const c2ch = clean[i + 1];
    const e2 = c2ch === undefined ? -1 : B64_CHARS.indexOf(c2ch);
    const c3ch = clean[i + 2];
    const e3 = c3ch === undefined || c3ch === '=' ? -1 : B64_CHARS.indexOf(c3ch);
    const c4ch = clean[i + 3];
    const e4 = c4ch === undefined || c4ch === '=' ? -1 : B64_CHARS.indexOf(c4ch);
    if (e1 < 0 || e2 < 0) continue;
    if (p < bytes.length) bytes[p++] = ((e1 << 2) | (e2 >> 4)) & 0xff;
    if (e3 >= 0 && p < bytes.length) bytes[p++] = (((e2 & 0xf) << 4) | (e3 >> 2)) & 0xff;
    if (e4 >= 0 && p < bytes.length) bytes[p++] = (((e3 & 0x3) << 6) | e4) & 0xff;
  }
  return bytes;
}

// --- pure-JS SHA-256 (no native module) ---
// Standard FIPS 180-4 constants and algorithm. Correctness is pinned against
// the published test vectors for "", "abc", and the pangram in
// ota1886LegacyStoragePreserveIsReadOnly — not trusted on the strength of
// looking right.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

export function sha256Hex(message: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = message.length * 8;
  const withOneBit = message.length + 1;
  const padded = (withOneBit + 8 + 63) & ~63;
  const buf = new Uint8Array(padded);
  buf.set(message);
  buf[message.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(padded - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(padded - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return Array.from(h).map((x) => x.toString(16).padStart(8, '0')).join('');
}

async function probeFile(path: string): Promise<FileProbe> {
  const name = path.split('/').pop() ?? path;
  try {
    const info = await FileSystem.getInfoAsync(uriFor(path));
    if (!info.exists) {
      return { name, path, exists: false, sizeBytes: null, hashSha256: null, error: null };
    }
    const base64 = await FileSystem.readAsStringAsync(uriFor(path), { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToBytes(base64);
    return { name, path, exists: true, sizeBytes: bytes.length, hashSha256: sha256Hex(bytes), error: null };
  } catch (e) {
    return { name, path, exists: false, sizeBytes: null, hashSha256: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Copies FROM the original TO a new file in this app's own cache directory.
 *  `copyAsync`'s source argument is only ever read, never written — the
 *  write lands solely on `destPath`, which is always inside `destDir`. */
async function preserveFile(originalProbe: FileProbe, destDir: string): Promise<PreserveResult> {
  const destPath = `${destDir}${originalProbe.name}`;
  if (!originalProbe.exists) {
    return {
      name: originalProbe.name, originalPath: originalProbe.path, copyPath: destPath,
      copied: false, originalHash: null, copyHash: null, hashesMatch: null, error: null,
    };
  }
  try {
    await FileSystem.copyAsync({ from: uriFor(originalProbe.path), to: destPath });
    const copyBase64 = await FileSystem.readAsStringAsync(destPath, { encoding: FileSystem.EncodingType.Base64 });
    const copyHash = sha256Hex(base64ToBytes(copyBase64));
    return {
      name: originalProbe.name, originalPath: originalProbe.path, copyPath: destPath,
      copied: true, originalHash: originalProbe.hashSha256, copyHash,
      hashesMatch: copyHash === originalProbe.hashSha256, error: null,
    };
  } catch (e) {
    return {
      name: originalProbe.name, originalPath: originalProbe.path, copyPath: destPath,
      copied: false, originalHash: originalProbe.hashSha256, copyHash: null, hashesMatch: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runLegacyStoragePreservation(): Promise<LegacyStorageReport> {
  const empty: Omit<LegacyStorageReport, 'fatalError'> = {
    platformSupported: false, packageName: null, databasesDir: null,
    legacy: [], current: [], preserved: [],
    legacyDatabaseExists: false, legacyEvidenceSetPreserved: false, byteIdenticalCopyVerified: false,
  };
  if (Platform.OS !== 'android') {
    return { ...empty, fatalError: null };
  }
  let packageName: string | null = null;
  try {
    packageName = Application.applicationId ?? null;
  } catch {
    packageName = null;
  }
  if (!packageName) {
    return { ...empty, fatalError: "Could not determine this install's package name." };
  }

  const databasesDir = `/data/data/${packageName}/databases`;
  const legacy = await Promise.all(LEGACY_NAMES.map((n) => probeFile(`${databasesDir}/${n}`)));
  const current = await Promise.all(CURRENT_NAMES.map((n) => probeFile(`${databasesDir}/${n}`)));

  const legacyDatabaseExists = legacy.some((f) => f.exists);
  let preserved: PreserveResult[] = [];
  if (legacyDatabaseExists) {
    const destDir = `${FileSystem.cacheDirectory ?? ''}${PRESERVE_SUBDIR}`;
    try {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    } catch {
      // may already exist — preserveFile below reports its own failure if the
      // directory is genuinely unusable.
    }
    preserved = await Promise.all(legacy.map((f) => preserveFile(f, destDir)));
  }

  const existingLegacy = legacy.filter((f) => f.exists);
  const legacyEvidenceSetPreserved =
    legacyDatabaseExists &&
    existingLegacy.every((f) => preserved.find((p) => p.name === f.name)?.copied === true);
  const copiedEntries = preserved.filter((p) => p.copied);
  const byteIdenticalCopyVerified =
    legacyDatabaseExists &&
    copiedEntries.length === existingLegacy.length &&
    copiedEntries.every((p) => p.hashesMatch === true);

  return {
    platformSupported: true,
    packageName,
    databasesDir,
    legacy,
    current,
    preserved,
    legacyDatabaseExists,
    legacyEvidenceSetPreserved,
    byteIdenticalCopyVerified,
    fatalError: null,
  };
}

/** No hashes, no paths, no SQLite jargon — just what Kevin actually needs to
 *  know: was the old file found, and is a verified safe copy sitting beside
 *  it now. Technical detail still included below the plain answer, for
 *  whoever reads this next. */
export function formatLegacyStorageReport(r: LegacyStorageReport): string {
  const lines: string[] = [];
  lines.push('=== LEGACY SAVE DATABASE CHECK (read-only — nothing was changed) ===');
  lines.push('');
  if (!r.platformSupported) {
    lines.push("This check only applies on Android, and either this device isn't Android or the check couldn't run.");
    if (r.fatalError) lines.push(`Detail: ${r.fatalError}`);
    return lines.join('\n');
  }
  if (r.fatalError) {
    lines.push(`Could not complete the check: ${r.fatalError}`);
    return lines.join('\n');
  }

  lines.push(
    r.legacyDatabaseExists
      ? 'RESULT: FOUND — the old pre-update save database still exists on this device.'
      : 'RESULT: NOT FOUND — no trace of the old pre-update save database was found on this device.',
  );
  if (r.legacyDatabaseExists) {
    lines.push(
      r.byteIdenticalCopyVerified
        ? 'A safe, verified copy was made — the copy matches the original exactly, byte for byte.'
        : 'A safe copy was ATTEMPTED but could not be fully verified — see details below. Nothing about the original was changed either way.',
    );
  }
  lines.push('');

  lines.push('--- LEGACY FILES (the old save engine) ---');
  for (const f of r.legacy) {
    lines.push(`${f.name}: ${f.exists ? `present (${f.sizeBytes} bytes)` : 'absent'}${f.error ? ` — read error: ${f.error}` : ''}`);
  }
  lines.push('');
  lines.push('--- CURRENT FILES (the engine the app uses today, for comparison only) ---');
  for (const f of r.current) {
    lines.push(`${f.name}: ${f.exists ? `present (${f.sizeBytes} bytes)` : 'absent'}${f.error ? ` — read error: ${f.error}` : ''}`);
  }

  if (r.preserved.length > 0) {
    lines.push('');
    lines.push('--- PRESERVATION COPIES ---');
    for (const p of r.preserved) {
      if (!p.copied) {
        lines.push(`${p.name}: copy NOT completed${p.error ? ` — ${p.error}` : ''}`);
        continue;
      }
      lines.push(`${p.name}: copied to app cache; original/copy hashes ${p.hashesMatch ? 'MATCH' : 'DO NOT MATCH'}`);
    }
  }

  lines.push('');
  lines.push(`(technical: package ${r.packageName}, directory ${r.databasesDir})`);
  return lines.join('\n');
}

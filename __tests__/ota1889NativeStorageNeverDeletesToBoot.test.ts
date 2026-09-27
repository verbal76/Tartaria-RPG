// OTA-1889 — the native door never trades the save for a boot.
//
// Forensics (OTA-1888/1889): the Room ("next") storage engine that
// @react-native-async-storage/async-storage ships is opt-in
// (AsyncStorage_useNextStorage, default false) and nothing in this repo's
// app.json/eas.json/plugins ever turns it on — so RKStorage/
// catalystLocalStorage (ReactDatabaseSupplier.java) is the ONLY Android
// save store Tartaria has ever compiled. There is no SQLite-to-Room
// migration to protect on Android.
//
// The real defect: the library's OWN ensureDatabase() retried a failed
// open exactly once, and on that second failure called deleteDatabase()
// unconditionally — wiping the player's only save the moment SQLite
// couldn't open the file (corruption, a disk-full write, a killed
// process mid-write) — inside native module init, before any JS
// (including OTA-1888's own boot-time preservation snapshot) ever runs.
//
// patches/@react-native-async-storage+async-storage+2.2.0.patch removes
// that delete entirely: a failed open now preserves a verified quarantine
// copy of RKStorage + any -wal/-shm/-journal companions BEFORE retrying,
// never deletes anything, and returns false (a contract every caller in
// AsyncStorageModule.java already handles) instead of destroying data to
// force a boot.
//
// This suite reads the ACTUAL file `npm ci`'s postinstall (patch-package)
// leaves on disk — the one that really ships — not a copy or a summary of
// intent. It is a mechanical door, not a comment: it fails if a future
// `npm install`, dependency bump, or manual edit ever restores the
// delete-on-open-failure shape, and it fails if Tartaria's own config
// ever turns on the Room engine this patch does not touch.

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..');
const src = (...p: string[]) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

const REACT_DATABASE_SUPPLIER = path.join(
  'node_modules', '@react-native-async-storage', 'async-storage', 'android', 'src', 'main',
  'java', 'com', 'reactnativecommunity', 'asyncstorage', 'ReactDatabaseSupplier.java',
);

/** Slices out one method's body by brace-depth from its signature line to its matching close. */
function extractMethodBody(fileText: string, signatureNeedle: string): string {
  const start = fileText.indexOf(signatureNeedle);
  if (start === -1) {
    throw new Error(`signature not found: ${signatureNeedle}`);
  }
  const openBrace = fileText.indexOf('{', start);
  let depth = 0;
  let i = openBrace;
  for (; i < fileText.length; i++) {
    if (fileText[i] === '{') depth++;
    else if (fileText[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return fileText.slice(openBrace, i + 1);
}

describe('OTA-1889 — ReactDatabaseSupplier.ensureDatabase() never deletes RKStorage to open it', () => {
  it('carries the Tartaria owner patch marker (proves the patch actually applied, not a raw upstream file)', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    expect(text).toContain('TARTARIA OWNER PATCH');
  });

  it('ensureDatabase() contains no call to deleteDatabase() anywhere in its body', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    const body = extractMethodBody(text, 'boolean ensureDatabase()');
    expect(body).not.toMatch(/deleteDatabase\s*\(/);
  });

  it('ensureDatabase() preserves before it ever retries a failed open', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    const body = extractMethodBody(text, 'boolean ensureDatabase()');
    expect(body).toMatch(/preserveBeforeRecoveryAttempt\s*\(/);
    // Preservation must happen inside the catch of the failed open, not after
    // the loop — i.e. it must appear between the SQLiteException catch and
    // the loop's closing brace, not merely be called somewhere unrelated.
    const catchIdx = body.indexOf('catch (SQLiteException');
    const preserveIdx = body.indexOf('preserveBeforeRecoveryAttempt(');
    expect(catchIdx).toBeGreaterThan(-1);
    expect(preserveIdx).toBeGreaterThan(catchIdx);
  });

  it('a failed open returns false rather than throwing (matches AsyncStorageModule\'s own if (!ensureDatabase()) contract) and never deletes on the way out', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    const body = extractMethodBody(text, 'boolean ensureDatabase()');
    // The terminal "still couldn't open it" branch must return false, not throw.
    const terminalBranch = body.slice(body.indexOf('if (mDb == null)'));
    expect(terminalBranch).toMatch(/return false;/);
    expect(terminalBranch).not.toMatch(/throw lastSQLiteException/);
  });

  it('preserveBeforeRecoveryAttempt() copies RKStorage and its -wal/-shm/-journal companions and verifies each copy', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    const body = extractMethodBody(text, 'void preserveBeforeRecoveryAttempt()');
    expect(body).toMatch(/PRESERVABLE_SUFFIXES/);
    expect(body).toMatch(/copyFileVerified/);
    // Never removes or moves the original — this method may only read the
    // source files and write into the quarantine directory.
    expect(body).not.toMatch(/\.delete\(\)/);
    expect(body).not.toMatch(/deleteDatabase\s*\(/);
  });
  it('the preservation suffix table actually names RKStorage\'s WAL, SHM and journal companions', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    const table = text.slice(text.indexOf('PRESERVABLE_SUFFIXES ='), text.indexOf(';', text.indexOf('PRESERVABLE_SUFFIXES =')));
    for (const suffix of ['-wal', '-shm', '-journal']) {
      expect(table).toContain(suffix);
    }
  });

  it('get() still throws rather than silently handing back a null database when ensureDatabase() fails', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    const body = extractMethodBody(text, 'SQLiteDatabase get()');
    expect(body).toMatch(/if \(!ensureDatabase\(\)\)/);
    expect(body).toMatch(/throw new RuntimeException/);
  });

  it('the quarantine directory is bounded — no unlimited uncontrolled backup growth', () => {
    const text = src(REACT_DATABASE_SUPPLIER);
    expect(text).toMatch(/MAX_PRESERVED_INCIDENTS\s*=\s*\d+/);
    expect(text).toMatch(/prunePreservedIncidents/);
  });
});

describe('OTA-1889 — the patch this protection depends on is the one actually committed', () => {
  it('patches/@react-native-async-storage+async-storage+2.2.0.patch exists and touches ensureDatabase', () => {
    const patchText = src('patches', '@react-native-async-storage+async-storage+2.2.0.patch');
    expect(patchText).toMatch(/ensureDatabase/);
    expect(patchText).toMatch(/deleteDatabase/); // removing the call still mentions its name in a diff
    expect(patchText).toMatch(/TARTARIA OWNER PATCH/);
  });

  it('package.json still runs patch-package on every install, so a future npm ci reapplies this patch', () => {
    const pkg = JSON.parse(src('package.json'));
    expect(pkg.scripts?.postinstall).toBe('patch-package');
    expect(pkg.dependencies?.['@react-native-async-storage/async-storage'] ?? pkg.devDependencies?.['@react-native-async-storage/async-storage']).toBe('2.2.0');
  });
});

describe('OTA-1889 — the Room engine this patch does not touch is still, in fact, never enabled', () => {
  it('async-storage\'s own default for AsyncStorage_useNextStorage is still false', () => {
    const gradleConfig = src(
      'node_modules', '@react-native-async-storage', 'async-storage', 'android', 'config.gradle',
    );
    const line = gradleConfig
      .split('\n')
      .find((l) => l.includes('useNextStorage') && l.includes('getFlagOrDefault'));
    expect(line).toBeDefined();
    expect(line).toMatch(/false\s*\)/);
  });

  it('nothing in app.json, eas.json, or plugins/ ever sets AsyncStorage_useNextStorage', () => {
    const appJson = src('app.json');
    expect(appJson).not.toMatch(/useNextStorage/);
    let easJsonText = '';
    try {
      easJsonText = src('eas.json');
    } catch {
      // eas.json may not exist in every checkout shape; absence is fine — we
      // only assert it never mentions the flag when it does exist.
    }
    expect(easJsonText).not.toMatch(/useNextStorage/);
    const pluginsDir = path.join(repoRoot, 'plugins');
    const pluginFiles = fs.existsSync(pluginsDir)
      ? fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.js'))
      : [];
    for (const file of pluginFiles) {
      const contents = fs.readFileSync(path.join(pluginsDir, file), 'utf8');
      expect(contents).not.toMatch(/useNextStorage/);
    }
  });
});

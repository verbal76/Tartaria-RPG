// OTA-1494 — THE LOG SAYS WHICH ERA EACH LINE BELONGS TO.
//
// ⚠⚠ THE MEASUREMENT (sentry-inbox/player-log_2026-08-24T21-20-59, the owner's
// first successful SEND LOG): 1,027 entries — 987 from Aug 9, 22 from Aug 23,
// 18 from Aug 24. 111KB against a 400,000-char cap, so diskLogCap had never
// trimmed a byte; the log simply accumulated across two weeks and dozens of
// builds with no visible seam.
//
// ⚠⚠ AND IT COST A WRONG DIAGNOSIS THE SAME HOUR. Three "STANDING DOWN for
// good" lines in that bundle were read as a live repeat-logging loop and
// nearly became an OTA — they were Aug 9, build 1203, and OTA-1181 had already
// fixed that repeat two weeks earlier. The defect class is DIAGNOSTICS THAT
// MIX ERAS WITHOUT SAYING SO; the fix is one line at a seam that already
// exists (slotSlice's OTA-099 session marker), not a trim and not a new
// subsystem. The owner chose the banner WITHOUT an age-based drop.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { seamBanner, lastEntryTime, gapPhrase } from '../app/engine/logSeam';
import { between } from '../test-utils/srcBlock';

const SLOT = readFileSync(
  join(__dirname, '..', 'app', 'state', 'slices', 'slotSlice.ts'), 'utf8');

describe('OTA-1494 — the banner states the era', () => {
  it('⚠⚠ build, wall clock and the gap since the previous entry', () => {
    const now = Date.parse('2026-08-24T21:20:59.000Z');
    const line = seamBanner({
      build: '2026-08-24-1494-x',
      now,
      previousEntryAt: Date.parse('2026-08-09T03:54:08.000Z'),
    });
    expect(line).toContain('2026-08-24-1494-x');
    expect(line).toContain('2026-08-24T21:20:59');
    // The owner's real gap: fifteen days. A reader cannot miss that.
    expect(line).toMatch(/previous entry 15d \d+h earlier/);
  });

  it('⚠ a fresh log says so rather than inventing a gap', () => {
    const line = seamBanner({ build: 'b', now: 1, previousEntryAt: null });
    expect(line).toMatch(/first entries/i);
    expect(line).not.toContain('previous entry');
  });

  it('⚠ an OTA upgrade names where it came from, on the same line', () => {
    const line = seamBanner({
      build: 'new', now: 2, previousEntryAt: 1, appliedFrom: 'old',
    });
    expect(line).toMatch(/updated from\s+old/i);
  });

  it('⚠ gap phrasing covers moments, minutes, hours and days', () => {
    expect(gapPhrase(5_000)).toBe('moments');
    expect(gapPhrase(9 * 60_000)).toBe('9m');
    expect(gapPhrase(3 * 3_600_000 + 4 * 60_000)).toBe('3h 4m');
    expect(gapPhrase(15 * 86_400_000 + 2 * 3_600_000)).toBe('15d 2h');
    expect(gapPhrase(Number.NaN)).toBe('unknown'); // never a bogus number
  });
});

describe('OTA-1494 — reading the previous entry out of a real log', () => {
  it('⚠⚠ the LAST stamp wins, not the last line — the export appends unstamped text', () => {
    // stampLogExport puts the device summary after the entries; a tail line
    // without a stamp must not read as "no history".
    const body = [
      '[2026-08-09T03:53:02.206Z] [debug] old line',
      '[2026-08-24T21:20:51.719Z] [debug] newest line',
      'Device',
      '  Name: iPhone',
    ].join('\n');
    expect(lastEntryTime(body)).toBe(Date.parse('2026-08-24T21:20:51.719Z'));
  });

  it('⚠ an empty or stampless log answers null, not a guess', () => {
    expect(lastEntryTime('')).toBeNull();
    expect(lastEntryTime('=== TARTARIA LOG · BEGIN ===')).toBeNull();
  });

  it('⚠⚠ THE REAL BUNDLE: the fifteen-day seam is what the banner would have announced', () => {
    // Drives the actual artifact this OTA came from, when it is present.
    const real = join(__dirname, '..', 'sentry-inbox',
      'player-log_2026-08-24T21-20-59_899e766d7754', 'game-log.txt');
    if (!existsSync(real)) return; // inbox is synced evidence, not a fixture
    const body = readFileSync(real, 'utf8');
    const last = lastEntryTime(body);
    expect(last).not.toBeNull();
    // The oldest entries are Aug 9; the newest are Aug 24 — the era span that
    // made this log misleading.
    expect(body).toContain('[2026-08-09T');
    expect(new Date(last!).toISOString().slice(0, 10)).toBe('2026-08-24');
  });
});

describe('OTA-1494 — wired at the seam that already existed', () => {
  it('⚠⚠ the banner is written where the OTA-099 session marker is written', () => {
    const span = between(SLOT, 'OTA session start: ${OTA_BUILD_ID}', '} catch {');
    expect(span).toContain('seamBanner({');
    expect(span).toContain('previousEntryAt: lastEntryTime(existing)');
  });

  it('⚠⚠ it never delays or breaks a slot load', () => {
    // Fire-and-forget with its own catch: a log read must not sit in the
    // load path, and a missing banner must not cost the player a load.
    const span = between(SLOT, 'void readFullLog()', '/* a missing banner must never cost a load */');
    expect(span).toContain('.catch(');
    expect(SLOT).toContain('void readFullLog()');
  });

  it('⚠ the OTA-099 markers themselves are untouched — the banner ADDS, it does not replace', () => {
    expect(SLOT).toContain('`OTA applied: ${ota099UpdatedFrom} → ${OTA_BUILD_ID}.`');
    expect(SLOT).toContain("get().appendLog('debug', `OTA session start: ${OTA_BUILD_ID}.`)");
  });

  it('⚠⚠ NO age-based trim rode along — the owner asked for the banner only', () => {
    // ⚠ Claim-level, and my first draft got this wrong: matching /age/ over the
    // whole file hit the word "staged" in OTA-398's own header. The claim is
    // about CODE — the cap still trims by SIZE and by nothing else.
    const cap = readFileSync(join(__dirname, '..', 'app', 'engine', 'diskLogCap.ts'), 'utf8');
    const code = cap.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/MAX_DISK_LOG_CHARS\s*=\s*400_000/);
    expect(code).toMatch(/content\.length\s*<=\s*maxChars/);
    expect(code).not.toMatch(/Date|days|timestamp|olderThan/i);
  });
});

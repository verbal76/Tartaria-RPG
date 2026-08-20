/**
 * OTA-1385 — the four OTA sequences become one.
 *
 * Owner: *"ota sequences become 1."*
 *
 * Until OTA-1384 each branch counted its own OTAs and carried its own
 * DISPLAY_VERSION. There is now one trunk and one sequence, and every OTA from
 * here applies to all four products.
 *
 * ⚠⚠ THE ONE THING WORTH A TEST rather than a comment: the unified version must
 * be ABOVE every retired line's last number. html was on 4.30.10 — AHEAD of
 * golem's 4.29.278 — so the obvious move (carry on counting from the trunk)
 * would have moved html players' version backwards. It is only cosmetic, which
 * is exactly why it would have shipped unnoticed: the Expo `version` that gates
 * OTA compatibility is 2.4.1 and unchanged, so nothing would have broken. It
 * would just have looked, in every About screen and every bug report and every
 * crash record, like the app had been rolled back.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { DISPLAY_VERSION, OTA_BUILD_ID } from '../app/buildInfo';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** The last number each line carried before its sequence was retired. */
const RETIRED = {
  golem: '4.29.278',
  hal: '4.29.233',
  steam: '4.29.220',
  html: '4.30.10',
};

const cmp = (a: string, b: string): number => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

describe('OTA-1385 — no product moves backwards', () => {
  it('⚠⚠ the unified version is above EVERY retired line, not just the trunk', () => {
    for (const [line, last] of Object.entries(RETIRED)) {
      expect(cmp(DISPLAY_VERSION, last)).toBeGreaterThan(0);
    }
  });

  it('⚠⚠ …and html is the one that made that necessary', () => {
    // html (4.30.10) was AHEAD of the trunk (4.29.278). Continuing the trunk's
    // patch count would have decreased it. This assertion is the reason the
    // jump to 4.31.0 exists, stated so nobody later "tidies" it back down.
    expect(cmp(RETIRED.html, RETIRED.golem)).toBeGreaterThan(0);
    expect(cmp(DISPLAY_VERSION, RETIRED.html)).toBeGreaterThan(0);
  });

  it('⚠ the sanity check on my own comparator', () => {
    expect(cmp('4.31.0', '4.30.10')).toBeGreaterThan(0);   // 31 > 30, not "0 < 10"
    expect(cmp('4.29.278', '4.30.10')).toBeLessThan(0);
    expect(cmp('4.31.0', '4.31.0')).toBe(0);
  });

  it('a MINOR bump resets PATCH, per the scheme this file documents', () => {
    const [, minor, patch] = DISPLAY_VERSION.split('.').map(Number);
    expect(minor).toBe(31);
    expect(patch).toBe(0);
  });
});

describe('OTA-1385 — the sequence itself', () => {
  it('⚠ golem\'s number continued, because it was the highest of the four', () => {
    // 1384 vs HAL 1367, steam 1371, html web11 — so no OTA number goes
    // backwards either.
    expect(OTA_BUILD_ID).toContain('1385');
    expect(src('app', 'buildInfo.ts')).toContain(
      "// SUPERSEDED: export const OTA_BUILD_ID = '2026-08-20-1384-one-trunk-four-products';");
  });

  it('⚠⚠ the ledger says every row from here covers ALL FOUR products', () => {
    // The per-line channel column is meaningful on older rows and misleading on
    // new ones. Saying so in the file is what stops the next reader assuming a
    // row applied to one line.
    const v = src('VERSION.md');
    expect(v).toContain('ONE SEQUENCE FOR ALL FOUR PRODUCTS');
    expect(v).toContain('⚠⚠ ALL FOUR PRODUCTS');
    expect(v).toContain('history rather than instruction');
  });

  it('⚠⚠ and that the retired sequences are HISTORY, not deletions', () => {
    // The thing most likely to be misread later: their numbering stopped, their
    // record did not.
    const v = src('VERSION.md');
    expect(v).toContain('The retired sequences are not deleted');
    expect(v).toContain('What ended is their\nFUTURE numbering, not their history.');
  });

  it('⚠ each retired line\'s last number is recorded, so this is checkable later', () => {
    const v = src('VERSION.md');
    for (const last of Object.values(RETIRED)) expect(v).toContain(last);
  });
});

describe('OTA-1385 — what did NOT change', () => {
  it('⚠⚠ the Expo version that gates OTA compatibility is untouched', () => {
    // This is the number that decides whether an OTA can land on an installed
    // binary. Moving it orphans updates. DISPLAY_VERSION is the cosmetic one and
    // the only one this OTA touches.
    expect(JSON.parse(src('app.json')).expo.version).toBe('2.4.1');
    expect(JSON.parse(src('app.json')).expo.runtimeVersion).toEqual({ policy: 'appVersion' });
  });

  it('the four products still resolve to four distinct identities', () => {
    // Unifying the NUMBER must not unify the products. app.config.js is
    // untouched by this OTA; check:lines proves it live.
    const cfg = src('app.config.js');
    for (const line of ['golem', 'hal', 'steam', 'html']) expect(cfg).toContain(`  ${line}: {`);
  });
});

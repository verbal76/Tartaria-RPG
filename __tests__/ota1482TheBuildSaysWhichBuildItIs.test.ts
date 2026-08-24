// OTA-1482 — THE BUILD SAYS WHICH BUILD IT IS.
//
// ⚠⚠ Owner, from the device: *"I'm only on OTA 1469 and it says fully up to
// date."* BOTH HALVES WERE TRUE. Eleven publish runs (OTA-1470…1480) were green
// and the bundles were on the phone — but `OTA_BUILD_ID` in buildInfo.ts is the
// number the game DISPLAYS, the just-updated toast keys on it changing
// (bootSlice), and save exports name it — and no session since 1469 had stamped
// it. Eleven real updates arrived wearing the old badge, silently.
//
// The same class as the compass (OTA-1477) and the tier ladder (OTA-1478): one
// fact — "which OTA is this" — derived twice, commit title and constant, with
// nothing tying them. The tie is `check:otastamp`: every OTA creates an
// `otaNNNN*.test.ts` suite in the same commit (the standing test rule), so the
// highest suite number IS the repo's record of the newest OTA, and the stamp
// must name exactly that number. Forgetting the stamp now fails the gate
// chain, not the player.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { OTA_BUILD_ID } from '../app/buildInfo';
import { getBuildCodename } from '../app/buildCodename';

const ROOT = join(__dirname, '..');

const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})-(\d{3,4})-([a-z0-9-]+)$/;

describe('self-test', () => {
  it('the stamp matcher recognises the real format and rejects near-misses', () => {
    expect(STAMP_RE.test('2026-08-24-1469-the-course-banner-tells-the-truth')).toBe(true);
    expect(STAMP_RE.test('2026-08-24-1469')).toBe(false);          // no slug
    expect(STAMP_RE.test('1469-some-slug')).toBe(false);           // no date
    expect(STAMP_RE.test('2026-08-24-1469-Bad Slug')).toBe(false); // not kebab
  });
});

describe('the stamp', () => {
  it('⚠⚠ names the newest OTA suite in the repo — the gate:otastamp invariant', () => {
    const m = STAMP_RE.exec(OTA_BUILD_ID);
    expect(m).not.toBeNull();
    const stamped = Number(m![4]);
    let maxSuite = 0;
    let count = 0;
    for (const f of readdirSync(join(ROOT, '__tests__'))) {
      const s = /^ota(\d{3,4})\D/.exec(f);
      if (!s) continue;
      count++;
      maxSuite = Math.max(maxSuite, Number(s[1]));
    }
    expect(count).toBeGreaterThan(100); // the walk is not a no-op
    expect(stamped).toBe(maxSuite);
  });

  it('⚠ the superseded 1469 stamp is kept as a record, not deleted', () => {
    // Saves exported between 1469 and this stamp name a build they are newer
    // than; the SUPERSEDED line is how a bug report from that window resolves.
    const src = readFileSync(join(ROOT, 'app', 'buildInfo.ts'), 'utf8');
    expect(src).toContain("// SUPERSEDED: export const OTA_BUILD_ID = '2026-08-24-1469");
    // Exactly one LIVE export — a second would be the two-derivations defect
    // reborn inside the very constant that fixes it.
    const lives = src.match(/^export const OTA_BUILD_ID = /gm) ?? [];
    expect(lives.length).toBe(1);
  });

  it('⚠ the codename layer degrades loudly, not wrongly, for the new id', () => {
    // The CODENAMES map stopped at OTA-623; everything since renders as the raw
    // id in parens — diagnostic by design ("the parens make it obvious the map
    // needs an entry"). What must NOT happen is a stale or invented name.
    const name = getBuildCodename();
    expect(name === `(${OTA_BUILD_ID})` || !name.includes('(')).toBe(true);
    expect(name).not.toContain('1469');
  });

  it('⚠ the just-updated toast will fire off this change — the key is the stamp', () => {
    // bootSlice compares the stored last-seen id against OTA_BUILD_ID and pops
    // the one-shot "system updated" modal when they differ. That is why eleven
    // silent updates FELT like none: the key never moved. Shape-assert the
    // comparison reads this constant, not some second copy of it.
    const boot = readFileSync(join(ROOT, 'app', 'state', 'slices', 'bootSlice.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(boot).toContain('lastSeen !== OTA_BUILD_ID');
    expect(boot).toContain("AsyncStorage.setItem(LAST_BUILD_KEY, OTA_BUILD_ID)");
  });
});

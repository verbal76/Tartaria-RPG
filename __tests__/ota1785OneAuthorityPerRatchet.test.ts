/**
 * OTA-1785 — ONE AUTHORITY PER RATCHET.
 *
 * Owner: *"Do not knowingly carry contradictory test authorities into Legacy
 * Hunt... Where multiple suites are protecting the SAME architectural claim,
 * they should consume one authority or otherwise have one unmistakable source
 * of truth. Do not weaken the actual protections merely to make the tests
 * agree. If two apparently duplicated ratchets actually protect different
 * claims, preserve both and document the distinction."*
 *
 * ⚠⚠⚠ IT WAS WORSE THAN I REPORTED, AND THAT CORRECTION IS THE FIRST FINDING.
 * I told the owner there were four gameStore ceiling authorities. There were
 * THIRTEEN: twelve suites asserting `< 37000` and `ota1717` asserting `< 36999`.
 * The tightest silently governed, so a pass comfortably under 37,000 could still
 * be red, and the failure named a dog-clock OTA from weeks earlier rather than
 * the rule it had broken. That happened three times in one session.
 *
 * ⚠⚠ AND THERE WAS NO GATE. `check:lines` sounds like a line-count gate and is
 * not — it is `verify-lines.mjs`, proving the four PRODUCT lines resolve
 * distinct Expo configs. So all three ratchets in this pass were enforceable
 * only by a fourteen-minute surface run. All three are gates now.
 *
 * WHAT THIS PASS DID, PER RATCHET:
 *   store ceiling  13 → 1 number, in a new gate. All 13 suites KEPT, because
 *                  they are 13 different sentences — the campaign ratchet, and
 *                  twelve "this OTA moved X out and it stayed out" claims —
 *                  that merely shared a number. `ota1717` is re-expressed: its
 *                  claim is that a collapse RETURNED 62 lines, which the two
 *                  assertions above it already prove.
 *   kit palette    2 copies → 1, and the STRONGER one survives. `ota1744`'s had
 *                  four exempt names instead of five and no chroma ceiling.
 *   kit exports    2 copies → 1. OTA-1777 raised one and left the other; only a
 *                  full surface caught it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const STORE_GATE = 'scripts/check-store-ceiling.mjs';
const PALETTE_GATE = 'scripts/check-kit-palette.mjs';
const EXPORTS_GATE = 'scripts/check-kit-exports.mjs';

const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

/* This suite reads the ceiling the same way the thirteen do. */
function storeCeiling(): number {
  const gate = read(STORE_GATE);
  const m = /export const CEILING = (\d+);/.exec(gate);
  if (!m) throw new Error('check-store-ceiling.mjs no longer declares CEILING');
  return parseInt(m[1]!, 10);
}


describe('OTA-1785 — the three authorities exist and are wired as gates', () => {
  it.each([
    ['check:storeceiling', STORE_GATE],
    ['check:kitpalette', PALETTE_GATE],
    ['check:kitexports', EXPORTS_GATE],
  ])('%s runs %s', (script, file) => {
    expect(pkg.scripts[script]).toBe(`node ${file}`);
    expect(read(file).length).toBeGreaterThan(0);
  });

  /* ⚠ A GATE IS THE POINT, NOT A NICETY. Every one of these rules was
   * previously reachable only through the full surface. Three separate passes
   * in one session burned ~14 minutes each discovering a ceiling a gate would
   * have named in milliseconds. */
  it('each names its own limit exactly once', () => {
    expect((read(STORE_GATE).match(/export const CEILING = \d+;/g) ?? [])).toHaveLength(1);
    expect((read(EXPORTS_GATE).match(/export const (COMPONENTS|HELPERS|TOTAL) = \d+;/g) ?? [])).toHaveLength(3);
    expect((read(PALETTE_GATE).match(/export const (CHROMA_CEILING|NEAR_NEUTRAL) = \d+;/g) ?? [])).toHaveLength(2);
  });
});

describe('OTA-1785 — no suite retypes a number the gates own', () => {
  const suites = require('node:fs')
    .readdirSync(join(ROOT, '__tests__'))
    .filter((f: string) => /\.test\.tsx?$/.test(f));

  /* ⚠⚠⚠ THE ASSERTION THAT ACTUALLY CLOSES THIS. Re-pointing thirteen suites is
   * worth nothing if the fourteenth is written next week with the number typed
   * in again — which is exactly how thirteen happened. So: no suite may compare
   * gameStore's line count against a literal.
   * ⚠ Scoped to the SHAPE that caused the problem (a length compared to a
   * number), not to the digits, so renumbering the ceiling cannot make this
   * test lie. */
  it('no literal line bound can ever be the one that fails', () => {
    /* ⚠⚠⚠ THE GUARD IS ABOUT WHAT CAN BIND, NOT ABOUT DIGITS — and the first
     * cut of it was wrong in an instructive way. It banned every literal line
     * bound and immediately found NINE MORE that I had not counted: the
     * extraction campaign's own ladder, one per slice —
     *     ota1392 45050 · ota1393 44891 · ota1394 44200 · ota1395 43600
     *     ota1396 43300 · ota1397 43000 · ota1398 41800 · ota1399 39700
     * So the real number of assertions on this file's size was 22, not 13.
     *
     * ⚠⚠ BUT THOSE NINE ARE NOT A SECOND AUTHORITY, AND DELETING THEM WOULD
     * DESTROY NINE TRUE SENTENCES. Each says "slice N's extraction has not been
     * reversed" and each names the count on the day that slice landed. They are
     * dated RECORDS. A record can never be the thing that fails, because the
     * store has been far below all of them since 2026-07.
     * The distinction that matters, then, is not literal-vs-read. It is
     * BINDING-vs-HISTORICAL: any literal bound must sit strictly ABOVE the
     * governed ceiling, so the ceiling is always the first thing to fail and the
     * failure always names the rule it broke. That is precisely what went wrong
     * before — `ota1717`'s 36,999 sat BELOW the 37,000 everyone else read, so it
     * governed silently and its failure named a dog-clock OTA. */
    /* ⚠ THE SUBJECT IS MATCHED, NOT THE FILE. A first cut keyed off "the file
     * mentions gameStore.ts" and flagged `ota1404`, which bounds a TWELVE-LINE
     * slice of the combat resolver in a file that happens to name the store
     * elsewhere. These four spellings are how the store is actually referred to
     * across the campaign; anything else is not this file's size. */
    const SUBJECT = /expect\(\s*(STORE|store_?|src\('app', 'state', 'gameStore\.ts'\))\.split\('\\n'\)\.length\)\.toBeLessThan(?:OrEqual)?\(\s*(\d+)\s*\)/g;
    const ceiling = storeCeiling();
    const offenders: string[] = [];
    for (const f of suites) {
      for (const m of read('__tests__', f).matchAll(SUBJECT)) {
        const n = parseInt(m[2]!, 10);
        if (n <= ceiling) offenders.push(`${f}: bounds the store at ${n} (<= ceiling ${ceiling})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the suites that carried the governing number now read it', () => {
    /* ⚠ COUNTED BY WHO DEFINES THE READER, not by who mentions its name — this
     * suite mentions it constantly and self-counted on the first run. */
    const readers = suites
      .filter((f: string) => !f.startsWith('ota1785'))
      .filter((f: string) => read('__tests__', f).includes('function storeCeiling(): number'));
    expect(readers.length).toBe(13);
  });

  /* ⚠⚠ AND THE KIT NUMBERS TOO. The export budget existed in two suites and one
   * raise reached only one of them. */
  it('nobody retypes the kit export budget', () => {
    const offenders: string[] = [];
    for (const f of suites) {
      const src = read('__tests__', f);
      if (!/tartariaKit/.test(src)) continue;
      const hits = src.match(/(?:components|helpers|exported)\.length\)\.toBeLessThanOrEqual\(\s*\d+\s*\)/g) ?? [];
      if (hits.length) offenders.push(`${f}: ${hits.join(' , ')}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('OTA-1785 — the stronger rule survived, not the tidier one', () => {
  /* Owner: *"Do not weaken the actual protections merely to make the tests
   * agree."* `ota1742`'s palette rule had five exempt names and a chroma
   * ceiling; `ota1744`'s copy had four and none. Consolidating on the stronger
   * one is a strengthening — and `#F0C96A`, the fifth name, is the whole reason
   * the mechanism exists: OTA-1769 MEASURED it at chroma 134, refused to add it,
   * and held the question until the owner ruled. */
  it('all five exempt names are in the surviving rule', () => {
    const gate = read(PALETTE_GATE);
    for (const h of ['C9A86A', '8E7548', 'E07A5F', '5A2A26', 'F0C96A']) {
      expect(gate).toContain(`'${h}'`);
    }
  });

  it('the chroma ceiling that the weaker copy lacked is the one that survived', () => {
    expect(read(PALETTE_GATE)).toContain('export const CHROMA_CEILING = 60;');
  });

  /* ⚠ GRADE THE CODE, NOT THE PROSE — inside the gate itself this time, which is
   * how OTA-1782 tripped `ota1744`: the kit's comments quote a hex that lives in
   * another file. A rule that can be broken by writing a measurement down
   * teaches people not to write measurements down. */
  it('the palette gate strips comments before it counts', () => {
    const gate = read(PALETTE_GATE);
    expect(gate).toContain('export function stripComments');
    expect(gate).toContain('stripComments(src)');
  });
});

describe('OTA-1785 — the claims that are NOT duplicates were kept', () => {
  /* ⚠⚠⚠ THE HALF OF THE RULING THAT IS ABOUT RESTRAINT. Owner: *"If two
   * apparently duplicated ratchets actually protect different claims, preserve
   * both and document the distinction rather than forcing false
   * consolidation."* Thirteen suites shared one NUMBER and made thirteen
   * different CLAIMS. `ota1400` is the campaign ratchet — the record of
   * 45,050 → 39,470 → here across nine extraction slices. The others each say
   * something narrower: this OTA absorbed a feature, or moved a writer out, and
   * did not give that ground back. Deleting twelve of them to leave one number
   * would have thrown away twelve true sentences. */
  it('all thirteen suites still assert the ceiling, and nine historical records survive too', () => {
    const all = require('node:fs')
      .readdirSync(join(ROOT, '__tests__'))
      .filter((f: string) => /\.test\.tsx?$/.test(f));
    const governed = all
      .filter((f: string) => !f.startsWith('ota1785'))
      .filter((f: string) => read('__tests__', f).includes('function storeCeiling(): number'));
    expect(governed.length).toBe(13);
    /* ⚠ AND THE CAMPAIGN LADDER IS UNTOUCHED. Eight slice OTAs each named the
     * count on the day their extraction landed. They are records of nine
     * separate wins, not nine copies of one rule, and they are all far above the
     * governed ceiling so none can ever be the thing that fails. */
    const ladder = ['ota1392', 'ota1393', 'ota1394', 'ota1395', 'ota1396', 'ota1397', 'ota1398', 'ota1399'];
    for (const slice of ladder) {
      const f = all.find((x: string) => x.startsWith(slice));
      expect({ slice, present: !!f }).toEqual({ slice, present: true });
      expect(read('__tests__', f!)).toMatch(/toBeLessThan\(\d{5}\)/);
    }
  });

  /* ⚠ `ota1717` IS THE ONE THAT WAS GENUINELY DIFFERENT, and its claim is
   * proved by the two assertions above the ceiling line — the dog-clock
   * functions LEAVING the file is what the 62 lines were. What is left for the
   * count to say is that the gain has not since been spent. */
  it("ota1717's own claim — that the collapse moved the functions out — still stands", () => {
    const s = read('__tests__', 'ota1717OneDogOneClock.test.ts');
    expect(s).toContain('OTA-1717 — dogThresholdCheck USED TO RUN HERE');
    expect(s).toContain('OTA-1717 — dogThresholdCheck AND DOG_LOYALTY_THRESHOLDS LIVED HERE');
    expect(s).not.toContain('toBeLessThan(36999)');
  });
});

describe('OTA-1785 — the ceiling is where the store actually is', () => {
  /* ⚠ NO HEADROOM, the same discipline as `check:gold`. The store is AT its
   * ceiling: new store code must displace old store code, or the responsibility
   * belongs outside the file. The extraction that follows lowers this number in
   * ONE place instead of thirteen — which is the practical point of the whole
   * consolidation. */
  it('is set to the measured count, with nothing spare', () => {
    const m = /export const CEILING = (\d+);/.exec(read(STORE_GATE));
    const ceiling = parseInt(m![1]!, 10);
    const actual = read('app', 'state', 'gameStore.ts').split('\n').length;
    expect(actual).toBeLessThanOrEqual(ceiling);
    expect(ceiling - actual).toBeLessThanOrEqual(0);
  });
});

// OTA-1477 — THE COMPASS AND THE TRAVEL BANNER NOW PRICE A DISTANCE THE SAME WAY.
//
// From the 4.32.11 device log, 70 seconds apart, describing about the same two tiles:
//
//     23:49:04  You set course for Voronov. 2 tiles — about 5 hours of travel, all in.
//     23:50:14  [Voronov] north: Drakova (2 days' travel) · east: Ostragar (9 days' travel)
//
// 48 hours against 5. The player has two instruments, both authoritative-sounding,
// disagreeing by 9.6×, and nothing anywhere tells them which one a contract deadline
// is actually built from. (It is the banner. `bountyDeadlineFor` is
// `BOUNTY_DEADLINE_HOURS + travelHoursFor(tiles) + job`.)
//
// ⚠ THE CAUSE IS COPIED-CONSTANT DRIFT, and it had THREE copies, not two:
//   • `worldDirections.TILES_PER_DAY = 1` + `distanceInDays()`   — the radar and the ASK answers
//   • a hand-inlined `days <= 1 ? "a day's travel" : ...`         — the 'directional' ASK branch in gameStore
//   • `${s.distance} stretch${...}`                               — the compass-item surfaces, a fourth unit again
// OTA-1162 gave a tile a real price and OTA-1167 moved the banner onto it. Nothing
// went back for the compass, and a number three things believe differently is a
// number nobody owns.
//
// ⚠ THE FIX IS DELETION, NOT A BETTER CONSTANT. A corrected TILES_PER_DAY would be
// the same defect carrying a nicer value, free to drift again the next time the
// stamina economy moves. `travelPhraseFor` in travelTime.ts is now the only place
// tiles become words, and this suite's job is to prove there is no second one — by
// behaviour where it can, and by reading the source where the surface is a template
// string no unit test can reach.
//
// ⚠ WHAT THE OLD TESTS DID INSTEAD. `worldDirections.test.ts` asserted
// `distanceInDays(2) === "2 days' travel"` and `TILES_PER_DAY > 0`. Both passed for
// the whole life of the defect: they checked the module against ITSELF. The one
// question that mattered — does this agree with the banner — was never asked. Every
// assertion below is cross-surface for that reason.

import fs from 'fs';
import path from 'path';

import {
  travelPhraseFor,
  travelPhraseShort,
  travelWindowFor,
  tilesPhrase,
  travelHoursFor,
  formatWindow,
  HOURS_PER_TILE_TRUE,
  TILE_HOURS,
  UNKNOWN_DISTANCE,
} from '../app/engine/travelTime';
import { formatWindow as formatWindowViaBountyPrimer } from '../app/engine/bountyPrimer';
import { bountyDeadlineFor } from '../app/engine/factionBounty';
import {
  describeAllDirections,
  findNamedById,
  findNamedByQuery,
  findNearestNamed,
} from '../app/engine/worldDirections';
import { generateWorldMap } from '../app/engine/worldMap';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/** ⚠ Comments FIRST. Every one of the strings this suite hunts for is quoted in a
 *  comment somewhere in these files — including in the comments this very OTA
 *  wrote, which name the broken output verbatim. A scanner that reads prose finds
 *  the defect it just fixed. */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const STORE_RAW = read('app', 'state', 'gameStore.ts');
const DIRS_RAW = read('app', 'engine', 'worldDirections.ts');
const TIME_RAW = read('app', 'engine', 'travelTime.ts');
const PRIMER_RAW = read('app', 'engine', 'bountyPrimer.ts');

const STORE = codeOnly(STORE_RAW);
const DIRS = codeOnly(DIRS_RAW);
const TIME = codeOnly(TIME_RAW);
const PRIMER = codeOnly(PRIMER_RAW);

// The whole reachable range on the canonical 82×41 grid: Manhattan distance
// tops out at 81 + 40 = 121. Every loop below walks all of it.
const MAX_TILES = 121;
const ALL_TILES = Array.from({ length: MAX_TILES }, (_, i) => i + 1);

const TEST_SEED = 'ota1477|mud_dweller|forgotten_order|legacy';
const TEST_START = 'tartarian_outskirts';
const map = generateWorldMap(TEST_SEED, TEST_START);
const start = map.positions[TEST_START]!;
const fromX = start.x;
const fromY = start.y;

// ---------------------------------------------------------------------------
// 0 — the instrument checks itself before it reports anything
// ---------------------------------------------------------------------------

describe('self-test — the scanner is reading what it thinks it is reading', () => {
  it('loaded four non-trivial sources', () => {
    for (const [name, src] of [
      ['gameStore', STORE_RAW],
      ['worldDirections', DIRS_RAW],
      ['travelTime', TIME_RAW],
      ['bountyPrimer', PRIMER_RAW],
    ] as const) {
      expect(src.length).toBeGreaterThan(400);
      expect(src).toContain('\n');
      expect(name.length).toBeGreaterThan(0);
    }
    expect(STORE_RAW.length).toBeGreaterThan(500_000);
  });

  it('stripped comments without eating code', () => {
    // A landmark that only exists in a comment. ⚠ A LOG TIMESTAMP, not a
    // sentence: the first draft pinned the heading "THE ONE PHRASE" and broke
    // the moment the heading was reworded two edits later — the exact
    // quote-the-prose mistake this repo keeps paying for. A timestamp out of a
    // device log is a fact; it will still be that fact after any rewrite.
    expect(TIME_RAW).toContain('23:49:04');
    expect(TIME).not.toContain('23:49:04');
    // A landmark that only exists in code.
    expect(TIME).toContain('export function travelPhraseFor');
    expect(STORE).toContain('export const useGameStore');
    // Stripping must not have gutted the file.
    expect(STORE.length).toBeGreaterThan(STORE_RAW.length * 0.5);
  });

  it('would actually SEE the defect if it came back — the scanner is not blind', () => {
    // NOT-WHERE-I-LOOKED is the failure mode a source scan dies of. Prove the
    // regexes below fire on the real broken text before trusting them not to
    // fire on the real file.
    const brokenRadar = `const travelPhrase = days <= 1 ? 'a day\\'s travel' : \`\${days} days' travel\`;`;
    expect(DAY_SCALE).toBeInstanceOf(RegExp);
    expect(DAY_SCALE.test(brokenRadar)).toBe(true);
    expect(STRETCH_UNIT.test('`${s.distance} stretch${s.distance > 1 ? \'es\' : \'\'}`')).toBe(true);
    expect(DAY_SCALE.test('travelPhraseFor(hit.distance)')).toBe(false);
    expect(STRETCH_UNIT.test('travelPhraseFor(s.distance)')).toBe(false);
  });
});

/** Any surviving "N days' travel" / "a day's travel" template. */
const DAY_SCALE = /days?['’]\s*travel|TILES_PER_DAY|distanceInDays/;
/** Any surviving "N stretches" distance template. */
const STRETCH_UNIT = /\$\{[^}]*\.distance[^}]*\}\s*stretch/;

// ---------------------------------------------------------------------------
// 1 — there is exactly one derivation left
// ---------------------------------------------------------------------------

describe('one derivation', () => {
  it('deleted the compass scale rather than correcting it', () => {
    expect(DIRS).not.toContain('TILES_PER_DAY');
    expect(DIRS).not.toContain('distanceInDays');
    expect(DIRS).not.toMatch(DAY_SCALE);
    // …and it did not simply move next door.
    expect(TIME).not.toContain('TILES_PER_DAY');
    expect(STORE).not.toContain('TILES_PER_DAY');
  });

  it('left no hand-inlined tiles→time arithmetic in the store', () => {
    expect(STORE).not.toMatch(DAY_SCALE);
    expect(STORE).not.toMatch(STRETCH_UNIT);
  });

  it('routes worldDirections through travelTime and computes nothing itself', () => {
    expect(DIRS).toContain("from './travelTime'");
    expect(DIRS).toContain('travelPhraseFor');
    // The only arithmetic left in the file is Manhattan distance — no division
    // by any scale, no multiplication into hours.
    expect(DIRS).not.toContain(String(HOURS_PER_TILE_TRUE));
    expect(DIRS).not.toContain('travelHoursFor');
  });

  it('re-exports formatWindow rather than keeping a second copy of it', () => {
    // Identity, not equality: a copied function would pass a behavioural
    // comparison for years and then drift, which is this OTA's entire subject.
    expect(formatWindowViaBountyPrimer).toBe(formatWindow);
    expect(PRIMER).toContain("from './travelTime'");
    expect(PRIMER).not.toContain('const dPart');
    expect(PRIMER).not.toContain('Math.floor(h / 24)');
  });

  it('keeps the world clock and the travel allowance as separate, unequal facts', () => {
    // ⚠ The compass quotes the ALLOWANCE (2.5 h/tile), not the clock (0.25 h/tile).
    // If these ever converge the derivation in travelTime.ts is stale.
    expect(TILE_HOURS).toBe(0.25);
    expect(HOURS_PER_TILE_TRUE).toBe(2.5);
    expect(HOURS_PER_TILE_TRUE).toBeGreaterThan(TILE_HOURS);
    expect(HOURS_PER_TILE_TRUE / TILE_HOURS).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 2 — the phrase itself, across the whole reachable range
// ---------------------------------------------------------------------------

describe('travelPhraseFor — every distance the grid can hold', () => {
  it('is exactly tiles + the banner window, for all 121 of them', () => {
    let checked = 0;
    for (const t of ALL_TILES) {
      expect(travelPhraseFor(t)).toBe(
        `${tilesPhrase(t)}, about ${formatWindow(travelHoursFor(t))} of travel`,
      );
      checked++;
    }
    expect(checked).toBe(MAX_TILES); // an empty loop is a failure, not a pass
  });

  it('answers the two log lines with the banner\'s own numbers', () => {
    // Voronov(52,21) → Drakova(52,19) = 2 tiles; → Ostragar(58,18) = 9 tiles.
    expect(travelPhraseFor(2)).toBe('2 tiles, about 5 hours of travel');
    expect(travelPhraseFor(9)).toBe('9 tiles, about 23 hours of travel');
    // The old readings, for the record: 48 h and 216 h.
    expect(travelHoursFor(2)).toBe(5);
    expect(travelHoursFor(9)).toBe(22.5);
    expect(travelPhraseFor(2)).not.toMatch(/day/);
    expect(travelPhraseFor(9)).not.toMatch(/day/);
  });

  it('holds the "you stand on it" sentinel at and below zero', () => {
    // ⚠ FINITE negatives only. -Infinity is not "zero distance", it is a broken
    // number, and it belongs to the unknown-distance case below — the first
    // draft of this list had it here and the guard caught the disagreement.
    for (const t of [0, -0, -1, -2.6, -121, -1e9]) {
      expect(travelPhraseFor(t)).toBe('you stand on it');
    }
    // …and rounds into it, so a sub-tile fraction never prints "0 tiles".
    expect(travelPhraseFor(0.49)).toBe('you stand on it');
    expect(travelPhraseFor(0.5)).not.toBe('you stand on it');
    expect(travelPhraseFor(0.5)).toContain('1 tile,');
  });

  it('never prints a zero-hour or empty window for a real distance', () => {
    for (const t of ALL_TILES) {
      const p = travelPhraseFor(t);
      // ⚠ Word-bounded on BOTH sides. A bare toContain('0 hours') matches
      // "10 hours" and fails every fourth tile — the assertion was wrong, not
      // the code, and it is written out here so the next reader does not
      // "fix" the formatter to satisfy it.
      expect(p).not.toMatch(/(^|\s)0 hours\b/);
      expect(p).not.toContain('about  ');
      expect(p.trim()).toBe(p);
      expect(p.endsWith('of travel')).toBe(true);
    }
    // The guard proves itself: a genuine zero window would be caught.
    expect(/(^|\s)0 hours\b/.test('1 tile, about 0 hours of travel')).toBe(true);
    expect(/(^|\s)0 hours\b/.test('4 tiles, about 10 hours of travel')).toBe(false);
  });

  it('singularises one and only one', () => {
    expect(tilesPhrase(1)).toBe('1 tile');
    expect(travelPhraseFor(1)).toBe('1 tile, about 3 hours of travel');
    for (const t of ALL_TILES.filter((n) => n !== 1)) {
      expect(tilesPhrase(t)).toBe(`${t} tiles`);
      expect(travelPhraseFor(t)).not.toMatch(/\b\d+ tile,/);
    }
  });

  it('crosses into days at 24 h and nowhere else', () => {
    let hourly = 0;
    let daily = 0;
    for (const t of ALL_TILES) {
      const hours = Math.round(travelHoursFor(t));
      const phrase = travelPhraseFor(t);
      if (hours < 24) {
        expect(phrase).not.toMatch(/\bdays?\b/);
        hourly++;
      } else {
        expect(phrase).toMatch(/\bdays?\b/);
        daily++;
      }
    }
    // 2.5 h/tile → tiles 1–9 stay under 24 h (9 → 22.5), tile 10 is 25 h.
    expect(hourly).toBe(9);
    expect(daily).toBe(MAX_TILES - 9);
    expect(travelPhraseFor(10)).toContain('1 day, 1 hour');
  });

  it('is monotone — a longer walk never reads as a shorter one', () => {
    let prevHours = -1;
    for (let t = 0; t <= MAX_TILES; t++) {
      const h = travelHoursFor(t);
      expect(h).toBeGreaterThanOrEqual(prevHours);
      prevHours = h;
    }
    expect(prevHours).toBe(MAX_TILES * HOURS_PER_TILE_TRUE);
  });

  // -------------------------------------------------------------------------
  // Two renderings, one derivation. ⚠ This is the pair most likely to become
  // the NEXT copied-constant defect, so it gets pinned harder than either
  // rendering alone: not "both look right" but "both quote the same number,
  // for every distance, and neither computes it".
  // -------------------------------------------------------------------------

  it('short and long forms quote an identical window at every distance', () => {
    let checked = 0;
    for (const t of ALL_TILES) {
      const window = travelWindowFor(t);
      expect(travelPhraseShort(t)).toBe(`${tilesPhrase(t)}, ${window}`);
      expect(travelPhraseFor(t)).toBe(`${tilesPhrase(t)}, about ${window} of travel`);
      // The long form is the short form with the hedge and the noun added —
      // it cannot carry a different number without failing here.
      expect(travelPhraseFor(t).replace('about ', '').replace(' of travel', ''))
        .toBe(travelPhraseShort(t));
      checked++;
    }
    expect(checked).toBe(MAX_TILES);
  });

  it('short and long forms share the sentinels too', () => {
    for (const t of [0, -1, -1e9]) {
      expect(travelPhraseShort(t)).toBe('you stand on it');
      expect(travelPhraseFor(t)).toBe('you stand on it');
    }
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(travelPhraseShort(bad)).toBe(UNKNOWN_DISTANCE);
      expect(travelPhraseFor(bad)).toBe(UNKNOWN_DISTANCE);
    }
  });

  it('keeps the radar line short enough to glance at', () => {
    // ⚠ WHY THE SHORT FORM EXISTS. Four cardinals, each carrying the long
    // phrase, put the radar entry past 200 characters — a paragraph where the
    // player wanted a glance, and the owner has already called out walls of
    // text once ("a big block of text", OTA-812). The fix for that is a
    // tighter RENDERING, never a cheaper number.
    const summary = describeAllDirections(map, fromX, fromY);
    expect(summary.length).toBeLessThan(170);
    // And prove the alternative really was worse, so this bound is a measured
    // choice rather than a number somebody liked.
    const longVersion = summary.replace(
      /\((\d+ tiles?), ([^)]+)\)/g,
      (_m, tiles, window) => `(${tiles}, about ${window} of travel)`,
    );
    expect(longVersion.length).toBeGreaterThan(summary.length + 40);
  });

  it('is total — no input throws or returns a non-string', () => {
    for (const t of [-1, 0, 0.3, 1, 1.5, 40, 121, 500, NaN, Infinity, -Infinity]) {
      const out = travelPhraseFor(t);
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it('says it does not know rather than printing NaN or a confident zero', () => {
    // ⚠ FOUND BY THIS SUITE, NOT BY THE FIX. `Math.max(0, NaN)` is NaN, so the
    // clamp every caller assumes is there is not — the old `distanceInDays`
    // printed "NaN days' travel" for a broken map position and the first draft
    // of `travelPhraseFor` printed "NaN tiles, about 0 hours of travel".
    // Neither is reachable today; both are one missing position away.
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(travelPhraseFor(bad)).toBe(UNKNOWN_DISTANCE);
      expect(tilesPhrase(bad)).toBe(UNKNOWN_DISTANCE);
    }
    expect(UNKNOWN_DISTANCE).not.toContain('NaN');
    expect(UNKNOWN_DISTANCE).not.toMatch(/\d/);
    // ⚠ And it is NOT the standing-on-it sentinel. "You stand on it" is a
    // CLAIM about where the player is; saying it because the map broke would
    // be the game asserting something false rather than admitting a gap.
    expect(travelPhraseFor(NaN)).not.toBe(travelPhraseFor(0));
  });
});

// ---------------------------------------------------------------------------
// 3 — the surfaces agree with each other and with the deadline
// ---------------------------------------------------------------------------

describe('every surface that prices a distance quotes the same number', () => {
  it('matches the autoroute banner template exactly', () => {
    // The banner (gameStore, OTA-1167) builds its window as
    // `about ${formatWindow(travelHoursFor(tiles))} of travel`. Re-derive it
    // here from the same functions and require the compass phrase to end in it.
    expect(STORE).toContain('formatWindow(travelHoursFor(tiles))');
    for (const t of ALL_TILES) {
      const bannerWindow = `about ${formatWindow(travelHoursFor(t))} of travel`;
      expect(travelPhraseFor(t).endsWith(bannerWindow)).toBe(true);
    }
  });

  it('is the number a bounty deadline is built from', () => {
    // A player budgets a contract window off the compass. That is only sound
    // if the compass quotes the same travel term the deadline does.
    for (const t of [0, 1, 2, 9, 23, 40, 121]) {
      for (const count of [3, 5, 8]) {
        const deadline = bountyDeadlineFor(t, count);
        expect(deadline).toBeGreaterThanOrEqual(travelHoursFor(t));
        // The travel term is present, unscaled, inside the deadline.
        expect(deadline - travelHoursFor(t)).toBeGreaterThan(0);
      }
    }
  });

  it('hands the same phrase back through every worldDirections lookup', () => {
    let seen = 0;
    for (const id of Object.keys(map.positions)) {
      const hit = findNamedById(map, fromX, fromY, id);
      if (!hit) continue;
      expect(hit.travelPhrase).toBe(travelPhraseFor(hit.tiles));
      seen++;
    }
    expect(seen).toBeGreaterThan(5); // the map is populated; this is not a no-op

    const near = findNearestNamed(map, fromX, fromY, { excludeId: TEST_START })!;
    expect(near.travelPhrase).toBe(travelPhraseFor(near.tiles));
    const byName = findNamedByQuery(map, fromX, fromY, 'asgardar')!;
    expect(byName.travelPhrase).toBe(travelPhraseFor(byName.tiles));
    // Standing on the tile keeps the sentinel every caller branches on.
    expect(findNamedById(map, fromX, fromY, TEST_START)!.travelPhrase).toBe('you stand on it');
  });

  it('prints no days phrasing anywhere in the radar line', () => {
    const summary = describeAllDirections(map, fromX, fromY);
    expect(summary).not.toMatch(/days?['’] travel/);
    expect(summary).toContain(' · ');
    // Every named fragment carries a phrase re-derivable from the map.
    let named = 0;
    for (const frag of summary.split(' · ')) {
      const m = /^(north|east|south|west): (.+) \((.+)\)$/.exec(frag);
      if (!m) {
        expect(frag).toMatch(/^(north|east|south|west): open ground$/);
        continue;
      }
      named++;
      const hit = findNamedByQuery(map, fromX, fromY, m[2]!)!;
      expect(hit).not.toBeNull();
      expect(m[3]).toBe(travelPhraseShort(hit.tiles));
      // …and the short fragment carries the same window the sentence form
      // would have used, so the two renderings cannot diverge unseen.
      expect(travelPhraseFor(hit.tiles)).toContain(travelWindowFor(hit.tiles));
      expect(m[3]).toContain(travelWindowFor(hit.tiles));
    }
    expect(named).toBeGreaterThan(0);
  });

  it('surveys from several vantage points, not just the start tile', () => {
    // One tile proves one tile. Walk the named seats and re-check each.
    let checkedSeats = 0;
    for (const id of Object.keys(map.positions).slice(0, 12)) {
      const p = map.positions[id]!;
      const summary = describeAllDirections(map, p.x, p.y);
      expect(summary).not.toMatch(/days?['’] travel/);
      expect(summary).not.toMatch(/stretch/);
      checkedSeats++;
    }
    expect(checkedSeats).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// 4 — the sentences the player actually reads
// ---------------------------------------------------------------------------
//
// These are template literals inside a 30k-line store method behind the parser;
// no unit test reaches them. So they are read, and what is asserted is the shape
// that broke: the phrase is a NOUN PHRASE, and the old sentences spliced it
// mid-clause ("Drakova lies 2 days' travel north"). With the new phrase that
// same splice would read "Drakova lies 2 tiles, about 5 hours of travel north",
// which is the fix printing garbage — a thing a passing unit test would never
// have caught.

describe('the sentences that carry the phrase', () => {
  const uses = (): string[] => {
    const out: string[] = [];
    const re = /\$\{[^{}]*travelPhrase(?:For|Short)?[^{}]*(?:\([^()]*\))?[^{}]*\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(STORE))) out.push(STORE.slice(m.index, re.lastIndex + 1));
    return out;
  };

  it('finds every interpolation of the phrase in the store', () => {
    const found = uses();
    // ⚠ A count, so a surface that quietly stops using it fails here rather
    // than reappearing on a device with its own arithmetic.
    //   • ASK 'nearest'      — near.travelPhrase            (long)
    //   • ASK 'directional'  — travelPhraseFor(hit.distance)  (long)
    //   • ASK 'specific'     — found.travelPhrase            (long)
    //   • compass bearings   — travelPhraseShort(s.distance)  (short, 4 per line)
    //   • compass wander hint— travelPhraseFor(ahead.distance)(long)
    expect(found.length).toBe(5);
    expect(found.filter((u) => u.includes('travelPhraseShort')).length).toBe(1);
  });

  it('never splices the phrase mid-clause', () => {
    for (const use of uses()) {
      const after = use.slice(-1);
      // The character immediately following the closing brace must end the
      // clause. A letter or a `${` there is the old broken grammar.
      expect(['.', ',', ')', '"', '`', '!']).toContain(after);
    }
  });

  it('sets the phrase off with a dash or a colon, never bare against a bearing', () => {
    // Each of the five sites reads "<place> lies <dir> — <phrase>" or
    // "<dir>: <place> (<phrase>)". Neither shape can produce the old splice.
    let dashed = 0;
    let parenthesised = 0;
    for (const use of uses()) {
      const idx = STORE.indexOf(use);
      const before = STORE.slice(Math.max(0, idx - 12), idx);
      if (/—\s*$/.test(before)) dashed++;
      else if (/\(\s*$/.test(before)) parenthesised++;
    }
    expect(dashed + parenthesised).toBe(5);
    expect(dashed).toBeGreaterThan(0);
    expect(parenthesised).toBeGreaterThan(0);
  });

  it('imports the shared helper into the store exactly once', () => {
    // The import is multi-line, so match the specifier lines and then the
    // module they belong to — the point is that BOTH renderings come from
    // travelTime and nowhere else.
    const specifiers = STORE.split('\n').filter((l) => /^\s+travelPhrase(For|Short),$/.test(l));
    expect(specifiers.length).toBe(2);
    expect(STORE.split("from '../engine/travelTime'").length - 1).toBe(1);
    const importBlock = STORE.slice(
      STORE.lastIndexOf('import {', STORE.indexOf("from '../engine/travelTime'")),
      STORE.indexOf("from '../engine/travelTime'"),
    );
    expect(importBlock).toContain('travelPhraseFor');
    expect(importBlock).toContain('travelPhraseShort');
    expect(importBlock).toContain('travelHoursFor');
    expect(importBlock).toContain('formatWindow');
  });
});

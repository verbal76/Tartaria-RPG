// OTA-1011 — "travel to <place>" finds the place you NAMED, not the place you
// punctuated correctly. Owner: "'travel to the location name' should start an
// auto route as long as the name matches."
//
// Measured before the fix, against the live catalog: typing a name EXACTLY
// resolved 36/36, but typing it without punctuation failed outright on 7 real
// places — Zharak's Teeth, Reclaimer's Stake, Thametan's Tower, The Architect's
// Blind, The Monarch's Waystation, Builders' Survey Camp, Giant-Watch Shrine.
// A flat "I don't know a place called that" for somewhere the player had been.
//
// This suite drives EVERY location in the catalog through every way a person
// actually types a name — exact, lowercased, article-stripped, punctuation
// dropped, punctuation spaced, shouted, padded, and with a real single-character
// typo at each position — and then proves the matcher still says NO to things
// that are not places. The point is that a future location with an apostrophe in
// its name cannot silently become unreachable.
import * as fs from 'fs';
import * as path from 'path';
import { matchLocationByName, tightKey, keysFor } from '../app/engine/locationMatch';

interface Loc { id: string; name: string; aliases?: string[] }
const LOCS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'locations', 'locations.json'), 'utf8'),
) as Loc[];

const hit = (q: string) => matchLocationByName(q, LOCS);
const PUNCT = LOCS.filter((l) => /[^A-Za-z0-9 ]/.test(l.name));

describe('OTA-1011 — travel-by-name resolves however you type it', () => {
  it('the catalog under test is real and does contain punctuated names', () => {
    expect(LOCS.length).toBeGreaterThanOrEqual(30);
    // The seven that used to fail live in here; if punctuation ever vanishes
    // from the catalog this suite would be proving nothing.
    expect(PUNCT.length).toBeGreaterThanOrEqual(5);
  });

  it('EXACT name — every location, no exceptions', () => {
    const misses = LOCS.filter((l) => hit(l.name)?.id !== l.id).map((l) => l.name);
    expect(misses).toEqual([]);
  });

  it('lowercased, UPPERCASED, and whitespace-padded — every location', () => {
    for (const l of LOCS) {
      expect(hit(l.name.toLowerCase())?.id).toBe(l.id);
      expect(hit(l.name.toUpperCase())?.id).toBe(l.id);
      expect(hit(`   ${l.name}   `)?.id).toBe(l.id);
    }
  });

  it('THE REGRESSION: punctuation dropped — every location', () => {
    // This is the exact failure the owner hit. Apostrophes and hyphens gone,
    // which is what a phone keyboard produces.
    const misses = LOCS
      .filter((l) => hit(l.name.replace(/['’\-.]/g, ''))?.id !== l.id)
      .map((l) => l.name);
    expect(misses).toEqual([]);
  });

  it('the seven that used to fail, by name, typed the way a person types them', () => {
    const CASES: Array<[string, string]> = [
      ['zharaks teeth', "Zharak's Teeth"],
      ['reclaimers stake', "Reclaimer's Stake"],
      ['thametans tower', "Thametan's Tower"],
      ['architects blind', "The Architect's Blind"],
      ['monarchs waystation', "The Monarch's Waystation"],
      ['builders survey camp', "Builders' Survey Camp"],
      ['giantwatch shrine', 'Giant-Watch Shrine'],
    ];
    for (const [typed, expected] of CASES) {
      const got = hit(typed);
      expect(got).toBeTruthy();
      expect(got!.name).toBe(expected);
    }
  });

  it('punctuation replaced by a SPACE also resolves (giant watch shrine)', () => {
    for (const l of PUNCT) {
      const spaced = l.name.replace(/['’\-.]/g, ' ').replace(/\s+/g, ' ').trim();
      expect(hit(spaced)?.id).toBe(l.id);
    }
  });

  it('a leading article is never part of the name', () => {
    for (const l of LOCS) {
      expect(hit(`the ${l.name}`)?.id).toBe(l.id);
      // ...and dropping an article the name really has still works.
      if (/^the\s+/i.test(l.name)) {
        expect(hit(l.name.replace(/^the\s+/i, ''))?.id).toBe(l.id);
      }
    }
  });

  it('an alias owned by ONE place resolves to it', () => {
    for (const l of LOCS) {
      for (const a of l.aliases ?? []) {
        if (tightKey(a).length < 4) continue;
        // Uniqueness must be judged with the SAME article-insensitive keys the
        // matcher uses, or the test lies to itself: "the tower" looks unique
        // under a naive compare, but three places answer to "tower".
        const ks = keysFor(a);
        const owners = LOCS.filter(
          (o) => (o.aliases ?? []).some((x) => keysFor(x).some((k) => ks.includes(k))),
        );
        if (owners.length !== 1) continue; // shared aliases are covered below
        expect(hit(a)?.id).toBe(l.id);
      }
    }
  });

  it('a SHARED alias refuses instead of guessing a city for you', () => {
    // The catalog gives five places the alias "city" and three the alias
    // "tower". There is no right answer to "travel to the city", and quietly
    // walking someone to Asgardar because it sorted first is the same class of
    // bug this OTA exists to kill. The caller's refusal lists real destinations.
    const shared = new Map<string, Set<string>>();
    for (const l of LOCS) {
      for (const a of l.aliases ?? []) {
        for (const k of keysFor(a)) {
          if (!shared.has(k)) shared.set(k, new Set());
          shared.get(k)!.add(l.id);
        }
      }
    }
    const multi = [...shared.entries()].filter(([, ids]) => ids.size > 1).map(([k]) => k);
    expect(multi).toContain('city');
    expect(multi).toContain('tower');
    for (const k of multi) {
      // Unless some location is ACTUALLY named that, in which case the exact
      // name wins outright and that is correct.
      if (LOCS.some((l) => tightKey(l.name) === k)) continue;
      expect(hit(k)).toBeNull();
    }
  });

  it('the id resolves (missions and the map address places that way)', () => {
    for (const l of LOCS) expect(hit(l.id)?.id).toBe(l.id);
  });

  it('SINGLE-CHARACTER TYPOS: a dropped letter at every position still lands', () => {
    // Only asserted where the typo leaves an unambiguous answer — a deletion
    // that genuinely collides with another place SHOULD refuse rather than
    // guess, and that is checked in the negative tests below.
    let checked = 0, landed = 0;
    for (const l of LOCS) {
      const key = tightKey(l.name);
      if (key.length < 8) continue;
      for (let i = 0; i < key.length; i++) {
        const typo = key.slice(0, i) + key.slice(i + 1);
        checked++;
        if (hit(typo)?.id === l.id) landed++;
      }
    }
    expect(checked).toBeGreaterThan(200);
    // The overwhelming majority must recover; a handful of deletions legitimately
    // produce a different real word and are refused on purpose.
    expect(landed / checked).toBeGreaterThan(0.9);
  });

  it('SINGLE-CHARACTER TYPOS: a substituted letter still lands', () => {
    let checked = 0, landed = 0;
    for (const l of LOCS) {
      const key = tightKey(l.name);
      if (key.length < 8) continue;
      for (let i = 0; i < key.length; i += 3) {
        const typo = `${key.slice(0, i)}x${key.slice(i + 1)}`;
        checked++;
        if (hit(typo)?.id === l.id) landed++;
      }
    }
    expect(checked).toBeGreaterThan(60);
    expect(landed / checked).toBeGreaterThan(0.9);
  });

  it('a distinctive PARTIAL name resolves, and to the most specific place', () => {
    expect(hit('zharaks')?.name).toBe("Zharak's Teeth");
    expect(hit('drakova')?.name).toBe('Drakova');
    expect(hit('waystation')?.name).toBe("The Monarch's Waystation");
    // Every location's first significant word, where it is unambiguous.
    for (const l of LOCS) {
      const first = tightKey(l.name.replace(/^the\s+/i, '').split(/\s+/)[0]!);
      if (first.length < 5) continue;
      const owners = LOCS.filter((o) => tightKey(o.name).includes(first));
      if (owners.length !== 1) continue; // ambiguous by nature — skip
      expect(hit(first)?.id).toBe(l.id);
    }
  });

  it('SAYS NO to things that are not places — the refusal must survive', () => {
    for (const junk of [
      'the hollowed caverns', 'atlantis', 'qqqqqqqq', 'my house',
      'the moon', 'zzzz', 'somewhere nice', 'narnia',
    ]) {
      expect(hit(junk)).toBeNull();
    }
  });

  it('SAYS NO to fragments too short to be unambiguous', () => {
    // A 1-3 character scrap must not brute-force its way into a real location.
    for (const scrap of ['a', 'th', 'ar', 'se', 'am', 'x', '']) {
      expect(hit(scrap)).toBeNull();
    }
  });

  it('an ambiguous near-miss refuses rather than guessing wrong', () => {
    // Two equally-close candidates must produce nothing: walking a player to
    // the wrong city is worse than telling them the name was not recognised.
    const twins = [
      { id: 'aaa', name: 'Kadar' },
      { id: 'bbb', name: 'Kadan' },
    ];
    expect(matchLocationByName('kadax', twins)).toBeNull();
    // ...but an exact hit among them is still exact.
    expect(matchLocationByName('kadar', twins)!.id).toBe('aaa');
  });

  it('never returns a location for a differently-named real place', () => {
    // Cross-check: no query built from location A may resolve to location B.
    for (const l of LOCS) {
      for (const form of [l.name, l.name.toLowerCase(), l.name.replace(/['’\-.]/g, '')]) {
        const got = hit(form);
        expect(got).toBeTruthy();
        expect(got!.id).toBe(l.id);
      }
    }
  });

  it('SOURCE LOCK: the travel handler uses the shared matcher, not raw strings', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
    );
    expect(src).toContain('matchLocationByName(target, allLocations)');
    // The raw-string find this OTA removed must not creep back.
    expect(src).not.toContain('l.name.toLowerCase().includes(target)');
  });
});

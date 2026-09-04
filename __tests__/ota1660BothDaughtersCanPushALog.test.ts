// OTA-1660 — BOTH DAUGHTERS CAN PUSH A LOG.
//
// Owner: *"why can't my daughters push a log to sentry"* — and then, rather
// than an answer, the evidence: both daughters' own bug reports, emailed
// because the button they needed was not on their screens. kai's description
// line read *"Can't push a log so I se t this"*; her sister's, from a second
// SM-S942U on its own OTA, read *"To send a log"*.
//
// ⚠⚠⚠ EACH REPORT DIAGNOSED ITSELF, ON ITS OWN DEVICE, IN TWO LINES:
//
//     Character: kai                        Character: Grilled cheese sandwich
//     Crash delivery: ON — reports go to Sentry when you crash.   (both)
//
// SEND LOG renders behind `ownerTools && crashConfigured` (AboutScreen). The
// second half was ALREADY TRUE on both phones — the DSN is in the build and
// delivery is on — so the transport, the opt-in and the OTA channel were never
// the problem on either. `ownerTools` resolves through
// `ownerToolsUnlocked(player?.name)`, which tests THE LOADED CHARACTER'S NAME
// against this list. One is "kai", the other "Grilled cheese sandwich".
// Nothing else was wrong on either device.
//
// ⚠ AND THE FIX COULD NOT BE THE OBVIOUS ONE. SHARING_UNLOCK_NAMES is a PREFIX
// match, safe only because "verbal" and "sasmooch" are long enough that the
// worst collision is "Verbalist". Adding "kai" there would also admit Kaiden,
// Kaira, Kaito and Kaiya — and admission is not cosmetic: owner tools carry the
// OTA-1505 auto-bundle, which uploads typed input and a save with no tap at
// all. So the short name goes in an EXACT list instead, and this suite pins
// that the two tiers stay distinct.
//
// ⚠ AND EACH ENTRY ONLY HAS TO FIRE ONCE. OTA-1490 made the unlock
// DEVICE-STICKY, so the first load marks the install and every future character
// on it inherits the tools — which is why this list can stay two names long
// instead of chasing whatever they call the next one.

import {
  sharingUnlockedFor,
  SHARING_UNLOCK_NAMES,
  SHARING_UNLOCK_EXACT,
} from '../app/engine/fallenLedger';

describe('OTA-1660 — the reported case', () => {
  it('⚠ both names off the two bug reports unlock', () => {
    expect(sharingUnlockedFor('kai')).toBe(true);
    expect(sharingUnlockedFor('Grilled cheese sandwich')).toBe(true);
  });

  it('⚠⚠ the spaced name matches because the gate normalises FIRST', () => {
    // The character sheet says "Grilled cheese sandwich"; the gate compares
    // `grilledcheesesandwich`. An entry written with the spaces in would be
    // permanently dead — a failure indistinguishable from "the name does not
    // work" — which is what the normalisation guard below exists to catch.
    expect(SHARING_UNLOCK_EXACT).toContain('grilledcheesesandwich');
    expect(SHARING_UNLOCK_EXACT).not.toContain('Grilled cheese sandwich');
    for (const n of ['GRILLED CHEESE SANDWICH', 'grilled-cheese-sandwich', 'GrilledCheeseSandwich']) {
      expect(sharingUnlockedFor(n)).toBe(true);
    }
  });

  it('and they are case- and punctuation-insensitive like every other entry', () => {
    for (const n of ['Kai', 'KAI', ' kai ', 'K.a.i']) {
      expect(sharingUnlockedFor(n)).toBe(true);
    }
  });

  it('the owner and sasmooch still pass, by prefix, exactly as before', () => {
    for (const n of ['verbal', 'Verbal', 'verbal76', 'Sasmooch', 'sasmooch2']) {
      expect(sharingUnlockedFor(n)).toBe(true);
    }
  });
});

describe('OTA-1660 — ⚠⚠ the exact tier is EXACT, which is the whole point', () => {
  it('a longer name that merely STARTS with kai is refused', () => {
    // These are the names a stranger might actually pick. Each one would have
    // been admitted by a prefix entry — along with the no-tap auto-bundle.
    for (const n of ['Kaiden', 'Kaira', 'Kaito', 'Kaiya', 'Kaimana', 'kaidence']) {
      expect(sharingUnlockedFor(n)).toBe(false);
    }
  });

  it('and ordinary names are still refused, which is most players', () => {
    for (const n of ['Ella', 'Halem', 'Yulka', 'Francis',
      'Grilled', 'cheese', 'Grilled cheese', 'Grilled cheese sandwiches',
      '', null, undefined]) {
      expect(sharingUnlockedFor(n)).toBe(false);
    }
  });

  it('⚠ the two lists must not be merged — a short name in the PREFIX list is the bug', () => {
    // If someone later "tidies" kai into SHARING_UNLOCK_NAMES, Kaiden unlocks
    // and the test above goes red. This one says why in advance: nothing in the
    // prefix list may be short enough to be a common name's opening syllable.
    for (const entry of SHARING_UNLOCK_NAMES) {
      expect(entry.length).toBeGreaterThanOrEqual(6);
    }
    expect(SHARING_UNLOCK_NAMES).not.toContain('kai');
    expect(SHARING_UNLOCK_EXACT).toContain('kai');
  });

  it('every exact entry is already normalised, or it can never match', () => {
    // The gate lowercases and strips non-alphanumerics before comparing, so an
    // entry carrying capitals or punctuation would be permanently dead — a
    // failure that looks exactly like "the name just does not work".
    for (const entry of SHARING_UNLOCK_EXACT) {
      expect(entry).toBe(entry.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  });
});

describe('OTA-1660 — what unlocking actually turns on', () => {
  it('the same predicate feeds the owner-tools gate, so SEND LOG follows', () => {
    // ownerToolsUnlocked(name) → sharingUnlockedFor(name) OR the device flag.
    // Pinning the composition here means the About screen cannot drift away
    // from the list without this going red.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '..', 'app', 'diagnostics', 'ownerTools.ts'), 'utf8',
    ) as string;
    expect(src).toContain('if (sharingUnlockedFor(name)) return true;');
  });
});

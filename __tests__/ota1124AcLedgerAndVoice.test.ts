// OTA-1124 — MEASURE THE TWO THINGS WE KEEP GUESSING AT, AND FIX THE ONE THAT
// IS ACTUALLY FIXABLE.
//
// Both come from the same device log, and both had been answered with a
// suspect rather than a cause.
//
// ⚠ 0. AND THE INVESTIGATE CHIP THAT LIED. The watch list carried an
// unconfirmed report — "tap again → 2 active items" — with the note that the
// detail needed was WHETHER THE PLAYER WAS CLIMBED UP. It was reproducible
// from a cold read: the pinned surface chip (ground / mud / floor) is built
// separately from the scene nouns and never received the elevation gate that
// OTA-166 gave the chips and OTA-953 gave the count. So on a perch, every
// reachable noun greys and the ground chip alone stays bright — with the badge
// still reading active — while the engine answers every tap with "You're up on
// the {perch}. The ground is down there. Climb down to reach it." OTA-970
// describes the same thing from the other side: "eight identical salvage
// attempts from atop a shelf … the player retried into dead silence, which
// reads as a hang."
//
// ⚠ 1. AC 16 → AC 10, TWICE NOW. Two logs in a row show the owner's AC
// dropping six points with no line saying why — the second time with a ~2m40s
// inventory gap in the middle, which is enough room for anything at all. The
// suspect is the group unequip bar; a suspect is not a cause, and two
// timestamps four minutes apart are not evidence. So rather than guess a third
// time, the one place the number is computed now prints its whole derivation
// whenever it shifts by 2 or more. OTA-1109 is the precedent: instrument
// first, let the log name the culprit, and only then write a remedy.
//
// ⚠ 2. THE AMBIENT VOICE SLIPPED, and it slipped in two different ways in one
// line: first person ("my eyes") and invented scenery ("ancient trees" in the
// Obsidian Pillars, which has none).
//   · The first-person half IS fixable and is fixed — narrowly. It mirrors the
//     existing `they`-opener filter and tests the OPENER only, because
//     OTA-1031's broader version dropped every sentence starting with "You"
//     (which the voice rules ORDER the model to write) and silently ate the
//     entire feature for four builds.
//   · The scenery half is NOT fixed, on purpose. The off-canon guard covers
//     named ENTITIES; policing generic scenery needs a per-biome whitelist,
//     which is a content system rather than a filter. Guessing at one is
//     exactly how OTA-1031 happened.
// What ships instead is EVIDENCE: an accepted ambient line now logs its raw
// text. OTA-1034 added that for failures and it has paid for itself since —
// but a line that passes every filter and is still wrong left no trace at all,
// so the only record was the owner noticing and typing it out by hand.

// This suite reads source with `require` and has no `import`, which makes the
// file a SCRIPT rather than a module — so its top-level consts land in the
// GLOBAL scope and collide by name with any other source-reading suite that
// picked the same obvious identifier. `export {}` makes it a module and keeps
// `SRC` local. (Found by the typecheck ratchet the moment a second suite here
// also reached for `SRC`; two files, two TS2451s, neither one wrong on its own.)
export {};

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SRC: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8')
  + '\n' + require('fs').readFileSync(
    require('path').join(__dirname, '../app/ai/narration.ts'), 'utf8');

/** The ambient first-person opener filter, lifted verbatim from the store so
 *  the cases below test the REAL predicate rather than a paraphrase of it. */
// ⚠ OTA-1125 RETARGET. OTA-1124 shipped an OPENER test and the very next
// device log carried the line it was written for:
//   "As I walk through the shadows of the Obsidian Pillars, my eyes follow
//    the ancient trees that seem to whisper secrets to the wind."
// It opens with "As". The opener test lets it straight through. I had matched
// the shape I imagined rather than the shape that happened — and a filter that
// misses its own motivating example is worth nothing.
// The real rule is about WHO THE SENTENCE IS ABOUT: first person present AND
// second person absent.
const NARRATOR_ONLY = (s: string): boolean => {
  const firstPerson = /\b(i|i'm|i've|i'll|my|mine|me|myself)\b/i.test(s);
  const secondPerson = /\b(you|your|you're|you've|yours|yourself)\b/i.test(s);
  return firstPerson && !secondPerson;
};
const FIRST_PERSON_OPENER = { test: NARRATOR_ONLY };

describe("OTA-1124 — the first-person opener, and what it must NOT eat", () => {
  it('⚠ drops narrator-only lines', () => {
    expect(FIRST_PERSON_OPENER.test('My eyes have seen worse roads than this.')).toBe(true);
    expect(FIRST_PERSON_OPENER.test("I've walked longer roads.")).toBe(true);
    // RETARGETED BY OTA-1125 — this one contains "you", so under the corrected
    // rule it is a line ABOUT THE PLAYER and survives. That is right: "I
    // remember when you could barely lift that" is the companion voice working.
    expect(FIRST_PERSON_OPENER.test('I remember when you could barely lift that.')).toBe(false);
  });

  it('⚠ keeps a second-person line that merely CONTAINS "my"', () => {
    // The Arbiter is a companion. Saying "I" inside a line addressed to the
    // player is in voice; being the SUBJECT is not. This distinction is the
    // whole reason the filter tests the opener only.
    expect(FIRST_PERSON_OPENER.test('You have come far, and my eyes have seen worse.')).toBe(false);
    expect(FIRST_PERSON_OPENER.test('Your shoulders carry more than mine ever did.')).toBe(false);
  });

  it('⚠ keeps an impersonal reflection — the shape a good musing often takes', () => {
    // OTA-1031's lesson in one assertion: a filter that looks obviously right
    // can silently delete the feature. A musing need not contain "you" at all.
    expect(FIRST_PERSON_OPENER.test('The road behind is longer than the one ahead.')).toBe(false);
    expect(FIRST_PERSON_OPENER.test('Mud remembers every step taken through it.')).toBe(false);
  });

  it('does not fire on words that merely START with those letters', () => {
    // \b is doing real work here — "Iron", "Mine shafts", "Mist" must survive.
    expect(FIRST_PERSON_OPENER.test('Iron rusts slower than resolve.')).toBe(false);
    expect(FIRST_PERSON_OPENER.test('Mist clings to the low ground here.')).toBe(false);
    expect(FIRST_PERSON_OPENER.test('Mineral crust flakes from the walls.')).toBe(false);
  });

  it('it sits with the other register filters, not somewhere new', () => {
    // RETARGETED BY OTA-1125 — the opener regex became a two-sided predicate.
    // ⚠⚠ RE-ANCHORED BY OTA-1258, and the reason is worth keeping: this sliced
    // from the FIRST occurrence of the `they`-opener filter, which appears in TWO
    // functions (narrateViaArbiter's survivors chain and the ambient chain). So
    // the window began in the wrong function and only passed because nothing
    // between them mentioned the predicate. The moment N1 added an
    // action-opener check to the intro BANK, the window picked that up instead —
    // a false failure about ordering in a chain this test does not police.
    // **Anchor a slice to the function you mean, not to a string that happens to
    // be unique today.**
    const ambient = SRC.indexOf('async function maybeGenerateAmbientArbiter');
    expect(ambient).toBeGreaterThan(0);
    const chain = SRC.slice(ambient);
    expect(chain.indexOf('const firstPerson =')).toBeLessThan(chain.indexOf('isSecondPersonActionOpener'));
  });
});

describe('OTA-1124 — an accepted ambient line leaves a trace', () => {
  it('⚠ the raw text of a line that PASSED is logged', () => {
    expect(SRC).toContain('arbiter: ambient-said "${finalText.slice(0, 160)}"');
  });

  it('it is gated on usable — a dropped line already has its own reason line', () => {
    const i = SRC.indexOf('arbiter: ambient-said');
    expect(SRC.lastIndexOf('if (ambientUsable) {', i)).toBeGreaterThan(SRC.indexOf('const ambientMark ='));
  });

  it('⚠ the scenery half is recorded as deliberately UNFIXED', () => {
    // If a later reader thinks this OTA forgot the trees, the comment has to
    // say it was a choice and why — a per-biome whitelist is a content system,
    // not a filter, and guessing at one is how OTA-1031 happened.
    expect(SRC).toContain('DELIBERATELY NOT "FIXED" HERE');
    expect(SRC).toContain('whitelist of what may exist in each biome');
  });
});

describe('OTA-1124 — the AC ledger prints a derivation, not a number', () => {
  it('⚠ it fires on a shift of 2 or more, at the one place AC is computed', () => {
    expect(SRC).toContain('const prev = _lastEffectiveAc;');
    expect(SRC).toContain('if (prev !== null && Math.abs(effectiveAc - prev) >= 2) {');
  });

  it('⚠ every component is named — the point is WHICH one moved', () => {
    // "AC dropped" is what we already knew twice. The ledger has to answer
    // which term changed, or it is the same non-answer in more characters.
    for (const part of ['race/base ${racialAC}', 'gear ${armorPieces.acBonus}',
      'title ${titleRuinsAc}', 'trimmed ${acFromGear}',
      'status ${statusAcAdjustment(player.statusEffects)}']) {
      expect(SRC).toContain(part);
    }
  });

  it('⚠ EMPTY slots are named too — that is the finding, not a gap in it', () => {
    // A worn-list that silently omits missing pieces cannot show "the chest
    // slot is empty", which is the single most likely explanation.
    expect(SRC).toContain("parts.push(`${slot}=${name ?? '—'}`);");
  });

  it('a fresh session prints nothing until it has something to compare', () => {
    expect(SRC).toContain('let _lastEffectiveAc: number | null = null;');
  });

  it('⚠ it changes no behaviour — debug channel only', () => {
    const start = SRC.indexOf('const prev = _lastEffectiveAc;');
    const end = SRC.indexOf('const enemyCrit =', start);
    const block = SRC.slice(start, end);
    expect(block).toContain("appendLog('debug'");
    expect(block).not.toContain('set(');
    // The AC it reports is the AC the swing actually used.
    expect(SRC.indexOf('const effectiveAc = Math.max(1,')).toBeLessThan(start);
  });

  it('the threshold is explained, because a noisy ledger gets ignored', () => {
    expect(SRC).toContain('Threshold 2 because ±1 is ordinary');
  });
});

describe('OTA-1124 — the pinned surface chip stops lying on a perch', () => {
  const UI: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/screens/ExplorationScreen.tsx'), 'utf8');

  it('⚠ the pinned chip greys with "climb down to reach"', () => {
    expect(UI).toContain("unmetRequirement = 'climb down to reach';");
    const pin = UI.slice(UI.indexOf('const key = noun.replace('), UI.indexOf('alwaysShow: true'));
    expect(pin).toContain('const pinElev = currentScene?.elevatedOn;');
  });

  it('⚠ and the COUNT drops it too — chip and badge must agree', () => {
    // The badge reading active while the modal is entirely greyed is the whole
    // reported symptom. Fixing one side without the other just moves the lie.
    expect(UI).toContain('if (surfaceUnlocked && !groundOutOfReach) groundCount = 1;');
    expect(UI).toContain('const groundOutOfReach = !!gElev');
  });

  it('⚠ an elevated OVERLAY still reaches — a rooftop has its own ground', () => {
    // elevatedOverlayMeta means the perch has a surface of its own, so the
    // gate must not fire. Both sites check it, same as OTA-166 did.
    expect((UI.match(/!currentScene\?\.elevatedOverlayMeta/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('the climbed noun itself is still reachable', () => {
    const pin = UI.slice(UI.indexOf('const pinElev = currentScene?.elevatedOn;'));
    expect(pin.slice(0, 400)).toContain('!climbed.includes(key) && !key.includes(climbed)');
  });

  it('⚠ a missing scanner still wins — it is the more specific refusal', () => {
    // Climbing down will not conjure a Mud Scanner, so telling the player to
    // climb down would be actively misleading.
    const pin = UI.slice(UI.indexOf('const pinElev = currentScene?.elevatedOn;'));
    expect(pin.slice(0, 300)).toContain('&& !unmetRequirement');
  });
});

describe('OTA-1125 — the filter now catches the line from the device log', () => {
  it("⚠ THE ACTUAL LINE. It opens with \"As\", so the opener test missed it", () => {
    expect(NARRATOR_ONLY(
      'As I walk through the shadows of the Obsidian Pillars, my eyes follow '
      + 'the ancient trees that seem to whisper secrets to the wind.')).toBe(true);
  });

  it('⚠ and it STILL cannot eat the feature — OTA-1031 is the standing warning', () => {
    expect(NARRATOR_ONLY('You have come far, and my eyes have seen worse.')).toBe(false);
    expect(NARRATOR_ONLY('The road behind is longer than the one ahead.')).toBe(false);
    expect(NARRATOR_ONLY('Your shoulders carry more than mine ever did.')).toBe(false);
    expect(NARRATOR_ONLY('Mud remembers every step taken through it.')).toBe(false);
  });

  it('the store carries the two-sided rule, not the opener', () => {
    expect(SRC).toContain("const firstPerson = /\\b(i|i'm|i've|i'll|my|mine|me|myself)\\b/i.test(s);");
    expect(SRC).toContain("const secondPerson = /\\b(you|your|you're|you've|yours|yourself)\\b/i.test(s);");
    expect(SRC).toContain('return !(firstPerson && !secondPerson);');
  });

  it('⚠ the miss is recorded, because it is the lesson', () => {
    expect(SRC).toContain('RETARGETED THE MOMENT THE LOG ARRIVED');
    expect(SRC).toContain('matched the shape I imagined rather than the shape that');
  });
});

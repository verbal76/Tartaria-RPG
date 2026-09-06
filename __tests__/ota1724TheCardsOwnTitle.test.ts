/**
 * OTA-1724 — THE CARD'S OWN TITLE.
 *
 * Found during the pre-Fable audit, in the area OTA-1713 had already been over.
 *
 * ⚠⚠⚠ OTA-1713 CHECKED EVERY KEYWORD AND NEVER CHECKED THE HEADING. It named
 * this concept GIVE GROUND on the ACTIONS screen and shipped an instrument
 * asserting that every KEYWORD on a card routes to the intent the card is about
 * — because "a card that teaches a word the parser does not know is worse than
 * no card: it sends the player to a dead end in the game's own voice." That
 * instrument passed, and still passes. But a card's TITLE is not one of its
 * keywords, so the one phrase printed largest on the card was the only string on
 * it nobody tested.
 *
 * ⚠⚠ AND IT DID NOT DEAD-END, WHICH IS WORSE. Measured before the fix:
 *
 *     "give ground"  →  intent=gift, target="ground"
 *
 * A player who read the heading and typed it was routed into the GIFTING system
 * to hand somebody the floor. A no-op teaches you the phrase was wrong; a wrong
 * action teaches you the game is broken.
 *
 * ⚠ THE FIX IS THE SHAPE OTA-1713 ALREADY ESTABLISHED TWICE. Declared WITH the
 * space so MULTI_WORD_COLLAPSES builds the rule, because the collapse pass runs
 * before verb matching — which is exactly how `take cover` stopped losing to
 * `take` and `close in` stopped being unreachable. Declared without it, "give
 * ground" would only ever fire for a player who typed "giveground".
 *
 * ⚠ AND THE CANON IT SERVES, stated by the owner in the audit brief: RETREAT =
 * attempt to leave combat; tactical range-opening is GIVE GROUND / BACK OFF.
 * The parser already matched that — `retreat` routes to escape, `back off` to
 * the range intent — so this OTA closes the one phrase that did not, and the
 * suite below pins the whole rule so neither half can drift.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseInput } from '../app/engine/parser';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const concepts = JSON.parse(src('app', 'data', 'lore', 'concepts.json')) as {
  concepts: { id: string; title: string; keywords?: string[] }[];
};

describe('OTA-1724 — ⚠⚠⚠ the heading is a phrase too', () => {
  it('"give ground" reaches the range-opening intent', () => {
    expect(parseInput('give ground', {}).intent).toBe('retreat');
  });

  it('⚠⚠ and it is no longer read as GIFTING somebody the floor', () => {
    const r = parseInput('give ground', {});
    expect(r.intent).not.toBe('gift');
    expect(r.target ?? '').not.toContain('ground');
  });

  it('⚠ real gifting is untouched — the collapse is surgical', () => {
    // `give ground` collapses to one token BEFORE verb matching, so `give`
    // never sees it. Everything else `give` does must still work.
    expect(parseInput('give the rope to the trader', {}).intent).toBe('gift');
    expect(parseInput('give her the tin whistle', {}).intent).toBe('gift');
  });
});

describe('OTA-1724 — ⚠⚠ the owner-facing canon, pinned on both halves', () => {
  it('RETREAT leaves the fight', () => {
    // Owner, in the audit brief: "RETREAT = attempt to leave combat."
    expect(parseInput('retreat', {}).intent).toBe('escape');
  });

  it('GIVE GROUND / BACK OFF open one range band', () => {
    // "Tactical range-opening language should use a distinct concept such as
    // GIVE GROUND/BACK OFF rather than secretly interpreting RETREAT as one
    // range-band movement."
    for (const phrase of ['give ground', 'back off', 'back away', 'pull back', 'step back']) {
      expect({ phrase, intent: parseInput(phrase, {}).intent })
        .toEqual({ phrase, intent: 'retreat' });
    }
  });

  it('and the card still teaches only phrases that route', () => {
    // OTA-1713's rule, re-asserted here because this OTA edited the same list.
    const card = concepts.concepts.find((c) => c.id === 'retreat_action')!;
    for (const kw of card.keywords ?? []) {
      expect({ kw, intent: parseInput(kw, {}).intent }).toEqual({ kw, intent: 'retreat' });
    }
  });
});

describe('OTA-1724 — ⚠⚠⚠ THE INSTRUMENT: every command-shaped title', () => {
  /** The cards the ACTIONS screen actually shows. */
  const shown = (): Set<string> => {
    const ar = src('app', 'screens', 'ActionReferenceScreen.tsx');
    const block = ar.slice(ar.indexOf('const SECTIONS'), ar.indexOf('const SECTIONS') + 6000);
    return new Set([...block.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]!));
  };

  /** ⚠ NOT every title — most are HEADINGS. "Brawl — Skill: Fighting (Brawl)"
   *  is a label with a skill annotation; nobody types it and requiring it to
   *  parse would be a rule that fails on correct content. A title that reads as
   *  an INSTRUCTION is short, unpunctuated, and imperative — which is exactly
   *  what "Give Ground" is, and what made it indistinguishable from the keywords
   *  printed beside it. */
  const commandShaped = (t: string): boolean =>
    !/[—:()/]/.test(t) && t.trim().split(/\s+/).length <= 3;

  it('a command-shaped heading agrees with its own keywords', () => {
    const on = shown();
    const bad: string[] = [];
    let checked = 0;
    for (const c of concepts.concepts) {
      if (!on.has(c.id) || !commandShaped(c.title)) continue;
      const kwIntents = new Set((c.keywords ?? []).map((k) => parseInput(k.toLowerCase(), {}).intent));
      if (kwIntents.size === 0) continue;
      checked++;
      const titleIntent = parseInput(c.title.toLowerCase(), {}).intent;
      if (!kwIntents.has(titleIntent)) {
        bad.push(`"${c.title}" -> ${titleIntent}, but its keywords -> ${[...kwIntents].join('/')}`);
      }
    }
    // Before this OTA: ['"Give Ground" -> gift, but its keywords -> retreat'].
    expect(bad).toEqual([]);
    // ⚠ And the scan is looking at something. A title filter that excluded
    // everything would pass forever — the failure mode OTA-1710's probe had.
    expect(checked).toBeGreaterThanOrEqual(25);
  });
});

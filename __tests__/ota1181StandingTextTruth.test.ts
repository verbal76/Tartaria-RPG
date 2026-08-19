// OTA-1181 — THE TEXT SAYS WHAT THE CODE DOES, AND SAYS THE PART IT NEVER SAID.
//
// Owner, deciding the second of the design calls OTA-1179 held:
//   "correct the incorrect wording and make sure they know a certain − standing
//    will get them hunted."
//
// Two halves. The wrong numbers, and the missing rule.
//
// The wrong numbers: the glossary and the concepts catalogue both described
// standing as a currency that is "exchanged" or "spent" — it is neither, it is a
// threshold you stand above and it never goes down by being used. The join entry
// priced purchases at "+1" with no denominator, which is off by the entire
// BUY_REP_TC_PER_STANDING constant (500 TC). Gifts were quoted as a flat "+5"
// when the real grants are +4 loved / +2 liked / −2 insulted under a lifetime
// per-faction cap of 10. Theft was quoted at −10 when a caught theft on another
// faction's ground docks −10 TWICE, to two different factions.
//
// The missing rule is the one that matters: NOTHING anywhere in the game told the
// player that low standing gets them hunted. It is the most consequential state in
// the system and it was undocumented in the sheet, the glossary and the catalogue
// alike.
//
// ⚠ These assertions are about TRUTH, not about wording. Each one pins a number
// against the constant that actually drives the behaviour, so re-tuning a constant
// fails here instead of silently making the help text lie again — which is the
// exact failure this OTA exists to clean up.

import * as fs from 'fs';
import * as path from 'path';

import { JOIN_THRESHOLD, BUY_REP_TC_PER_STANDING } from '../app/engine/factions';
import { HOSTILE_STANDING } from '../app/engine/pressure';
import {
  STANDING_LOVED, STANDING_LIKED, STANDING_INSULT, GIFT_STANDING_FACTION_CAP,
} from '../app/engine/gifting';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const CONCEPTS = read('app', 'data', 'lore', 'concepts.json');
const GLOSSARY = read('app', 'data', 'lore', 'glossary.json');
const SHEET = read('app', 'screens', 'CharacterScreen.tsx');

/** Every `answer` string in a lore catalogue, joined — the player-facing text. */
function answersOf(raw: string): string {
  const out: string[] = [];
  (function walk(o: unknown): void {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    const rec = o as Record<string, unknown>;
    if (typeof rec.answer === 'string') out.push(rec.answer);
    if (typeof rec.definition === 'string') out.push(rec.definition);
    Object.values(rec).forEach(walk);
  })(JSON.parse(raw));
  return out.join('\n');
}

const CONCEPT_TEXT = answersOf(CONCEPTS);
const GLOSSARY_TEXT = answersOf(GLOSSARY);

describe('OTA-1181 — standing is not a currency', () => {
  it('no lore entry says standing is spent or exchanged', () => {
    // The false mental model. "Spend it to unlock…" invites the player to hoard
    // and then cash out, and there is no cash-out: crossing a line is the whole
    // mechanic, and you stay across it.
    //
    // ⚠ Matched on the AFFIRMATIVE claim only, and only inside standing entries.
    // A blanket /spend/ sweep is wrong twice over: the stamina entry legitimately
    // says "Travel and combat spend it" about a pool that really is spent, and the
    // replacement text here says "You never SPEND standing" — the fix would trip
    // the test written to protect it.
    const affirmative = /(?<!never )\b(spend|exchange)(s|d)? (it|them|standing|FP)\b/i;
    for (const [name, text] of [['concepts', CONCEPT_TEXT], ['glossary', GLOSSARY_TEXT]] as const) {
      const offenders = text
        .split('\n')
        .filter((a) => /faction standing|\bFP\b/i.test(a))
        .filter((a) => affirmative.test(a) || /\b(FP|standing) can be exchanged\b/i.test(a));
      expect(`${name}: ${offenders.join(' || ')}`).toBe(`${name}: `);
    }
    // and the two exact sentences that carried the claim are gone
    expect(CONCEPT_TEXT).not.toContain('Spend it to unlock exclusive gear');
    expect(GLOSSARY_TEXT).not.toContain('FP can be exchanged for exclusive gear');
  });

  it('both catalogues state it is a threshold you hold, not a purse', () => {
    expect(GLOSSARY_TEXT).toMatch(/never exchanged or spent/i);
    expect(CONCEPT_TEXT).toMatch(/never SPEND standing/i);
  });
});

describe('OTA-1181 — the numbers match the constants that drive them', () => {
  it('trade is priced per BUY_REP_TC_PER_STANDING, not as a bare +1', () => {
    // The old text: "making purchases (+1)". True only per 500 TC spent.
    expect(BUY_REP_TC_PER_STANDING).toBe(500);
    const perTc = new RegExp(`${BUY_REP_TC_PER_STANDING} TC`);
    expect(CONCEPT_TEXT).toMatch(perTc);
    expect(CONCEPT_TEXT).not.toMatch(/making purchases \(\+1\)/);
    expect(CONCEPT_TEXT).not.toMatch(/purchases \(\+1\)/);
    // and the sheet interpolates the constant rather than printing a copy
    expect(SHEET).toContain('{BUY_REP_TC_PER_STANDING} TC spent is worth 1');
  });

  it('gifts are quoted at their real tiers and their real cap', () => {
    expect([STANDING_LOVED, STANDING_LIKED, STANDING_INSULT]).toEqual([4, 2, 2]);
    expect(GIFT_STANDING_FACTION_CAP).toBe(10);
    expect(CONCEPT_TEXT).toMatch(new RegExp(`\\+${STANDING_LOVED} if they love it`));
    expect(CONCEPT_TEXT).toMatch(new RegExp(`\\+${STANDING_LIKED} if they merely like it`));
    expect(CONCEPT_TEXT).toMatch(new RegExp(`move any one faction ${GIFT_STANDING_FACTION_CAP} in total`));
    // the flat +5 that was never a real number anywhere in the code
    expect(CONCEPT_TEXT).not.toMatch(/gains 5 standing/);
    expect(CONCEPT_TEXT).not.toMatch(/gifts \(\+5\)/);
    expect(CONCEPT_TEXT).not.toMatch(/gifting items \(\+5\)/);
  });

  it('a caught theft names BOTH docks, because the store applies two', () => {
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('applyRepChange(repStanding, vendorFaction, -10).standing');
    expect(store).toContain('applyRepChange(repStanding, nativeFaction, -10).standing');
    expect(CONCEPT_TEXT).toMatch(/another faction holds, that faction docks you 10 as well/);
  });

  it('the join threshold is still stated, and still read from the constant', () => {
    expect(JOIN_THRESHOLD).toBe(20);
    expect(CONCEPT_TEXT).toMatch(new RegExp(`at least ${JOIN_THRESHOLD} standing`));
    expect(SHEET).toContain('+{JOIN_THRESHOLD} unlocks joining');
  });
});

describe('OTA-1181 — the player is told that low standing gets them hunted', () => {
  it('the character sheet warns, off the real constant', () => {
    // ⚠ The whole point of the owner's ask. Not a colour — words.
    expect(SHEET).toContain('HOSTILE_STANDING');
    expect(SHEET).toContain("from '../engine/pressure'");
    expect(SHEET).toContain('const hunted = standing <= HOSTILE_STANDING;');
    expect(SHEET).toMatch(/At \{HOSTILE_STANDING\} they\s*\n?\s*hunt you/);
    // both thresholds, because they are different numbers doing different jobs
    expect(SHEET).toMatch(/Below 0, a faction&apos;s patrols will engage you on sight/);
  });

  it('the sheet marks the rows themselves, not just the footnote', () => {
    expect(SHEET).toContain('☠ hunted');
    expect(SHEET).toContain('⚠ close');
    // the early warning sits inside the last 10 before the line — one contract
    // for a rival moves you about 4, so a bare threshold mark arrives too late
    expect(SHEET).toContain('const nearHunted = !hunted && standing <= HOSTILE_STANDING + 10;');
  });

  it('both lore catalogues carry the rule too', () => {
    const line = new RegExp(`${HOSTILE_STANDING}`.replace('-', '[−-]'));
    expect(CONCEPT_TEXT).toMatch(line);
    expect(GLOSSARY_TEXT).toMatch(line);
    expect(CONCEPT_TEXT).toMatch(/hunt(s)? you/i);
    expect(GLOSSARY_TEXT).toMatch(/hunt(s)? you/i);
  });

  it('the rival cost is stated, since it is how players actually fall', () => {
    // Nobody reaches −25 by being disliked. They reach it by working for the
    // other side: every earned point costs the target's rivals half.
    expect(CONCEPT_TEXT).toMatch(/costs their enemies half/);
    expect(SHEET).toMatch(/costs their enemies half as much the other way/);
  });
});

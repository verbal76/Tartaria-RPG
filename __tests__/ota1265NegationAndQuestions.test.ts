// ⚠⚠ OTA-1265 — "DO NOT OPEN THE CHEST" WAS OPENING THE CHEST.
//
// Owner, on the note from the 4.29.186 log: *"so this still needs addressed?"*
//
// The note said his typed sentence — *"and I have to hit ignore rest to close
// it."* — had parsed as `rest` at confidence 1.00 and cost him 8 game hours. He
// was talking to me, not the game, so I had filed it as a curiosity. Measuring it
// turned up something much worse sitting underneath.
//
// ⚠⚠ FIRST, THE THING THAT LOOKED LIKE THE BUG WAS NOT THE BUG. The obvious read
// is "the verb was buried mid-sentence and position is not a factor" — true, the
// scan takes the first minimum-distance hit anywhere in the token stream. But the
// hit-rate corpus DELIBERATELY expects exactly that: `maybe I should rest for a
// while and recover` → rest, `okay so I think I should attack but also kind of
// want to flee` → attack, twenty rows of it under `category: 'verbose'`. Penalising
// a buried verb would have broken a well-tested product decision. **The measurement
// stopped a fix that would have been a regression.**
//
// ⚠⚠ WHAT THE MEASUREMENT ACTUALLY FOUND — 10 OF 10 NEGATED COMMANDS EXECUTED THE
// NEGATED ACTION, AT FULL CONFIDENCE:
//
//     do not open the chest ........ open   conf=1.00
//     dont attack the guard ........ attack conf=1.00
//     do not disturb the sleeping .. attack conf=1.00   (wakes it — OTA-750 routes 'disturb' to attack)
//     I would rather not fight ..... attack conf=1.00
//     never eat the strange fungus . rest   conf=1.00
//     no rest for me yet ........... rest   conf=1.00
//     nothing to eat here .......... rest   conf=1.00
//     I do not want to sleep ....... rest   conf=1.00
//     I never want to camp here .... rest   conf=1.00
//     not going to rest yet ........ rest   conf=1.00
//
// Nobody designed "don't" to mean "do". There was no negation handling anywhere in
// the parser or the validator — not a weak rule, no rule. Unlike the verbose case
// this contradicts the design rather than expressing it.
//
// ⚠⚠ SECOND FINDING, FOUND BY READING THE LIST: `where` and `when` were MISSING
// from the `ask` synonyms while `what`/`who`/`how`/`why` were all present. So a
// question that happened to name an action performed it — `where can I sleep` slept
// eight hours, `when does the shop open` opened the chest. The wh-word sits at index
// 0 and the scan takes the FIRST minimum-distance hit, so restoring the two words is
// the entire fix; no new mechanism. Corpus `question` category went 14/15 → 15/15
// and dictionary-domain hit rate 98.3% → 99.2%.
//
// ⚠⚠ THIRD, AND THE ONE THAT WOULD HAVE SHIPPED THIS INERT: a demoted parse falls
// through to the QWEN RESOLVER, whose whole job is to find an actionable verb in the
// sentence. Handing it "do not open the chest" is asking for `open` back. Every
// other demotion means "I could not work out what you wanted" and belongs there;
// this one means the player was perfectly clear and the clear thing was DON'T. It is
// answered in the store and stopped. **This is the same shape as the N2 mistake
// earlier this session — a fix that looked right and never fired.**

import { parseInput } from '../app/engine/parser';
import { describeIssues } from '../app/engine/parseValidator';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const P = (s: string) => parseInput(s, { inventory: [], enemyPresent: false });

describe('OTA-1265 — negation is read', () => {
  // Verbatim from the pre-fix measurement, with the intent each one fired.
  const NEGATED: [string, string][] = [
    ['do not open the chest', 'open'],
    ['dont attack the guard', 'attack'],
    ['do not disturb the sleeping thing', 'attack'],
    ['I would rather not fight', 'attack'],
    ['never eat the strange fungus', 'rest'],
    ['no rest for me yet', 'rest'],
    ['nothing to eat here', 'rest'],
    ['I do not want to sleep', 'rest'],
    ['I never want to camp here', 'rest'],
    ['not going to rest yet', 'rest'],
  ];

  it.each(NEGATED)('⚠⚠ "%s" no longer fires %s', (phrase, wouldHaveFired) => {
    const r = P(phrase);
    expect(r.intent).not.toBe(wouldHaveFired);
    expect(r.intent).toBe('unknown');
    expect(r.validationIssues).toContain('negated_command');
  });

  it('⚠⚠ the two that COST something are the reason this is not cosmetic', () => {
    // `rest` burns 8 game hours and rolls for an ambush; `attack` opens a fight the
    // player did not choose. Both were reachable by typing the opposite.
    expect(P('do not rest').intent).toBe('unknown');
    expect(P('dont attack').intent).toBe('unknown');
  });

  it('⚠⚠ a FUZZY verb is still caught — this is why the index is passed, not derived', () => {
    // The validator cannot find the verb by searching `normalized` for
    // `matchedVerb`: on a fuzzy hit the canonical synonym is not a token in the
    // sentence at all. Passing `bestMatch.index` is what makes this case work.
    // ⚠ `attck` → attack at 0.82 and `sleeep` → sleep are inside the matcher's
    // edit-distance range; `slep` is NOT (it parses unknown on its own, with no
    // verb at all), so it would have proved nothing here.
    expect(P('attck').matchedVerb).toBe('attack');
    for (const s of ['do not attck the guard', 'do not sleeep']) {
      const r = P(s);
      expect(r.intent).toBe('unknown');
      expect(r.validationIssues).toContain('negated_command');
    }
  });
});

describe('OTA-1265 — negation SCOPE, so the rule cannot eat real commands', () => {
  it('⚠⚠ it does not scope across a coordinating conjunction', () => {
    // "I have nothing SO I will attack" is an attack. Without the boundary the
    // backward scan reads `nothing` and refuses a command the player really gave —
    // which would be a worse bug than the one being fixed, because it fails on
    // input the player meant.
    expect(P('I have nothing so I will attack').intent).toBe('attack');
    expect(P('nothing here but I will open the chest').intent).toBe('open');
    expect(P('found nothing and then rest').intent).not.toBe('unknown');
  });

  it('⚠⚠ it does not reach past the lookback window', () => {
    // MEASURED, not picked: the longest real distance in the corpus of negated
    // phrasings is 3 ("I do not want to sleep"), so the window is 4. An unbounded
    // scan would let a `no` at the head of a sentence veto a verb ten words later
    // that it has nothing to do with.
    expect(P('no I changed my mind I will open the chest').intent).toBe('open');
    // ⚠ NOT "...I will GO AHEAD and open the chest" — `go` is a travel verb at an
    // earlier index and wins the scan, so that phrasing would have passed for a
    // reason that has nothing to do with the lookback window. A test that passes
    // for the wrong reason protects nothing.
  });

  it('⚠ the window really does cover the measured distance-3 cases', () => {
    // Guards the other direction: shrinking the window would silently drop
    // "I do not want to sleep" back into the bug.
    for (const s of ['I do not want to sleep', 'I never want to camp here', 'not going to rest yet']) {
      expect(P(s).validationIssues).toContain('negated_command');
    }
  });
});

describe('OTA-1265 — the corpus contract is untouched', () => {
  // ⚠⚠ THESE ARE THE ROWS THAT KILLED THE FIRST DESIGN. Verbatim from
  // parserHitRate's `verbose` category: a verb buried in prose is expected to
  // route. If a future edit tries the positional-penalty idea again, this fails.
  const MUST_STILL_WORK: [string, string][] = [
    ['maybe I should rest for a while and recover', 'rest'],
    ['I think we should rest and plan ahead', 'rest'],
    ['let me search the rubble carefully', 'investigate'],
    ['I will attack the goblin with my rusted blade', 'attack'],
    ['rest', 'rest'],
    ['sleep', 'rest'],
    ['eat the ration', 'rest'],
    ['open the chest', 'open'],
  ];

  it.each(MUST_STILL_WORK)('⚠⚠ "%s" still routes to %s', (phrase, intent) => {
    const r = P(phrase);
    expect(r.intent).toBe(intent);
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });
});

describe('OTA-1265 — a question that names an action asks it', () => {
  const QUESTIONS = [
    'where can I sleep',      // slept 8 hours
    'when does the shop open', // opened the chest
    'where is the camp',
    'when can I rest',
    'where am I',              // was `unknown` — the corpus wanted `ask`
  ];

  it.each(QUESTIONS)('⚠⚠ "%s" → ask', (phrase) => {
    expect(P(phrase).intent).toBe('ask');
  });

  it('⚠⚠ the two missing wh-words are back beside their four siblings', () => {
    // The bug was pure omission: four of six wh-words were listed and two were not.
    const parser = src('app', 'engine', 'parser.ts');
    const m = /\n\s*ask: \[([^\]]+)\]/.exec(parser);
    expect(m).not.toBeNull();
    for (const w of ['what', 'who', 'how', 'why', 'where', 'when']) {
      expect(m![1]).toContain(`'${w}'`);
    }
  });

  it('⚠ the wh-word wins by POSITION, which is a property of the existing scan', () => {
    // No new mechanism was added for this: the verb scan already takes the FIRST
    // minimum-distance match, and the wh-word is at index 0. Stated as a check so
    // nobody later "fixes" the tiebreak and quietly undoes this.
    const r = P('where can I sleep');
    expect(r.matchedVerb).toBe('where');
  });
});

describe('OTA-1265 — the refusal reaches the player, and never reaches Qwen', () => {
  it('⚠⚠ THE INERT-FIX GUARD: the negated branch sits BEFORE the fallback gate', () => {
    // ⚠⚠ If this check ever moves below the `intent === 'unknown'` gate, the
    // sentence goes to a resolver hunting for an actionable verb and comes back as
    // the action the player refused. Ordering IS the fix, so ordering is what is
    // pinned.
    const store = src('app', 'state', 'gameStore.ts');
    const guard = store.indexOf("(parsed.validationIssues ?? []).includes('negated_command')");
    const gate = store.indexOf("if (parsed.intent === 'unknown' || parsed.confidence < 0.5) {");
    expect(guard).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(gate);
    // And it STOPS — no fall-through into the dispatch below.
    expect(store.slice(guard, gate)).toContain('return;');
  });

  it('⚠⚠ it ANSWERS rather than refusing in silence — the OTA-1164 rule', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const guard = store.indexOf("(parsed.validationIssues ?? []).includes('negated_command')");
    const block = store.slice(guard, guard + 500);
    expect(block).toContain("appendLog('arbiter', describeIssues(['negated_command']))");
  });

  it('⚠⚠ the message fits the mistake — the generic ones would insult the player', () => {
    // He said something perfectly clear. "That is a lot of words for one action" is
    // the wrong reply to "do not open the chest", so the negation case is answered
    // first and in its own words.
    const msg = describeIssues(['negated_command']);
    expect(msg).toContain('decide against it');
    expect(msg).not.toContain('a lot of words');
    // ⚠ And it wins even when a long negated sentence also trips `too_long`.
    expect(describeIssues(['too_long', 'negated_command'])).toBe(msg);
  });

  it('⚠ describeIssues finally has a caller — it had none for ~1000 OTAs', () => {
    // It has existed since OTA-205 and nothing ever called it; demoted parses fell
    // through to the generic refusal. Worth stating out loud: the remaining issue
    // codes still have no consumer, and that is a live gap, not a finished job.
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain("import { describeIssues } from '../engine/parseValidator';");
  });
});

/**
 * OTA-1464 — A NOTE ABOUT THE GAME IS NOT A COMMAND TO IT.
 *
 * ⚠⚠⚠ WHAT THIS COST, from the owner's 2026-08-23 log:
 *
 *   23:53:40  [player] hitting summon when there were already enemies screwed up that fight
 *   23:53:40  parser: intent=cast conf=1.00 verb=summon target=enemies screwed fight
 *   23:53:40  [world] An Eternal Dynasty war party crests the rise — 2 of them, blades already out.
 *   23:53:43  skillcheck: cast d20=2 INT 11 = 13 vs DC 12 — Hard → PASS
 *   23:54:16  Pike takes 21. (0/18 HP left)
 *   23:54:25  Eternal Dynasty Raider 1 deals 19 bludgeoning damage. You have 7 HP remaining.
 *
 * He was describing a summon that had gone badly. The game cast one, spent the
 * materials, and spawned the party that put his dog down and left him at 7 HP.
 *
 * ⚠⚠ THE CORPUS BELOW IS NOT INVENTED. Every NOTE is a message he actually typed
 * into the game across the 2026-08-23 and 2026-08-24 sessions, verbatim. Every
 * COMMAND is an action he actually issued in those same sessions, verbatim. A
 * hand-written corpus would have been written by the same mind that wrote the
 * matcher and would have agreed with it; these are the strings that already
 * defeated it once.
 *
 * ⚠ AND THE DISCRIMINATION THAT MATTERS IS INSIDE THE CORPUS, not beside it:
 *
 *     "summon crystal golem"                                      → COMMAND
 *     "hitting summon when there were already enemies screwed
 *      up that fight"                                             → NOTE
 *
 * Same verb. Only shape separates them. Any rule that gets one of these wrong
 * has failed, and a rule that passes by never firing has failed harder — which
 * is why the two directions are asserted with equal weight below.
 */
import {
  classifyMetaComment, isMetaComment, anyClauseIsMeta,
} from '../app/engine/metaComment';
import { splitClauses } from '../app/engine/parser';

/** ⚠⚠ EVERY NOTE HE TYPED. The three marked WAS-MISSED are the ones the old
 *  two-regex guard let through to the parser. */
const NOTES: readonly { text: string; note: string }[] = [
  {
    note: 'inventory sorting request',
    text: "the weapons all have names in the inventory, but some don't hint at what type they are. we need it to have the weapons sorted, equipped first, then the rest by type, melee, ranged, and so forth.",
  },
  {
    note: 'autoroute refresh report',
    text: 'when I set an autoroute it refreshes whatever tile I am on with new items',
  },
  {
    note: 'fuse chip layout report',
    text: "so when I first when I to ovils shop in side there was the fuse screen we were looking for, so I hit cancel and went out to come back in for a screen shot, but when I backed out it put the store chip and the fuse chip on the same line line we had decided before, it's only the initial time i enter that I see the messed up fuse block, it's not that it's broken, it just shouldn't be there, it should be a separate chip from the start",
  },
  {
    note: 'fuse crucible follow-up',
    text: 'then when I used the fuse cruciable it went back to the old style and I could see the screen I was looking for again',
  },
  {
    note: 'mission refusal feedback request',
    text: "I couldn't accept the core ass mission from this vendor, but there was no pop-up telling me why I'm imagining it's because either I've hit my cap of missions that I can have or I don't have enough standing but it doesn't say which. so either we need to have a pop-up or maybe like an angular set of writing like how they do. you know kind of faded that says need standing or something like that?",
  },
  {
    note: 'hidden market board request',
    text: "also, I think in the hidden market in the square should be a version of the missions board like in the starter. outpost, since it's a no fighting zone, then I'm guessing that all of the factions should be able to post there without interaction from each other",
  },
  {
    note: '⚠ WAS-MISSED — the one that cast a spell and killed the run',
    text: 'hitting summon when there were already enemies screwed up that fight',
  },
  {
    note: '⚠ WAS-MISSED — split into 5 clauses, three read as gift commands',
    text: "I just tried to gift scrap metal to brisk cartwright and it told me that I cannot equip it. I'm not trying to equip it. I'm trying to save or gift it. sorry. it even says at the top of the screen that I'm gifting so that's a glitch",
  },
];

/** ⚠⚠ EVERY COMMAND HE ISSUED, verbatim. If any of these starts being swallowed
 *  as prose, the guard has become the defect: a player who cannot act is worse
 *  off than one whose bug report occasionally fires a spell. */
const COMMANDS: readonly string[] = [
  'summon crystal golem',
  'attack with the bolt-caster',
  'attack with the off-hand dust cloud',
  'attack with the off-hand cantor\'s tuning fork',
  'investigate the ground',
  'investigate mud stain',
  'investigate shallow pool',
  'investigate Aetheric Helm of Insight',
  'investigate family portrait',
  'investigate tools',
  'investigate pegs',
  'investigate light',
  'investigate ruin',
  'investigate shelves',
  'investigate tins',
  'approach Mother Drakovna',
  'approach Aetheric Raven',
  'approach Eternal Dynasty Raider 1',
  'use Water Bottle',
  'use Smoke-Cured Jerky Strip',
  'craft Smoldering Paste',
  'craft Searing Paste',
  'craft Acid Flask',
  'Ask why the stall is here',
  'salvage lanterns',
  'salvage wares',
  'punch',
  'dodge',
  'sneak',
  'rest',
  'flee',
  'fuse',
];

describe('OTA-1464 — every note he typed is recognised as a note', () => {
  for (const { text, note } of NOTES) {
    it(`⚠⚠⚠ NOTE: ${note}`, () => {
      const v = classifyMetaComment(text);
      expect({ note, isMeta: v.isMeta }).toEqual({ note, isMeta: true });
      // A verdict with no reason is an instrument that fired without knowing
      // why — undiagnosable from a device log, which is the only place the
      // next miss will ever show up.
      expect(v.reason).not.toBeNull();
      expect(v.match).not.toBeNull();
      expect(v.match!.length).toBeGreaterThan(0);
      // and the match must genuinely occur in the input, not be a stray group
      expect(text.toLowerCase()).toContain(v.match!.toLowerCase());
    });
  }
});

describe('OTA-1464 — every command he issued still reaches the parser', () => {
  for (const cmd of COMMANDS) {
    it(`⚠⚠⚠ COMMAND: "${cmd}"`, () => {
      expect({ cmd, isMeta: isMetaComment(cmd) }).toEqual({ cmd, isMeta: false });
    });
  }
});

describe('OTA-1464 — the pair that proves it is shape and not vocabulary', () => {
  it('⚠⚠⚠ BOTH CONTAIN "summon" AND THEY GO OPPOSITE WAYS', () => {
    // THE test. A matcher keyed on words rather than shape fails exactly here,
    // and this is the failure that killed the run.
    expect(isMetaComment('summon crystal golem')).toBe(false);
    expect(isMetaComment('hitting summon when there were already enemies screwed up that fight')).toBe(true);
  });

  it('⚠⚠ …and the note is caught for a stated reason, not by accident', () => {
    const v = classifyMetaComment('hitting summon when there were already enemies screwed up that fight');
    expect(v.reason).toBe('report-of-behaviour');
    expect(v.match!.toLowerCase()).toBe('screwed up');
  });
});

describe('OTA-1464 — prose does not become a command by being cut up', () => {
  // ⚠⚠⚠ THE SECOND BUG, AND THE WORSE ONE. gameStore re-submits each clause with
  // `{ skipPreChecks: true }`, and the old guard was gated on
  // `!_opts?.skipPreChecks` — so it never ran on a clause at all. His five-
  // sentence note produced three separate gift attempts at conf 1.00, 1.00 and
  // 0.48. The many-doors mistake: the rule taught to the front door only.
  const FIVE_SENTENCE_NOTE =
    "I just tried to gift scrap metal to brisk cartwright and it told me that I cannot equip it. I'm not trying to equip it. I'm trying to save or gift it. sorry. it even says at the top of the screen that I'm gifting so that's a glitch";

  it('⚠⚠⚠ THE WHOLE NOTE IS A NOTE', () => {
    expect(isMetaComment(FIVE_SENTENCE_NOTE)).toBe(true);
  });

  it('⚠⚠⚠ AND IT IS STILL A NOTE AFTER THE SPLITTER HAS CUT IT UP', () => {
    const clauses = splitClauses(FIVE_SENTENCE_NOTE);
    // Confirm the splitter really does fragment it — otherwise this test is
    // asserting nothing and would stay green if the splitter changed.
    expect(clauses.length).toBeGreaterThan(1);
    expect(anyClauseIsMeta(FIVE_SENTENCE_NOTE, clauses).isMeta).toBe(true);
  });

  it('⚠⚠⚠ A NOTE WHOSE *WHOLE* READS CLEAN IS STILL CAUGHT BY ITS CLAUSES', () => {
    // The case `anyClauseIsMeta` exists for, built so the whole string dodges
    // every rule (short, no markers) while one clause does not. Without the
    // per-clause pass this runs three commands.
    const whole = 'go east and then the button is broken and does not work';
    const clauses = splitClauses(whole);
    expect(clauses.length).toBeGreaterThan(1);
    expect(anyClauseIsMeta(whole, clauses).isMeta).toBe(true);
  });

  it('⚠⚠ but a GENUINE multi-clause command chain is untouched', () => {
    // OTA-205 exists because chaining is a real feature. If this OTA broke it,
    // it would have traded a rare misfire for a constant one.
    const whole = 'go east then investigate the rubble then rest';
    const clauses = splitClauses(whole);
    expect(clauses.length).toBeGreaterThan(1);
    expect(anyClauseIsMeta(whole, clauses).isMeta).toBe(false);
    for (const c of clauses) expect(isMetaComment(c)).toBe(false);
  });
});

describe('OTA-1464 — the guard cannot swallow the whole game', () => {
  it('⚠⚠⚠ SHORT INPUTS ARE NEVER PROSE unless they carry a certain marker', () => {
    // The floor that keeps terse play working. Anything the player types in
    // anger at a fight must still resolve.
    for (const c of ['flee', 'rest', 'go east', 'punch', 'dodge', 'fuse', 'look']) {
      expect({ c, meta: isMetaComment(c) }).toEqual({ c, meta: false });
    }
  });

  it('⚠⚠ empty and whitespace are not notes — they are nothing', () => {
    // An instrument that answers "yes" to no input would silently disable the
    // parser on a stray return key.
    for (const s of ['', '   ', '\n', '\t ']) {
      expect(isMetaComment(s)).toBe(false);
    }
  });

  it('⚠⚠ the interface-noun tier is length-gated, so short in-world nouns pass', () => {
    // `screen`, `button`, `chip` are all plausible in Tartaria. They only count
    // inside prose long enough that a command is ruled out — this is the tier
    // that carries false-positive risk, so its floor is asserted directly.
    expect(isMetaComment('investigate the screen')).toBe(false);
    expect(isMetaComment('press the button')).toBe(false);
    expect(
      isMetaComment('when I open the map the button for the second tab is drawn on top of the banner'),
    ).toBe(true);
  });

  it('⚠ a bug SWARM is a monster, not a defect report', () => {
    // The `bug` marker has to not eat the fiction. Tartaria has vermin.
    expect(isMetaComment('attack the bug swarm')).toBe(false);
  });
});

describe('OTA-1464 — proof by removal: the corpus actually discriminates', () => {
  it('⚠⚠⚠ NOT EVERY STRING IS A NOTE — the matcher is not a rubber stamp', () => {
    // A classifier that answered `true` to everything would pass all eight NOTE
    // tests above. This is the half that stops that: the command corpus and the
    // note corpus must land on opposite sides, and both must be non-empty.
    expect(NOTES.length).toBeGreaterThanOrEqual(8);
    expect(COMMANDS.length).toBeGreaterThanOrEqual(30);
    const notesCaught = NOTES.filter((n) => isMetaComment(n.text)).length;
    const commandsCaught = COMMANDS.filter((c) => isMetaComment(c)).length;
    expect({ notesCaught, commandsCaught })
      .toEqual({ notesCaught: NOTES.length, commandsCaught: 0 });
  });
});

/**
 * OTA-1473 — THE WORDS OF SOMEBODY WHO KNOWS HOW IT IS BUILT.
 *
 * ⚠⚠⚠ OTA-1464 SHIPPED, AND THE 4.32.11 LOG STILL HAS FOUR NOTES THAT REACHED
 * THE PARSER — on a build that already carried it. Two the game acted on:
 *
 *   02:53:01  "the last text box was half covered by the keyboard"
 *             → parser: intent=help conf=0.66 verb=cover target=keyboard
 *             → "You shoulder in beside keyboard — but here, alone on the road,
 *                there's no second pair of hands to lift."
 *
 *   02:59:15  "any investigation story hook that ends in a trade now in a tile
 *              that has a vendor should not be able to spawn in that tile"
 *             → intent=unknown → "Your coil of tartarian filament is still there"
 *             "if there is already a vendor there that story hook gets skipped"
 *             → intent=maneuver verb=hook
 *             → "Maneuver against whom? Empty ground does not grapple back."
 *
 *   02:48:14  "I selected take and wear throwing knife and it did not go to my
 *              bandolier … nor did it end up in my weapons inventory, wear did
 *              it go?"
 *             → parse-fallback → 4694ms of qwen → "no usable result"
 *
 * ⚠⚠ THREE DISTINCT HOLES, and none of them is "add another word to the list":
 *
 *   1. A TIER ABOUT MACHINERY, not interface. `UI_NOUNS` covers what a player
 *      SEES and is length-gated because a room can hold a cracked screen.
 *      `keyboard`, `text box`, `spawn`, `story hook` are words for how the thing
 *      is BUILT — no character in Tartaria can form these sentences — so they
 *      need no gate, exactly like `glitch`.
 *
 *   2. THE REPORT VERB LIST WAS THE BUG. "it did not LET me" was covered; "it
 *      did not GO to my bandolier" was not. Enumerating the verbs somebody might
 *      reach for is the copied-constant mistake wearing a new hat. The verb is
 *      now ANY verb; what makes it a report is the bare `it`/`they`/`that`
 *      subject plus a negated outcome, a shape no command has.
 *
 *   3. A DESIGN DIRECTIVE CAN HAVE SOMEBODY ELSE AS ITS SUBJECT. `SUGGESTION`
 *      demanded `we` or `I`. A specification names the THING: "…should not be
 *      able to spawn", "…gets skipped".
 *
 * ⚠ The corpus half of this suite matters more than the catching half. Every
 * command he actually issued in this same log is run through the new tiers and
 * must still reach the parser untouched — a guard that eats real commands is a
 * far worse defect than the one it fixes.
 */
import { classifyMetaComment, isMetaComment, anyClauseIsMeta } from '../app/engine/metaComment';

/** The four that reached the parser on a build carrying OTA-1464. */
const THE_FOUR_MISSES: readonly [string, string][] = [
  ['the last text box was half covered by the keyboard', 'engine-vocabulary'],
  ['any investigation story hook that ends in a trade now in a tile that has a vendor should not be able to spawn in that tile', 'engine-vocabulary'],
  ['if there is already a vendor there that story hook gets skipped', 'engine-vocabulary'],
  ['I selected take and wear throwing knife and it did not go to my bandolier which is what was implied, nor did it end up in my weapons inventory, wear did it go?', 'report-of-behaviour'],
];

/**
 * ⚠⚠⚠ EVERY COMMAND HE TYPED OR TAPPED IN THE 4.32.11 LOG, verbatim. This is
 * the instrument that says the fix did not overreach, and it is transcribed
 * from the log rather than invented, because invented commands are the ones
 * that happen to avoid the words a real player uses.
 */
const REAL_COMMANDS: readonly string[] = [
  'craft Smoldering Paste', 'craft Searing Paste', 'craft Acid Flask',
  'summon crystal golem',
  'approach Mother Drakovna', 'approach Aetheric Raven', 'approach Drowned Aetherkin',
  'approach Eternal Dynasty Raider 1',
  'attack with the bolt-caster', 'attack with the off-hand dust cloud',
  "attack with the off-hand cantor's tuning fork", 'attack with the mud grinder axe',
  "attack with the reclaimer's trowel", 'attack with the off-hand aetheric crystal blade',
  'punch', 'dodge', 'sneak', 'flee', 'rest', 'look', 'fuse',
  'go south', 'go west', 'go north', 'go east',
  'investigate the ground', 'investigate mud stain', 'investigate Aetheric Helm of Insight',
  'investigate shallow pool', 'investigate ruin', 'investigate light', 'investigate warp',
  'investigate stove', 'investigate floodwater', 'investigate trunk', 'investigate rafters',
  'investigate window', 'investigate dust', 'investigate wardrobe', 'investigate mildew',
  'investigate drawer', 'investigate books', 'investigate shelves', 'investigate tins',
  'investigate pegs', 'investigate tools', 'investigate family portrait',
  'use Smoke-Cured Jerky Strip', 'use Water Bottle', 'use Aetheric Torch',
  'salvage lanterns', 'salvage wares',
  'Ask why the stall is here', 'Ask about their trade', 'Ask how far they range',
  'Ask why they trade out here', 'Try to make it right',
];

/**
 * ⚠⚠ THE NEAR MISSES — commands built from the exact words this OTA added, or
 * from the words it deliberately REFUSED to add. Each one is a sentence the
 * world can legitimately produce, and each would be a real regression.
 */
const MUST_STILL_PASS: readonly [string, string][] = [
  ['investigate hooks', 'bare "hook" — the game itself writes "Dried meat on hooks"'],
  ['salvage the hooks over the workbench', 'same, in a longer command'],
  ['break the kitchen tile apart', '"kitchen tile" is a salvageable noun in the shed'],
  ['investigate the kitchen tile in the flooded house', 'and in a longer one'],
  ['build a golem from the cores I am carrying', '"build" is a world verb'],
  ['summon crystal golem', '"summon", not "spawn" — the real cast verb'],
  ['investigate the banner on the reclaimer caravan', 'banner is length-gated UI, and this is a command'],
  ['press the button on the tartarian tumbler', '"button" in a real puzzle sentence'],
  ['look at the cracked screen', 'the classic false positive UI_NOUNS was gated for'],
  ['read the wall map with cities still labeled by their original names', 'long, prosaic, and a real command'],
  ['take the flag from the half-buried banner pole', '"flag" — deliberately NOT in the engine list'],
];

describe('OTA-1473 — the four that got through OTA-1464', () => {
  for (const [note, reason] of THE_FOUR_MISSES) {
    it(`⚠⚠⚠ CAUGHT: "${note.slice(0, 52)}…"`, () => {
      const v = classifyMetaComment(note);
      expect({ note: note.slice(0, 30), isMeta: v.isMeta }).toEqual({ note: note.slice(0, 30), isMeta: true });
      expect(v.reason).toBe(reason);
      expect(v.match).toBeTruthy();
    });
  }

  it('⚠⚠⚠ AND THE KEYBOARD NOTE IS CAUGHT AT 51 CHARACTERS — no length gate', () => {
    // The specific reason it slipped twice over: it is a SHORT bug report. Both
    // PROSE_MIN_LEN (34) and the UI tier's own >60 would have to be satisfied,
    // and it clears the first and fails the second. Machinery words carry their
    // own certainty, so they sit above both.
    const note = 'the last text box was half covered by the keyboard';
    expect(note.length).toBeLessThan(60);
    expect(isMetaComment(note)).toBe(true);
    // and shorter still
    expect(isMetaComment('keyboard covers it')).toBe(true);
    expect(isMetaComment('text box cut off')).toBe(true);
  });

  it('⚠⚠⚠ THE MANEUVER LINE — the one that grappled empty ground', () => {
    // `intent=maneuver verb=hook` is what "story hook" parsed to. The clause is
    // 63 characters and contains no `we`, no `I`, no interface noun and no
    // glitch — every tier OTA-1464 had, missed it.
    const v = classifyMetaComment('if there is already a vendor there that story hook gets skipped');
    expect(v.isMeta).toBe(true);
    expect(v.match).toMatch(/story\s+hooks?/i);
  });
});

describe('OTA-1473 — the report shape, with the verb list removed', () => {
  it('⚠⚠⚠ "it did not GO" is a report, and so is any other verb', () => {
    for (const verb of ['go', 'land', 'appear', 'stick', 'register', 'happen', 'save']) {
      const s = `I hit the button and it did not ${verb} where I expected it to`;
      expect({ verb, meta: isMetaComment(s) }).toEqual({ verb, meta: true });
    }
  });

  it('⚠⚠ "nor did it end up" — the same sentence\'s second half, on its own', () => {
    expect(isMetaComment('nor did it end up in my weapons inventory')).toBe(true);
  });

  it('⚠⚠ both spellings of the negation, as OTA-1464 established', () => {
    expect(isMetaComment("it didn't go to my bandolier at all")).toBe(true);
    expect(isMetaComment('it did not go to my bandolier at all')).toBe(true);
    expect(isMetaComment("they weren't shown in the list")).toBe(true);
    expect(isMetaComment('they were not shown in the list')).toBe(true);
  });

  it('⚠⚠⚠ AND A NAMED SUBJECT IS NOT A REPORT — the guard stops at bare pronouns', () => {
    // "the door will not open" is a player narrating the WORLD, not the
    // software, and it is a thing somebody might type meaning "open the door".
    // The subject list is `it|they|that` on purpose.
    expect(isMetaComment('the door will not open no matter how hard I pull')).toBe(false);
    expect(isMetaComment('the gate did not budge when I leaned on it')).toBe(false);
  });
});

describe('OTA-1473 — a directive about the thing, not about us', () => {
  it('⚠⚠⚠ "X should not be able to Y"', () => {
    expect(isMetaComment('any investigation story hook that ends in a trade should not be able to fire there')).toBe(true);
    expect(isMetaComment('a wandering trader should not be able to appear twice on the same stretch of road')).toBe(true);
  });

  it('⚠⚠ "X gets skipped"', () => {
    expect(isMetaComment('if there is already a vendor on the ground that whole beat gets skipped instead')).toBe(true);
  });

  it('⚠⚠ still length-gated — "should" alone is far too common to trust short', () => {
    // A terse line stays the parser's. This is the tier that carries the
    // false-positive risk and it keeps its floor.
    expect(isMetaComment('I should rest')).toBe(false);
    expect(isMetaComment('should be able to')).toBe(false);
  });
});

describe('OTA-1473 — and every real command still reaches the parser', () => {
  it('⚠⚠⚠ ALL 57 COMMANDS FROM THE SAME LOG PASS THROUGH UNTOUCHED', () => {
    const eaten = REAL_COMMANDS.filter((c) => isMetaComment(c))
      .map((c) => ({ cmd: c, why: classifyMetaComment(c) }));
    expect(eaten).toEqual([]);
    // and the corpus is actually loaded — an empty list would pass vacuously
    expect(REAL_COMMANDS.length).toBeGreaterThan(50);
  });

  for (const [cmd, why] of MUST_STILL_PASS) {
    it(`⚠⚠ NOT META: "${cmd}" — ${why}`, () => {
      const v = classifyMetaComment(cmd);
      expect({ cmd, isMeta: v.isMeta, reason: v.reason }).toEqual({ cmd, isMeta: false, reason: null });
    });
  }

  it('⚠⚠⚠ A REAL QUESTION TO THE ARBITER IS NOT SUPPRESSED', () => {
    // ⚠ DELIBERATELY LEFT UNCAUGHT. His 02:52:32 note — "I haven't seen any of
    // the new Aetheric abilities in the stores yet, how do I get them?" — is a
    // question the game CAN answer, and it tried. It answered the wrong
    // question (it explained aetheric DAMAGE), but that is a defect in the ASK
    // handler, not a reason to stop the Arbiter hearing questions. Swallowing
    // this would trade a bad answer for no answer.
    expect(isMetaComment("I haven't seen any of the new Aetheric abilities in the stores yet, how do I get them?")).toBe(false);
    expect(isMetaComment('how do I get the aetheric abilities')).toBe(false);
    expect(isMetaComment('where can I buy a crucible')).toBe(false);
  });
});

describe('OTA-1473 — the multi-clause splitter still covers the whole note', () => {
  it('⚠⚠⚠ HIS FIVE-PART GIFT NOTE — one meta clause suppresses all five', () => {
    // From the log: `multi-clause: 5 parts`, then all five ran as commands, one
    // of them resolving `Scrap Metal`. Only the first and last clauses are meta
    // on their own; "I'm not trying to equip it" and "sorry" are not, and must
    // not need to be — the note is one note.
    const whole = "I just tried to gift scrap metal to brisk cartwright and it told me that I cannot equip it. I'm not trying to equip it. I'm trying to save or gift it. sorry. it even says at the top of the screen that I'm gifting so that's a glitch";
    const clauses = [
      'I just tried to gift scrap metal to brisk cartwright and it told me that I cannot equip it',
      "I'm not trying to equip it",
      "I'm trying to save or gift it",
      'sorry',
      "it even says at the top of the screen that I'm gifting so that's a glitch",
    ];
    expect(anyClauseIsMeta(whole, clauses).isMeta).toBe(true);
    // the two carrying the evidence
    expect(isMetaComment(clauses[0]!)).toBe(true);
    expect(isMetaComment(clauses[4]!)).toBe(true);
  });

  it('⚠⚠⚠ AND HIS TWO-PART STORY-HOOK NOTE — the one that grappled empty ground', () => {
    const clauses = [
      'any investigation story hook that ends in a trade now in a tile that has a vendor should not be able to spawn in that tile',
      'if there is already a vendor there that story hook gets skipped',
    ];
    expect(anyClauseIsMeta(clauses.join('. '), clauses).isMeta).toBe(true);
  });

  it('⚠⚠ a genuine two-command line is NOT suppressed by this', () => {
    const clauses = ['go north', 'then rest'];
    expect(anyClauseIsMeta(clauses.join(' and '), clauses).isMeta).toBe(false);
  });
});

describe('OTA-1473 — the vocabulary is defensible word by word', () => {
  it('⚠⚠⚠ "spawn" NEVER REACHES A PLAYER, so it cannot be parroted back', () => {
    // 452 occurrences in the source, every one an identifier (`${spawn.name}`).
    // Asserted rather than remembered: if a line ever starts SAYING "spawn" to
    // the player, this tier starts eating their words back.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const store = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // every player-visible channel; `debug` is ours to read, not theirs
    const said = store.match(/appendLog\(\s*'(?:world|arbiter|combat|reward|system)'\s*,\s*`[^`]*`/g) ?? [];
    expect(said.length).toBeGreaterThan(100);   // the corpus is loaded
    const leaks = said.filter((s) => /\bspawn(s|ed|ing)?\b/i.test(s.replace(/\$\{[^}]*\}/g, '')));
    expect(leaks).toEqual([]);
  });

  it('⚠⚠ the words held BACK are held back for a stated reason', () => {
    // Each of these was considered and refused. If a later hand adds one, these
    // fail and the reasoning has to be revisited rather than quietly lost.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'engine', 'metaComment.ts'), 'utf8') as string;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const engine = code.slice(code.indexOf('const ENGINE_VOCABULARY'), code.indexOf('const REPORT_MARKERS'));
    expect(engine).not.toMatch(/\\bhooks\?/);        // only `story hook`
    expect(engine).not.toMatch(/\\btiles\?/);
    expect(engine).not.toMatch(/\\bbuilds\?/);
    expect(engine).not.toMatch(/\\bflags\?/);
    expect(engine).toMatch(/story\\s\+hooks\?/);
  });

  it('⚠ the new reason is a real reason, and reaches the debug line', () => {
    // The store prints `meta-comment guard: skipped intent parse (<reason>: "<match>")`.
    // A tier that fired under somebody else's name would be undiagnosable from
    // a device log, which is the only place these are ever seen.
    expect(classifyMetaComment('the keyboard covered it').reason).toBe('engine-vocabulary');
    const store = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8') as string;
    expect(store).toContain('meta-comment guard: skipped intent parse');
    expect(store).toContain('${metaVerdict.reason}: "${metaVerdict.match}"');
  });
});

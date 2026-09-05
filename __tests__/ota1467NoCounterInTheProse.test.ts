/**
 * OTA-1467 — COMING BACK SOMEWHERE, WITHOUT RECITING A NUMBER.
 *
 * ⚠⚠⚠ THE OWNER, ON THE LINE HE HEARS MORE THAN ANY OTHER:
 *
 *   "instead of saying 'hey, I've been here before' — you can't say 'this is my
 *    second time here'. I think I've been here more than once cuz you're saying
 *    the same thing. find some other kind of flavour."
 *
 * It shipped as `You've stood here ${tag}. (visit ${n})` — seven words, three
 * possible tags, and a debug readout on the end — and it fires on EVERY re-entry
 * to EVERY tile. His 2026-08-24 log still shows it: `You've stood here before.
 * (visit 2)`.
 *
 * ⚠⚠ THE COUNTER IS THE PART HE OBJECTED TO, AND THE PART THAT LOOKS LIKE
 * INFORMATION. "(visit 2)" tells the player something the character would never
 * think, in a register nothing else in the game uses. Familiarity is a feeling —
 * the ground knows your weight, you stop reading the walls, you catch yourself
 * taking the same line through the rubble. None of that needs an integer.
 *
 * ⚠ So the strongest pin here is a NEGATIVE one, asserted over the whole pool
 * rather than over one sentence: no line may contain a digit, and no line may
 * count in words either. A pool that passed the digit check while saying
 * "the second time" would have missed the complaint entirely.
 */
import {
  RETURN_AGAIN_LINES, RETURN_FAMILIAR_LINES, returnLine, RETURN_MANY_THRESHOLD,
} from '../app/engine/voicePools';
import { rotatingPick, resetRotationCursors } from '../app/engine/rng';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const STORE = codeOnly(read('app', 'state', 'gameStore.ts'));

const ALL = [...RETURN_AGAIN_LINES, ...RETURN_FAMILIAR_LINES];

describe('OTA-1467 — the counter is gone, in every sense', () => {
  it('⚠⚠⚠ THE OLD SENTENCE IS NOT IN THE STORE ANY MORE', () => {
    expect(STORE).not.toContain("You've stood here");
    expect(STORE).not.toContain('(visit ');
    expect(STORE).not.toContain('visitCount + 1');
  });

  it('⚠⚠⚠ NO RETURN LINE CONTAINS A DIGIT', () => {
    for (const line of ALL) {
      expect({ line, hasDigit: /\d/.test(line) }).toEqual({ line, hasDigit: false });
    }
  });

  it('⚠⚠⚠ AND NONE COUNTS IN WORDS EITHER — the half a digit check misses', () => {
    // "this is your second time here" contains no digit and is exactly the
    // sentence he objected to. A pool that passed the check above while saying
    // this would have missed the complaint entirely.
    //
    // ⚠⚠ THE FIRST DRAFT OF THIS PATTERN BANNED THE BARE WORD "second" AND
    // FAILED ON "…lands a half-second before the memory does." That is a unit of
    // TIME, not an ordinal, and the line is good prose — the instrument was
    // wrong, not the content. Recorded because the tempting fix was to reword
    // the sentence to appease the test, which would have quietly narrowed the
    // writing to whatever a careless regex happened to allow.
    //
    // What is actually banned is an ordinal ATTACHED TO A VISIT — the tally
    // shape — plus the standalone counting adverbs.
    //
    // ⚠⚠ AND "first time" IS NOT ON THE LIST, WHICH IS THE SECOND TIME THIS
    // PATTERN OVER-REACHED. It failed on "You breathe easier here than you did
    // the first time." — a comparison to a PAST occasion, not a tally of the
    // present one. His complaint is precisely about the game naming which visit
    // THIS is ("this is my second time here"); a line that remembers how the
    // first visit felt is doing the opposite, and is the kind of flavour he
    // asked for. Twice now the instrument has been broader than the claim, and
    // both times the tempting fix was to bend the writing to fit it.
    const COUNTING =
      /\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(time|visit|trip|pass|round|crossing)\b|\b(twice|thrice)\b|\bvisit\s*(number|#|\d)/i;
    for (const line of ALL) {
      expect({ line, counts: COUNTING.test(line) }).toEqual({ line, counts: false });
    }
  });

  it('⚠⚠⚠ …AND THAT PATTERN ACTUALLY CATCHES THE SENTENCE HE COMPLAINED ABOUT', () => {
    // ⚠ Proof the rule above is not a rubber stamp. A negative assertion that
    // cannot fire is the worst kind in this codebase — it reports safety it
    // never checked — so the pattern is fired at the real offending shapes here.
    const COUNTING =
      /\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(time|visit|trip|pass|round|crossing)\b|\b(twice|thrice)\b|\bvisit\s*(number|#|\d)/i;
    for (const bad of [
      'This is your second time here.',
      'Your third visit to this ground.',
      'You have been here twice.',
      'You have stood here before. (visit 2)',
      'Visit number four, and the mud has not moved.',
    ]) {
      expect({ bad, caught: COUNTING.test(bad) }).toEqual({ bad, caught: true });
    }
    // and it leaves ordinary prose alone
    for (const fine of [
      'The look of it lands a half-second before the memory does.',
      'You breathe easier here than you did the first time.',
      'You know this place. Not well, but you know it.',
      'Pike lifts his head, then puts it down.',
    ]) {
      expect({ fine, caught: COUNTING.test(fine) }).toEqual({ fine, caught: false });
    }
  });

  it('⚠⚠ "three times" survives ONLY where it is an animal circling, not a tally', () => {
    // Proof the rule above is about COUNTING THE PLAYER'S VISITS and not about
    // banning number-words from the game: the dog pool legitimately says
    // "circles three times". These pools must not, and that pool still may.
    expect(ALL.some((l) => /three times/i.test(l))).toBe(false);
  });
});

describe('OTA-1467 — the tiers', () => {
  beforeEach(() => { resetRotationCursors(); });

  it('⚠⚠⚠ A SECOND VISIT DRAWS FROM THE RECOGNITION POOL', () => {
    // visitCount is PRIOR visits, so 1 means "this is the second time". The old
    // call site read `visitCount + 1` to build its counter, which is the same
    // off-by-one that made OTA-1104's phantom shell record greet a FIRST entry
    // as "(visit 2)".
    for (let i = 0; i < RETURN_AGAIN_LINES.length; i++) {
      expect(RETURN_AGAIN_LINES).toContain(returnLine(1));
    }
  });

  it('⚠⚠⚠ A WELL-TRODDEN TILE DRAWS FROM THE OTHER ONE', () => {
    for (let i = 0; i < RETURN_FAMILIAR_LINES.length; i++) {
      const said = returnLine(RETURN_MANY_THRESHOLD + 3);
      expect(RETURN_FAMILIAR_LINES).toContain(said);
      expect(RETURN_AGAIN_LINES).not.toContain(said);
    }
  });

  it('⚠⚠⚠ THE BOUNDARY IS A DECISION, not an accident of < versus <=', () => {
    resetRotationCursors();
    expect(RETURN_AGAIN_LINES).toContain(returnLine(RETURN_MANY_THRESHOLD - 1));
    resetRotationCursors();
    expect(RETURN_FAMILIAR_LINES).toContain(returnLine(RETURN_MANY_THRESHOLD));
  });

  it('⚠⚠ the two pools share no line — the tiers must actually differ', () => {
    const again = new Set<string>(RETURN_AGAIN_LINES);
    expect(RETURN_FAMILIAR_LINES.filter((l) => again.has(l))).toEqual([]);
  });

  it('⚠⚠ a nonsense count still returns prose rather than throwing', () => {
    // The caller reads `existing.visitCount` off a persisted record. A save
    // written by an older build, or corrupted, must not crash the scene.
    for (const n of [NaN, Infinity, -Infinity, -5, 0]) {
      const said = returnLine(n as number);
      expect(typeof said).toBe('string');
      expect(said.length).toBeGreaterThan(10);
      expect(/\d/.test(said)).toBe(false);
    }
  });
});

describe('OTA-1467 — rotation, so returning twice does not sound the same twice', () => {
  beforeEach(() => { resetRotationCursors(); });

  it('⚠⚠⚠ A FULL CYCLE SHOWS EVERY LINE BEFORE REPEATING ANY', () => {
    const seen = new Set<string>();
    for (let i = 0; i < RETURN_AGAIN_LINES.length; i++) seen.add(returnLine(1));
    expect(seen.size).toBe(RETURN_AGAIN_LINES.length);
  });

  it('⚠⚠ consecutive returns are never identical, in either tier', () => {
    for (const n of [1, 2, 4, 9, 40]) {
      resetRotationCursors();
      let prev = '';
      for (let i = 0; i < 40; i++) {
        const next = returnLine(n);
        expect({ n, next }).not.toEqual({ n, next: prev });
        prev = next;
      }
    }
  });

  it('⚠⚠ the two tiers keep SEPARATE cursors', () => {
    // On one shared key, crossing the threshold mid-session would resume the
    // other pool at whatever index the first had reached — and could repeat a
    // line immediately across the boundary.
    const src = read('app', 'engine', 'voicePools.ts');
    expect(src).toContain("rotatingPick(RETURN_FAMILIAR_LINES, 'return-familiar')");
    expect(src).toContain("rotatingPick(RETURN_AGAIN_LINES, 'return-again')");
  });
});

describe('OTA-1467 — the wiring', () => {
  it('⚠⚠⚠ THE STORE CALLS returnLine AND CANNOT LEAK THE COUNT', () => {
    // `returnLine` takes a number and returns prose. There is no argument a
    // caller can pass through to the screen — which is what makes the counter
    // structurally impossible to reintroduce here rather than merely absent.
    expect(STORE).toContain('returnLine(existing.visitCount)');
  });

  it('⚠⚠ the cleared-bodies note still rides along', () => {
    // OTA's neighbouring feature: a tile you cleared reports its dead. Losing it
    // while rewriting the sentence around it would be a silent content loss.
    // OTA-1691 — the clause moved to voicePools.clearedBodiesNote and names the dead.
    expect(read('app', 'engine', 'voicePools.ts')).toContain('you left are still here. Nothing has moved in to replace them.');
    expect(STORE).toContain('${clearedNote}');
  });

  it('⚠⚠ the greet still requires a REAL prior visit — OTA-1104 is undisturbed', () => {
    // A visitCount-0 shell record is created by other writers in the same build
    // to hang their tables on. Greeting off bare existence read every first
    // entry as a return, which is the defect that put "(visit 2)" on every room
    // in the game.
    expect(STORE).toContain('existing.visitCount >= 1');
  });

  it('⚠⚠ both pools are frozen and registered with the depth gate', () => {
    expect(Object.isFrozen(RETURN_AGAIN_LINES)).toBe(true);
    expect(Object.isFrozen(RETURN_FAMILIAR_LINES)).toBe(true);
    const gate = read('scripts', 'check-voice-pools.mjs');
    expect(gate).toContain("name: 'RETURN_AGAIN_LINES'");
    expect(gate).toContain("name: 'RETURN_FAMILIAR_LINES'");
  });

  it('⚠ every line is a whole sentence — it is concatenated with the cleared note', () => {
    for (const line of ALL) {
      expect(line.trimEnd().endsWith('.')).toBe(true);
      expect(line[0]).toBe(line[0]!.toUpperCase());
    }
  });

  it('⚠ no line carries a template token — nothing substitutes into these', () => {
    for (const line of ALL) expect(line).not.toMatch(/\{[A-Za-z]+\}/);
  });
});

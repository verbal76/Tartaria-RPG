/**
 * OTA-1461 — THE LINES YOU HEAR TEN TIMES AN HOUR.
 *
 * Owner: *"it's like when your friend asks you every time he sees you: hey man,
 * what you up to?"* — and the census off his own device log found four of the
 * game's highest-frequency lines with NO POOL AT ALL. One hardcoded sentence,
 * fired roughly twenty-five times in a session.
 *
 * ⚠⚠ WHAT THESE PINS ARE FOR, AND WHAT THEY ARE NOT. The COUNT and the
 * SIMILARITY of each pool are enforced by `npm run check:voicepools`, which is
 * where that belongs — it is a property of content, it changes every time someone
 * writes a line, and a jest snapshot of it would be a chore rather than a guard.
 *
 * These tests pin the WIRING: that the pools are actually consumed at the sites
 * that used to hold one hardcoded string, through the picker that refuses an
 * immediate repeat, with the templating each pool needs. A pool of forty lines
 * nothing reads is worth exactly as much as the one line it replaced.
 */
import {
  UNRESOLVED_HOOK_LINES, DOG_SETTLE_LINES, TAKE_LINES,
  FLEE_OPEN_LINES, FLEE_INDOOR_LINES,
} from '../app/engine/voicePools';
import { rotatingPick, resetRotationCursors } from '../app/engine/rng';
import { applyDogPronouns } from '../app/engine/dogCompanion';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const STORE = read('app', 'state', 'gameStore.ts');
const POOLS_SRC = read('app', 'engine', 'voicePools.ts');

describe('OTA-1461 — the pools are actually wired in', () => {
  it('⚠⚠⚠ THE HARDCODED SENTENCES ARE GONE FROM THE STORE', () => {
    // Each of these was ONE string doing all the work. If any survives as a
    // literal, that site is still saying the same thing every time regardless of
    // how deep its pool got.
    expect(STORE).not.toContain('The thread you were following waits where you left it.');
    expect(STORE).not.toContain('circles three times and curls beside you');
    expect(STORE).not.toContain('from where it lay.`');
    expect(STORE).not.toContain('You break away across the open ground. Behind you the thing');
  });

  it('⚠⚠⚠ …AND EVERY SITE READS ITS POOL THROUGH rotatingPick', () => {
    // rotatingPick cycles in ORDER and refuses an immediate repeat, so a pool of
    // forty is forty distinct fires before anything comes round again. A plain
    // random pick would show the same line twice in a row often enough to be
    // noticed, which is the exact complaint.
    for (const [pool, key] of [
      ['UNRESOLVED_HOOK_LINES', 'hook-waiting'],
      ['DOG_SETTLE_LINES', 'dog-settle'],
      ['TAKE_LINES', 'take-noun'],
    ] as const) {
      expect(STORE).toContain(`rotatingPick(${pool}, '${key}')`);
    }
    // ⚠ THE TWO FLEE POOLS ARE NOT IN THIS LIST, AND THAT IS THE FIX, NOT A GAP.
    // OTA-1462 moved their selection behind `fleeLine(indoors)` because the
    // indoor/outdoor CHOICE is itself a claim — the store was picking a pool AND
    // deciding which one, and only the second half was ever guarded. Their
    // rotation is proved through the picker by the pool-wide checks below, and
    // the choice is proved behaviourally in ota1301.
    expect(STORE).toContain('fleeLine(fleeIndoors)');
    for (const line of [...FLEE_OPEN_LINES, ...FLEE_INDOOR_LINES]) {
      // and the picker still governs them — a `fleeLine` that reached for
      // `pick()` would lose the no-immediate-repeat guarantee silently.
      expect(POOLS_SRC).toContain(line);
    }
    expect(POOLS_SRC).toContain("rotatingPick(FLEE_INDOOR_LINES, 'flee-indoor')");
    expect(POOLS_SRC).toContain("rotatingPick(FLEE_OPEN_LINES, 'flee-open')");
  });

  it('⚠⚠ the two dog-settle sites use DIFFERENT rotation keys', () => {
    // The rescue arc's first-ever settle and the nightly rest beat share a pool.
    // On one key, the once-in-a-game beat would show whatever the nightly rotation
    // happened to be pointing at — and could repeat it that same night.
    expect(STORE).toContain("rotatingPick(DOG_SETTLE_LINES, 'dog-settle')");
    expect(STORE).toContain("rotatingPick(DOG_SETTLE_LINES, 'dog-settle-first')");
  });
});

describe('OTA-1461 — the templating each pool needs', () => {
  it('⚠⚠⚠ EVERY dog line survives all three pronouns without leaking a token', () => {
    // The owner's dog can be he, she or they. A line that hardcodes "his"
    // misgenders a companion the player named and chose the sex for — and a
    // leaked `{Possessive}` in the feed is the OTA-146 defect (raw template
    // surfacing to the player) returning through a new door.
    for (const pronoun of ['he', 'she', 'they'] as const) {
      for (const line of DOG_SETTLE_LINES) {
        const out = applyDogPronouns(line.replace(/\{Name\}/g, 'Pike'), pronoun);
        expect(out).not.toMatch(/\{[A-Za-z]+\}/);
        expect(out).not.toContain('undefined');
      }
    }
  });

  it('⚠⚠⚠ NO DOG LINE HARDCODES A GENDER — every reference goes through a token', () => {
    // ⚠ ADDED AFTER PROOF-BY-REMOVAL EXPOSED THIS AS UNPROTECTED. The pronoun test
    // above only catches LEAKED tokens; a line that simply writes "his ears up"
    // has no token to leak and sailed straight through, while misgendering a
    // companion the player named and chose the sex for. The claim was in the
    // comment and not in the code — which is the exact failure this project has
    // been correcting all week, made by the test rather than by the feature.
    const GENDERED = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
    for (const line of DOG_SETTLE_LINES) {
      expect({ line, gendered: GENDERED.test(line) }).toEqual({ line, gendered: false });
    }
  });

  it('⚠⚠ every dog line names the dog — none says "the dog"', () => {
    // The name is the whole point of the rescue arc. A settle line that says
    // "the dog" reads as a stranger's animal.
    for (const line of DOG_SETTLE_LINES) {
      expect(line.toLowerCase()).not.toContain('the dog');
    }
  });

  it('⚠⚠⚠ EVERY take line carries the {thing} slot', () => {
    // A take line with no slot would announce a pickup without saying what was
    // picked up — worse than the single line it replaced.
    for (const line of TAKE_LINES) expect(line).toContain('{thing}');
  });

  it('⚠ the store substitutes {thing} and {Name} at the call sites', () => {
    expect(STORE).toContain("replace(/\\{thing\\}/g, cat.name)");
    expect(STORE).toContain('replace(/\\{Name\\}/g, restDog.name)');
    expect(STORE).toContain('replace(/\\{Name\\}/g, dog.name)');
  });

  it('⚠⚠ no pool leaks a template token it has no substituter for', () => {
    // {thing} belongs to TAKE_LINES; {Name} and the pronoun tokens to the dog
    // pool. A stray token anywhere else reaches the player raw.
    for (const line of [...UNRESOLVED_HOOK_LINES, ...FLEE_OPEN_LINES, ...FLEE_INDOOR_LINES]) {
      expect(line).not.toMatch(/\{[A-Za-z]+\}/);
    }
  });
});

describe('OTA-1461 — rotation actually rotates', () => {
  beforeEach(() => { resetRotationCursors(); });

  it('⚠⚠⚠ A FULL CYCLE SHOWS EVERY LINE BEFORE REPEATING ANY', () => {
    // THE claim the owner is asking for. With forty lines he should hear forty
    // different things before the first one comes back.
    const seen = new Set<string>();
    for (let i = 0; i < UNRESOLVED_HOOK_LINES.length; i++) {
      seen.add(rotatingPick(UNRESOLVED_HOOK_LINES, 'test-cycle'));
    }
    expect(seen.size).toBe(UNRESOLVED_HOOK_LINES.length);
  });

  it('⚠⚠ consecutive picks are never identical, across every pool', () => {
    for (const [name, pool] of Object.entries({
      UNRESOLVED_HOOK_LINES, DOG_SETTLE_LINES, TAKE_LINES, FLEE_OPEN_LINES, FLEE_INDOOR_LINES,
    })) {
      resetRotationCursors();
      let prev = '';
      for (let i = 0; i < pool.length * 2; i++) {
        const next = rotatingPick(pool, `test-${name}`);
        expect({ name, next }).not.toEqual({ name, next: prev });
        prev = next;
      }
    }
  });
});

describe('OTA-1461 — the floors are enforced somewhere real', () => {
  it('⚠⚠ the gate script exists and is wired into the build', () => {
    // The counts live in check:voicepools, not here — but if that gate is not in
    // package.json it never runs, and these pools can silently shrink back.
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:voicepools']).toBe('node scripts/check-voice-pools.mjs');
  });

  it('⚠ every pool is frozen — no accidental runtime mutation', () => {
    for (const pool of [UNRESOLVED_HOOK_LINES, DOG_SETTLE_LINES, TAKE_LINES,
      FLEE_OPEN_LINES, FLEE_INDOOR_LINES]) {
      expect(Object.isFrozen(pool)).toBe(true);
    }
  });
});

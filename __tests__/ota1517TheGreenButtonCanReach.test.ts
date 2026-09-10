// OTA-1517 — THE GREEN BUTTON CAN REACH.
//
// ⚠⚠⚠ THE OWNER'S QUESTION, CARRIED SINCE OTA-1511: *"why did the timing fork
// light up green if it wasn't able to be used??"* His 4.32.11 log answered it —
// top of the tower relay, tier 4/4, Raider 1 down at the base:
//
//     22:46:07  ui: tap "searing tuning fork"
//     22:46:07  "…Cantor's Tuning Fork won't reach from up here."
//     22:46:09  ui: tap "searing tuning fork"   → same refusal
//     22:46:10  ui: tap "searing tuning fork"   → same refusal
//     22:46:13  ui: tap "searing tuning fork"   → same refusal
//
// Four taps, four refusals, and the button stayed ready-green through all of
// them. The debug line names why: `reach.bands=[close]` and the raider WAS at
// close band, so `weaponTone`'s only question — "is the target in a band this
// weapon covers" — answered yes. The gate was asking a different question
// entirely: "can this weapon shoot DOWN a climb", which OTA-960 added to the
// store and never gave the button.
//
// ⚠⚠ SO THE DEFECT IS NOT THE BAND TEST, WHICH IS CORRECT. It is that a
// control's LOOK and a control's GATE computed eligibility from two different
// predicates. Copying the far/distant test into the component would fix this
// instance and leave the class alive — the next edit to either side desyncs
// them again, silently, and the only symptom is a green button that bounces.
// `reachFiresDown` is now a named export both sides import, and this suite pins
// that neither side hand-rolls it.

import { readFileSync } from 'fs';
import { join } from 'path';
import { reachBandsFor, reachFiresDown } from '../app/engine/types';

const ROOT = join(__dirname, '..');
const INPUT = readFileSync(join(ROOT, 'app', 'components', 'InputBox.tsx'), 'utf8');
// ⚠ OTA-1800 — the shared authority both sides now read.
const RESOLUTION = readFileSync(join(ROOT, 'app', 'state', 'combatResolution.ts'), 'utf8');
const STORE = readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
const SCREEN = readFileSync(join(ROOT, 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');

/** Source with comments stripped — a pin must never be satisfied by prose that
 *  merely describes the call it is checking. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

describe('OTA-1517 — one predicate, asked by both sides', () => {
  it('⚠⚠⚠ THE FORK CANNOT SHOOT DOWN, AND THE PREDICATE SAYS SO', () => {
    // The exact weapon from the log: a melee reach class, close band only.
    expect(reachFiresDown(reachBandsFor('melee'))).toBe(false);
    expect(reachFiresDown(reachBandsFor('barehanded'))).toBe(false);
    // 'long' reaches mid — still not down a climb.
    expect(reachFiresDown(reachBandsFor('long'))).toBe(false);
  });

  it('⚠⚠ AND THE REFUSAL\'S OWN PROMISE IS KEPT: shooters AND throwables pass', () => {
    // The Arbiter says "Use something that SHOOTS (or a throwable)". A
    // throwable reaches 'far', so the band test blesses exactly what the
    // sentence blesses — which is why this asks BANDS, not a reach class.
    expect(reachFiresDown(reachBandsFor('ranged'))).toBe(true);
    expect(reachFiresDown(reachBandsFor('runecaster'))).toBe(true);
    expect(reachFiresDown(reachBandsFor('throwable'))).toBe(true);
  });

  it('⚠⚠⚠ NEITHER SIDE HAND-ROLLS IT — that is the error class, not the instance', () => {
    // Both the gate and the button must call the shared export. A literal
    // far/distant test in either file is the desync waiting to happen.
    expect(codeOnly(STORE)).toContain('const firesDown = reachFiresDown(reach.bands);');
    /* ⚠ OTA-1800 — THE BUTTON'S HALF MOVED, AND THIS CLAIM GOT STRONGER FOR IT.
     * The button used to spell the elevation test itself, one line down from
     * this pin. It now asks `weaponSwingRefusal`, which is the store's three
     * gates in the store's order — so "neither side hand-rolls it" is no longer
     * a thing two files each remember to do, it is a thing only one file can
     * do. The desync this test exists to prevent is now structurally
     * unavailable rather than merely absent. */
    expect(codeOnly(INPUT)).toContain('weaponSwingRefusal({');
    expect(codeOnly(RESOLUTION)).toContain("if (f.groundedFoesBelow && !reachFiresDown(f.bands)) return 'cannot-fire-down';");
    for (const src of [STORE, INPUT]) {
      expect(codeOnly(src)).not.toMatch(/includes\('far'\)\s*\|\|\s*.*includes\('distant'\)/);
    }
  });
});

describe('OTA-1517 — the button now answers the gate\'s question', () => {
  it('⚠⚠ weaponTone takes the elevation fact and answers it BEFORE the band test', () => {
    const fn = INPUT.slice(INPUT.indexOf('export function weaponTone('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toContain('groundedFoesBelow?: boolean,');
    // ⚠ OTA-1800 — the button still TAKES the elevation fact and still passes
    // it on; what it no longer does is decide what to do with it. The ORDER
    // this test was really about (elevation answered before the band, because a
    // weapon can be in-band and still unable to land) now lives in
    // `weaponSwingRefusal` and is asserted there, against the store's order.
    expect(body).toContain('groundedFoesBelow,');
    const order = RESOLUTION.slice(RESOLUTION.indexOf('export function weaponSwingRefusal('));
    const elevAt = order.indexOf("return 'cannot-fire-down'");
    const bandAt = order.indexOf("return 'out-of-reach'");
    expect(elevAt).toBeGreaterThan(-1);
    expect(bandAt).toBeGreaterThan(-1);
    // The store refuses on reach FIRST — the thing the player can act on by
    // moving — so the predicate must report them in that same order.
    expect(elevAt).toBeGreaterThan(bandAt);
  });

  it('⚠⚠ EVERY weapon button gets the fact — however many there are', () => {
    /* ⚠⚠⚠ THIS LISTED FOUR CHIPS BY NAME AND WENT RED WHEN ONE WAS REMOVED.
     * OTA-1768 dropped the KICK chip — punch and kick are the same action in the
     * engine, so two chips for one action were not worth the space. The pin
     * enumerated `punchT, kickT, mainT, offT`, which is the MECHANISM (which
     * chips exist) rather than OTA-1517's CLAIM (no weapon chip may be left out
     * of the elevation fact). Fifth time in this rollout.
     * ⚠ Stated as a claim it is stronger than the list ever was: it now covers a
     * chip added tomorrow, which the hard-coded four never could. */
    const code = codeOnly(INPUT);
    const tones = [...code.matchAll(/const (\w+T) = weaponTone\(([^)]*)\)/g)];
    expect(tones.length).toBeGreaterThanOrEqual(3);      // main, off, punch today
    for (const [, name, args] of tones) {
      expect([name, args!.includes('groundedFoesBelow')]).toEqual([name, true]);
    }
    // and the two hands are definitely among them
    const names = tones.map((m) => m[1]);
    expect(names).toEqual(expect.arrayContaining(['mainT', 'offT', 'punchT']));
    expect(names).not.toContain('kickT');                 // OTA-1768
  });

  it('⚠ the amber is reused, not replaced — no sixth colour on the busiest button', () => {
    // "needs-approach" already means "this one cannot land from here", which is
    // exactly true up a climb. A new tone would read as a warning.
    const fn = INPUT.slice(INPUT.indexOf('function weaponTone('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).not.toMatch(/'(elevated|no-shot|cant-reach)'/);
  });
});

describe('OTA-1517 — the screen reads the same three scene facts the gate reads', () => {
  it('⚠⚠⚠ elevatedOn AND enemiesAtBase AND not-airborne — the store\'s exact conjunction', () => {
    const gate = STORE.indexOf('sceneAfterDots.elevatedOn && sceneAfterDots.enemiesAtBase && !enemyIsAirborne(targetEnemy)');
    expect(gate).toBeGreaterThan(-1); // the gate is unchanged; only its predicate moved
    const code = codeOnly(SCREEN);
    expect(code).toContain('if (!currentScene?.elevatedOn || !currentScene?.enemiesAtBase) return false;');
    expect(code).toContain('return live.length > 0 && live.every((e) => !enemyIsAirborne(e));');
  });

  it('⚠⚠ ONE LIVE FLIER LEAVES EVERY BUTTON GREEN — airborne foes come to you', () => {
    // OTA-960's rule, quoted in its own comment: an AIRBORNE enemy ignores the
    // ground and can be met with ANY weapon. `every` is what encodes that: a
    // single flier in the group makes the melee button honest again.
    const code = codeOnly(SCREEN);
    expect(code).toContain('live.every((e) => !enemyIsAirborne(e))');
    expect(code).not.toContain('live.some((e) => !enemyIsAirborne(e))');
  });

  it('⚠ dead and knocked-out foes do not hold the button amber', () => {
    const code = codeOnly(SCREEN);
    expect(code).toContain("(e, i) => e && (e.hp ?? 0) > 0 && !(currentScene?.enemyKnockedOut ?? [])[i],");
  });
});

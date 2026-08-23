/**
 * OTA-1450 — THE BOARD KNOWS HOW BIG YOU ARE, AND THE MINI-MAP GETS THE LIFT.
 *
 * Owner: *"Tarek the Tinkerer still gives out a ton of higher end missions in
 * the outpost"* — and, the same day, *"the mini-map still has the location on
 * the name."*
 *
 * ⚠⚠ WHAT THE LOG SHOWED. A character who had never left the starting outpost —
 * Cudgel, 51 HP, Day 1 — walked into the Workshop and was posted sixteen hunts,
 * nine of them Veteran and five Elite, on his first day.
 *
 * ⚠⚠ A CARRY CAP WAS BUILT FOR THIS AND THEN REMOVED. Recorded here because the
 * next reader will have the same idea. OTA-972 settled it deliberately — *"first
 * contract goes LIVE; every later accept — any kind — parks"* — so the Arbiter's
 * "you can only walk one road at a time" is ACCURATE, not an unkept promise, and
 * a hold limit would have undone a shipped design two suites document. The
 * report was about what the vendor GIVES OUT. That is the reach gate.
 *
 * ⚠⚠ AND THE CATALOGUE ALREADY KNEW. Every hunt carries `recommendedHp` — 30 to
 * 65 — authored and never read. `minRep` was the only gate and SIXTEEN OF THE
 * EIGHTEEN sit at minRep 0, so the whole board was posted on day one: nine
 * Veteran, five Elite, two Apex, to a 51 HP character.
 *
 * ⚠⚠ THE MINI-MAP IS THE MANY-DOORS MISTAKE, PLAIN. OTA-1441 lifted the "you
 * are here" marker off the painted room name on the Atlas and left the corner
 * mini-map — a separate component with its own copy of the arithmetic — still
 * centring on the point. One door fixed, its sibling left standing.
 */
import { HUNTS, availableHunts, huntWithinReach } from '../app/engine/hunts';
import { INTERIOR_MARKER_LIFT_FRAC } from '../app/engine/outpostRoomMarks';
import { blockAt } from '../test-utils/srcBlock';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const QUEST = read('app', 'state', 'slices', 'questSlice.ts');
const STORE = read('app', 'state', 'gameStore.ts');
const MINI = read('app', 'components', 'MiniMap.tsx');
const MAP = read('app', 'screens', 'MapScreen.tsx');

describe('OTA-1450 — the measurement that started it', () => {
  it('⚠⚠ minRep alone could never have gated this: 16 of 18 sit at zero', () => {
    // Pinned as the REASON the second gate exists. If someone later re-tunes
    // minRep upward and deletes the reach rule believing rep now covers it,
    // this fails and explains why it does not.
    const open = HUNTS.filter((h) => h.minRep <= 0);
    expect(open.length).toBeGreaterThanOrEqual(15);
    expect(HUNTS.length).toBe(18);
  });

  it('⚠⚠ THE REPORTED CASE: a 51 HP tutorial character is no longer posted Elites', () => {
    // The owner's actual character. Before: the near-complete board.
    const at51 = availableHunts(null, 0, [], [], 51);
    expect(at51.length).toBeGreaterThan(0);          // the board is not empty…
    expect(at51.length).toBeLessThan(HUNTS.length);  // …and it is not everything
    for (const h of at51) expect(h.recommendedHp ?? 0).toBeLessThanOrEqual(51);
    // Every Elite/Apex in that pool recommends more HP than he has, so none post.
    const ungated = availableHunts(null, 0, [], []);
    expect(ungated.length).toBeGreaterThan(at51.length);
  });

  it('⚠⚠ the board OPENS as the character grows — it is a gate, not a wall', () => {
    const small = availableHunts(null, 0, [], [], 30).length;
    const mid = availableHunts(null, 0, [], [], 55).length;
    const big = availableHunts(null, 0, [], [], 999).length;
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(big);
    // With room to spare, reach stops mattering and rep is the only gate again.
    expect(big).toBe(availableHunts(null, 0, [], []).length);
  });

  it('⚠ omitting hpMax keeps the OLD behaviour, for callers that mean "what exists"', () => {
    // The Contracts modal lists the catalogue; the walkers enumerate it. A
    // readiness filter there would hide content from the wrong surface.
    expect(availableHunts(null, 0, [], []).length)
      .toBe(availableHunts(null, 0, [], [], undefined).length);
    expect(huntWithinReach(HUNTS[0]!, undefined)).toBe(true);
  });
});

describe('OTA-1450 — the offer and the accept obey ONE rule', () => {
  it('⚠⚠ every player-facing pool passes hpMax — offering what accept refuses is the bug', () => {
    // Three surfaces: the vendor's spoken bounty-board line, the "next contract"
    // teaser, and the accept lookup. If any one forgets, the game dangles work
    // it will then deny — the exact shape OTA-1402 exists to prevent.
    expect(STORE).toContain('player.hpMax,');
    expect((QUEST.match(/player\.hpMax, \/\/ OTA-1450/g) ?? []).length).toBe(2);
  });
});

describe('OTA-1450 — the carry cap that was built and then removed', () => {
  it('⚠⚠ there is NO hold limit, and that is on purpose — OTA-972 owns this question', () => {
    // The first cut of this OTA added MAX_ACTIVE_HUNTS = 5 and three suites went
    // red, because OTA-972 had already decided the flood was answered by
    // TRACKING one contract and PARKING the rest. This pin exists so the next
    // reader who has the same idea finds the reasoning instead of the bug.
    const accept = blockAt(QUEST, '  acceptHunt(titleOrId) {');
    expect(accept).not.toContain('MAX_ACTIVE_HUNTS');
    expect(read('app', 'engine', 'hunts.ts')).not.toContain('export const MAX_ACTIVE_HUNTS');
  });

  it('⚠ and the reasoning is written down where the cap would have gone', () => {
    // A deleted idea with no note is an idea that gets rebuilt.
    const hunts = read('app', 'engine', 'hunts.ts');
    expect(hunts).toContain('A CARRY CAP WAS BUILT HERE AND THEN REMOVED');
    expect(hunts).toContain('OTA-972');
  });
});

describe('OTA-1450 — the mini-map gets the lift the Atlas got', () => {
  it('⚠⚠ ONE constant, and BOTH maps read it', () => {
    // The whole point. OTA-1441 put a number in MapScreen; the mini-map kept its
    // own arithmetic and never got it, and the owner saw the ring on the room
    // name the same day.
    expect(INTERIOR_MARKER_LIFT_FRAC).toBeGreaterThan(0);
    // ⚠ The import grew a second symbol in OTA-1451 (the ✓'s drop), so this pins
    // the SYMBOL and its source rather than the exact shape of the import line.
    expect(MAP).toContain('INTERIOR_MARKER_LIFT_FRAC');
    expect(MAP).toContain("} from '../engine/outpostRoomMarks'");
    expect(MINI).toContain('INTERIOR_MARKER_LIFT_FRAC');
    // …and neither keeps a private copy of the old pixel constant.
    expect(MAP).not.toContain('const INTERIOR_MARKER_LIFT = ');
  });

  it('⚠⚠ the mini-map lifts INTERIORS only — the world marker stays centred', () => {
    // The overland marker stands on landmark silhouettes, not text, and its
    // placement was approved on device. Lifting it would be a regression
    // dressed as consistency.
    expect(MINI).toContain('interior: true,');
    expect(MINI).toContain('interior: false,');
    expect(MINI).toContain('view.interior ? INTERIOR_MARKER_LIFT_FRAC * renderedW + RING / 2 : 0');
  });

  it('⚠ the lift scales with the RENDER, because the mini-map zooms its art', () => {
    // A fixed pixel lift clears the name on the Atlas and lands back on it in
    // the mini-map, where the painted lettering is 2.5× larger.
    expect(MINI).toContain('* renderedW');
    expect(MAP).toContain('INTERIOR_MARKER_LIFT_FRAC * renderedWidth');
  });
});

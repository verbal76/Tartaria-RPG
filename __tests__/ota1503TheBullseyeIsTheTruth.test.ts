// OTA-1503 — THE BULLSEYE IS THE TRUTH (the geometry, proved).
//
// ⚠⚠⚠ THE OWNER'S MODEL, 2026-08-25: *"picture a bullseye. I'm in the middle
// and then there's four outward rings extending … it doesn't matter what
// compass heading they are to me, it just matters what ring outward they are to
// me … if I step closer to the guy directly north of me, I get one ring closer,
// but the guy south of me, he's now one ring further away. So we need to know
// where I'm at, where every other person is in relation to me in those rings,
// and then every time I move we need to recalculate that."*
//
// ⚠⚠ THE CASE THE MODEL HAS TO GET RIGHT AND A RING-ONLY MODEL CANNOT: the man
// at 90°. Step one ring-width north and he should barely care — a naive
// "everyone else moves out one ring" would shove him as far as the man at your
// back, and the player would feel that lie the first time it happened.
//
// ⚠ Ring 5 is not a band, it is ABSENCE: nobody can act on him and he cannot
// act on you. He is walking in, and that is all.

import {
  ringOf, bandOf, distanceForBand, stepToward, stepAwayFrom, stepField,
  enemyCloses, staggerSpawn, nearestFirst, STEP, CONTACT_MIN, OUT_OF_RANGE_RING,
  type EnemyPosition,
} from '../app/engine/combatGeometry';
import { RANGE_ORDER, type CombatRange } from '../app/engine/types';

const at = (bearing: number, distance: number): EnemyPosition => ({ bearing, distance });
/** Deterministic stand-in for Math.random — no Date/random in suites. */
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

describe('OTA-1503 — the rings themselves', () => {
  it('⚠⚠⚠ FIVE RINGS, FOUR OF THEM FIGHTABLE', () => {
    expect(ringOf(0.2)).toBe(1);
    expect(ringOf(1.5)).toBe(2);
    expect(ringOf(2.5)).toBe(3);
    expect(ringOf(3.5)).toBe(4);
    expect(ringOf(4.2)).toBe(OUT_OF_RANGE_RING);
    expect(ringOf(99)).toBe(OUT_OF_RANGE_RING);
  });

  it('⚠⚠⚠ RING 5 IS ABSENCE, NOT A BAND — null, so no reach check can pass', () => {
    expect(bandOf(0.2)).toBe('close');
    expect(bandOf(1.5)).toBe('mid');
    expect(bandOf(2.5)).toBe('far');
    expect(bandOf(3.5)).toBe('distant');
    expect(bandOf(4.01)).toBeNull();
  });

  it('⚠⚠ every band round-trips — the save migration cannot land in the wrong ring', () => {
    for (const band of RANGE_ORDER as readonly CombatRange[]) {
      expect(bandOf(distanceForBand(band))).toBe(band);
    }
  });

  it('⚠ a mid-ring landing, so the first step reads as a clean change', () => {
    // Sitting exactly ON a boundary means a hair of movement tips the ring and
    // the player sees a change he did not earn.
    for (const band of RANGE_ORDER as readonly CombatRange[]) {
      const d = distanceForBand(band);
      expect(d - Math.floor(d)).toBeCloseTo(0.5, 5);
    }
  });
});

describe('OTA-1503 — one step, and what it does to everybody', () => {
  it('⚠⚠⚠ THE OWNER\'S SENTENCE, EXACTLY: north closes, south opens', () => {
    const field = [at(0, 3.5), at(180, 1.5)];
    const after = stepToward(field, 0);
    expect(ringOf(after[0]!.distance)).toBe(3); // 3.5 → 2.5, distant → far
    expect(ringOf(after[1]!.distance)).toBe(3); // 1.5 → 2.5, mid → far
    expect(bandOf(after[0]!.distance)).toBe('far');
    expect(bandOf(after[1]!.distance)).toBe('far');
  });

  it('⚠⚠⚠ THE MAN AT 90° BARELY MOVES — the case a ring-only model gets wrong', () => {
    const after = stepField([at(90, 2.5)], 0);
    expect(after[0]!.distance).toBeCloseTo(2.693, 3);
    expect(ringOf(after[0]!.distance)).toBe(3); // unchanged
  });

  it('⚠⚠ the diagonals land where the geometry says, not where a table says', () => {
    expect(stepField([at(45, 2.5)], 0)[0]!.distance).toBeCloseTo(1.927, 3);
    expect(stepField([at(135, 2.5)], 0)[0]!.distance).toBeCloseTo(3.284, 3);
  });

  it('⚠⚠⚠ A MAN CAN BE PUSHED OUT OF THE FIGHT ENTIRELY — ring 5 earns its keep', () => {
    const after = stepField([at(180, 3.2)], 0);
    expect(ringOf(after[0]!.distance)).toBe(OUT_OF_RANGE_RING);
    expect(bandOf(after[0]!.distance)).toBeNull();
  });

  it('⚠⚠⚠ YOU CANNOT WALK THROUGH THE MAN YOU WALK AT — the step shortens', () => {
    // Half a ring away, head-on: a full STEP would carry the player past him and
    // flip his bearing 180°, which reads as "he teleported behind me".
    const after = stepToward([at(0, 0.5)], 0);
    expect(after[0]!.distance).toBeCloseTo(CONTACT_MIN, 5);
    expect(after[0]!.bearing).toBeCloseTo(0, 5);
  });

  it('⚠⚠ the shortened step is ONE step — everyone else moves by the same amount', () => {
    // The player does not travel a different distance for each observer.
    const field = [at(0, 0.5), at(180, 2)];
    const after = stepToward(field, 0);
    const travelled = 0.5 - CONTACT_MIN;
    expect(after[1]!.distance).toBeCloseTo(2 + travelled, 5);
  });

  it('⚠⚠ stepping at somebody 120° off does not shorten for him — he is not being closed on', () => {
    const field = [at(0, 3), at(120, 0.4)];
    const after = stepField(field, 0, { limitToward: 1 });
    expect(after[0]!.distance).toBeCloseTo(2, 5); // full step still taken
  });

  it('⚠⚠⚠ STEP BACK GOES STRAIGHT AWAY — and closes on whoever is behind you', () => {
    const field = [at(0, 1.5), at(180, 2.5)];
    const after = stepAwayFrom(field, 0);
    expect(after[0]!.distance).toBeCloseTo(2.5, 5); // the one you backed off
    expect(after[1]!.distance).toBeCloseTo(1.5, 5); // the one behind you
  });

  it('⚠⚠ bearings stay correct across TWO steps — the reason this is not a cosine solve', () => {
    // A cosine solve gives the new distance but loses the sign of the angle; a
    // second step from a wrong bearing goes wrong quietly.
    const once = stepField([at(90, 2.5)], 0);
    const twice = stepField(once, 0);
    // Two steps north from due-east: dead reckoning says (2.5, -2) from origin.
    expect(twice[0]!.distance).toBeCloseTo(Math.hypot(2.5, 2), 5);
    expect(twice[0]!.bearing).toBeCloseTo((Math.atan2(2.5, -2) * 180) / Math.PI, 4);
  });

  it('⚠ an empty field and a bad index are no-ops, not throws', () => {
    expect(stepToward([], 0)).toEqual([]);
    expect(stepToward([at(0, 2)], 7)).toEqual([at(0, 2)]);
    expect(stepAwayFrom([at(0, 2)], 7)).toEqual([at(0, 2)]);
  });
});

describe('OTA-1503 — the enemy walks in', () => {
  it('⚠⚠ closing keeps the bearing — he is coming down the line, not circling', () => {
    const closed = enemyCloses(at(27, 3.5));
    expect(closed.bearing).toBe(27);
    expect(closed.distance).toBeCloseTo(3.5 - STEP, 5);
  });

  it('⚠⚠ he stops at contact — never inside the player', () => {
    expect(enemyCloses(at(0, 0.4)).distance).toBeCloseTo(CONTACT_MIN, 5);
    expect(enemyCloses(at(0, CONTACT_MIN)).distance).toBeCloseTo(CONTACT_MIN, 5);
  });
});

describe('OTA-1503 — where a fresh lineup stands', () => {
  it('⚠⚠⚠ AMBUSH SPREADS, PATROL CLUSTERS — the owner picked both', () => {
    const spread = staggerSpawn(4, 'ambush', seeded(7));
    const cluster = staggerSpawn(4, 'patrol', seeded(7));
    const arc = (ps: EnemyPosition[]) => {
      const bs = ps.map((p) => p.bearing).sort((a, b) => a - b);
      // widest gap between neighbours tells us whether they ring the player
      let widest = 360 - (bs[bs.length - 1]! - bs[0]!);
      for (let i = 1; i < bs.length; i++) widest = Math.max(widest, bs[i]! - bs[i - 1]!);
      return 360 - widest; // the arc they actually occupy
    };
    expect(arc(spread)).toBeGreaterThan(180); // around you
    expect(arc(cluster)).toBeLessThan(90); // in front of you
  });

  it('⚠⚠⚠ BOTH SHAPES STAGGER ACROSS THE RINGS — that is the whole mechanic', () => {
    for (const shape of ['ambush', 'patrol'] as const) {
      const rings = staggerSpawn(4, shape, seeded(3)).map((p) => ringOf(p.distance));
      expect(new Set(rings).size).toBe(4); // one man per ring, 1 through 4
      expect(Math.min(...rings)).toBe(1);
      expect(Math.max(...rings)).toBe(4);
    }
  });

  it('⚠⚠ a fifth body stacks in the outer ring — it never piles onto the player', () => {
    const rings = staggerSpawn(6, 'ambush', seeded(11)).map((p) => ringOf(p.distance));
    expect(rings.filter((r) => r === 1)).toHaveLength(1);
    expect(Math.max(...rings)).toBeLessThanOrEqual(4); // nobody spawns already out
  });

  it('⚠⚠ a lone enemy spawns in your face — a duel does not open at distance', () => {
    expect(ringOf(staggerSpawn(1, 'patrol', seeded(5))[0]!.distance)).toBe(1);
  });

  it('⚠ zero enemies is an empty field', () => {
    expect(staggerSpawn(0, 'ambush', seeded(1))).toEqual([]);
  });
});

describe('OTA-1503 — the pager order', () => {
  it('⚠⚠⚠ NEAREST FIRST — swiping walks the line outward from your face', () => {
    const field = [at(0, 3.5), at(90, 0.5), at(180, 2.0)];
    expect(nearestFirst(field)).toEqual([1, 2, 0]);
  });

  it('⚠⚠ ties keep spawn order — cards must not shuffle for no reason', () => {
    const field = [at(10, 2), at(200, 2), at(300, 2)];
    expect(nearestFirst(field)).toEqual([0, 1, 2]);
  });
});

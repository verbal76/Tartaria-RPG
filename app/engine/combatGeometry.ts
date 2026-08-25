// ---------------------------------------------------------------------------
// combatGeometry — where everybody is standing, relative to you
// ---------------------------------------------------------------------------
//
// ⚠⚠⚠ THE OWNER'S MODEL, 2026-08-25, in his own words: *"picture a bullseye.
// I'm in the middle and then there's four outward rings extending … it doesn't
// matter what compass heading they are to me, it just matters what ring outward
// they are to me … so if I step closer to the guy directly north of me, I get
// one ring closer, but the guy south of me, he's now one ring further away."*
//
// ⚠⚠ WHY BEARINGS EXIST EVEN THOUGH THE UI NEVER SHOWS ONE. The rings are what
// the player reads; the bearing is what makes the rings TRUE. Without it,
// "everyone else moves one ring out" would push the man standing at your
// shoulder as far as the man at your back — and the player would feel the lie
// immediately. With it, the perpendicular case falls out for free: step one
// ring-width north and the man due east barely moves a hair (2.50 → 2.69),
// which is exactly what anyone would expect and what no ring-only model can do.
//
// ⚠⚠ THE MATH IS DELIBERATELY CARTESIAN, NOT THE LAW OF COSINES. Cosines give
// the new DISTANCE in one line, and that is all the design discussion needed —
// but a second step has to start from a correct bearing too, and recovering the
// new bearing from a cosine solve needs a sign-disambiguating atan2 anyway. So
// positions convert to x/y, the whole field translates by the step vector
// (the player is always the origin — he does not move, the world moves past
// him), and they convert back. Exact for every angle, no special cases, and
// walking past somebody is impossible by construction (see CONTACT_MIN).
//
// Compass convention: 0° = due north = +y, 90° = east = +x, clockwise, so it
// matches the way the owner talks about it ("one guy 27° to me").

import { RANGE_ORDER, type CombatRange } from './types';

/** Where one enemy stands: which way, and how far. Player is always at 0,0. */
export interface EnemyPosition {
  /** Compass bearing from the player, 0–360, 0 = north, clockwise. */
  bearing: number;
  /** Distance in ring-widths. Ring boundaries fall on the whole numbers. */
  distance: number;
}

/** One ring-width — and the size of one APPROACH / STEP BACK. The owner:
 *  "I should just be able to hit approach until all my weapons are in range."
 *  One tap = one ring when you are head-on, less when you are cutting an
 *  angle, which is the honest geometry rather than a flat promise. */
export const STEP = 1;

/** Rings 1–4 are the fightable bands; ring 5 (distance ≥ 4) is out of it.
 *  RING_BANDS is indexed by ring-1, so ring 1 = close … ring 4 = distant. */
export const OUT_OF_RANGE_RING = 5;
const RING_BANDS: readonly CombatRange[] = ['close', 'mid', 'far', 'distant'];

/** Closest two bodies get: they are toe to toe. Stops a step from carrying the
 *  player THROUGH somebody (which would flip their bearing 180° and read as
 *  "he teleported behind me"), and keeps the bearing meaningful at contact. */
export const CONTACT_MIN = 0.35;

/** Which ring a distance falls in. 1 = nose to nose … 5 = out of the fight. */
export function ringOf(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 1;
  const ring = Math.floor(distance) + 1;
  return Math.min(OUT_OF_RANGE_RING, Math.max(1, ring));
}

/** The band a position sits in, or null when it is out past ring 4. A null
 *  here means NOBODY can act on that enemy and it cannot act on the player —
 *  it is present in the scene and walking in, nothing more. */
export function bandOf(distance: number): CombatRange | null {
  const ring = ringOf(distance);
  return ring >= OUT_OF_RANGE_RING ? null : (RING_BANDS[ring - 1] ?? 'close');
}

/** ⚠ The inverse, for migrating a save that only knows one shared band. Lands
 *  mid-ring so the first step in either direction reads as a clean change
 *  rather than tipping over a boundary it was already sitting on. */
export function distanceForBand(band: CombatRange): number {
  const idx = RANGE_ORDER.indexOf(band); // 0 distant … 3 close
  const ring = 4 - idx; // distant → 4, far → 3, mid → 2, close → 1
  return ring - 0.5;
}

const toXY = (p: EnemyPosition): { x: number; y: number } => ({
  x: p.distance * Math.sin((p.bearing * Math.PI) / 180),
  y: p.distance * Math.cos((p.bearing * Math.PI) / 180),
});

const fromXY = (x: number, y: number): EnemyPosition => {
  const distance = Math.hypot(x, y);
  let bearing = (Math.atan2(x, y) * 180) / Math.PI;
  if (!Number.isFinite(bearing)) bearing = 0;
  return { bearing: ((bearing % 360) + 360) % 360, distance };
};

/**
 * The player takes one step along `bearing`. Everybody's position is
 * recomputed; the player stays the origin.
 *
 * ⚠⚠ THE STEP IS SHORTENED SO YOU CANNOT WALK THROUGH THE MAN YOU ARE WALKING
 * AT. `limitToward` is the enemy being closed on: the step shrinks to whatever
 * it takes to arrive at CONTACT_MIN and no further. Everyone ELSE is then moved
 * by that same shortened step, because it is one step — the player does not
 * travel a different distance for each observer.
 */
export function stepField(
  positions: readonly EnemyPosition[],
  bearing: number,
  opts: { limitToward?: number; step?: number } = {},
): EnemyPosition[] {
  const want = opts.step ?? STEP;
  let step = want;
  const limit = opts.limitToward;
  if (limit !== undefined && positions[limit]) {
    const target = positions[limit]!;
    // Only shorten when we are actually heading at him (within a right angle);
    // a step at 120° off his bearing does not close on him at all.
    const delta = Math.abs(((target.bearing - bearing + 540) % 360) - 180);
    if (delta < 90) {
      const room = Math.max(0, target.distance - CONTACT_MIN);
      step = Math.min(want, room / Math.cos((delta * Math.PI) / 180));
    }
  }
  if (step <= 0) return positions.map((p) => ({ ...p }));
  const dx = step * Math.sin((bearing * Math.PI) / 180);
  const dy = step * Math.cos((bearing * Math.PI) / 180);
  return positions.map((p) => {
    const { x, y } = toXY(p);
    const moved = fromXY(x - dx, y - dy);
    // Never closer than contact — two bodies do not occupy one spot.
    return moved.distance < CONTACT_MIN
      ? { bearing: moved.distance === 0 ? p.bearing : moved.bearing, distance: CONTACT_MIN }
      : moved;
  });
}

/** APPROACH: step toward the enemy the player has up on the pager. */
export function stepToward(positions: readonly EnemyPosition[], idx: number): EnemyPosition[] {
  const target = positions[idx];
  if (!target) return positions.map((p) => ({ ...p }));
  return stepField(positions, target.bearing, { limitToward: idx });
}

/** STEP BACK: straight away from that same enemy — which, when the field is
 *  wrapped around you, closes on whoever is behind. That cost is the point. */
export function stepAwayFrom(positions: readonly EnemyPosition[], idx: number): EnemyPosition[] {
  const target = positions[idx];
  if (!target) return positions.map((p) => ({ ...p }));
  return stepField(positions, (target.bearing + 180) % 360);
}

/** One enemy walks a step straight at the player. Their bearing is unchanged —
 *  they are closing the line between you, not circling. */
export function enemyCloses(pos: EnemyPosition, step = STEP): EnemyPosition {
  return { bearing: pos.bearing, distance: Math.max(CONTACT_MIN, pos.distance - step) };
}

/**
 * Where a fresh lineup starts.
 *
 * ⚠⚠ THE OWNER PICKED BOTH SHAPES, because he described both pictures: *"if
 * I'm fighting multiple people … they're coming at me in a line"* and *"they're
 * a pyramid around me, they're the seven points of the Star of David all around
 * me."* An AMBUSH spread the bearings — they chose the ground and they have you
 * surrounded. A PATROL you walked into clusters in a narrow arc — they were
 * travelling together and you met them head-on.
 *
 * Distances stagger across rings 1–4 either way, so the near man is reachable
 * while the back of the line is not. The stagger is what makes "attack the
 * closest first so I don't walk into anyone else's reach" a real decision.
 */
export function staggerSpawn(
  count: number,
  shape: 'ambush' | 'patrol',
  rng: () => number = Math.random,
): EnemyPosition[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const facing = rng() * 360;
  const out: EnemyPosition[] = [];
  for (let i = 0; i < n; i++) {
    const bearing = shape === 'ambush'
      // Even spread around the whole circle, jittered so a four-man ambush is
      // not a perfect compass rose every single time.
      ? (facing + (360 / n) * i + (rng() - 0.5) * (180 / n)) % 360
      // A 60° arc: everyone in front of you, fanned out the way a group walking
      // abreast down a road would be.
      : (facing + (i - (n - 1) / 2) * (60 / Math.max(1, n)) + (rng() - 0.5) * 8 + 360) % 360;
    // Ring 1 for the leader, walking back through the rings; more than four
    // bodies stack up in the outer rings rather than piling onto the player.
    const ring = Math.min(4, 1 + i);
    const jitter = 0.15 + rng() * 0.7; // sit inside the ring, off its boundary
    out.push({ bearing, distance: Math.max(CONTACT_MIN, ring - 1 + jitter) });
  }
  return out;
}

/** Indices sorted nearest-first — the owner's pager order, so a swipe walks the
 *  line from the man in your face outward. Ties keep their spawn order so the
 *  sort is stable and the cards do not shuffle for no reason. */
export function nearestFirst(positions: readonly EnemyPosition[]): number[] {
  return positions
    .map((p, i) => ({ i, d: p.distance }))
    .sort((a, b) => (a.d - b.d) || (a.i - b.i))
    .map((e) => e.i);
}

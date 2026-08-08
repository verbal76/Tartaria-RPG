// OTA-1166 — ARRIVING SOMEWHERE MEANS FINDING SOMEONE.
//
// Owner: "once you reach that location… it spawns a set number, say three groups within
// five blocks of you in different directions, so that you always have a chance of running
// into them… those three groups are now actively hunting you, so you might get fight after
// fight after fight. that eliminates the wait factor. now it's just how well are you geared
// up. nobody knows that we're prepping you. they still think they found them, or they
// found you."
//
// ⚠ THIS REPLACES A WORKAROUND WITH A FIX, AND THAT IS THE POINT.
// A bounty's real cost was never travel — it was WAITING. `maybePatrolAmbush` will not fire
// twice inside PATROL_MIN_HOURS (6), and it only fires at all if a patrol of the right
// faction happens to be within 2 tiles. So a player could arrive on time, do everything
// right, and simply never meet anybody — especially if rival hordes had already thinned the
// quarry off that ground. OTA-1165 answered that by widening the DEADLINE
// (HOURS_PER_REQUIRED_KILL), which bought time to keep waiting instead of removing the
// wait. Owner, correctly: *"sometimes we spend an hour going back and forth on the best way
// to step around that cardboard box instead of just picking it up and throwing it away."*
//
// ⚠ IT IS INVISIBLE ON PURPOSE. Nothing tells the player these were placed. They roam and
// engage through the ordinary patrol machinery, so what the player experiences is finding
// the quarry — or being found by it — in a place the contract said they'd be thick.

/** How many groups arriving seeds. Owner's number, and his reason: "I'm just saying three
 *  cuz it's the Trinity." Three also happens to be the smallest number that can surround —
 *  one in each of three directions means no single retreat line is clean. */
export const QUARRY_GROUPS = 3;

/** How far out they are placed, in tiles. Far enough that they are not standing on the
 *  player when they land (which would read as a spawn, not a hunt), close enough that a
 *  couple of steps in any direction can find one. `maybePatrolAmbush` engages within 2, so
 *  these have to CLOSE before anything happens — which is what makes it feel like hunting.
 *  ⚠ Owner said "five blocks"; MIN exists because a group placed at distance 1 would engage
 *  on the very next action and read as an ambush waiting at the gate. */
export const QUARRY_RING_MIN = 3;
export const QUARRY_RING_MAX = 5;

export interface SeedCell { gx: number; gy: number; phase: number }

/** Deterministic hash → 0..1. Same shape the patrol wander uses, so seeded groups drift
 *  exactly like every other patrol and cannot be told apart by their movement. */
function h(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Place `count` groups around a centre, ⚠ IN DIFFERENT DIRECTIONS.
 *
 *  The directional spread is the whole design: three groups bunched on one side leaves a
 *  clean escape and a player who walks the wrong way meets nobody — which is the failure
 *  this exists to prevent. Quadrants are assigned round-robin from a rotating start, so
 *  two contracts at the same outpost do not lay the same trap twice.
 *
 *  Pure and deterministic (seeded by `salt`), so a test can assert the spread rather than
 *  hope for it. */
export function quarrySeedCells(
  centreX: number,
  centreY: number,
  count: number,
  salt: number,
): SeedCell[] {
  const out: SeedCell[] = [];
  // Four diagonal-ish quadrants; a group takes one each, rotating with the salt so the
  // same outpost is not ringed identically every time.
  const QUADRANTS: ReadonlyArray<readonly [number, number]> = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const start = Math.floor(h(salt) * QUADRANTS.length);
  for (let i = 0; i < Math.max(0, count); i++) {
    const [sx, sy] = QUADRANTS[(start + i) % QUADRANTS.length]!;
    const r1 = h(salt * 7 + i * 13);
    const r2 = h(salt * 11 + i * 29);
    // Split the radius across the two axes so the group sits off-axis rather than dead
    // north/east of the player — a straight line of sight reads as scripted.
    const span = QUARRY_RING_MAX - QUARRY_RING_MIN;
    const major = QUARRY_RING_MIN + Math.round(r1 * span);
    const minor = Math.round(r2 * major);
    out.push({
      gx: centreX + sx * major,
      gy: centreY + sy * minor,
      phase: Math.floor(h(salt * 3 + i * 101) * 100000),
    });
  }
  return out;
}

/** ⚠ The arrival beat. Owner: "you know something you'd say to your boy — like if you're
 *  looking for somebody and you know he's always at CVS, and you both pull up in the
 *  parking lot: all right man, take a look, he's got to be here somewhere."
 *
 *  It has to say ARRIVED and LOOK, and it must NOT say "three groups have been placed
 *  around you" — the player is meant to believe they found them. */
export function arrivalBeat(targetName: string, locationName: string): string {
  return `"This is the ground," the Arbiter says, low. "${locationName}. If the ${targetName} are anywhere, they're here — and they've had word you were coming. Keep your eyes up and walk it. Something will turn up, and it won't be looking to talk."`;
}

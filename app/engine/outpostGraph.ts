// ⚠⚠ OTA-1279 — THE UNIVERSAL OUTPOST NAVIGATION GRAPH.
//
// The owner supplied the Revivalist Camp map art plus a written specification,
// and the specification's first line is the whole point of this file:
//
//     "The artwork does not determine movement. The room graph does."
//
// Every faction outpost is ONE topology wearing nine different sets of clothes.
// A room is a node; an exit is an explicit edge to another node. The generic
// structural id (R01…R15) is the room's identity for navigation; the faction
// name is only what the player reads. R01 is the Central Courtyard whether it
// says "The Rally Hall" (Revivalists), "The Operations Room" (Architects) or
// "The Memorial Hall" (True Tartarians) on screen.
//
// ⚠⚠ WHY THIS FILE EXISTS AT ALL — the audit that preceded it. Before OTA-1279
// the topology lived hand-typed in static_hub.json, one `exits` block per room,
// each direction written out by hand. It had rotted badly and silently:
//
//   · 10 of the exits did not come back the way they went out. You could walk
//     Gate → east → Armory, and walking west from the Armory put you in the
//     Square. The owner's words: *"there is no rhyme or reason to these rooms
//     and I'm getting lost in them."* He was not lost. The map was.
//   · 2 rooms — the Chapel and the Culvert Descent — had NOTHING pointing at
//     them. Both were authored, skinned in all eight faction variant sets, and
//     physically unreachable from the entry room. 8 of 10 rooms reachable.
//
// That is the project's oldest failure mode in its purest form: a rule (this
// edge exists) written down twice (once in each room) and free to disagree.
// So the reverse direction is no longer written down at all. Each connection is
// declared ONCE below, and the return edge is GENERATED. Asymmetry is not
// forbidden here — it is unrepresentable.
//
// The spec asked for exactly this: *"Do not assume that the engine
// automatically creates the reverse connection. Explicitly define or
// programmatically create both directions."*

export type StructuralId =
  | 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08'
  | 'R09' | 'R10' | 'R11' | 'R12' | 'R13' | 'R14' | 'R15';

export type Direction = 'north' | 'south' | 'east' | 'west';

export const DIRECTIONS: readonly Direction[] = ['north', 'south', 'east', 'west'];

export const STRUCTURAL_IDS: readonly StructuralId[] = [
  'R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08',
  'R09', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15',
];

/** Structural names. These are NOT lore — no player ever sees them. They exist
 *  so a human reading a bug report can tell which node is meant without holding
 *  nine faction name-sets in their head. */
export const STRUCTURAL_NAMES: Readonly<Record<StructuralId, string>> = {
  R01: 'Central Courtyard',
  R02: 'North Hub',
  R03: 'Northwest Room',
  R04: 'Northeast Room',
  R05: 'West Inner Room',
  R06: 'East Inner Room',
  R07: 'West Outer Room',
  R08: 'Southwest Outer Room',
  R09: 'Southeast Outer Room',
  R10: 'South Gate',
  R11: 'Upper Landing',
  R12: 'Lower Landing',
  R13: 'Lower West Room',
  R14: 'Lower East Room',
  R15: 'South Terminus',
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
};

// ⚠⚠ THE ONLY PLACE THE TOPOLOGY IS WRITTEN DOWN. 14 connections, 15 nodes —
// a tree, so there is exactly one route between any two rooms and every branch
// must be backtracked. That is deliberate: the owner asked for a room-based
// dungeon map, not a fast-travel menu.
//
//                     R03
//                      |
//              R02 ---------- R04           (north complex)
//                      |
//                     R01                   (central courtyard)
//                  /   |   \
//               R05    |    R06
//              /   \   |      \
//           R07    R08 |       R09
//                      |
//                     R10                   (south gate / threshold)
//                      |
//                     R11                   (upper landing)
//                      |
//                     R12                   (lower landing)
//                   /  |  \
//                R13  R15  R14              (buried level)
//
// Read each row as "from, heading, to". The return trip is generated.
const CONNECTIONS: ReadonlyArray<readonly [StructuralId, Direction, StructuralId]> = [
  ['R01', 'north', 'R02'],
  ['R01', 'west',  'R05'],
  ['R01', 'east',  'R06'],
  ['R01', 'south', 'R10'],
  ['R02', 'west',  'R03'],
  ['R02', 'east',  'R04'],
  ['R05', 'west',  'R07'],
  ['R05', 'south', 'R08'],
  ['R06', 'south', 'R09'],
  ['R10', 'south', 'R11'],
  ['R11', 'south', 'R12'],
  ['R12', 'west',  'R13'],
  ['R12', 'east',  'R14'],
  ['R12', 'south', 'R15'],
];

export type ExitMap = Record<Direction, StructuralId | null>;

function buildExits(): Record<StructuralId, ExitMap> {
  const out = {} as Record<StructuralId, ExitMap>;
  for (const id of STRUCTURAL_IDS) {
    out[id] = { north: null, south: null, east: null, west: null };
  }
  for (const [from, dir, to] of CONNECTIONS) {
    // Declared direction...
    out[from][dir] = to;
    // ...and the return, generated. Never hand-typed, so never wrong.
    out[to][OPPOSITE[dir]] = from;
  }
  return out;
}

/** The authoritative exit table. `OUTPOST_EXITS.R05.west === 'R07'`. */
export const OUTPOST_EXITS: Readonly<Record<StructuralId, Readonly<ExitMap>>> = buildExits();

/** Neighbours of a node, in fixed direction order. */
export function outpostNeighbors(id: StructuralId): StructuralId[] {
  const exits = OUTPOST_EXITS[id];
  return DIRECTIONS.map((d) => exits[d]).filter((x): x is StructuralId => x !== null);
}

/** True when `to` can be entered from `from` in ONE step. The core rule: this
 *  is the only question movement is allowed to ask. */
export function outpostAdjacent(from: StructuralId, to: StructuralId): boolean {
  return outpostNeighbors(from).includes(to);
}

/** Terminal branches — exactly one structural neighbour. Entering one means
 *  backtracking to leave it, and the spec is explicit that this is intentional. */
export const OUTPOST_DEAD_ENDS: readonly StructuralId[] =
  STRUCTURAL_IDS.filter((id) => outpostNeighbors(id).length === 1);

/** Distribution rooms — three or more neighbours. R01, R02, R05, R12. */
export const OUTPOST_HUBS: readonly StructuralId[] =
  STRUCTURAL_IDS.filter((id) => outpostNeighbors(id).length >= 3);

/** ⚠⚠ A HINT, NOT A MOVE. Returns the first node on the shortest route from
 *  `from` to `to`, or null if they are the same node.
 *
 *  This exists so a player who names a room three corridors away is told which
 *  door to take rather than being silently refused — the owner got lost in an
 *  outpost for a whole session and the fix for that is directions, not
 *  teleportation. The caller may print it. The caller may NOT walk it: the spec
 *  says *"Do NOT automatically calculate a path and teleport the player through
 *  intermediate rooms"*, and one edge per command is the whole rule. */
export function outpostFirstStep(from: StructuralId, to: StructuralId): StructuralId | null {
  if (from === to) return null;
  const cameFrom = new Map<StructuralId, StructuralId>();
  const seen = new Set<StructuralId>([from]);
  const queue: StructuralId[] = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const next of outpostNeighbors(at)) {
      if (seen.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, at);
      queue.push(next);
    }
  }
  if (!seen.has(to)) return null;
  let step: StructuralId = to;
  while (cameFrom.get(step) !== from) {
    const prev = cameFrom.get(step);
    if (!prev) return null;
    step = prev;
  }
  return step;
}

/** Every node reachable from `from`. Used by the layout self-check; a healthy
 *  outpost returns all 15. */
export function outpostReachableFrom(from: StructuralId): Set<StructuralId> {
  const seen = new Set<StructuralId>([from]);
  const queue: StructuralId[] = [from];
  while (queue.length) {
    for (const next of outpostNeighbors(queue.shift()!)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

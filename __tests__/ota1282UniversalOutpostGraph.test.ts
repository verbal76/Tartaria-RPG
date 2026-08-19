// ⚠⚠ OTA-1282 — PORT OF GOLEM OTA-1279/1281: THE OWNER'S MAP, ENFORCED AS A GRAPH.
//
// Owner's porting order, verbatim: "the gift and map fix should port to hal."
//
// He uploaded the Revivalist Camp artwork and a written navigation spec. The
// spec's governing sentence:
//
//     "The artwork does not determine movement. The room graph does."
//
// And the complaint underneath it, typed into the game mid-session:
//
//     "there is no rhyme or reason to these rooms and I'm getting lost in
//      them... the maps for each individual Outpost already have rooms
//      assigned and there's a central hub structure where there's a central
//      room that's where the ex[it] should be"
//
// ⚠⚠ HE WAS RIGHT AND IT WAS MEASURABLE. The audit of the shipped layout:
//   · 10 of the exits did not come back the way they went out. Gate → east →
//     Armory; Armory → west → the SQUARE. Ten pairs like that.
//   · 2 rooms — the Chapel and the Culvert Descent — had nothing pointing at
//     them at all. Fully authored, skinned in all eight faction variant files,
//     and unreachable. 8 of 10 outpost rooms could be walked to.
// He was not lost. The map was.
//
// ⚠⚠ AND I TOLD HIM I DIDN'T HAVE THE MAPS. That was false — static_hub.json
// has been in this repo for months and I had been reading it the same session.
// The correction is recorded here because the next person to doubt whether the
// map exists should find the answer in the test file that enforces it.
//
// The repair is structural, not a patch: connections are declared ONCE in
// outpostGraph.ts and the return edge is GENERATED, so an asymmetric exit is no
// longer a bug that can be introduced — it is a shape the data cannot take.
import {
  OUTPOST_EXITS,
  OUTPOST_DEAD_ENDS,
  OUTPOST_HUBS,
  STRUCTURAL_IDS,
  STRUCTURAL_NAMES,
  DIRECTIONS,
  outpostAdjacent,
  outpostFirstStep,
  outpostNeighbors,
  outpostReachableFrom,
  type StructuralId,
} from '../app/engine/outpostGraph';
import {
  HUB,
  findHubRoom,
  hubEntryRoomId,
  hubRoomAtNode,
  hubRoomFor,
  hubFirstStepToward,
  resolveHubTravel,
  roomIsExit,
} from '../app/engine/hub';
import { readFileSync } from 'fs';
import { join } from 'path';

const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;

/** Full route, computed one legal step at a time — exactly how the player has
 *  to walk it. If the graph were broken this would not terminate cleanly. */
const route = (from: StructuralId, to: StructuralId): StructuralId[] => {
  const path: StructuralId[] = [from];
  let at = from;
  for (let guard = 0; at !== to && guard < 32; guard++) {
    const step = outpostFirstStep(at, to);
    if (!step) break;
    path.push(step);
    at = step;
  }
  return path;
};

describe('OTA-1282 — the universal graph itself', () => {
  it('⚠⚠ EVERY connection comes back the way it went — the ten one-way doors are gone', () => {
    const oneWay: string[] = [];
    for (const id of STRUCTURAL_IDS) {
      for (const dir of DIRECTIONS) {
        const to = OUTPOST_EXITS[id][dir];
        if (!to) continue;
        if (OUTPOST_EXITS[to][OPPOSITE[dir]] !== id) {
          oneWay.push(`${id} --${dir}--> ${to}, but ${to} --${OPPOSITE[dir]}--> ${OUTPOST_EXITS[to][OPPOSITE[dir]]}`);
        }
      }
    }
    expect(oneWay).toEqual([]);
  });

  it('⚠⚠ every room can be walked to from the entry — the Chapel was not', () => {
    const entry = findHubRoom(hubEntryRoomId())!;
    const reached = outpostReachableFrom(entry.structuralId);
    expect(Array.from(reached).sort()).toEqual([...STRUCTURAL_IDS].sort());
    // Named, because these two are the ones that were stranded.
    expect(reached.has('R08')).toBe(true);   // Chapel / The Cell Sanctum
    expect(reached.has('R09')).toBe(true);   // Cellar / The Storage Descent
  });

  it('⚠ 15 nodes, 14 connections — a tree, so exactly one route between any two rooms', () => {
    const edges = STRUCTURAL_IDS.reduce((n, id) => n + outpostNeighbors(id).length, 0) / 2;
    expect(STRUCTURAL_IDS.length).toBe(15);
    expect(edges).toBe(14);
  });

  it("⚠⚠ dead ends are dead ends — the spec's eight, exactly", () => {
    // Owner's spec: "Dead ends must behave as dead ends. Branches must require
    // backtracking. This backtracking is intentional."
    expect([...OUTPOST_DEAD_ENDS].sort()).toEqual(['R03', 'R04', 'R07', 'R08', 'R09', 'R13', 'R14', 'R15']);
    for (const id of OUTPOST_DEAD_ENDS) expect(outpostNeighbors(id)).toHaveLength(1);
  });

  it('⚠ the four distribution hubs are the four the spec names', () => {
    expect([...OUTPOST_HUBS].sort()).toEqual(['R01', 'R02', 'R05', 'R12']);
  });

  it("⚠⚠ the canonical adjacency list, verbatim from the owner's spec", () => {
    // Transcribed from his document, not from the implementation. If the two
    // ever disagree, his wins and this test is how you find out.
    const CANON: Record<string, string[]> = {
      R01: ['R02', 'R05', 'R06', 'R10'],
      R02: ['R01', 'R03', 'R04'],
      R03: ['R02'],
      R04: ['R02'],
      R05: ['R01', 'R07', 'R08'],
      R06: ['R01', 'R09'],
      R07: ['R05'],
      R08: ['R05'],
      R09: ['R06'],
      R10: ['R01', 'R11'],
      R11: ['R10', 'R12'],
      R12: ['R11', 'R13', 'R14', 'R15'],
      R13: ['R12'],
      R14: ['R12'],
      R15: ['R12'],
    };
    for (const id of STRUCTURAL_IDS) {
      expect({ id, adj: outpostNeighbors(id).slice().sort() }).toEqual({ id, adj: CANON[id] });
    }
  });
});

describe("OTA-1279 — the spec's own worked examples", () => {
  it('⚠⚠ EXAMPLE 1: Shallow Digs to the Evidence Room is a six-step walk', () => {
    // R15 -> R12 -> R11 -> R10 -> R01 -> R02 -> R03
    expect(route('R15', 'R03')).toEqual(['R15', 'R12', 'R11', 'R10', 'R01', 'R02', 'R03']);
    // "The engine MUST NOT permit THE SHALLOW DIGS -> THE EVIDENCE ROOM."
    expect(outpostAdjacent('R15', 'R03')).toBe(false);
  });

  it('⚠⚠ EXAMPLE 2: Crash Room to Storage Descent goes back through the middle', () => {
    expect(route('R07', 'R09')).toEqual(['R07', 'R05', 'R01', 'R06', 'R09']);
  });

  it('⚠⚠ EXAMPLE 3: the two lower branches do NOT touch each other', () => {
    expect(route('R13', 'R14')).toEqual(['R13', 'R12', 'R14']);
    expect(outpostAdjacent('R13', 'R14')).toBe(false);
  });

  it('⚠ the landings stay real rooms — never collapsed into one hop', () => {
    // Spec: "Do NOT collapse them into a single connection... They preserve the
    // intended physical depth of the outpost."
    expect(route('R01', 'R12')).toEqual(['R01', 'R10', 'R11', 'R12']);
  });
});

describe('OTA-1282 — the layout wears the graph', () => {
  it('⚠⚠ every room claims one node, and all fifteen are claimed exactly once', () => {
    const claimed = HUB.rooms.map((r) => r.structuralId);
    expect(claimed.slice().sort()).toEqual([...STRUCTURAL_IDS].sort());
    for (const node of STRUCTURAL_IDS) expect(hubRoomAtNode(node)).not.toBeNull();
  });

  it('⚠⚠ room exits are DERIVED — static_hub.json no longer hand-types a single one', () => {
    // This is the whole repair. Hand-typed exits are what rotted; the file now
    // carries structural ids and the engine composes the doors.
    const raw = readFileSync(join(__dirname, '..', 'app', 'data', 'world', 'static_hub.json'), 'utf8');
    expect(raw).not.toContain('"exits"');
    expect(raw).toContain('"structuralId"');
    // ...and the composed table agrees with the canon for every room.
    for (const room of HUB.rooms) {
      for (const dir of DIRECTIONS) {
        const node = OUTPOST_EXITS[room.structuralId][dir];
        expect({ room: room.id, dir, to: room.exits[dir] })
          .toEqual({ room: room.id, dir, to: node ? hubRoomAtNode(node)!.id : null });
      }
    }
  });

  it("⚠⚠ THE OWNER'S CROSSWALK: the Revivalist artwork maps 1:1 onto the nodes", () => {
    // Read straight off the map image he supplied. Every one of these already
    // matched the room it was skinning — the NAMES were right the whole time;
    // only the connections between them had rotted.
    const CROSSWALK: Array<[StructuralId, string, string]> = [
      ['R01', 'outpost_central',         'The Rally Hall'],
      ['R02', 'outpost_relic_vault',     'The Field Vault'],
      ['R03', 'outpost_lab',             'The Evidence Room'],
      ['R04', 'outpost_workshop',        'The Field Shop'],
      ['R05', 'outpost_messhall',        'The Cell Mess'],
      ['R06', 'outpost_armory',          'The Cell Cache'],
      ['R08', 'outpost_chapel',          'The Cell Sanctum'],
      ['R09', 'outpost_culvert_descent', 'The Storage Descent'],
      ['R10', 'outpost_gate',            'The Stand-Down'],
      ['R11', 'buried_landing_one',      'First Landing'],
      ['R12', 'buried_landing_two',      'Second Landing'],
      ['R13', 'buried_pumps',            'The Pump Room'],
      ['R14', 'buried_storage',          'Storage Halls'],
      ['R15', 'buried_shallow_digs',     'The Shallow Digs'],
    ];
    for (const [node, roomId, revivalistName] of CROSSWALK) {
      expect({ node, id: hubRoomAtNode(node)?.id }).toEqual({ node, id: roomId });
      expect({ roomId, name: hubRoomFor(roomId, 'tartarian_revivalists')?.name })
        .toEqual({ roomId, name: revivalistName });
    }
    // ⚠ R07 — the ONE art/game divergence, ported WITH the map: the image says
    // THE CRASH ROOM; the game says "The Cell Bunks" (golem OTA-1274, parser
    // collision on the chip `crash`). ⚠⚠ OWNER RULED: "keep the rename, 99% of
    // players won't even recognize it." The rename set rode along in this port
    // because HAL still shipped the DUPLICATE chips the same audit fixed —
    // stone_builders labeled two rooms "Plans", which made typed navigation
    // ambiguous the moment fast-travel's teleport stopped hiding it.
    expect(hubRoomAtNode('R07')?.id).toBe('outpost_quarters');
    expect(hubRoomFor('outpost_quarters', 'tartarian_revivalists')?.name).toBe('The Cell Bunks');
  });

  it('⚠ the structural names are debug scaffolding, never player-facing', () => {
    const shown = HUB.rooms.map((r) => r.name.toLowerCase());
    for (const generic of Object.values(STRUCTURAL_NAMES)) {
      expect(shown).not.toContain(generic.toLowerCase());
    }
  });
});

describe('OTA-1282 — one edge at a time, and directions when you ask for more', () => {
  const gate = 'outpost_gate';        // R10, where the player enters

  it('⚠ an adjacent room by name still just walks', () => {
    const r = resolveHubTravel(gate, 'go to the square');
    expect(r).toEqual({ roomId: 'outpost_central', via: 'adjacent' });
  });

  it('⚠ cardinals still walk', () => {
    expect(resolveHubTravel(gate, 'go north')).toEqual({ roomId: 'outpost_central', via: 'cardinal' });
  });

  it('⚠⚠ THE TELEPORT IS GONE: a far room is refused, not jumped to', () => {
    // Pre-OTA-1279 this returned via:'fast_travel' and moved the player across
    // the outpost in one command as long as they had been there once.
    const r = resolveHubTravel(gate, 'go to the workshop');
    expect(r?.via).toBe('not_adjacent');
    expect(r?.roomId).toBe('outpost_workshop');
  });

  it('⚠⚠ ...and the refusal names the door that heads that way', () => {
    // Being told "no" with no direction is what had him cycling fifteen names.
    const r = resolveHubTravel(gate, 'go to the workshop');
    expect(r && 'firstStep' in r ? r.firstStep : null).toBe('outpost_central');
    // From the Square, the next step toward the Workshop is the Vault block.
    expect(hubFirstStepToward('outpost_central', 'outpost_workshop')).toBe('outpost_relic_vault');
    // And from the Vault block it IS adjacent — the walk really is three steps.
    expect(resolveHubTravel('outpost_relic_vault', 'go to the workshop')?.via).toBe('adjacent');
  });

  it('⚠ naming the room you are standing in is not travel', () => {
    expect(resolveHubTravel(gate, 'go to the gate')).toBeNull();
    expect(hubFirstStepToward(gate, gate)).toBeNull();
  });

  it('⚠⚠ the store REFUSES rather than falling through to overland travel', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const i = store.indexOf("interiorMove.via === 'not_adjacent'");
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 1200);
    expect(block).toContain("isn't off this one. Head ${dir} to the ${step.shortName}");
    // The branch must end the command. If it fell through, 'go to the workshop'
    // would leave the outpost looking for a location called workshop.
    expect(block).toContain('break;');
    // ...and it must NOT move the player.
    expect(block.slice(0, block.indexOf('break;'))).not.toContain('hubRoomId: interiorMove.roomId');
  });
});

describe('OTA-1282 — every edge of every skin, exhaustively (golem OTA-1281 layer)', () => {
  const FACTIONS = [
    'reclaimers_guild', 'forgotten_order', 'mud_monarchs', 'true_tartarians',
    'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants',
    'stone_builders', 'tartarian_revivalists',
  ] as const;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const VARIANTS = (require('../app/data/world/hub_faction_variants.json') as {
    factions: Record<string, Record<string, { shortName: string }>>;
  }).factions;
  const OPP = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
  const short = (roomId: string, skin: string): string =>
    VARIANTS[skin]?.[roomId]?.shortName ?? findHubRoom(roomId)!.shortName;

  for (const faction of FACTIONS) {
    const skin = VARIANTS[faction] ? faction : null;   // reclaimers = base names
    it(`⚠⚠ ${faction}: 28 edges by cardinal, 28 by screen name, all dead cardinals refuse`, () => {
      for (const room of HUB.rooms) {
        for (const dir of DIRECTIONS) {
          const to = room.exits[dir];
          if (to) {
            expect({ room: room.id, dir, got: resolveHubTravel(room.id, `go ${dir}`, skin) })
              .toEqual({ room: room.id, dir, got: { roomId: to, via: 'cardinal' } });
            const name = short(to, faction).toLowerCase();
            expect({ room: room.id, typed: name, got: resolveHubTravel(room.id, `go to the ${name}`, skin) })
              .toEqual({ room: room.id, typed: name, got: { roomId: to, via: 'adjacent' } });
            expect({ from: to, got: resolveHubTravel(to, `go ${OPP[dir]}`, skin)?.roomId })
              .toEqual({ from: to, got: room.id });
          } else {
            expect({ room: room.id, dir, via: resolveHubTravel(room.id, `go ${dir}`, skin)?.via })
              .toEqual({ room: room.id, dir, via: 'no_exit_that_way' });
          }
        }
      }
    });
  }

  it("⚠⚠ LONGEST NAME WINS: Order's `cells` walks to the QUARTERS, not the Chapel", () => {
    // The collision golem's crawl found (OTA-1281), ported with the fix: the
    // Order skin ships a prefix pair — Quarters "Cells", Chapel "Cell" — and
    // first-substring-in-direction-order walked `cells` into the Chapel.
    expect(resolveHubTravel('outpost_messhall', 'go to the cells', 'forgotten_order'))
      .toEqual({ roomId: 'outpost_quarters', via: 'adjacent' });
    expect(resolveHubTravel('outpost_messhall', 'go to the cell', 'forgotten_order'))
      .toEqual({ roomId: 'outpost_chapel', via: 'adjacent' });
  });
});

describe('OTA-1282 — there is always a way out, and it is on the spine', () => {
  it('⚠⚠ at least one room has a door out — the invariant OTA-1271 pinned', () => {
    expect(HUB.rooms.filter((r) => roomIsExit(r)).length).toBeGreaterThanOrEqual(1);
  });

  it("⚠⚠ THE OWNER'S RULING: the central room carries an exit", () => {
    // *"there's a central hub structure where there's a central room that's
    // where the ex[it] should be."* OTA-1271 had put the spare door on the
    // Workshop, which under the corrected graph is R04 — a dead end in the far
    // north corner, the worst room in the outpost to hide the way out in.
    expect(roomIsExit(hubRoomAtNode('R01'))).toBe(true);
    expect(roomIsExit(hubRoomAtNode('R04'))).toBe(false);
  });

  it('⚠ the gate keeps its threshold role, one step off the middle', () => {
    expect(roomIsExit(hubRoomAtNode('R10'))).toBe(true);
    expect(outpostAdjacent('R01', 'R10')).toBe(true);
    expect(findHubRoom(hubEntryRoomId())!.structuralId).toBe('R10');
  });

  it('⚠ no room is more than four steps from a door out', () => {
    const doors = HUB.rooms.filter((r) => roomIsExit(r)).map((r) => r.structuralId);
    for (const id of STRUCTURAL_IDS) {
      const best = Math.min(...doors.map((d) => route(id, d).length - 1));
      expect({ id, best }).toEqual({ id, best: expect.any(Number) });
      expect({ id, tooFar: best > 4 }).toEqual({ id, tooFar: false });
    }
  });
});

/**
 * OTA-1451 — THE MAP BRACKETS THE NAME, THE LIT BUTTON TELLS THE TRUTH, AND A
 * SIGNATURE IS NOT A FRIENDSHIP.
 *
 * Three reports from one device log, in the owner's words:
 *
 *   1. *"when you are looking at the mini-map or the Atlas map it should show
 *      the you are here above the name, and the ✓ below it, that way you never
 *      have to guess."*
 *   2. *"sometimes when I go through a room investigate still stays lit and when
 *      I tap it again it's empty, and when I leave it it clears then."*
 *   3. *"look at all the vendor conversations I had in this log, it seems too
 *      easy to get to the later tiers of topics."*
 *
 * ⚠⚠ ALL THREE ARE THE SAME KIND OF DEFECT — the game holding a fact and
 * presenting its opposite. A ✓ printed across the room name it endorses; a
 * button lit over a menu with nothing in it; a shopkeeper who met you eighteen
 * seconds ago talking about their people.
 *
 * ⚠⚠ AND THE SECOND ONE IS A DEPENDENCY ARRAY. OTA-164 put `hubRoomId` into the
 * room key and did not put it into the two memo dep lists that BUILD that key.
 * Everywhere in the world that hole is invisible, because changing rooms out
 * there also changes locationId or mapX/mapY. Inside an outpost, walking to the
 * next room moves hubRoomId AND NOTHING ELSE ON THAT LIST — so the consumed-noun
 * set stayed on the room you left. That is why it "clears when I leave": leaving
 * finally moves one of the other five.
 */
import {
  npcRegard, MEETINGS_FOR_NAME, TC_FOR_FAMILIAR, TC_FOR_TRUSTED,
} from '../app/engine/npcMemory';
import type { NpcRelation } from '../app/engine/types';
import {
  INTERIOR_MARKER_LIFT_FRAC, INTERIOR_VISITED_DROP_FRAC, OUTPOST_ROOM_MARKS,
} from '../app/engine/outpostRoomMarks';
import { hubExitRooms, roomIsExit, HUB } from '../app/engine/hub';
import { blockAt, between } from '../test-utils/srcBlock';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const MAP = read('app', 'screens', 'MapScreen.tsx');
const MINI = read('app', 'components', 'MiniMap.tsx');
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');
const TOPICS = require('../app/data/npcs/dialogue_topics.json').npcs as Record<
  string, { topics: { id: string; gate?: { minRegard?: string; onlyRegard?: string } }[] }
>;

/** The dependency array of the useMemo that starts at `anchor` — the text
 *  between its closing `}, [` and the `]);` that ends the call. Bounded by
 *  found positions, never a fixed window, so it cannot silently read the next
 *  hook's list if this one moves. */
const depsOf = (src: string, anchor: string): string => {
  const start = src.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);
  const open = src.indexOf('}, [', start);
  const close = src.indexOf(']);', open);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return src.slice(open, close);
};

/** A relation with nothing in it but the meeting count. */
const rel = (over: Partial<NpcRelation> = {}): NpcRelation => ({
  id: 'x', name: 'X', role: null, factionId: null,
  meetings: 1, trades: 0, tcTraded: 0,
  contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
  lastSeenAt: 0, lastSeenHours: 0,
  ...over,
} as NpcRelation);

describe('OTA-1451 — the marker and the ✓ bracket the name', () => {
  it('⚠⚠ they pull APART: one rises, one drops, and neither is zero', () => {
    // The whole ask in one assertion. If a later edit collapses them onto the
    // same offset the glyphs stack; if either goes to zero it lands on the text.
    expect(INTERIOR_MARKER_LIFT_FRAC).toBeGreaterThan(0);
    expect(INTERIOR_VISITED_DROP_FRAC).toBeGreaterThan(0);
    expect(INTERIOR_VISITED_DROP_FRAC).not.toBe(INTERIOR_MARKER_LIFT_FRAC);
  });

  it('⚠⚠ ONE engine constant for the drop, and BOTH maps read it', () => {
    // OTA-1450 was the mini-map's turn to be forgotten when the Atlas got the
    // lift. Same trap, one OTA later, so the pin is written before the miss.
    expect(MAP).toContain('INTERIOR_VISITED_DROP_FRAC');
    expect(MINI).toContain('INTERIOR_VISITED_DROP_FRAC');
    expect(MAP).not.toContain('const VISITED_DROP = ');
    expect(MINI).not.toContain('const VISITED_DROP = ');
  });

  it('⚠⚠ the mini-map DRAWS ✓ marks at all — it never used to', () => {
    // Before this OTA the corner map showed the ring and nothing else, so the
    // two maps answered "have I been in there?" differently. The tick is a real
    // rendered glyph fed by the same two visited sets the Atlas reads.
    expect(MINI).toContain('visitedTick');
    expect(MINI).toContain("s.worldMemory?.hubVisited");
    expect(MINI).toContain('s.buildingVisited');
  });

  it('⚠⚠ the room you are IN never wears a ✓ — it wears the marker', () => {
    // The owner set this rule himself in OTA-1355 and the mini-map has to obey
    // it too, or the current room gets both glyphs and reads as two rooms.
    expect(MINI).toContain('.filter((id) => id !== player.hubRoomId)');
    expect(MINI).toContain('.filter((id) => id !== buildingRoomId)');
  });

  it('⚠ the world atlas gets NEITHER offset — it marks silhouettes, not text', () => {
    // Lifting or dropping out there would be a regression dressed as
    // consistency; the overland placement was approved on device.
    const geom = between(MINI, 'const geom = useMemo', '}, [box, view]);');
    expect(geom).toContain('view.interior ?');
    expect(MINI).toContain('interior: false');
    expect(MINI).toContain('visited: []');   // the world branch has no rooms
  });

  it('⚠ the ✓ is drawn BEFORE the marker, so "you are here" wins any overlap', () => {
    const tick = MINI.indexOf('geom.visited.map');
    const ring = MINI.indexOf('styles.markerRing');
    expect(tick).toBeGreaterThan(-1);
    expect(ring).toBeGreaterThan(tick);
  });
});

describe('OTA-1451 — the map says where the door is', () => {
  it('⚠⚠ the door list comes from roomIsExit — the SAME predicate the EXIT chip reads', () => {
    // Owner: *"the exit doesn't feel right where it is, it should be easily
    // noticeable where it is. maybe a little door icon at the bottom?"* The
    // danger in answering that is hard-coding "the gate" into a map: the layout
    // tags TWO rooms, and a painted door the button then refuses to open would
    // be OTA-1271's stranding bug with a picture attached.
    const rooms = hubExitRooms();
    expect(rooms.length).toBeGreaterThan(0);
    for (const r of rooms) expect(roomIsExit(r)).toBe(true);
    // …and it is every such room, not the first one found.
    expect(rooms.length).toBe(HUB.rooms.filter((r) => roomIsExit(r)).length);
  });

  it('⚠⚠ THE GUESS THAT FAILS: the bottom room of the plan is NOT the way out', () => {
    // Why the icon was needed at all. The lowest-painted room is the Shallow
    // Digs — the DEEPEST point, three levels the wrong way — so a player looking
    // for the exit at the bottom of the map walks away from it.
    const bottom = Object.entries(OUTPOST_ROOM_MARKS.reclaimers_guild!)
      .sort((a, b) => b[1].fy - a[1].fy)[0]![0];
    expect(bottom).toBe('R15');
    expect(hubExitRooms().map((r) => r.structuralId)).not.toContain('R15');
  });

  it('⚠⚠ BOTH maps draw it, from that one call', () => {
    expect(MAP).toContain('hubExitRooms()');
    expect(MINI).toContain('hubExitRooms()');
    expect(MAP).toContain('🚪');
    expect(MINI).toContain('🚪');
  });

  it('⚠⚠ a room that is BOTH walked and a way out shows both, never one over the other', () => {
    // The Gate is always both. On the Atlas the two facts share ONE text node;
    // on the mini-map the door is offset sideways off the ✓'s row. Two layers
    // drawn on the same point would have hidden one of them.
    expect(MAP).toContain('walked ? `${walked} 🚪` : \'🚪\'');
    expect(MINI).toContain('+ TICK_W');
  });

  it('⚠ the door does NOT wait for you to have been there', () => {
    // A mark that only appears once you have found the room answers nothing.
    // The Atlas builds ✓ from hubVisited and then adds doors unconditionally.
    const outpost = between(MAP, 'const roomGlyphs = new Map<string, string>();', 'for (const [structuralId, glyph] of roomGlyphs)');
    expect(outpost).toContain('for (const room of hubExitRooms())');
    expect(outpost).not.toContain('hubVisited.includes');
  });

  it('⚠ painted BUILDINGS get no door mark — their exit is their own layout\'s', () => {
    // Marking a shed from the hub's tags would paint the outpost's answer onto
    // a different building. Deliberate omission, pinned so it reads as one.
    const building = between(MAP, 'for (const roomId of buildingVisited ?? [])', 'arb102 — every overlay glyph');
    expect(building).not.toContain('🚪');
  });
});

describe('OTA-1451 — the stale INVESTIGATE light', () => {
  it('⚠⚠ BOTH consumed-noun memos depend on hubRoomId, because both KEY on it', () => {
    // The many-doors rule: these two memos are copies of each other, keyed the
    // same way, and the count subtracts BOTH sets. Fixing one leaves half the
    // stale light standing.
    for (const anchor of [
      '  const productivelyConsumedSet = useMemo(() => {',
      '  const flavorExhaustedSet = useMemo(() => {',
    ]) {
      // it builds the key from hubRoomId…
      expect(blockAt(EXPL, anchor, { mode: 'opener' })).toContain('player.hubRoomId,');
      // …so hubRoomId must also be in the deps that follow the body.
      expect(depsOf(EXPL, anchor)).toContain('player?.hubRoomId,');
    }
  });

  it('⚠⚠ THE REPORTED SHAPE: only hubRoomId moves when you cross an outpost room', () => {
    // Pinned as the REASON the dependency matters, so nobody trims it back as
    // redundant. Every other dep in that list is a WORLD coordinate; an outpost
    // interior holds all of them still while the room changes underneath.
    const list = depsOf(EXPL, '  const productivelyConsumedSet = useMemo(() => {');
    for (const dep of [
      'player?.currentLocationId,', 'player?.mapX,', 'player?.mapY,',
      'currentScene?.microMicroId,', 'player?.hubRoomId,', 'worldMemory.visitedRooms,',
    ]) expect(list).toContain(dep);
  });
});

describe('OTA-1451 — a signature is not a friendship', () => {
  it('⚠⚠ THE REPORTED CASE: accepting on the visit you MET them does not promote', () => {
    // Tarek, 16:09:39 met → 16:09:57 contract accepted → same visit.
    expect(npcRegard(rel({ meetings: 1, contractsTaken: 1 }))).toBe('met');
    expect(npcRegard(rel({ meetings: 1, contractsTaken: 16 }))).toBe('met');  // the burst
  });

  it('⚠⚠ …and COMING BACK does promote — it is a delay, not a wall', () => {
    expect(npcRegard(rel({ meetings: 2, contractsTaken: 1 }))).toBe('known');
  });

  it('⚠⚠ OTA-1050\'s ordering is intact: work still outranks walking past', () => {
    // The rule that put contractsTaken on this rung. At EVERY equal visit count
    // the contract-giver ranks at or above the passer-by — never below, which
    // was the entire complaint OTA-1050 fixed.
    const ORDER = ['stranger', 'met', 'known', 'familiar', 'trusted'];
    for (let m = 1; m <= MEETINGS_FOR_NAME + 1; m++) {
      const giver = ORDER.indexOf(npcRegard(rel({ meetings: m, contractsTaken: 1 })));
      const passer = ORDER.indexOf(npcRegard(rel({ meetings: m })));
      expect(giver).toBeGreaterThanOrEqual(passer);
    }
    // And strictly above at the visit where it matters.
    expect(npcRegard(rel({ meetings: 2, contractsTaken: 1 }))).toBe('known');
    expect(npcRegard(rel({ meetings: 2 }))).toBe('met');
  });

  it('⚠⚠ THE SECOND REPORT: one purchase is a transaction, not a relationship', () => {
    // Owner, on Halem the Trader: *"way too familiar with these guys. way too
    // quick. look at all these conversation options I just opened up with Halem
    // with barely any contact."* A single sale was buying the same rung that
    // three separate visits buy. Coin and contract now go through ONE rule, so
    // neither can be the cheap way in.
    expect(npcRegard(rel({ meetings: 1, trades: 1 }))).toBe('met');
    expect(npcRegard(rel({ meetings: 2, trades: 1 }))).toBe('known');
  });

  it('⚠⚠ every OTHER rung is untouched — only the free ones moved', () => {
    // The rungs that cost something keep costing exactly what they cost. A
    // regression here would be re-tuning the cast's whole depth by accident.
    // ⚠ Three visits still stand ALONE: being around often enough that your face
    // is furniture is its own way to be placed, and it is the slowest of the
    // three. Nothing about it depends on what you spent.
    expect(npcRegard(rel({ meetings: MEETINGS_FOR_NAME }))).toBe('known');
    expect(npcRegard(rel({ trades: 4 }))).toBe('familiar');
    expect(npcRegard(rel({ contractsTurnedIn: 1 }))).toBe('familiar');
    expect(npcRegard(rel({ tcTraded: TC_FOR_FAMILIAR }))).toBe('familiar');
    expect(npcRegard(rel({ contractsTurnedIn: 2 }))).toBe('trusted');
    expect(npcRegard(rel({ tcTraded: TC_FOR_TRUSTED }))).toBe('trusted');
    expect(npcRegard(rel({ meetings: 9, trades: 9, wrongs: 1 }))).toBe('wronged');
    expect(npcRegard(rel({ meetings: 0 }))).toBe('stranger');
  });

  it('⚠ and Tarek, the person actually reported, is a real instance of it', () => {
    const tarek = TOPICS.tarek_tinkerer!;
    expect(tarek.topics.some((t) => t.gate?.minRegard === 'known')).toBe(true);
  });
});

/** How many topics a person will discuss at each rung, cumulatively. */
const ladderOf = (set: { topics: { gate?: { minRegard?: string; onlyRegard?: string } }[] }) => {
  const c: Record<string, number> = { open: 0, known: 0, familiar: 0, trusted: 0 };
  for (const t of set.topics) {
    if (!t.gate) c.open!++;
    else if (t.gate.onlyRegard) continue;              // the wronged repair state
    else if (t.gate.minRegard) c[t.gate.minRegard] = (c[t.gate.minRegard] ?? 0) + 1;
  }
  return {
    met: c.open!,
    known: c.open! + c.known!,
    familiar: c.open! + c.known! + c.familiar!,
    trusted: c.open! + c.known! + c.familiar! + c.trusted!,
  };
};

describe('OTA-1451 — the first rung is a step, not a floodgate', () => {
  const ALL = Object.values(TOPICS);
  const total = (rung: 'met' | 'known' | 'familiar' | 'trusted') =>
    ALL.reduce((n, s) => n + ladderOf(s)[rung], 0);

  it('⚠⚠ THE MEASUREMENT THAT DROVE THE RE-TIER', () => {
    // Owner picked "both, weighted toward moving the content." Before: 42 topics
    // open to a stranger across FORTY-ONE PEOPLE — about one shop-front question
    // each — and then 93 more arriving at once. One purchase roughly tripled a
    // vendor, which is why the first rung read as a floodgate rather than a step.
    //
    // ⚠ NOTHING WAS DELETED — the claim this line exists to hold. Depth was
    // RE-TIERED, not cut: everything reachable before is still reachable, it
    // just arrives in a better order. Stated as a floor, not an equality,
    // because the re-tier was allowed to ADD (OTA-1452 wrote three new counter
    // questions for the quartermasters) and an exact count would read a
    // deliberate addition as a regression.
    expect(total('met')).toBeGreaterThanOrEqual(60);       // was 42
    expect(total('trusted')).toBeGreaterThanOrEqual(301);  // was 301 — never fewer
    // The step INTO `known` is now smaller than the opening tier it follows.
    expect(total('known') - total('met')).toBeLessThan(total('met'));
  });

  it('⚠⚠ every person still has a real step at EVERY rung — no dead rungs', () => {
    // The trap in re-tiering by hand: empty a rung and the ladder has a step
    // that gives the player nothing for the trip they just made.
    for (const [id, set] of Object.entries(TOPICS)) {
      const l = ladderOf(set);
      expect({ id, opens: l.met > 0 }).toEqual({ id, opens: true });
      expect({ id, known: l.known > l.met }).toEqual({ id, known: true });
      expect({ id, familiar: l.familiar > l.known }).toEqual({ id, familiar: true });
      expect({ id, trusted: l.trusted > l.familiar }).toEqual({ id, trusted: true });
    }
  });

  it('⚠⚠ THE TWO PEOPLE REPORTED, by the numbers', () => {
    // Halem was the second report: 2 topics at met, 6 at known — one purchase
    // tripled him. Tarek was the first.
    expect(ladderOf(TOPICS.halem_trader!).met).toBe(3);
    expect(ladderOf(TOPICS.tarek_tinkerer!).met).toBe(2);
    // …and the personal ones the owner named by hand are off the customer rung.
    const gateOf = (person: string, topic: string) =>
      TOPICS[person]!.topics.find((t) => (t as { id: string }).id === topic)?.gate?.minRegard ?? null;
    expect(gateOf('halem_trader', 'halem_beam')).toBe('familiar');
    expect(gateOf('halem_trader', 'halem_post')).toBe(null);   // the shop-front question
  });

  it('⚠⚠ NOTHING THAT HANDS OUT CONTENT WAS OPENED TO STRANGERS', () => {
    // The one real hazard in this pass. A topic can carry `grants` — a whisper
    // chain or a paid lead — and demoting one of those to ungated would hand a
    // stranger content the ladder exists to pace. Elara's `yulka_discs` whisper
    // is the only granting topic at `known`; it stayed there.
    for (const set of ALL) {
      for (const t of set.topics as { gate?: { minRegard?: string }; grants?: unknown }[]) {
        if (t.grants) expect(t.gate?.minRegard).toBeTruthy();
      }
    }
  });
});

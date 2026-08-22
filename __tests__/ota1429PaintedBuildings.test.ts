/**
 * OTA-1428/1429 — PAINTED BUILDINGS: A NAME, A FLOOR PLAN, ARROWS AND ✓.
 *
 * Owner, on the found hall: *"can we keep a list of multiple names for this and
 * just have it randomly pull one as we find it? and use this image for both the
 * mini-map like we do the Outpost and for the atlas. also use the ✓ symbol for
 * visited rooms and directional arrows."* Then, over the next few minutes, the
 * paintings for the flooded house, the shack and the market.
 *
 * ⚠⚠ SO THE MODULE STOPPED BEING ABOUT ONE BUILDING. OTA-1428 shipped this as
 * `musterHall.ts` — a file named after a building because there was only one.
 * A second copy of it would have been the start of the drift this session has
 * already repaired several times over: two tables, two direction maps, two chip
 * builders, and the first bug fixed in only one of them (the "many-doors"
 * mistake). It is one table keyed by building id, and this suite runs EVERY
 * assertion against EVERY entry rather than against a named one — so a fifth
 * painting is an entry, and the suite covers it the moment it lands.
 *
 * ⚠ AND THE HALL NEEDED A NEW NAME BECAUSE THE OLD ONE WAS A COLLISION. The
 * template id is `outpost`, and the faction home base is also an outpost —
 * `buildings.ts` carried the comment *"(NOT the faction home base — a found
 * one)"*, which is the tell that the name had already misled somebody. It misled
 * this session too: asked what the building was, the first answer described the
 * faction hub's rooms and NPCs, none of which are in it. Same species as
 * `preview` (OTA-1418/1419), `empty` (OTA-1119) and `hunger` (OTA-1118).
 */
import {
  BUILDING_MAPS,
  buildingMap,
  buildingNameFor,
  buildingHookLabel,
  buildingDirection,
  buildingArrow,
  buildingChipLabel,
  type Compass,
} from '../app/engine/buildingMaps';
import {
  getBuilding,
  buildingIds,
  buildingExitRooms,
  roomHasExitDoor,
  visibleBuildingRooms,
} from '../app/engine/buildings';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const STORE = read('app', 'state', 'gameStore.ts');
const MINI = read('app', 'components', 'MiniMap.tsx');
const MAP = read('app', 'screens', 'MapScreen.tsx');
const INPUT = read('app', 'components', 'InputBox.tsx');

/** Every painted building, as [id, plan]. Everything below iterates this, so a
 *  new entry is covered without editing a single assertion. */
const PAINTED = Object.entries(BUILDING_MAPS);

/** ⚠ Buildings whose name is FIXED rather than pooled. The market is one place
 *  in the world (force-attached at hidden_market, excluded from the wild pick
 *  pool in buildings.ts), so rolling a name for it would rename a landmark the
 *  player was told about and routed to. Empty pool → the template's own name. */
const FIXED_NAME = new Set(['market']);

const OPPOSITE: Readonly<Record<Compass, Compass>> = {
  N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW',
};

/** Room ids the template actually offers, secret ones included — a secret room
 *  is reachable once revealed, so it needs a mark like any other. */
const roomIds = (id: string) => (getBuilding(id)?.rooms ?? []).map((r) => r.id).sort();

describe('OTA-1429 — the table itself', () => {
  it('⚠⚠ every painted id is a REAL building template', () => {
    // A plan for an id no template has is a map of nowhere: it would never draw,
    // and the missing-mark branches would silently hide the mistake forever.
    for (const [id] of PAINTED) {
      expect({ id, template: !!getBuilding(id) }).toEqual({ id, template: true });
    }
  });

  it('⚠⚠ OTA-1430 — EVERY template is painted; none is left half-mapped', () => {
    // The owner sent all five paintings, so there is no building that shows a
    // plain chip row while its neighbours show arrows. A sixth template landing
    // without art is the case the fallback below exists for.
    for (const id of buildingIds()) {
      expect({ id, named: !!getBuilding(id)?.name }).toEqual({ id, named: true });
      expect({ id, painted: !!buildingMap(id) }).toEqual({ id, painted: true });
    }
    expect(Object.keys(BUILDING_MAPS).sort()).toEqual(buildingIds().sort());
  });

  it('⚠ a template with no painting falls back to plain chips, not to a guess', () => {
    // An arrow needs a plan to point at. Inventing one for a building with no
    // painting would put a direction on screen that nothing on the floor agrees
    // with — worse than no arrow, because a wrong arrow reads as a direction.
    // No live template hits this branch any more, which is exactly why it is
    // pinned: an unexercised path is the one that quietly rots.
    expect(buildingMap('smokehouse')).toBeUndefined();
    expect(buildingArrow('smokehouse', 'a', 'b')).toBe('');
    expect(buildingDirection('smokehouse', 'a', 'b')).toBe('');
    expect(buildingChipLabel('smokehouse', 'a', { id: 'b', shortName: 'B', name: 'B' }, ['a', 'b']))
      .toBe('B ✓');
  });

  it('⚠ an unknown / null / empty id gets undefined, not a crash', () => {
    expect(buildingMap('cistern')).toBeUndefined();
    expect(buildingMap(null)).toBeUndefined();
    expect(buildingMap(undefined)).toBeUndefined();
    expect(buildingMap('')).toBeUndefined();
  });
});

describe('OTA-1429 — the names', () => {
  it('⚠⚠ a pooled building is named from its pool, and DIFFERENT ones differ', () => {
    for (const [id, plan] of PAINTED) {
      if (FIXED_NAME.has(id)) continue;
      const names = new Set(
        Array.from({ length: 60 }, (_, i) => buildingNameFor(id, `loc${i}:${i}:${i * 3}`)),
      );
      expect({ id, spread: names.size > 4 }).toEqual({ id, spread: true });
      for (const n of names) {
        expect({ id, n, inPool: plan.names.includes(n!) }).toEqual({ id, n, inPool: true });
      }
    }
  });

  it('⚠⚠ …but ONE building keeps its name — walk out, walk back, same place', () => {
    // A fresh roll per entry would rename the building on the same tile, which
    // reads as a different building. Hashed from the tile instead: random across
    // the world, fixed for any one place, and nothing has to be stored.
    for (const [id] of PAINTED) {
      for (const key of ['asgardar:3:7', 'samarran:1:2', 'iskan:9:9']) {
        expect(buildingNameFor(id, key)).toBe(buildingNameFor(id, key));
      }
    }
  });

  it('⚠⚠ the market keeps its ONE name — a landmark is not renamed', () => {
    // It is force-attached at hidden_market and excluded from the wild pool, so
    // it is a single place the player has been told about. An empty pool falls
    // through to the template's own name, which is the pre-OTA-1428 behaviour.
    expect(BUILDING_MAPS.market!.names).toEqual([]);
    expect(buildingNameFor('market', 'hidden_market:47:15')).toBeUndefined();
    expect(STORE).toContain(
      "return buildingNameFor(buildingId, tileKey) ?? getBuilding(buildingId)?.name ?? 'a structure';",
    );
  });

  it('⚠ no pooled name promises a room the building does not have', () => {
    // The floor plan is fixed and the art is one painting. A "Drowned Chapel"
    // would promise a chapel the player never finds — OTA-1402's defect (the
    // game saying a thing it cannot do) applied to signage.
    const PROMISES = /chapel|shrine|forge|stable|library|tower|mine|dungeon|crypt/i;
    for (const [id, plan] of PAINTED) {
      for (const n of plan.names) {
        expect({ id, n, promises: PROMISES.test(n) }).toEqual({ id, n, promises: false });
      }
    }
  });

  it('⚠ a pool is deep enough to feel random, and has no duplicates', () => {
    for (const [id, plan] of PAINTED) {
      if (FIXED_NAME.has(id)) continue;
      expect({ id, deep: plan.names.length >= 10 }).toEqual({ id, deep: true });
      expect({ id, unique: new Set(plan.names).size }).toEqual({ id, unique: plan.names.length });
    }
  });

  it('⚠⚠ the article is right, including the vowel and the-prefixed cases', () => {
    expect(buildingHookLabel('Abandoned Muster Hall')).toBe('an abandoned muster hall');
    expect(buildingHookLabel('Ruined Chapter House')).toBe('a ruined chapter house');
    // "The Empty Garrison" must not become "a the empty garrison".
    expect(buildingHookLabel('The Empty Garrison')).toBe('an empty garrison');
    expect(buildingHookLabel('The Quiet Commandery')).toBe('a quiet commandery');
    // …and a name that already opens with "A" must not double it up.
    expect(buildingHookLabel('A Flooded House')).toBe('a flooded house');
  });

  it('⚠⚠ every pooled name in every pool produces a clean hook line', () => {
    for (const [id, plan] of PAINTED) {
      for (const n of plan.names) {
        const l = buildingHookLabel(n);
        expect({ id, n, l, ok: /^an? [a-z]/.test(l) }).toEqual({ id, n, l, ok: true });
        expect({ id, n, l, doubled: l.includes(' the ') }).toEqual({ id, n, l, doubled: false });
      }
    }
  });
});

describe('OTA-1429 — the map marks', () => {
  it('⚠⚠ every room in the template has a mark, and every mark a room', () => {
    // Either half failing is a silent hole: a room with no mark vanishes off the
    // atlas while you are standing in it, and a mark with no room paints a
    // chamber the player can never reach.
    for (const [id, plan] of PAINTED) {
      expect({ id, marks: Object.keys(plan.marks).sort() }).toEqual({ id, marks: roomIds(id) });
    }
  });

  it('⚠ every mark is inside the painting', () => {
    for (const [id, plan] of PAINTED) {
      for (const [room, f] of Object.entries(plan.marks)) {
        const ok = f.fx > 0 && f.fx < 1 && f.fy > 0 && f.fy < 1;
        expect({ id, room, ok }).toEqual({ id, room, ok: true });
      }
    }
  });

  it('⚠ no two rooms share a mark — two marks in one spot is one marker', () => {
    for (const [id, plan] of PAINTED) {
      const keys = Object.values(plan.marks).map((f) => `${f.fx.toFixed(3)},${f.fy.toFixed(3)}`);
      expect({ id, distinct: new Set(keys).size }).toEqual({ id, distinct: keys.length });
    }
  });

  it("⚠⚠ each aspect and width is its OWN painting's, never a shared constant", () => {
    // Reusing one building's aspect letterboxes another against the wrong frame,
    // and reusing one artWidth draws its glyphs at the wrong size — the outpost's
    // 1254 on the hall's 1122 is ~12% oversized.
    const SIZES: Record<string, [number, number]> = {
      outpost: [1122, 1402],
      flooded_house: [1370, 1148],
      shack: [1402, 1122],
      market: [1402, 1122],
      shed: [1402, 1122],
    };
    for (const [id, plan] of PAINTED) {
      const wh = SIZES[id];
      expect({ id, known: !!wh }).toEqual({ id, known: true });
      expect(plan.aspect).toBeCloseTo(wh![0] / wh![1], 5);
      expect({ id, w: plan.artWidth }).toEqual({ id, w: wh![0] });
      expect({ id, art: plan.art !== undefined && plan.art !== null }).toEqual({ id, art: true });
    }
  });

  it('⚠⚠ the marks agree with the painted plans, building by building', () => {
    // Hand-placed against the paintings, so this is the one place a typo in a
    // fraction shows up as something a reader can check against the image.
    const hall = BUILDING_MAPS.outpost!.marks;
    expect(hall.armory!.fx).toBeLessThan(hall.hall!.fx); // armory west
    expect(hall.cellar!.fx).toBeGreaterThan(hall.hall!.fx); // cellar east
    expect(hall.vault!.fy).toBeGreaterThan(hall.hall!.fy); // vault south
    expect(Math.abs(hall.hall!.fx - hall.vault!.fx)).toBeLessThan(0.02); // shared spine

    const house = BUILDING_MAPS.flooded_house!.marks;
    expect(house.attic!.fy).toBeLessThan(house.bedroom!.fy); // attic above
    expect(house.bedroom!.fx).toBeLessThan(house.study!.fx); // bedroom west of study
    expect(house.kitchen!.fy).toBeGreaterThan(house.study!.fy); // kitchen below

    // ⚠ The shack is NOT a cross like the other two: the den takes the whole west
    // side and the bedroom/storage stack down the east, which is why den→bedroom
    // is NE and den→storage SE where a naive left/right read calls both E.
    const shack = BUILDING_MAPS.shack!.marks;
    expect(shack.den!.fx).toBeLessThan(shack.bedroom!.fx);
    expect(shack.den!.fx).toBeLessThan(shack.storage!.fx);
    expect(shack.bedroom!.fy).toBeLessThan(shack.storage!.fy);
    expect(Math.abs(shack.bedroom!.fx - shack.storage!.fx)).toBeLessThan(0.02); // stacked

    // The market is four corners around a middle — the only plan where every
    // room is diagonal from the room you arrive in.
    const mk = BUILDING_MAPS.market!.marks;
    expect(mk.weapons_stall!.fx).toBeLessThan(mk.market_square!.fx);
    expect(mk.weapons_stall!.fy).toBeLessThan(mk.market_square!.fy);
    expect(mk.armor_stall!.fx).toBeGreaterThan(mk.market_square!.fx);
    expect(mk.armor_stall!.fy).toBeLessThan(mk.market_square!.fy);
    expect(mk.food_stall!.fx).toBeLessThan(mk.market_square!.fx);
    expect(mk.food_stall!.fy).toBeGreaterThan(mk.market_square!.fy);
    expect(mk.materials_stall!.fx).toBeGreaterThan(mk.market_square!.fx);
    expect(mk.materials_stall!.fy).toBeGreaterThan(mk.market_square!.fy);

    // The shed: work room west, bedroom and storage stacked east, and the
    // cellar's mark inside the dashed inset at the bottom right — below
    // everything, because it is under the floor.
    const sd = BUILDING_MAPS.shed!.marks;
    expect(sd.shed!.fx).toBeLessThan(sd.bedroom!.fx);
    expect(sd.bedroom!.fy).toBeLessThan(sd.storage!.fy);
    expect(sd.cellar!.fy).toBeGreaterThan(sd.storage!.fy);
    expect(sd.cellar!.fy).toBeGreaterThan(0.7); // in the inset, not the floor above
  });
});

describe('OTA-1429 — the arrows', () => {
  it('⚠⚠ from the hall: armory west, cellar east, vault south', () => {
    expect(buildingArrow('outpost', 'hall', 'armory')).toBe('←');
    expect(buildingArrow('outpost', 'hall', 'cellar')).toBe('→');
    expect(buildingArrow('outpost', 'hall', 'vault')).toBe('↓');
  });

  it('⚠⚠ from the market square: the four stalls sit on the four diagonals', () => {
    expect(buildingArrow('market', 'market_square', 'weapons_stall')).toBe('↖');
    expect(buildingArrow('market', 'market_square', 'armor_stall')).toBe('↗');
    expect(buildingArrow('market', 'market_square', 'food_stall')).toBe('↙');
    expect(buildingArrow('market', 'market_square', 'materials_stall')).toBe('↘');
  });

  it('⚠⚠ EVERY pair in EVERY plan is complete, and has its exact opposite', () => {
    // A plan that disagrees with itself walks the player one way and tells them
    // the way back is somewhere else. Checked for every ordered pair of every
    // painted building, so a new entry cannot ship half a graph.
    for (const [id] of PAINTED) {
      const rooms = roomIds(id);
      for (const a of rooms) {
        for (const b of rooms) {
          if (a === b) continue;
          const there = buildingDirection(id, a, b);
          const pair = `${id}:${a}->${b}`;
          expect({ pair, d: there }).not.toEqual({ pair, d: '' });
          expect({ pair, back: buildingDirection(id, b, a) })
            .toEqual({ pair, back: OPPOSITE[there as Compass] });
        }
      }
    }
  });

  it('⚠ a room to itself, or an unknown room, gets NO arrow rather than a wrong one', () => {
    // A chip with no arrow reads as "no direction known"; a wrong arrow reads as
    // a direction and sends the player the wrong way.
    expect(buildingArrow('outpost', 'hall', 'hall')).toBe('');
    expect(buildingArrow('outpost', 'hall', 'cistern')).toBe('');
    expect(buildingArrow('outpost', '', 'vault')).toBe('');
  });

  it('⚠⚠ the shed\'s SECRET cellar is on the plan like any other room', () => {
    // It is drawn as a dashed inset because it is under the floor, but once the
    // floorboards are investigated it is a room you stand in — so it needs a
    // mark and a direction, or the marker vanishes the moment you climb down.
    expect(BUILDING_MAPS.shed!.marks.cellar).toBeDefined();
    expect(buildingArrow('shed', 'shed', 'cellar')).toBe('↘');
    expect(buildingArrow('shed', 'cellar', 'shed')).toBe('↖');
  });
});

describe('OTA-1429 — the ✓, and what it is scoped to', () => {
  it('⚠⚠ a walked room wears a ✓; the one you are in does not', () => {
    const chip = (id: string, from: string, room: string, visited: string[]) =>
      buildingChipLabel(id, from, { id: room, shortName: room, name: room }, visited);
    expect(chip('outpost', 'hall', 'armory', ['hall', 'armory'])).toBe('← armory ✓');
    expect(chip('outpost', 'hall', 'cellar', ['hall', 'armory'])).toBe('→ cellar');
    // The room you are standing in shows as active, not as a ✓.
    expect(chip('outpost', 'hall', 'hall', ['hall', 'armory'])).toBe('hall');
    // Same builder, other buildings — no second code path to drift.
    expect(chip('shack', 'den', 'storage', ['den', 'storage'])).toBe('↘ storage ✓');
    expect(chip('market', 'market_square', 'armor_stall', ['market_square'])).toBe('↗ armor_stall');
  });

  it('⚠ a building with no plan gets the plain label, never a bare ✓ with no arrow', () => {
    // The chip builder is only ever reached through the `buildingMap(...)` guard
    // in InputBox; pinned here so the guard cannot quietly be dropped.
    expect(INPUT).toContain('label={buildingMap(activeBuildingId)');
    expect(INPUT).toContain(': r.shortName}');
  });

  it('⚠⚠ the marks are PER VISIT, seeded on entry and cleared on exit', () => {
    // Building state is transient by design (a save inside reloads you outside),
    // and per-visit is also what outpost marks became at OTA-1410 after the owner
    // walked into a brand-new outpost and found every room pre-ticked.
    expect(STORE).toContain('buildingVisited: [entry.id],');
    expect(STORE).toContain('buildingVisited: [], preBuildingScene: null');
  });

  it('⚠⚠ walking back and forth does not grow the list', () => {
    expect(STORE).toContain('buildingVisited: st.buildingVisited.includes(roomId)');
  });
});

describe('OTA-1430 — the exit is tied to the room with the door', () => {
  it('⚠⚠ every template has at LEAST one way out — nobody is ever stranded', () => {
    // OTA-1271 is the record of what a floorless exit rule costs: the owner's own
    // playtest, stuck in the outpost workshop cluster asking "why is there no
    // exit button". The entry room qualifies unconditionally, by construction —
    // you walked in through it.
    for (const id of buildingIds()) {
      const doors = buildingExitRooms(id).map((r) => r.id);
      expect({ id, doors: doors.length > 0 }).toEqual({ id, doors: true });
      expect({ id, entryIsDoor: doors.includes(getBuilding(id)!.entryRoomId) })
        .toEqual({ id, entryIsDoor: true });
      // …and every door is a room that actually exists.
      for (const d of doors) {
        expect({ id, d, real: roomIds(id).includes(d) }).toEqual({ id, d, real: true });
      }
    }
  });

  it('⚠⚠ you cannot walk out of a sealed vault or a cellar under the floor', () => {
    expect(roomHasExitDoor('outpost', 'hall')).toBe(true);
    expect(roomHasExitDoor('outpost', 'vault')).toBe(false);
    expect(roomHasExitDoor('shed', 'shed')).toBe(true);
    expect(roomHasExitDoor('shed', 'cellar')).toBe(false);
    expect(roomHasExitDoor('flooded_house', 'kitchen')).toBe(true);
    expect(roomHasExitDoor('flooded_house', 'attic')).toBe(false);
  });

  it('⚠ the shack has TWO doors, because the painting shows two', () => {
    expect(buildingExitRooms('shack').map((r) => r.id)).toEqual(['den', 'storage']);
    expect(roomHasExitDoor('shack', 'bedroom')).toBe(false);
  });

  it('⚠⚠ the market square stopped being navHidden, or a stall would be a trap', () => {
    // The square is the market's door room. While it was navHidden it was not a
    // chip, so tying EXIT to it would have left a player at the food stall with
    // no way back to the square and no EXIT of their own.
    const rooms = visibleBuildingRooms('market', new Set<string>()).filter((r) => !r.navHidden);
    expect(rooms.map((r) => r.id)).toContain('market_square');
    expect(roomHasExitDoor('market', 'market_square')).toBe(true);
    expect(roomHasExitDoor('market', 'food_stall')).toBe(false);
  });

  it('⚠⚠ the chip row shows EVERY room — the old slice(0, 4) would drop one', () => {
    // The market is five rooms with the square back on the row and the shed is
    // four plus a revealed cellar. A cap of four would silently hide the
    // materials stall, which is the "game knows and does not say" shape again.
    for (const id of buildingIds()) {
      const all = getBuilding(id)!.rooms.length;
      expect({ id, fits: all <= 6 }).toEqual({ id, fits: true });
    }
    expect(INPUT).toContain('buildingRooms.slice(0, 6)');
  });

  it('⚠⚠ BOTH ways out are gated — the chip AND the typed word', () => {
    // The "many-doors" mistake: fix one door, leave its sibling open. The chip
    // hiding while `exit` still worked would have been exactly that.
    expect(INPUT).toContain('roomHasExitDoor(activeBuildingId, activeBuildingRoomId) ? (');
    expect(STORE).toContain('if (!roomHasExitDoor(inBuilding, hereRoom)) {');
  });

  it('⚠⚠ a refused exit SAYS where the door is, and the room line agrees', () => {
    // A bare refusal is the failure this session has named more than any other —
    // the game knows and does not say. Both writers name the room and, where
    // there is a painted plan, point at it.
    expect(STORE).toContain("the door is back through ${say}. Tap it, then EXIT.");
    expect(STORE).toContain('(The way out is through ${doors} — tap it, then EXIT.)');
    expect(STORE).toContain("(Tap EXIT, or type 'exit', to step back outside.)");
  });
});

describe('OTA-1429 — both maps show it, and the world does not bleed through', () => {
  it('⚠⚠ the minimap branches on the PLAN and reads the STORE, not the player', () => {
    // Building state lives on the store. Reading it off `player` is the mistake
    // gameStore's own comment records — a row of checks that "read outdoors
    // while the player was inside". And it branches on the plan existing, not on
    // an id, so a fifth painting needs no edit here.
    expect(MINI).toContain('const buildingId = useGameStore((s) => s.activeBuildingId);');
    expect(MINI).toContain('const bmap = buildingMap(buildingId);');
    expect(MINI).toContain('if (bmap && buildingRoomId) {');
    expect(MINI).toContain('const mark = bmap.marks[buildingRoomId];');
    expect(MINI).toContain('aspect: bmap.aspect,');
  });

  it("⚠⚠ the atlas shows the same painting, at that painting's own scale", () => {
    expect(MAP).toContain('const bMap = buildingRoomId ? buildingMap(buildingId) : undefined;');
    expect(MAP).toContain('const hallMapSource = bMap?.art;');
    expect(MAP).toContain('const mapSource = outpostMapSource ?? hallMapSource ?? WORLD_ATLAS;');
    // ⚠ From the TABLE, not a literal. A shared constant would draw one
    // building's marks at another's size.
    expect(MAP).toContain('labelScale = renderedW / bMap.artWidth;');
    expect(MAP).not.toContain('labelScale = renderedW / 1122;');
  });

  it('⚠⚠ world overlays are suppressed on EITHER interior, not just the outpost', () => {
    // The hidden-market pin, event glyphs and contract pins belong to the
    // overland atlas; without this they would paint across a building's floor.
    expect(MAP).toContain('const showingInterior = showingOutpost || showingHall;');
    expect(MAP).toContain('const hm = showingInterior ? null : HIDDEN_LOCATIONS.hidden_market;');
    expect(MAP).toContain('if (!showingInterior) {');
  });

  it('⚠ the atlas draws a ✓ for every OTHER room walked this visit', () => {
    // ⚠ ORDERING, not a fixed window. An `i + 1200` slice missed the loop by a
    // few lines the moment the block grew a comment — the third fixed-window pin
    // to rot this session. Assert the statements appear, in order, after the
    // branch opens.
    const i = MAP.indexOf('if (bMap && buildingRoomId) {');
    expect(i).toBeGreaterThan(-1);
    const loop = MAP.indexOf('for (const roomId of buildingVisited ?? []) {', i);
    expect(loop).toBeGreaterThan(i);
    expect(MAP.indexOf('if (roomId === buildingRoomId) continue;', loop)).toBeGreaterThan(loop);
    expect(MAP.indexOf('visitedRoomMarkStyles.push({', loop)).toBeGreaterThan(loop);
  });

  it('⚠ the glide is per-interior, which is what the compiler forced', () => {
    // The first draft shared one code path and lost the hubRoomId narrowing the
    // outpost lookup depends on.
    expect(MAP).toContain('const hallMark = bMap.marks[buildingRoomId];');
    expect(MAP).toContain('if (!showingOutpost || !player?.hubRoomId) return;');
  });

  it('⚠⚠ NOTHING still points at the deleted one-building module', () => {
    // `musterHall.ts` was named after a building because there was only one. It
    // is gone; a straggler import would fail at Metro-time only — which is the
    // exact failure shape that hid 21 unshipped OTAs behind a green typecheck
    // (OTA-1415, why check:requires exists).
    for (const src of [STORE, MINI, MAP, INPUT]) {
      expect(src).not.toContain('musterHall');
      expect(src).not.toContain('MUSTER_HALL_');
    }
  });
});

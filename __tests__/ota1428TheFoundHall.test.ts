/**
 * OTA-1428 — THE FOUND HALL: A NAME, A MAP, AND WHICH WAY EACH ROOM LIES.
 *
 * Owner: *"can we keep a list of multiple names for this and just have it
 * randomly pull one as we find it? and use this image for both the mini-map like
 * we do the Outpost and for the atlas. also use the ✓ symbol for visited rooms
 * and directional arrows."*
 *
 * ⚠⚠ AND IT NEEDED A NEW NAME BECAUSE THE OLD ONE WAS A COLLISION. The template
 * was `Abandoned Outpost`, and the faction home base is also an outpost —
 * `buildings.ts` carried the comment *"(NOT the faction home base — a found
 * one)"*, which is the tell that the name had already misled somebody. It misled
 * this session too: asked what the building was, the first answer described the
 * faction hub's rooms and NPCs, none of which are in it. Same species as
 * `preview` (OTA-1418/1419), `empty` (OTA-1119) and `hunger` (OTA-1118), each
 * fixed by splitting the word rather than commenting it.
 */
import {
  MUSTER_HALL_NAMES,
  MUSTER_HALL_ROOM_MARKS,
  MUSTER_HALL_ASPECT,
  musterHallNameFor,
  musterHallHookLabel,
  musterHallDirection,
  musterHallArrow,
  musterHallChipLabel,
} from '../app/engine/musterHall';
import { getBuilding } from '../app/engine/buildings';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const STORE = read('app', 'state', 'gameStore.ts');
const MINI = read('app', 'components', 'MiniMap.tsx');
const MAP = read('app', 'screens', 'MapScreen.tsx');
const INPUT = read('app', 'components', 'InputBox.tsx');

const ROOMS = ['hall', 'armory', 'cellar', 'vault'] as const;

describe('OTA-1428 — the names', () => {
  it('⚠⚠ a hall is named from the pool, and DIFFERENT halls differ', () => {
    const names = new Set(
      Array.from({ length: 60 }, (_, i) => musterHallNameFor(`loc${i}:${i}:${i * 3}`)),
    );
    expect(names.size).toBeGreaterThan(4);
    for (const n of names) expect(MUSTER_HALL_NAMES).toContain(n);
  });

  it('⚠⚠ …but ONE hall keeps its name — walk out, walk back, same building', () => {
    // A fresh roll per entry would rename the hall on the same tile, which reads
    // as a different building. Hashed from the tile: random across the world,
    // fixed for any one place, and nothing has to be stored.
    for (const key of ['asgardar:3:7', 'samarran:1:2', 'iskan:9:9']) {
      expect(musterHallNameFor(key)).toBe(musterHallNameFor(key));
    }
  });

  it('⚠ every name fits ALL FOUR rooms — no name promises a room that is not there', () => {
    // The floor plan is fixed and the art is one painting. A "Drowned Chapel"
    // would promise a chapel the player never finds — OTA-1402's defect (the
    // game saying a thing it cannot do) applied to signage.
    for (const n of MUSTER_HALL_NAMES) {
      expect(n).not.toMatch(/chapel|shrine|forge|stable|kitchen|library|tower|mine/i);
    }
    expect(MUSTER_HALL_NAMES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(MUSTER_HALL_NAMES).size).toBe(MUSTER_HALL_NAMES.length);
  });

  it('⚠⚠ the article is right, including the vowel case', () => {
    expect(musterHallHookLabel('Abandoned Muster Hall')).toBe('an abandoned muster hall');
    expect(musterHallHookLabel('Ruined Chapter House')).toBe('a ruined chapter house');
    // "The Empty Garrison" must not become "a the empty garrison".
    expect(musterHallHookLabel('The Empty Garrison')).toBe('an empty garrison');
    expect(musterHallHookLabel('The Quiet Commandery')).toBe('a quiet commandery');
  });

  it('⚠⚠ every pooled name produces a clean hook line', () => {
    for (const n of MUSTER_HALL_NAMES) {
      const l = musterHallHookLabel(n);
      expect(l).toMatch(/^an? [a-z]/);
      expect(l).not.toContain(' the ');
    }
  });

  it('⚠ only THIS template is renamed — the others keep their single name', () => {
    expect(STORE).toContain("if (buildingId !== 'outpost') return b?.name ?? 'a structure';");
    for (const id of ['shack', 'shed', 'flooded_house', 'market']) {
      expect(getBuilding(id)?.name).toBeTruthy();
    }
  });
});

describe('OTA-1428 — the map marks', () => {
  it('⚠⚠ every room in the template has a mark, and every mark a room', () => {
    const templ = getBuilding('outpost')!;
    const ids = templ.rooms.map((r) => r.id).sort();
    expect(ids).toEqual([...ROOMS].sort());
    expect(Object.keys(MUSTER_HALL_ROOM_MARKS).sort()).toEqual([...ROOMS].sort());
  });

  it('⚠ every mark is inside the painting', () => {
    for (const [id, f] of Object.entries(MUSTER_HALL_ROOM_MARKS)) {
      expect({ id, ok: f.fx > 0 && f.fx < 1 && f.fy > 0 && f.fy < 1 }).toEqual({ id, ok: true });
    }
  });

  it('⚠⚠ the marks agree with the painted plan — armory west, cellar east, vault south', () => {
    const m = MUSTER_HALL_ROOM_MARKS;
    expect(m.armory!.fx).toBeLessThan(m.hall!.fx);
    expect(m.cellar!.fx).toBeGreaterThan(m.hall!.fx);
    expect(m.vault!.fy).toBeGreaterThan(m.hall!.fy);
    // Hall and vault share the spine, so their x is the same to within a hair.
    expect(Math.abs(m.hall!.fx - m.vault!.fx)).toBeLessThan(0.02);
  });

  it('⚠ the aspect is the painting\'s own (1122 × 1402), not the outpost\'s square', () => {
    expect(MUSTER_HALL_ASPECT).toBeCloseTo(1122 / 1402, 5);
    expect(MUSTER_HALL_ASPECT).not.toBe(1);
  });
});

describe('OTA-1428 — the arrows', () => {
  it('⚠⚠ from the hall: armory west, cellar east, vault south', () => {
    expect(musterHallArrow('hall', 'armory')).toBe('←');
    expect(musterHallArrow('hall', 'cellar')).toBe('→');
    expect(musterHallArrow('hall', 'vault')).toBe('↓');
  });

  it('⚠⚠ every direction has its opposite — the plan cannot disagree with itself', () => {
    const OPP: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
    for (const a of ROOMS) {
      for (const b of ROOMS) {
        if (a === b) continue;
        const there = musterHallDirection(a, b);
        expect({ pair: `${a}->${b}`, d: there }).not.toEqual({ pair: `${a}->${b}`, d: '' });
        expect({ pair: `${a}->${b}`, back: musterHallDirection(b, a) })
          .toEqual({ pair: `${a}->${b}`, back: OPP[there] });
      }
    }
  });

  it('⚠ a room to itself, or an unknown room, gets NO arrow rather than a wrong one', () => {
    // A chip with no arrow reads as "no direction known"; a wrong arrow reads as
    // a direction and sends the player the wrong way.
    expect(musterHallArrow('hall', 'hall')).toBe('');
    expect(musterHallArrow('hall', 'cistern')).toBe('');
    expect(musterHallArrow('', 'vault')).toBe('');
  });
});

describe('OTA-1428 — the ✓, and what it is scoped to', () => {
  it('⚠⚠ a walked room wears a ✓; the one you are in does not', () => {
    const chip = (id: string, visited: string[]) =>
      musterHallChipLabel('hall', { id, shortName: id, name: id }, visited);
    expect(chip('armory', ['hall', 'armory'])).toBe('← armory ✓');
    expect(chip('cellar', ['hall', 'armory'])).toBe('→ cellar');
    // The room you are standing in shows as active, not as a ✓.
    expect(chip('hall', ['hall', 'armory'])).toBe('hall');
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

describe('OTA-1428 — both maps show it, and the world does not bleed through', () => {
  it('⚠⚠ the minimap has a hall branch reading the STORE, not the player', () => {
    // Building state lives on the store. Reading it off `player` is the mistake
    // gameStore's own comment records — a row of checks that "read outdoors
    // while the player was inside".
    expect(MINI).toContain("if (buildingId === 'outpost' && buildingRoomId) {");
    expect(MINI).toContain('const buildingId = useGameStore((s) => s.activeBuildingId);');
    expect(MINI).toContain('MUSTER_HALL_ROOM_MARKS[buildingRoomId]');
    expect(MINI).toContain('aspect: MUSTER_HALL_ASPECT,');
  });

  it('⚠⚠ the atlas shows the same painting, at its own scale', () => {
    expect(MAP).toContain('const hallMapSource = inHall ? MUSTER_HALL_MAP : undefined;');
    expect(MAP).toContain('const mapSource = outpostMapSource ?? hallMapSource ?? WORLD_ATLAS;');
    // 1122, not the outpost's 1254 — reusing that constant would draw the
    // hall's glyphs ~12% oversized.
    expect(MAP).toContain('labelScale = renderedW / 1122;');
  });

  it('⚠⚠ world overlays are suppressed on EITHER interior, not just the outpost', () => {
    // The hidden-market pin, event glyphs and contract pins belong to the
    // overland atlas; without this they would paint across the hall's floor.
    expect(MAP).toContain('const showingInterior = showingOutpost || showingHall;');
    expect(MAP).toContain('const hm = showingInterior ? null : HIDDEN_LOCATIONS.hidden_market;');
    expect(MAP).toContain('if (!showingInterior) {');
  });

  it('⚠ the atlas draws a ✓ for every OTHER room walked this visit', () => {
    // ⚠ ORDERING, not a fixed window. An `i + 1200` slice missed the loop by a
    // few lines the moment the block grew a comment — the third fixed-window pin
    // to rot this session. Assert the statements appear, in order, after the
    // branch opens.
    const i = MAP.indexOf('if (showingHall && buildingRoomId) {');
    expect(i).toBeGreaterThan(-1);
    const loop = MAP.indexOf('for (const roomId of buildingVisited ?? []) {', i);
    expect(loop).toBeGreaterThan(i);
    expect(MAP.indexOf('if (roomId === buildingRoomId) continue;', loop)).toBeGreaterThan(loop);
    expect(MAP.indexOf('visitedRoomMarkStyles.push({', loop)).toBeGreaterThan(loop);
  });

  it('⚠⚠ only THIS building gets arrows — the others have no plan to point at', () => {
    expect(INPUT).toContain("activeBuildingId === 'outpost'");
    expect(INPUT).toContain('musterHallChipLabel(activeBuildingRoomId ?? \'\', r, buildingVisited)');
    expect(INPUT).toContain(': r.shortName}');
  });

  it('⚠ the glide is per-interior, which is what the compiler forced', () => {
    // The first draft shared one code path and lost the hubRoomId narrowing the
    // outpost lookup depends on.
    expect(MAP).toContain('const hallMark = MUSTER_HALL_ROOM_MARKS[buildingRoomId];');
    expect(MAP).toContain('if (!showingOutpost || !player?.hubRoomId) return;');
  });
});

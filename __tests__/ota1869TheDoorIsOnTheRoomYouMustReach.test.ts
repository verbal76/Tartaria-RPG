/**
 * ⚠⚠⚠ OTA-1869 — THE DOOR BELONGS ON THE ROOM YOU MUST REACH TO GET OUT.
 *
 * Owner, from an Abandoned Outpost interior on hardware: standing in the Vault,
 * the full-width `🚪 EXIT` is gone and Hall is just another room on the row.
 * Nothing says Hall is where the door is. The game knew all along — the EXIT
 * chip reads `roomHasExitDoor`, both maps paint `🚪` from `roomIsExit`, and the
 * engine's typed-exit refusal even names the room and points at it ("the door
 * is back through Hall ↑. Tap it, then EXIT."). The one surface that never said
 * so is the row the player is actually looking at.
 *
 * ⚠⚠ AND IT WAS SYSTEMIC, NOT AN OUTPOST BUG. The read-only audit walked both
 * interior architectures: 5 BUILDING templates (20 rooms) and 1 HUB layout (15
 * rooms) re-skinned for 8 factions. 6 of 6 tie leaving to particular rooms;
 * 0 of 6 marked those rooms on the navigation row. The Abandoned Outpost is
 * simply the one the owner happened to be standing in.
 *
 * ⚠ THE RULE, AND IT IS ONE SENTENCE:
 *     destination owns an exterior exit  AND  destination !== current room
 *       → the destination tile carries the existing `🚪`.
 * It means "go here to find the way outside" and never "press this to exit":
 * the tile is still room navigation, and the real EXIT is the control waiting
 * in that room. Ownership is read from `buildingExitRooms` / `roomIsExit` — the
 * EXIT chip's own tables — so the row can never promise a door the button will
 * not offer, which is OTA-1271's failure with a picture attached.
 *
 * ⚠ NOT THE CURRENT ROOM. The glyph is wayfinding; in the room you are standing
 * in the real EXIT control is already on screen directly beneath the row, and a
 * second door there would be noise.
 *
 * ⚠ NOT A ONE-EXIT ASSUMPTION. Two systems own two doors each — the shack (den
 * + storage) and the hub (Gate by `entrance`, Square by `exterior_door`) — and
 * both are marked. Picking a "preferred" exit would invent a rule the layouts
 * do not have.
 */

import {
  buildingChipLabel, buildingChipA11y, buildingRoomIsWayOut, buildingMap, BUILDING_MAPS,
} from '../app/engine/buildingMaps';
import {
  BUILDINGS, buildingExitRooms, buildingEntryRoom, roomHasExitDoor, visibleBuildingRooms,
} from '../app/engine/buildings';
import { HUB, roomIsExit, hubExitRooms } from '../app/engine/hub';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const INPUTBOX = read('app/components/InputBox.tsx');

const DOOR = '🚪';
const ALL = Object.keys(BUILDINGS);
/** Every room of a template, including secrets — the widest legal set. */
const roomsOf = (id: string) => BUILDINGS[id]!.rooms;
const label = (b: string, from: string, roomId: string, visited: string[] = []) =>
  buildingChipLabel(b, from, roomsOf(b).find((r) => r.id === roomId)!, visited);
const a11y = (b: string, from: string, roomId: string, visited: string[] = []) =>
  buildingChipA11y(b, from, roomsOf(b).find((r) => r.id === roomId)!, visited);

/* ══ A — THE CORPUS, FROM SOURCE, NOT FROM THE PROMPT ════════════════════ */

describe('A — the interior corpus and its exit tables', () => {
  it('1 — five building templates, twenty rooms, every one with a painted plan', () => {
    expect(ALL.sort()).toEqual(['flooded_house', 'market', 'outpost', 'shack', 'shed']);
    expect(ALL.reduce((n, k) => n + roomsOf(k).length, 0)).toBe(20);
    for (const id of ALL) expect(buildingMap(id)).toBeTruthy();
    expect(Object.keys(BUILDING_MAPS).sort()).toEqual(ALL.sort());
  });

  it('2 — every template has at least one exit-bearing room; none can strand a player', () => {
    for (const id of ALL) {
      const doors = buildingExitRooms(id);
      expect(doors.length).toBeGreaterThanOrEqual(1);
      // the entry room qualifies by construction — you walked in through it
      expect(doors.some((r) => r.id === buildingEntryRoom(id)!.id)).toBe(true);
    }
  });

  it('3 — the hub owns TWO doors and names them by tag, not by room name', () => {
    const ids = hubExitRooms().map((r) => r.id).sort();
    expect(ids).toEqual(['outpost_central', 'outpost_gate']);
    const byId = Object.fromEntries(HUB.rooms.map((r) => [r.id, r]));
    expect(roomIsExit(byId.outpost_gate)).toBe(true);       // 'entrance'
    expect(roomIsExit(byId.outpost_central)).toBe(true);     // 'exterior_door'
    expect(roomIsExit(byId.outpost_workshop)).toBe(false);
    expect(roomIsExit(byId.outpost_relic_vault)).toBe(false);
    expect(HUB.rooms.length).toBe(15);
  });
});

/* ══ B — THE RULE ════════════════════════════════════════════════════════ */

describe('B — destination owns a door AND is not where you stand', () => {
  it('4 — an exit-bearing destination is a way out; the same room underfoot is not', () => {
    expect(buildingRoomIsWayOut('outpost', 'vault', 'hall')).toBe(true);
    expect(buildingRoomIsWayOut('outpost', 'hall', 'hall')).toBe(false);   // you are there
  });

  it('5 — a room without a door is never marked, from anywhere', () => {
    for (const from of ['hall', 'armory', 'cellar', 'vault']) {
      for (const to of ['armory', 'cellar', 'vault']) {
        expect(buildingRoomIsWayOut('outpost', from, to)).toBe(false);
      }
    }
  });

  it('6 — it is read from the EXIT chip\'s own table, so the two cannot disagree', () => {
    for (const id of ALL) {
      const doors = new Set(buildingExitRooms(id).map((r) => r.id));
      for (const r of roomsOf(id)) {
        // standing somewhere else, the marker and the chip answer the same way
        const elsewhere = roomsOf(id).find((x) => x.id !== r.id)!.id;
        expect(buildingRoomIsWayOut(id, elsewhere, r.id)).toBe(doors.has(r.id));
        expect(roomHasExitDoor(id, r.id)).toBe(doors.has(r.id));
      }
    }
  });

  it('7 — null-ish inputs never invent a door', () => {
    expect(buildingRoomIsWayOut(null, 'vault', 'hall')).toBe(false);
    expect(buildingRoomIsWayOut('outpost', 'vault', null)).toBe(false);
    expect(buildingRoomIsWayOut('outpost', null, 'hall')).toBe(true); // outside a room, still true
  });
});

/* ══ C — THE ABANDONED OUTPOST, THE ROOM THE OWNER WAS STANDING IN ═══════ */

describe('C — Vault, Armory, Cellar: which way is out?', () => {
  it('8 — Hall holds the only door, and the EXIT chip agrees', () => {
    expect(buildingExitRooms('outpost').map((r) => r.id)).toEqual(['hall']);
    expect(roomHasExitDoor('outpost', 'hall')).toBe(true);
    for (const r of ['armory', 'cellar', 'vault']) expect(roomHasExitDoor('outpost', r)).toBe(false);
  });

  it('9 — from Vault, Armory and Cellar the Hall tile carries the door', () => {
    for (const from of ['vault', 'armory', 'cellar']) {
      const l = label('outpost', from, 'hall');
      expect(l).toContain(DOOR);
      expect(l).toContain('Hall');
      // the door sits immediately before the NAME, not adrift at either end
      expect(l).toMatch(/🚪 Hall/);
    }
  });

  it('10 — and the owner\'s sketch is what the row actually produces', () => {
    // `↑ 🚪 Hall ✓` — arrow, door, name, visited. Hall walked, player in Vault.
    expect(label('outpost', 'vault', 'hall', ['hall', 'vault'])).toBe('↑ 🚪 Hall ✓');
  });

  it('11 — standing IN Hall, the tile carries no door: EXIT is already on screen', () => {
    expect(label('outpost', 'hall', 'hall', ['hall'])).not.toContain(DOOR);
    expect(roomHasExitDoor('outpost', 'hall')).toBe(true);   // the chip is there instead
  });

  it('12 — the rooms that are not the way out never wear one', () => {
    for (const to of ['armory', 'cellar', 'vault']) {
      expect(label('outpost', 'hall', to, [])).not.toContain(DOOR);
    }
  });
});

/* ══ D — THE OTHER FOUR TEMPLATES ═══════════════════════════════════════ */

describe('D — every template, not just the reported one', () => {
  const CASES: Array<[string, string, string]> = [
    ['flooded_house', 'attic', 'kitchen'],
    ['shed', 'bedroom', 'shed'],
    ['market', 'weapons_stall', 'market_square'],
    ['shack', 'bedroom', 'den'],
  ];
  it.each(CASES)('13 — %s: %s → %s is marked as the way out', (b, from, to) => {
    expect(label(b, from, to)).toContain(DOOR);
    expect(buildingRoomIsWayOut(b, from, to)).toBe(true);
  });

  it('14 — and in that room the tile is plain again', () => {
    for (const [b, , to] of CASES) expect(label(b, to, to)).not.toContain(DOOR);
  });

  it('15 — corpus-wide: every non-current exit-bearing destination is marked, and only those', () => {
    let marked = 0;
    for (const id of ALL) {
      for (const from of roomsOf(id)) {
        for (const to of roomsOf(id)) {
          if (to.id === from.id) continue;
          const want = buildingExitRooms(id).some((r) => r.id === to.id);
          const has = label(id, from.id, to.id).includes(DOOR);
          expect(has).toBe(want);
          if (has) marked += 1;
        }
      }
    }
    expect(marked).toBeGreaterThan(0);
  });
});

/* ══ E — TWO DOORS, NOT ONE ═════════════════════════════════════════════ */

describe('E — structures that legitimately own more than one way out', () => {
  it('16 — the shack owns den AND storage, and both get marked', () => {
    expect(buildingExitRooms('shack').map((r) => r.id).sort()).toEqual(['den', 'storage']);
    expect(label('shack', 'bedroom', 'den')).toContain(DOOR);
    expect(label('shack', 'bedroom', 'storage')).toContain(DOOR);
    // standing in one, the OTHER is still a way out
    expect(label('shack', 'den', 'storage')).toContain(DOOR);
    expect(label('shack', 'storage', 'den')).toContain(DOOR);
    // and each stops marking itself
    expect(label('shack', 'den', 'den')).not.toContain(DOOR);
    expect(label('shack', 'storage', 'storage')).not.toContain(DOOR);
  });

  it('17 — the marker follows ownership; it does not manufacture a navigation edge', () => {
    // `visibleBuildingRooms` decides what the row renders; the glyph decides
    // nothing about that. A secret room stays hidden, door or no door.
    const shown = visibleBuildingRooms('shed', new Set<string>()).map((r) => r.id);
    expect(shown).not.toContain('cellar');          // secret until revealed
    expect(shown).toContain('shed');                // the way out, and visible
  });

  it('18 — the hub marks both of its doors and nothing else', () => {
    const doors = new Set(hubExitRooms().map((r) => r.id));
    expect(doors.size).toBe(2);
    for (const r of HUB.rooms) expect(doors.has(r.id)).toBe(roomIsExit(r));
  });
});

/* ══ F — THE VISITED TICK KEEPS ITS PLACE ═══════════════════════════════ */

describe('F — visited and exit-bearing are independent facts', () => {
  it('19 — a way out you have already walked wears BOTH marks', () => {
    const l = label('outpost', 'vault', 'hall', ['hall']);
    expect(l).toContain(DOOR);
    expect(l).toContain('✓');
  });

  it('20 — a way out you have NOT walked still says so: the door does not wait to be earned', () => {
    const l = label('outpost', 'vault', 'hall', []);
    expect(l).toContain(DOOR);
    expect(l).not.toContain('✓');
  });

  it('21 — a walked room with no door keeps its tick and gains nothing', () => {
    const l = label('outpost', 'hall', 'vault', ['vault']);
    expect(l).toContain('✓');
    expect(l).not.toContain(DOOR);
  });

  it('22 — the door never replaces the tick', () => {
    expect(label('outpost', 'vault', 'hall', ['hall'])).toBe('↑ 🚪 Hall ✓');
  });
});

/* ══ G — SAID IN WORDS, NOT ONLY IN A GLYPH ═════════════════════════════ */

describe('G — what a screen reader hears', () => {
  it('23 — an exit-bearing destination says so, in words', () => {
    expect(a11y('outpost', 'vault', 'hall')).toBe('Hall, way out');
    expect(a11y('outpost', 'vault', 'hall', ['hall'])).toBe('Hall, already explored, way out');
  });

  it('24 — an ordinary destination says nothing extra', () => {
    expect(a11y('outpost', 'hall', 'vault')).toBe('Vault');
    expect(a11y('outpost', 'hall', 'vault', ['vault'])).toBe('Vault, already explored');
  });

  it('25 — ⚠ IT NEVER CLAIMS TO EXIT. The tile walks you there; the door is what waits.', () => {
    for (const id of ALL) {
      for (const from of roomsOf(id)) {
        for (const to of roomsOf(id)) {
          const s = a11y(id, from.id, to.id, [to.id]).toLowerCase();
          expect(s).not.toContain('exit');
          expect(s).not.toContain('leave');
        }
      }
    }
  });

  it('26 — the glyph is never the only carrier: the row hands TravelBtn a real label', () => {
    // Without a11yLabel, TravelBtn falls back to the visible label — glyphs and
    // all — which is what made this necessary rather than optional.
    expect(INPUTBOX).toMatch(/a11yLabel=\{buildingChipA11y\(/);
    expect(INPUTBOX).toMatch(/accessibilityLabel=\{a11yLabel \?\?/);
  });
});

/* ══ H — THE WIDTH ENVELOPE, MEASURED HONESTLY ══════════════════════════ */

describe('H — the glyph never lands on a long label', () => {
  /* ⚠⚠⚠ A JEST RENDERER DOES NOT LAY OUT TEXT, so no honest test here can
   * report a rendered pixel width. What IS honest, and is the thing that
   * actually decides the risk: the marker can only ever appear on an
   * EXIT-BEARING room, and those rooms have short names. The row already ships
   * longer labels than any the door can produce, so this repair does not widen
   * the worst case the chip has to survive — it stays strictly inside an
   * envelope the narrowest supported phone already carries today.
   * `travelBtnText` is numberOfLines 1, ellipsizeMode tail, adjustsFontSizeToFit
   * with minimumFontScale 0.8, so "widest label" is the whole question. */
  const longestWithDoor = (): number => {
    let worst = 0;
    for (const id of ALL) {
      for (const from of roomsOf(id)) {
        for (const to of roomsOf(id)) {
          const l = label(id, from.id, to.id, [to.id]);
          if (l.includes(DOOR)) worst = Math.max(worst, l.length);
        }
      }
    }
    for (const r of hubExitRooms()) {
      worst = Math.max(worst, `↑ ✓ ${DOOR} ${(r.shortName ?? r.id).toUpperCase()}`.length);
    }
    return worst;
  };
  const longestWithout = (): number => {
    let worst = 0;
    for (const id of ALL) {
      for (const from of roomsOf(id)) {
        for (const to of roomsOf(id)) {
          const l = label(id, from.id, to.id, [to.id]);
          if (!l.includes(DOOR)) worst = Math.max(worst, l.length);
        }
      }
    }
    for (const r of HUB.rooms) {
      if (roomIsExit(r)) continue;
      worst = Math.max(worst, `↑ ✓ ${(r.shortName ?? r.id).toUpperCase()}`.length);
    }
    return worst;
  };

  it('27 — no door label is longer than a label the row already renders without one', () => {
    const withDoor = longestWithDoor();
    const without = longestWithout();
    expect(withDoor).toBeGreaterThan(0);
    // e.g. '↑ 🚪 Storage ✓' (13) vs the pre-existing '↑ ✓ SECOND LANDING' (18)
    expect(withDoor).toBeLessThanOrEqual(without);
  });

  it('28 — every exit-bearing room in both systems has a short name', () => {
    for (const id of ALL) {
      for (const r of buildingExitRooms(id)) {
        expect((r.shortName || r.name).length).toBeLessThanOrEqual(9);
      }
    }
    for (const r of hubExitRooms()) expect((r.shortName ?? r.id).length).toBeLessThanOrEqual(9);
  });

  it('29 — the chip geometry this rests on is unchanged', () => {
    expect(INPUTBOX).toMatch(/minWidth: 92/);
    expect(INPUTBOX).toMatch(/travelRow: \{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' \}/);
    expect(INPUTBOX).toMatch(/minimumFontScale=\{0\.8\}/);
  });
});

/* ══ I — WHAT THIS DID NOT TOUCH ════════════════════════════════════════ */

describe('I — a wayfinding repair, and only that', () => {
  it('30 — the hub row reads the same predicate the maps and the chip read', () => {
    const region = INPUTBOX.slice(INPUTBOX.indexOf('const hubExitChips'), INPUTBOX.indexOf('return out;'));
    expect(region).toMatch(/const door = roomIsExit\(targetRoom\) \? '🚪 ' : ''/);
    expect(region).toMatch(/label: `\$\{arrow\} \$\{walked \? '✓ ' : ''\}\$\{door\}\$\{name\}`/);
    expect(region).toMatch(/, way out/);
  });

  it('31 — no room name, no structure id, no hard-coded door decides the marker', () => {
    const src = read('app/engine/buildingMaps.ts');
    const fn = src.slice(src.indexOf('export function buildingRoomIsWayOut'), src.indexOf('export function buildingChipA11y'));
    const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const needle of ['hall', 'Hall', 'kitchen', 'outpost', 'den', 'shed', 'market_square']) {
      expect(code).not.toContain(needle);
    }
    expect(code).toContain('buildingExitRooms(buildingId)');
  });

  it('32 — exit ownership, the graph and the EXIT control itself are untouched', () => {
    // the marker asks; it never writes
    expect(buildingExitRooms('outpost').map((r) => r.id)).toEqual(['hall']);
    expect(buildingExitRooms('shack').map((r) => r.id).sort()).toEqual(['den', 'storage']);
    expect(hubExitRooms().length).toBe(2);
    // the full-width EXIT chip is still gated on roomHasExitDoor, unchanged
    expect(INPUTBOX).toMatch(/\{roomHasExitDoor\(activeBuildingId, activeBuildingRoomId\) \? \(/);
    expect(INPUTBOX).toMatch(/<TravelBtn label="🚪 EXIT" wayOut testID="exit-chip"/);
  });

  it('33 — the maps were evidence, not targets: neither was edited', () => {
    const mapScreen = read('app/screens/MapScreen.tsx');
    const mini = read('app/components/MiniMap.tsx');
    // the hub maps still paint from hubExitRooms, and the BUILDING map is still
    // deliberately ✓-only — that exclusion is a separate design question.
    expect(mapScreen).toContain('for (const room of hubExitRooms()) {');
    expect(mini).toContain('doors: MapFrac[];');
    // ⚠ the BUILDING branch only — MapScreen paints other glyphs further down
    const from = mapScreen.indexOf('for (const roomId of buildingVisited');
    const building = mapScreen.slice(from, mapScreen.indexOf('arb102', from));
    expect(from).toBeGreaterThan(0);
    expect(building).not.toContain(DOOR);
    expect(building).toContain("glyph: '✓'");
  });
});

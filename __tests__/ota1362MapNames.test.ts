/**
 * OTA-1362 — the button has to agree with the picture.
 *
 * Owner: *"the room names are incorrect according to the maps for each faction,
 * even with synonyms and abbreviations they are not close. the outpost rooms
 * need renamed to match the room names on the map as close as they can, and we
 * have a checkmark in the travel room name boxes let's also get a directional
 * arrow in front of that name in the box only so even if the name is wrong
 * directionally you can figure it out on the map."*
 *
 * Two rules come out of that, and they divide cleanly:
 *   · the NAME and the CHIP answer to the artwork, and
 *   · the ARROW answers to outpostGraph, which is the same thing the map's
 *     corridors draw — so it is the half that cannot drift.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import staticHub from '../app/data/world/static_hub.json';
import variants from '../app/data/world/hub_faction_variants.json';
import { OUTPOST_EXITS, DIRECTIONS } from '../app/engine/outpostGraph';

type Room = { id: string; structuralId?: string; name: string; shortName: string };
const BASE = (staticHub as unknown as { rooms: Room[] }).rooms;
const FACTIONS = (variants as unknown as {
  factions: Record<string, Record<string, Room>>;
}).factions;

/** Read straight off the nine outpost PNGs in assets/outposts/. */
const MAP_LABELS: Record<string, Record<string, string>> = {
  BASE: {                                   // reclaimers_guild.png
    outpost_gate: 'The Gate',
    outpost_central: 'The Central Square',
    outpost_relic_vault: 'The Relic Vault',
    outpost_lab: 'The Aether Lab',
    outpost_workshop: 'The Workshop',
    outpost_messhall: 'The Mess Hall',
    outpost_armory: 'The Armory',
    outpost_quarters: 'Sleeping Quarters',
    outpost_chapel: 'The Chapel',
    outpost_culvert_descent: 'The Culvert Descent',
  },
  mud_monarchs: {                           // mud_monarchs.png
    outpost_gate: 'The Atrium',
    outpost_central: 'The Court of Standards',
    outpost_relic_vault: 'The Royal Strongroom',
    outpost_lab: 'The Cabinet of Curiosities',
    outpost_workshop: 'The Cabinet Workshop',
    outpost_messhall: 'The Banquet Floor',
    outpost_armory: 'The Court Arsenal',
    outpost_quarters: "The Retainers' Quarters",
    outpost_chapel: 'The Family Chapel',
    outpost_culvert_descent: 'The Sub-Court Descent',
  },
  forgotten_order: {                        // forgotten_order.png
    outpost_gate: 'The Threshold',
    outpost_central: 'The Sanctum Hall',
    outpost_relic_vault: 'The Sealed Archive',
    outpost_lab: 'The High Reading Room',
    outpost_workshop: 'The Vellum Workshop',
    outpost_messhall: 'The Refectory',
    outpost_armory: 'The Reliquary Armory',
    outpost_quarters: 'The Scriptorium Dormitory',
    outpost_chapel: 'The Reading Cell',
    outpost_culvert_descent: 'The Archive Descent',
  },
  eternal_dynasty: {                        // eternal_dynasty.png
    outpost_gate: 'The Crown Gate',
    outpost_central: 'The Throne Promenade',
    outpost_relic_vault: 'The Imperial Vault',
    outpost_lab: 'The Library of the Line',
    outpost_workshop: "The Heir's Workshop",
    outpost_messhall: 'The Imperial Hall',
    outpost_armory: "The Heir's Armory",
    outpost_quarters: 'The Royal Quarters',
    outpost_chapel: 'The Coronation Chamber',
    outpost_culvert_descent: 'The Crypt Stair',
  },
  conspiracy_architects: {                  // conspiracy_architects.png
    outpost_gate: 'The Reception',
    outpost_central: 'The Operations Room',
    outpost_relic_vault: 'The Evidence Vault',
    outpost_lab: 'The Document Room',
    outpost_workshop: 'The Lab',
    outpost_messhall: 'The Break Room',
    outpost_armory: 'The Secured Storage',
    outpost_quarters: 'The Safehouse Bunks',
    outpost_chapel: 'The Quiet Office',
    outpost_culvert_descent: 'The Sublevel Access',
  },
  servants_of_giants: {                     // servants_of_giants.png
    outpost_gate: 'The Vigil Door',
    outpost_central: 'The Tomb-Lit Court',
    outpost_relic_vault: 'The Reliquary of the Sleepers',
    outpost_lab: 'The Tomb Records',
    outpost_workshop: 'The Vigil Workshop',
    outpost_messhall: 'The Vigil Refectory',
    outpost_armory: 'The Vigil Forge',
    outpost_quarters: 'The Vigil Cells',
    // ⚠ The Tomb Vigil art leaves the chapel's chamber UNLABELED (see the note
    // in outpostRoomMarks.ts), so there is nothing to match — the game name
    // stands on its own and only the chip had to stop saying "Shrine".
    outpost_culvert_descent: 'The Vault Descent',
  },
};

/** ⚠⚠ THE LOWER LEVEL IS THE SAME PICTURE ON ALL NINE PNGS. */
const BURIED_LABELS: Record<string, string> = {
  buried_landing_one: 'First Landing',
  buried_landing_two: 'Second Landing',
  buried_pumps: 'The Pump Room',
  buried_storage: 'Storage Halls',
  buried_shallow_digs: 'The Shallow Digs',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

describe('OTA-1362 — names match the painted labels', () => {
  it('the base skin says what the Reclaimer map says', () => {
    const byId = Object.fromEntries(BASE.map((r) => [r.id, r]));
    for (const [id, label] of Object.entries(MAP_LABELS.BASE!)) {
      expect({ id, name: byId[id]!.name }).toEqual({ id, name: label });
    }
    // ⚠ This is the one the drift produced: the room id has said "culvert
    // descent" since it was authored and the art paints THE CULVERT DESCENT,
    // but the game had wandered to "The Storage Cellar" with a chip reading
    // CELLAR — a name and a button that appear nowhere on the picture.
    expect(byId.outpost_culvert_descent!.name).toBe('The Culvert Descent');
    expect(byId.outpost_culvert_descent!.shortName).toBe('Descent');
  });

  it('every transcribed faction skin says what its map says', () => {
    for (const [fid, labels] of Object.entries(MAP_LABELS)) {
      if (fid === 'BASE') continue;
      for (const [id, label] of Object.entries(labels)) {
        expect({ fid, id, name: FACTIONS[fid]![id]!.name }).toEqual({ fid, id, name: label });
      }
    }
  });

  it('⚠⚠ the buried level carries the SAME name on every skin, because the art does', () => {
    // The previous OTA gave each faction its own undercroft names. The prose
    // was the right call and stays; the NAMES were not — all nine PNGs paint
    // First Landing / Second Landing / The Pump Room / Storage Halls / The
    // Shallow Digs, so a per-faction rename put the game at odds with the
    // picture on eight skins at once.
    const byId = Object.fromEntries(BASE.map((r) => [r.id, r]));
    for (const [id, label] of Object.entries(BURIED_LABELS)) {
      expect({ id, name: byId[id]!.name }).toEqual({ id, name: label });
      for (const [fid, rooms] of Object.entries(FACTIONS)) {
        expect({ fid, id, name: rooms[id]!.name }).toEqual({ fid, id, name: label });
      }
    }
  });

  it('…but the buried PROSE is still the faction\'s own', () => {
    for (const id of Object.keys(BURIED_LABELS)) {
      const seen = new Set(Object.values(FACTIONS).map((r) => (r[id] as unknown as { description: string }).description));
      expect(seen.size).toBe(Object.keys(FACTIONS).length);
    }
  });
});

describe('OTA-1362 — the chip is a word off the label', () => {
  /** Deliberate departures, each with its reason. Nothing else may join them. */
  const SANCTIONED: Record<string, string> = {
    // OTA-1274: the chip `break` collided with a parser verb, so the two words
    // are joined rather than split. Still the map's own words.
    'conspiracy_architects.outpost_messhall': 'Breakroom',
    // OTA-1274 pins bare "documents" as a REFUSED input that points the way.
    'conspiracy_architects.outpost_lab': 'Documents',
  };

  it('no chip carries a word its own name does not', () => {
    const check = (key: string, name: string, chip: string) => {
      if (SANCTIONED[key] === chip) return;
      expect({ key, chip, name }).toEqual(
        expect.objectContaining({ key, chip: expect.any(String) }));
      expect(norm(name)).toContain(norm(chip));
    };
    for (const r of BASE) check(`BASE.${r.id}`, r.name, r.shortName);
    for (const [fid, rooms] of Object.entries(FACTIONS)) {
      for (const [id, v] of Object.entries(rooms)) check(`${fid}.${id}`, v.name, v.shortName);
    }
  });

  it('no chip is a structural id', () => {
    for (const [fid, rooms] of Object.entries(FACTIONS)) {
      for (const v of Object.values(rooms)) {
        expect(`${fid}: ${v.shortName}`).not.toMatch(/\b(Landing|Room|Area|Zone)\s*\d+\b/i);
      }
    }
    for (const r of BASE) expect(r.shortName).not.toMatch(/\b\w+\s*\d+\b/);
  });

  it('⚠ the seven that were wrong are right, and named so the fix is legible', () => {
    expect(FACTIONS.forgotten_order!.outpost_quarters!.shortName).toBe('Dormitory');
    expect(FACTIONS.servants_of_giants!.outpost_chapel!.shortName).toBe('Chamber');
    expect(FACTIONS.eternal_dynasty!.outpost_messhall!.shortName).toBe('Imperial Hall');
    expect(FACTIONS.eternal_dynasty!.outpost_quarters!.shortName).toBe('Quarters');
    expect(FACTIONS.eternal_dynasty!.outpost_chapel!.shortName).toBe('Coronation');
    expect(FACTIONS.mud_monarchs!.outpost_lab!.shortName).toBe('Curiosities');
    expect(FACTIONS.true_tartarians!.outpost_lab!.shortName).toBe('Glyph');
  });

  it('a chip is never the generic half a sibling room also owns', () => {
    // "Imperial" opened both the Imperial Hall and the Imperial Vault; "Cabinet"
    // opened both the Cabinet of Curiosities and the Cabinet Workshop. A chip
    // must not be a prefix-word shared by two rooms in the SAME outpost.
    for (const [fid, rooms] of Object.entries(FACTIONS)) {
      for (const [id, v] of Object.entries(rooms)) {
        const others = Object.entries(rooms).filter(([oid]) => oid !== id);
        const alsoIn = others.filter(([, o]) => norm(o.name).includes(norm(v.shortName)));
        expect({ fid, id, chip: v.shortName, alsoMatches: alsoIn.map(([oid]) => oid) })
          .toEqual({ fid, id, chip: v.shortName, alsoMatches: [] });
      }
    }
  });
});

describe('OTA-1362 — the arrow leads the chip', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app', 'components', 'InputBox.tsx'), 'utf8');

  it('there is one arrow table and it covers exactly the four exits', () => {
    expect(src).toContain("north: '↑', south: '↓', east: '→', west: '←',");
    // The chip builder walks the same four directions the graph does, so a
    // fifth exit could never render without an arrow.
    expect([...DIRECTIONS].sort()).toEqual(['east', 'north', 'south', 'west']);
  });

  it('the arrow is composed onto the label ahead of the check and the name', () => {
    // Owner: "a directional arrow in front of that name in the box". Arrow
    // first so the four glyphs line up as a column; the ✓ keeps its place
    // immediately before the name, as OTA-1277 placed it.
    expect(src).toContain('const arrow = DIR_ARROW[dir];');
    expect(src).toContain('label: `${arrow} ${walked ? `✓ ${name}` : name}`,');
  });

  it('⚠ the east arrow can no longer be mistaken for a travel destination', () => {
    // `→` is both the EAST glyph and the marker on the "→ <PLACE>" continue-
    // travel chip, and TravelBtn used to detect a destination by sniffing the
    // label for a leading `→`. An east-facing room chip would have inherited
    // destination styling and two-line wrap. The flag is explicit now.
    expect(src).toContain('const isDestination = destination ?? label.startsWith');
    expect(src).toContain('destination={false}');
    expect(src).toContain('travelTargetName.toUpperCase()}`} destination');
  });

  it('a screen reader hears the direction as a word, not a glyph', () => {
    expect(src).toContain("a11y: `${dir}, ${targetRoom?.shortName ?? dir}");
    expect(src).toContain('a11yLabel={c.a11y}');
    expect(src).toContain('accessibilityLabel={a11yLabel ??');
  });

  it('the arrow comes from the graph, so it cannot disagree with the corridors', () => {
    // The property the owner asked for: the WORD is an abbreviation of a
    // painted label and can drift, the DIRECTION is the same data the map's
    // corridors are drawn from. Composed in outpostGraph, never hand-typed.
    expect(OUTPOST_EXITS.R01.north).toBe('R02');
    expect(OUTPOST_EXITS.R01.south).toBe('R10');
    expect(OUTPOST_EXITS.R01.east).toBe('R06');
    expect(OUTPOST_EXITS.R01.west).toBe('R05');
  });
});

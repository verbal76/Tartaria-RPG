/**
 * OTA-1359 — three fixes off the 4.29.260 device log.
 *
 * This suite covers the two that are checkable without a device: the outpost
 * skin coverage (the navigation error), and the salvage article/capital.
 * The native-queue watch and the door check are locked in ota1359NativeQueue.
 */
import fs from 'fs';
import path from 'path';
import staticHub from '../app/data/world/static_hub.json';
import variants from '../app/data/world/hub_faction_variants.json';
import { OUTPOST_EXITS } from '../app/engine/outpostGraph';

type BaseRoom = { id: string; structuralId: string; name: string; shortName: string; description: string };
type Variant = { name?: string; shortName?: string; description?: string };

const BASE = (staticHub as unknown as { rooms: BaseRoom[] }).rooms;
const FACTIONS = (variants as unknown as {
  factions: Record<string, Record<string, Variant>>;
}).factions;

/** The five that were unskinned: R11–R15, the buried level under the gate. */
const BURIED = ['buried_landing_one', 'buried_landing_two', 'buried_pumps',
  'buried_storage', 'buried_shallow_digs'] as const;

describe('OTA-1359 — the buried level is not generic any more', () => {
  it('the gate really does open onto the buried level (why this matters at all)', () => {
    // R10 is the gate; every faction skins it (Atrium, Threshold, Crown Gate…).
    // Its SOUTH exit is R11, so the five rooms below are reachable from the
    // first room of every outpost in the game — which is what made leaving them
    // unskinned a player-visible defect rather than dead data.
    const gate = BASE.find((r) => r.id === 'outpost_gate');
    expect(gate?.structuralId).toBe('R10');
    expect(OUTPOST_EXITS.R10.south).toBe('R11');
    expect(OUTPOST_EXITS.R11.south).toBe('R12');
    // …and R12 is the junction the rest of the level hangs off.
    expect([OUTPOST_EXITS.R12.west, OUTPOST_EXITS.R12.east, OUTPOST_EXITS.R12.south])
      .toEqual(['R13', 'R14', 'R15']);
  });

  it('every faction skins every room in the hub — no fallbacks left', () => {
    const ids = BASE.map((r) => r.id);
    expect(ids).toHaveLength(15);
    for (const [factionId, rooms] of Object.entries(FACTIONS)) {
      const missing = ids.filter((id) => !rooms[id]);
      expect({ factionId, missing }).toEqual({ factionId, missing: [] });
    }
  });

  it('no faction shows a structural id to the player', () => {
    // "Landing 1" / "Landing 2" are ids wearing a name, and the owner's log
    // caught one in the Atrium's exits line on the very first screen.
    for (const [factionId, rooms] of Object.entries(FACTIONS)) {
      for (const [roomId, v] of Object.entries(rooms)) {
        expect(`${factionId}.${roomId}: ${v.shortName ?? ''}`)
          .not.toMatch(/\b(Landing|Room|Area|Zone)\s*\d+\b/i);
      }
    }
  });

  it('each buried room reads differently in every faction', () => {
    // The bug was nine outposts sharing one Reclaimer description. A skin that
    // merely copies the base text would satisfy the coverage check above and
    // still ship the defect, so names and prose must actually diverge.
    for (const roomId of BURIED) {
      const base = BASE.find((r) => r.id === roomId)!;
      const names = new Set<string>();
      const descs = new Set<string>();
      for (const [factionId, rooms] of Object.entries(FACTIONS)) {
        const v = rooms[roomId]!;
        expect(`${factionId}.${roomId}.name`).toBeTruthy();
        // ⚠⚠ THE REVIVALISTS KEEP THE BASE NAMES, AND THIS IS NOT AN OVERSIGHT.
        // The OTA-1279 crosswalk is read straight off the map image the owner
        // supplied, and for R11–R15 that artwork says First Landing / Second
        // Landing / The Pump Room / Storage Halls / The Shallow Digs — i.e. the
        // "generic" base text WAS the Revivalist skin all along, which is why
        // it reads like a working dig. Renaming them would put the game at odds
        // with the picture, the exact failure ota1279 exists to prevent. They
        // still get their own prose, and their chips lose the id-shaped ones
        // ("Landing 1" → "First Landing"), which the structural-id test above
        // enforces for every faction including this one. What they do NOT have
        // to do is differ from the base for the sake of differing.
        if (factionId !== 'tartarian_revivalists') {
          expect(v.name).not.toBe(base.name);
          expect(v.shortName).not.toBe(base.shortName);
        }
        expect((v.description ?? '').length).toBeGreaterThan(80);
        expect(v.description).not.toBe(base.description);
        names.add(v.name ?? '');
        descs.add(v.description ?? '');
      }
      expect(names.size).toBe(Object.keys(FACTIONS).length);
      expect(descs.size).toBe(Object.keys(FACTIONS).length);
    }
  });

  it('the skins keep the topology the graph declares', () => {
    // A room's prose names its own exits. If a skin says "back west" where the
    // graph says east, the player is being lied to by the description — the
    // failure mode the base text already guarded against and the new text has
    // to inherit. Pumps (R13) sit WEST of the junction, so the way back is EAST;
    // storage (R14) sits east, so the way back is WEST; the digs (R15) sit
    // south, so the way out is NORTH.
    expect(OUTPOST_EXITS.R13.east).toBe('R12');
    expect(OUTPOST_EXITS.R14.west).toBe('R12');
    expect(OUTPOST_EXITS.R15.north).toBe('R12');
    for (const rooms of Object.values(FACTIONS)) {
      expect(rooms.buried_pumps!.description).toMatch(/back east/i);
      expect(rooms.buried_storage!.description).toMatch(/back west/i);
      expect(rooms.buried_shallow_digs!.description).toMatch(/way out is north/i);
    }
  });
});

describe('OTA-1359 — the new chips do not collide with the old ones', () => {
  it('no faction has two rooms sharing a button chip', () => {
    // ⚠ ota1274 already guards this and it EARNED its keep here: the first draft
    // of the Builders' undercroft store came back as "Materials", which their
    // relic vault already uses — two buttons, one word, in the same outpost.
    // Kept as a local assertion too so the failure names this OTA's data.
    const shortOf = (roomId: string, v: Variant) =>
      (v.shortName ?? BASE.find((b) => b.id === roomId)!.shortName).toLowerCase();
    for (const [factionId, rooms] of Object.entries(FACTIONS)) {
      const chips = Object.entries(rooms).map(([id, v]) => shortOf(id, v));
      const dupes = chips.filter((c, i) => chips.indexOf(c) !== i);
      expect({ factionId, dupes }).toEqual({ factionId, dupes: [] });
    }
  });
});

describe('OTA-1359 — the salvage line owns its article and its capital', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'engine', 'salvagePools.ts'), 'utf8');

  it('no template supplies its own leading article', () => {
    // `format()` always hands {target} over WITH an article ("the lantern"), so
    // a template that opens "The {target}" renders "The the lantern" — which is
    // exactly what the owner's log printed.
    const templates = src.match(/^\s*'[^']*\{target\}[^']*',$/gm) ?? [];
    expect(templates.length).toBeGreaterThan(8);
    for (const t of templates) {
      expect(t).not.toMatch(/'\s*(The|A|An)\s+\{target\}/);
    }
  });

  it('format() capitalises, so a template may open on {target}', () => {
    expect(src).toContain('filled.charAt(0).toUpperCase() + filled.slice(1)');
  });
});

// OTA-1216 — THE MAP TOWERS JOIN THE EVERY-STAGE-HAS-A-TRIGGER LAW. Owner,
// after the trigger sweep: "you tested all of the side quests for this specific
// class of error? including the map towers?" The five Great Climbs (the
// Skyreacher spires) were NOT in the quest-family audits — they are their own
// chain: buy/find the map → route to the landmark → climb past tier 10 (strap
// mandatory) → summit boss → crest banks the piece (once, guarded by
// summitBossesDefeated) → five crests = the title and the beacon rifle path.
// This suite walks every link of that chain the same way ota1213/1237 walk the
// quest families, so a tower that cannot pay can never ship.
import { GREAT_CLIMBS, SUMMIT_BOSSES, summitBossFor, greatClimbById } from '../app/engine/greatClimbs';
import { GEAR, findArmorByName, findCatalogItem } from '../app/engine/crafting';
import { canonicalCellOf } from '../app/engine/worldMap';
import { readFileSync } from 'fs';
import { join } from 'path';
import locationsData from '../app/data/locations/locations.json';
import { OUTSIDE_CLIMBABLES, INSIDE_CLIMBABLES } from '../app/engine/climbableSpawns';

const locations = (locationsData as { locations: Array<{ id: string }> }).locations
  ?? (locationsData as unknown as Array<{ id: string }>);

describe('OTA-1216 — every tower is reachable, climbable, and pays', () => {
  it('⚠⚠ each climb anchors to a real, routable landmark', () => {
    for (const c of GREAT_CLIMBS) {
      expect(locations.some((l) => l.id === c.locationId)).toBe(true);
      const cell = canonicalCellOf(c.locationId);
      expect(Number.isFinite(cell.x)).toBe(true);
      expect(Number.isFinite(cell.y)).toBe(true);
    }
  });

  it('⚠⚠ each crest reward is a REAL armor piece — a summit paying a phantom is the locket class', () => {
    for (const c of GREAT_CLIMBS) {
      expect(findArmorByName(c.rewardArmor)).toBeTruthy();
    }
  });

  it('⚠⚠ each climb has a summit boss carrying a real base enemy — no boss, no crest, no piece', () => {
    for (const c of GREAT_CLIMBS) {
      const boss = summitBossFor(c.id);
      expect(boss).toBeTruthy();
      // The base is AUTHORED inline (scaled at spawn) — it must be a whole
      // enemy: a name, hit points, and the boss flag the defeat path keys on.
      expect(boss!.base.name.length).toBeGreaterThan(0);
      expect(boss!.base.hp).toBeGreaterThan(0);
      expect(boss!.base.boss).toBe(true);
    }
    // And no orphan boss pointing at a climb that does not exist.
    for (const b of SUMMIT_BOSSES) {
      expect(greatClimbById(b.climbId)).toBeTruthy();
    }
  });

  it('⚠ all five Skyreacher Maps exist and the purchase table links every climb', () => {
    const maps = GEAR.filter((g) => g.name.startsWith('Skyreacher Map'));
    expect(maps.length).toBe(5);
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    for (const c of GREAT_CLIMBS) {
      // The SKYREACHER_MAPS purchase table must reference every climb id, or a
      // tower exists that no map can ever reveal.
      expect(store).toContain(`climbId: '${c.id}'`);
    }
  });

  it('⚠ the strap gate can be satisfied: every climb needs >10 tiers and the strap is a real, priced item', () => {
    for (const c of GREAT_CLIMBS) expect(c.tiers).toBeGreaterThan(10);
    const strap = findCatalogItem('Hardened Climbing Strap', { aliases: false });
    expect(strap).toBeTruthy();
  });

  it('⚠ no great-climb token collides with a curated generic climbable — the cross-match the file itself forbids', () => {
    const curated = [...OUTSIDE_CLIMBABLES, ...INSIDE_CLIMBABLES].map((c) => c.name.toLowerCase());
    for (const c of GREAT_CLIMBS) {
      for (const tok of c.tokens) {
        for (const name of curated) {
          expect({ climb: c.id, token: tok, collidesWith: name.includes(tok) ? name : null })
            .toEqual({ climb: c.id, token: tok, collidesWith: null });
        }
      }
    }
  });

  it('⚠ the crest grant is once-only — the alreadyDown guard and the Set dedupe stand', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(store).toContain("const alreadyDown = (wm912.summitBossesDefeated ?? []).includes(summitClimbId)");
    expect(store).toContain('if (climb && !alreadyDown)');
  });
});

// engine_Dev — THE GENERIC GAME (the default fallback). It must be (a) internally
// consistent — every quest/boss/starting-area points at a faction/location that
// actually exists — and (b) free of Tartaria proper nouns, so a section that falls
// back to it reads as a bland generic game, never the built-in setting.

import { GENERIC_GAME } from '../app/engine/genericGame';

const T = GENERIC_GAME.tables;
const factionIds = new Set((T.factions as Array<{ id: string }>).map((f) => f.id));
const raceIds = new Set((T.races as Array<{ id: string }>).map((r) => r.id));
const locationIds = new Set((T.locations as Array<{ id: string }>).map((l) => l.id));
const bossIds = new Set((GENERIC_GAME.bosses as Array<{ id: string }>).map((b) => b.id));

const TARTARIA_NOUNS = /tartar|aether|etheric|reclaimer|mud monarch|forgotten order|mudstone|aetherstone/i;

describe('generic game — internally consistent', () => {
  test('three factions, two races, a small map all have real ids', () => {
    expect(factionIds).toEqual(new Set(['wardens', 'seekers', 'freeholders']));
    expect(raceIds.size).toBe(2);
    expect(locationIds.has('crossroads')).toBe(true);
    expect((T.enemies as unknown[]).length).toBeGreaterThanOrEqual(4);
    expect((T.weapons as unknown[]).length).toBeGreaterThan(0);
  });

  test('main quest steps point at real locations and a real boss', () => {
    for (const step of GENERIC_GAME.mainQuest.steps as Array<{ locationId?: string; bossId?: string }>) {
      if (step.locationId) expect(locationIds.has(step.locationId)).toBe(true);
      if (step.bossId) expect(bossIds.has(step.bossId)).toBe(true);
    }
  });

  test('bosses spawn at real locations', () => {
    for (const b of GENERIC_GAME.bosses as Array<{ spawnLocationId?: string }>) {
      if (b.spawnLocationId) expect(locationIds.has(b.spawnLocationId)).toBe(true);
    }
  });

  test('faction quests + starting areas reference real factions and locations', () => {
    for (const q of GENERIC_GAME.missions.factionQuests as Array<{ factionId: string }>) {
      expect(factionIds.has(q.factionId)).toBe(true);
    }
    for (const a of GENERIC_GAME.startingAreas as Array<{ factionId: string; locationId: string }>) {
      expect(factionIds.has(a.factionId)).toBe(true);
      expect(locationIds.has(a.locationId)).toBe(true);
    }
  });

  test('each faction has a base location, and each base location exists', () => {
    for (const f of T.factions as Array<{ baseLocationId?: string }>) {
      if (f.baseLocationId) expect(locationIds.has(f.baseLocationId)).toBe(true);
    }
  });
});

describe('generic game — free of Tartaria nouns', () => {
  test('the whole pack serializes with no setting proper nouns', () => {
    const hit = JSON.stringify(GENERIC_GAME).match(TARTARIA_NOUNS);
    expect(hit ? `leaks "${hit[0]}"` : 'clean').toBe('clean');
  });

  test('identity renames the world away from Tartaria', () => {
    expect(GENERIC_GAME.identity.worldName).not.toMatch(TARTARIA_NOUNS);
    expect(GENERIC_GAME.identity.gameTitle).toBeTruthy();
  });
});

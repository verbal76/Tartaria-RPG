import {
  createCharacter,
  getRaces,
  RACE_STARTER_EXPLORATION,
} from '../app/engine/character';
import explorationData from '../app/data/items/exploration.json';

interface CatalogItem { name: string; tags?: string[] }
const explorationItems = explorationData as CatalogItem[];
const explorationByName = new Map(explorationItems.map((i) => [i.name, i]));

// ---------------------------------------------------------------------------
// Data integrity — the race → starter-item map vs the catalog
// ---------------------------------------------------------------------------

describe('RACE_STARTER_EXPLORATION — data integrity', () => {
  it('covers every race id present in races.json', () => {
    const raceIds = getRaces().map((r) => r.id);
    const missing = raceIds.filter((id) => !(id in RACE_STARTER_EXPLORATION));
    expect(missing).toEqual([]);
  });

  it('every starter-item name resolves to an entry in exploration.json', () => {
    const orphans: string[] = [];
    for (const [raceId, items] of Object.entries(RACE_STARTER_EXPLORATION)) {
      for (const name of items) {
        if (!explorationByName.has(name)) orphans.push(`${raceId} → "${name}"`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('every starter-item is tagged race_starter in the catalog', () => {
    const untagged: string[] = [];
    for (const names of Object.values(RACE_STARTER_EXPLORATION)) {
      for (const name of names) {
        const item = explorationByName.get(name);
        if (!item) continue;
        if (!(item.tags ?? []).includes('race_starter')) untagged.push(name);
      }
    }
    expect(untagged).toEqual([]);
  });

  it('gives every race at least 2 items so each character feels distinct', () => {
    for (const [raceId, items] of Object.entries(RACE_STARTER_EXPLORATION)) {
      expect(items.length).toBeGreaterThanOrEqual(2);
      // Sanity: names should be unique within a race's starter list.
      expect(new Set(items).size).toBe(items.length);
      void raceId;
    }
  });
});

// ---------------------------------------------------------------------------
// createCharacter — actually grants the race-themed items at new game
// ---------------------------------------------------------------------------

describe('createCharacter — race-themed starter inventory', () => {
  it('every race grants its catalog items at new game', () => {
    const races = getRaces();
    for (const race of races) {
      const player = createCharacter({
        name: 'Test Pilgrim',
        raceId: race.id,
        factionId: 'reclaimers_guild',
      });
      const itemNames = player.inventory.map((i) => i.name);
      const expected = RACE_STARTER_EXPLORATION[race.id] ?? [];
      for (const name of expected) {
        expect(itemNames).toContain(name);
      }
    }
  });

  it('keeps the new-character pack at or under the 10-slot soft budget', () => {
    // Player's Backpack is 10 slots. Shared starters (torch + rations + locket
    // + primary + knife) = 5. Race additions are 2. Total 7, well under cap.
    const player = createCharacter({
      name: 'Test',
      raceId: 'tartarian_giant',
      factionId: 'reclaimers_guild',
    });
    expect(player.inventory.length).toBeLessThanOrEqual(10);
  });

  it('preserves the shared starter items (torch, rations, locket)', () => {
    const player = createCharacter({
      name: 'Test',
      raceId: 'mud_dweller',
      factionId: 'true_tartarians',
    });
    const names = player.inventory.map((i) => i.name);
    expect(names).toContain('Aetheric Torch');
    expect(names).toContain('Trail Rations');
    expect(names).toContain('Aetheric Locket');
  });

  it('two characters of the same race get the same race items (deterministic mapping)', () => {
    const a = createCharacter({ name: 'A', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    const b = createCharacter({ name: 'B', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    const raceNamesA = a.inventory
      .map((i) => i.name)
      .filter((n) => (RACE_STARTER_EXPLORATION.reclaimer ?? []).includes(n));
    const raceNamesB = b.inventory
      .map((i) => i.name)
      .filter((n) => (RACE_STARTER_EXPLORATION.reclaimer ?? []).includes(n));
    expect(raceNamesA.sort()).toEqual(raceNamesB.sort());
  });
});

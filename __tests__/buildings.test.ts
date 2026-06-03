import {
  BUILDINGS,
  buildingIds,
  getBuilding,
  buildingEntryRoom,
  visibleBuildingRooms,
  secretRoomRevealedBy,
  resolveBuildingRoom,
  buildingForTile,
  BUILDING_TILE_CHANCE,
} from '../app/engine/buildings';

describe('arb36 — buildingForTile (organic discovery)', () => {
  it('is deterministic: same tile → same result every call', () => {
    for (let i = 0; i < 50; i++) {
      const a = buildingForTile('outskirts', i, i * 2);
      const b = buildingForTile('outskirts', i, i * 2);
      expect(a).toBe(b);
    }
  });

  it('only ever returns a real building id or null', () => {
    const ids = new Set(buildingIds());
    for (let x = -40; x <= 40; x++) {
      for (let y = -20; y <= 20; y++) {
        const r = buildingForTile('outskirts', x, y);
        if (r !== null) expect(ids.has(r)).toBe(true);
      }
    }
  });

  it('populates roughly BUILDING_TILE_CHANCE% of tiles (not all, not none)', () => {
    let hits = 0;
    let total = 0;
    for (let x = -50; x <= 50; x++) {
      for (let y = -25; y <= 25; y++) {
        total++;
        if (buildingForTile('mud_seas', x, y)) hits++;
      }
    }
    const pct = (hits / total) * 100;
    // Wide tolerance around the configured rate — just proving it's a
    // sparse scatter, not "every tile" or "never".
    expect(pct).toBeGreaterThan(BUILDING_TILE_CHANCE - 6);
    expect(pct).toBeLessThan(BUILDING_TILE_CHANCE + 6);
  });

  it('differs across locations for the same coordinates', () => {
    let differences = 0;
    for (let i = 0; i < 60; i++) {
      if (buildingForTile('outskirts', i, 0) !== buildingForTile('mud_seas', i, 0)) {
        differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });
});

describe('building templates', () => {
  it('has the five starter templates', () => {
    expect(buildingIds().sort()).toEqual(
      ['flooded_house', 'market', 'outpost', 'shack', 'shed'].sort(),
    );
  });

  it('every template has a valid entry room', () => {
    for (const id of buildingIds()) {
      const entry = buildingEntryRoom(id);
      expect(entry).not.toBeNull();
      // entry room must be one of the building's rooms and never secret
      const b = getBuilding(id)!;
      expect(b.rooms.some((r) => r.id === entry!.id)).toBe(true);
      expect(entry!.secret).toBeFalsy();
    }
  });

  it('shows at most 4 rooms on the nav row (so the row + EXIT = 5 fits)', () => {
    const none = new Set<string>();
    for (const id of buildingIds()) {
      expect(visibleBuildingRooms(id, none).length).toBeLessThanOrEqual(4);
    }
  });

  it('room shortNames are unique within a building', () => {
    for (const id of buildingIds()) {
      const shorts = getBuilding(id)!.rooms.map((r) => r.shortName.toLowerCase());
      expect(new Set(shorts).size).toBe(shorts.length);
    }
  });

  it('flooded house = kitchen / attic / bedroom / study', () => {
    const rooms = BUILDINGS.flooded_house!.rooms.map((r) => r.shortName);
    expect(rooms).toEqual(['Kitchen', 'Attic', 'Bedroom', 'Study']);
  });

  it('outpost = hall / armory / cellar / vault', () => {
    const rooms = BUILDINGS.outpost!.rooms.map((r) => r.shortName);
    expect(rooms).toEqual(['Hall', 'Armory', 'Cellar', 'Vault']);
  });

  it('shack = den / bedroom / storage (three rooms)', () => {
    const rooms = BUILDINGS.shack!.rooms.map((r) => r.shortName);
    expect(rooms).toEqual(['Den', 'Bedroom', 'Storage']);
  });

  describe('shed hidden cellar', () => {
    it('shows only the shed until the cellar is revealed', () => {
      const none = new Set<string>();
      const visible = visibleBuildingRooms('shed', none);
      expect(visible.map((r) => r.id)).toEqual(['shed']);
    });

    it('investigating the floorboards reveals the cellar', () => {
      expect(secretRoomRevealedBy('shed', 'investigate the floorboards')).toBe('cellar');
      expect(secretRoomRevealedBy('shed', 'floorboards')).toBe('cellar');
      // an unrelated noun reveals nothing
      expect(secretRoomRevealedBy('shed', 'workbench')).toBeNull();
    });

    it('once revealed, the cellar joins the nav row', () => {
      const revealed = new Set<string>(['cellar']);
      const visible = visibleBuildingRooms('shed', revealed);
      expect(visible.map((r) => r.id)).toEqual(['shed', 'cellar']);
    });
  });

  describe('market stalls', () => {
    it('has four categorised stalls', () => {
      const cats = BUILDINGS.market!.rooms.map((r) => r.stallCategory);
      expect(cats).toEqual(['weapons', 'armor', 'food', 'materials']);
    });
  });

  it('resolveBuildingRoom matches by short name / id', () => {
    const none = new Set<string>();
    expect(resolveBuildingRoom('flooded_house', none, 'go to the attic')).toBe('attic');
    expect(resolveBuildingRoom('outpost', none, 'vault')).toBe('vault');
    // a secret room can't be resolved before it's revealed
    expect(resolveBuildingRoom('shed', none, 'cellar')).toBeNull();
    expect(resolveBuildingRoom('shed', new Set(['cellar']), 'cellar')).toBe('cellar');
  });
});

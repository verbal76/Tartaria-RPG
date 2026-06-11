// OTA-500 — dynamically-mentioned places (whispers/contracts/missions) become
// install-canon: registered + persisted in worldMemory, then plotted on the grid
// and routable with exact grid-to-grid distance, like a static location.

import { registerCanonLocation, emptyMemory } from '../app/engine/worldMemory';
import {
  setCanonExtraLocations,
  allKnownLocations,
  canonicalPositions,
  canonicalDistance,
  generateWorldMap,
} from '../app/engine/worldMap';

afterEach(() => setCanonExtraLocations([])); // reset module state between tests

describe('OTA-500 — canon-location registry', () => {
  it('registerCanonLocation persists + is idempotent', () => {
    let wm = emptyMemory();
    wm = registerCanonLocation(wm, { id: 'whisper_yulka', name: 'Yulka', source: 'whisper' });
    expect(wm.canonLocations).toEqual([{ id: 'whisper_yulka', name: 'Yulka', source: 'whisper' }]);
    const same = registerCanonLocation(wm, { id: 'whisper_yulka', name: 'Yulka', source: 'whisper' });
    expect(same).toBe(wm); // no churn when nothing new
  });

  it('enriches an existing entry with later detail', () => {
    let wm = emptyMemory();
    wm = registerCanonLocation(wm, { id: 'x', name: 'X' });
    wm = registerCanonLocation(wm, { id: 'x', name: 'X', danger: 4, type: 'ruin' });
    expect(wm.canonLocations![0]).toMatchObject({ id: 'x', danger: 4, type: 'ruin' });
  });
});

describe('OTA-500 — canon location is plotted + has exact distance', () => {
  it('appears on the canonical grid + the visual map + gets an integer distance', () => {
    setCanonExtraLocations([{ id: 'whisper_yulka', name: 'Yulka' }]);

    expect(allKnownLocations().some((l) => l.id === 'whisper_yulka')).toBe(true);
    expect(canonicalPositions().whisper_yulka).toBeDefined();
    // routable: it lands on the re-centered visual map too (so travel can step to it)
    expect(generateWorldMap('seed', 'pilgrim_waycamp').positions.whisper_yulka).toBeDefined();

    const d = canonicalDistance('pilgrim_waycamp', 'whisper_yulka');
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
    // distance is symmetric + player-independent, like any canon location
    expect(canonicalDistance('whisper_yulka', 'pilgrim_waycamp')).toBe(d);
  });

  it('never shadows / duplicates a static location id', () => {
    setCanonExtraLocations([{ id: 'pilgrim_waycamp', name: 'dup' }]);
    expect(allKnownLocations().filter((l) => l.id === 'pilgrim_waycamp')).toHaveLength(1);
  });
});

// OTA-500 — dynamically-mentioned places (whispers/contracts/missions) become
// install-canon: registered + persisted in worldMemory, then plotted on the grid
// and routable with exact grid-to-grid distance, like a static location.

import { registerCanonLocation, setCanonLocationMarker, emptyMemory } from '../app/engine/worldMemory';
import {
  setCanonExtraLocations,
  allKnownLocations,
  canonicalPositions,
  canonicalDistance,
  canonicalCellFor,
  generateWorldMap,
} from '../app/engine/worldMap';
import { getLocationById } from '../app/engine/encounter';

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

describe('OTA-502 — explicit cell + resolution everywhere', () => {
  it('a place born at a known spot is pinned to its EXACT cell (whisper target)', () => {
    setCanonExtraLocations([{ id: 'mention_yulkas_fire', name: "Yulka's fire", gx: 50, gy: 18 }]);
    expect(canonicalCellFor('mention_yulkas_fire')).toEqual({ x: 50, y: 18 });
    expect(canonicalPositions().mention_yulkas_fire).toEqual({ x: 50, y: 18 });
    // distance is the exact grid math to that pinned cell
    const cur = canonicalPositions().pilgrim_waycamp!;
    expect(canonicalDistance('pilgrim_waycamp', 'mention_yulkas_fire'))
      .toBe(Math.abs(cur.x - 50) + Math.abs(cur.y - 18));
  });

  it('getLocationById resolves a canonized place to its real name (not a fallback)', () => {
    setCanonExtraLocations([{ id: 'mention_yulkas_fire', name: "Yulka's fire" }]);
    expect(getLocationById('mention_yulkas_fire').name).toBe("Yulka's fire");
    // an unknown id still falls back to a real static location (never crashes)
    expect(getLocationById('not_a_place_xyz').name).toBeTruthy();
  });
});

describe('OTA-503 — grid-event lifecycle (pending → done by route id)', () => {
  it('a whisper objective registers as a PENDING event', () => {
    let wm = emptyMemory();
    wm = registerCanonLocation(wm, { id: 'mention_452', name: 'gun guy', source: 'whisper', marker: 'pending' });
    expect(wm.canonLocations![0]!.marker).toBe('pending');
  });

  it('arriving via that id resolves it to DONE; register never downgrades a done event', () => {
    let wm = emptyMemory();
    wm = registerCanonLocation(wm, { id: 'mention_452', name: 'gun guy', marker: 'pending' });
    // arrival (travelTo) calls this:
    wm = setCanonLocationMarker(wm, 'mention_452', 'done');
    expect(wm.canonLocations![0]!.marker).toBe('done');
    // a later re-mention (register) must NOT knock it back to pending
    wm = registerCanonLocation(wm, { id: 'mention_452', name: 'gun guy', marker: 'pending' });
    expect(wm.canonLocations![0]!.marker).toBe('done');
  });

  it('two events can share a cell; resolving one leaves the other pending', () => {
    let wm = emptyMemory();
    // market (a plain place) + gun-guy (a pending event) at the same cell (50,18)
    wm = registerCanonLocation(wm, { id: 'mkt', name: 'Market', gx: 50, gy: 18 });
    wm = registerCanonLocation(wm, { id: 'mention_452', name: 'gun guy', gx: 50, gy: 18, marker: 'pending' });
    // route to the gun-guy id → only it resolves
    wm = setCanonLocationMarker(wm, 'mention_452', 'done');
    expect(wm.canonLocations!.find((l) => l.id === 'mention_452')!.marker).toBe('done');
    expect(wm.canonLocations!.find((l) => l.id === 'mkt')!.marker).toBeUndefined();
  });
});

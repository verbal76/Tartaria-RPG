// OTA-681 — the store's parley-verb intercept used to fire whenever the player
// stood on the parley_ground TILE, regardless of context. Its verb list
// (approach / examine / meet / …) overlaps combat verbs, so a playtester who got
// jumped by a wandering Aetheric Raven while a broker mission was active found
// every "approach Aetheric Raven" swallowed and re-printed as the mission
// reminder — five times, the fight un-winnable. Same trap for walking into a
// shed that happens to sit on the tile. parleyInterceptEligible now gates the
// intercept to: on-tile + challenge-live + not-labyrinth + NOT in a building +
// NO live enemies. These lock that gate in.

import { parleyInterceptEligible } from '../app/engine/broker';

const base = {
  labyrinthRun: false,
  insideBuilding: false,
  enemyCount: 0,
  currentLocationId: 'parley_ground',
  challengeOn: true,
};

describe('parleyInterceptEligible (OTA-681)', () => {
  it('fires on the open parley flats, out of combat', () => {
    expect(parleyInterceptEligible(base)).toBe(true);
  });

  it('does NOT fire while an enemy is live (combat "approach" must win)', () => {
    expect(parleyInterceptEligible({ ...base, enemyCount: 1 })).toBe(false);
  });

  it('does NOT fire inside a building on the tile (not at the stone)', () => {
    expect(parleyInterceptEligible({ ...base, insideBuilding: true })).toBe(false);
  });

  it('does NOT fire during a labyrinth run', () => {
    expect(parleyInterceptEligible({ ...base, labyrinthRun: true })).toBe(false);
  });

  it('does NOT fire off the parley tile', () => {
    expect(parleyInterceptEligible({ ...base, currentLocationId: 'outskirts' })).toBe(false);
  });

  it('does NOT fire when the challenge is off', () => {
    expect(parleyInterceptEligible({ ...base, challengeOn: false })).toBe(false);
  });

  it('the reported repro — enemy present in a cellar on the tile — is fully gated', () => {
    // Shed · Cellar (The Parley Ground) with an Aetheric Raven: both guards trip.
    expect(parleyInterceptEligible({ ...base, insideBuilding: true, enemyCount: 1 })).toBe(false);
  });
});

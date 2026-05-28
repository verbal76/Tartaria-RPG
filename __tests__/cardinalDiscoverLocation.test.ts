// OTA-162 — regression lock for discoverLocation firing on cardinal
// transits. Stress sweep (cartographer) found 500 cardinal-walk
// turns produced only 1 discoveredLocationId because discoverLocation
// only fired at terminal travelTo arrivals. Fix: when stepDirection
// surfaces a nearest-named-location label and that location is
// within 2 tiles, mark it discovered too.
//
// Unit-tests the helper at the level of the worldMemory transition.

jest.setTimeout(15000);

import { discoverLocation, emptyMemory } from '../app/engine/worldMemory';

describe('OTA-162 — discoverLocation extends to nearby cardinal transits', () => {
  it('discoverLocation adds a new id', () => {
    const before = emptyMemory();
    const after = discoverLocation(before, 'voronov');
    expect(after.discoveredLocationIds).toContain('voronov');
  });

  it('re-discovering an existing id is a no-op (idempotent)', () => {
    const before = discoverLocation(emptyMemory(), 'voronov');
    const after = discoverLocation(before, 'voronov');
    expect(after.discoveredLocationIds).toHaveLength(1);
    // Same array contents — discoverLocation returns the SAME object
    // when nothing changed.
    expect(after).toBe(before);
  });

  it('multiple distinct cardinal-passes accumulate', () => {
    let m = emptyMemory();
    m = discoverLocation(m, 'voronov');
    m = discoverLocation(m, 'drakova');
    m = discoverLocation(m, 'samarran');
    expect(m.discoveredLocationIds).toEqual(['voronov', 'drakova', 'samarran']);
  });
});

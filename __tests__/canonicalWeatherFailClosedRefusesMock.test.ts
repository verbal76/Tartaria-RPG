// Phase 3B, Part 2 — production weather fail-closed host, REFUSAL branch.
//
// Proves assertProductionWeatherActive() (test-utils/canonical/hostProfile.ts)
// DOES throw when handed the jest.setup.js Eerie Calm mock (the DEFAULT
// state for any test file that does not explicitly unmock
// app/engine/encounter) — i.e. a canonical host file that forgot the
// jest.unmock() call would be refused at boot, not silently run under the
// wrong weather system. Deliberately does NOT unmock in this file, so
// `pickWeather` below is the mock.
//
// Run focused: see the governed command in the Phase 3B final report.

import { pickWeather } from '../app/engine/encounter';
import { assertProductionWeatherActive } from '../test-utils/canonical/hostProfile';
import { emptyMemory } from '../app/engine/worldMemory';

describe('Phase 3B — production weather fail-closed host (REFUSAL branch)', () => {
  it('throws when pickWeather is still the jest.setup.js mock (source: test-harness)', () => {
    expect(() => assertProductionWeatherActive(pickWeather)).toThrow(/CANONICAL HOST PROFILE VIOLATION/);
    expect(() => assertProductionWeatherActive(pickWeather)).toThrow(/production weather/i);
  });

  it('the mock really is what is active here (sanity check on the negative control itself)', () => {
    const memory = emptyMemory();
    const w = pickWeather(memory);
    expect(w.source).toBe('test-harness');
    expect(w.name).toBe('Eerie Calm');
  });
});

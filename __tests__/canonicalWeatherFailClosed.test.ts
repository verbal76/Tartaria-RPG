// Phase 3B, Part 2 — production weather fail-closed host, PASS branch.
//
// Proves assertProductionWeatherActive() (test-utils/canonical/hostProfile.ts)
// does NOT throw when the real, unmocked pickWeather() is passed to it — the
// canonical host's own boot sequence would proceed past this assertion here.
//
// Run focused: see the governed command in the Phase 3B final report.

jest.unmock('../app/engine/encounter');

import { pickWeather } from '../app/engine/encounter';
import { assertProductionWeatherActive } from '../test-utils/canonical/hostProfile';

describe('Phase 3B — production weather fail-closed host (PASS branch)', () => {
  it('does not throw for the real, unmocked pickWeather()', () => {
    expect(() => assertProductionWeatherActive(pickWeather)).not.toThrow();
  });

  it('reports real catalog sources (manual/bible) and real id variety', () => {
    const result = assertProductionWeatherActive(pickWeather, 30);
    expect(result.sampledSources.every((s) => s === 'manual' || s === 'bible')).toBe(true);
    expect(new Set(result.sampledIds).size).toBeGreaterThan(1);
  });
});

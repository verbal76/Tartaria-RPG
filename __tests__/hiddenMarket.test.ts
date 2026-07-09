// OTA-498 — the Hidden Market: a static map location with no painted atlas icon,
// shown as a "?" on the map + travel list until the player travels there, then
// revealed. Hosts the 4-stall market building. These tests cover the reveal
// helper + the location/atlas data wiring.

import {
  revealedLocationName,
  isLocationRevealed,
  isHiddenLocation,
  HIDDEN_LOCATIONS,
} from '../app/engine/hiddenLocations';
import { isHubLocation } from '../app/engine/hub';
import locationsData from '../app/data/locations/locations.json';

describe('OTA-498 — Hidden Market reveal helper', () => {
  it('reads as "?" until discovered, then the real name', () => {
    expect(revealedLocationName('hidden_market', 'The Hidden Market', [])).toBe('?');
    expect(revealedLocationName('hidden_market', 'The Hidden Market', ['hidden_market']))
      .toBe('The Hidden Market');
  });

  it('ordinary locations are always revealed (real name, no "?")', () => {
    expect(isHiddenLocation('buried_cities')).toBe(false);
    expect(isLocationRevealed('buried_cities', [])).toBe(true);
    expect(revealedLocationName('buried_cities', 'The Buried Cities', [])).toBe('The Buried Cities');
  });

  it('the Hidden Market is a hidden location, undiscovered by default', () => {
    expect(isHiddenLocation('hidden_market')).toBe(true);
    expect(isLocationRevealed('hidden_market', undefined)).toBe(false);
    expect(isLocationRevealed('hidden_market', ['somewhere_else'])).toBe(false);
    expect(HIDDEN_LOCATIONS.hidden_market!.placeholder).toBe('?');
  });
});

describe('OTA-498 — Hidden Market location + atlas data', () => {
  const locs = (locationsData as { id: string; name: string; type: string; tags: string[] }[]);
  const hm = locs.find((l) => l.id === 'hidden_market');

  it('exists in locations.json with a market/middens identity', () => {
    expect(hm).toBeDefined();
    expect(hm!.name).toBe('The Hidden Market');
    expect(hm!.tags).toEqual(expect.arrayContaining(['market', 'sunken_middens', 'hidden']));
  });

  it('is plotted on the atlas right-of-centre on the Sunken Middens ring', () => {
    const c = HIDDEN_LOCATIONS.hidden_market!;
    expect(c).toBeDefined();
    // right of the frontier camps (pilgrim 0.32 / survey 0.41), below them,
    // above the Silt Wastes capitals (~0.42).
    expect(c.fx).toBeGreaterThan(0.41);
    expect(c.fy).toBeGreaterThan(0.09);
    expect(c.fy).toBeLessThan(0.42);
  });

  // OTA-743 — the market must be PEACEFUL (a neutral truce) so encounters never
  // spawn there and the market building never gets suppressed. It is NOT a
  // faction hub, so beginScene's hub check didn't cover it — the 'market' tag is
  // what suppressEncounter / the investigate-ambush guard key on. Pin both.
  it('is a market-tagged location but NOT a faction hub (so the tag guard is required)', () => {
    expect(hm!.tags).toEqual(expect.arrayContaining(['market', 'neutral']));
    expect(isHubLocation('hidden_market')).toBe(false);
  });
});

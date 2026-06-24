// engine_Dev — the generic game's HUB must render (mission board + anchor vendor) and the
// generic game must supply its OWN vendors. Regression for the audit findings: the hub
// runtime ignored generic-default starting areas (no hub interior → no board, no vendor),
// and GENERIC_GAME had no vendors (fell back to Tartaria traders). Also locks the stray
// "West" exit removal (the yard's `world` compass exit, redundant with the EXIT button).

import {
  installGenericDefaults,
  clearGenericDefaults,
  startingAreaForFaction,
  startingAreaAtLocation,
  getGenericVendors,
} from '../app/engine/contentPack';
import { GENERIC_GAME } from '../app/engine/genericGame';
import { getActiveVendors } from '../app/engine/vendors';

describe('engine_Dev — generic game hub + vendors', () => {
  beforeEach(() => installGenericDefaults(GENERIC_GAME));
  afterEach(() => clearGenericDefaults());

  it('FIX #1: the hub resolves for a generic faction (was override-only → empty hub)', () => {
    const area = startingAreaForFaction('wardens');
    expect(area).toBeTruthy();
    // it is found by its placement location too (drives isHubLocation)
    expect(startingAreaAtLocation('warden_hold')?.factionId).toBe('wardens');
    // a room flags the mission board
    expect(area!.rooms.some((r) => (r as { missionBoard?: boolean }).missionBoard === true)).toBe(true);
    // a room anchors a vendor NPC
    expect(area!.rooms.some((r) => !!(r as { anchorNpc?: string }).anchorNpc)).toBe(true);
  });

  it('the stray "West" is gone: the yard has no compass exit to the world map', () => {
    const yard = startingAreaForFaction('wardens')!.rooms.find((r) => (r as { id: string }).id === 'yard') as { exits: Record<string, string | null> };
    expect(Object.values(yard.exits)).not.toContain('world');
  });

  it('FIX #2: the generic game supplies its own vendors (no Tartaria fallback)', () => {
    expect(getGenericVendors()).toBeTruthy();
    const names = getActiveVendors().map((v) => v.name);
    expect(names).toContain('Quartermaster Vael');   // the hub anchor
    expect(names).not.toContain('Tellin Mak');        // a built-in Tartaria vendor
  });

  it('the anchor NPC name matches a real generic vendor template', () => {
    const area = startingAreaForFaction('wardens')!;
    const anchors = area.rooms.map((r) => (r as { anchorNpc?: string }).anchorNpc).filter(Boolean) as string[];
    const vendorNames = new Set(getActiveVendors().map((v) => v.name));
    for (const a of anchors) expect(vendorNames.has(a)).toBe(true);
  });

  it('clearing the generic pack falls back to the built-in vendor pool', () => {
    clearGenericDefaults();
    expect(getGenericVendors()).toBeNull();
    expect(getActiveVendors().some((v) => v.name === 'Tellin Mak')).toBe(true);
  });
});

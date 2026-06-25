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
  getGenericWasteland,
  resolveTable,
  getWorldTone,
  getWorldSetting,
  hasWorldLore,
  setLoreOverride,
  DEFAULT_WORLD_TONE,
} from '../app/engine/contentPack';
import { GENERIC_GAME } from '../app/engine/genericGame';
import { getActiveVendors } from '../app/engine/vendors';
import { GENERIC_TABLE_ROWS } from '../app/engine/genericTemplateData';

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
    // engine_Dev — the generic vendor pool is now the five data-driven storefront vendors,
    // stocked live from the loaded catalogs. The hub anchor resolves to "the Quartermaster".
    expect(names).toContain('Quartermaster');         // the hub anchor (data-driven storefront)
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

  it('generic LORE document resolves (no Tartaria canon) with an `always` block', () => {
    const lore = resolveTable('lore') as Array<{ tags?: string[]; text?: string }>;
    expect(Array.isArray(lore)).toBe(true);
    expect(lore.length).toBeGreaterThan(0);
    expect(lore.some((b) => Array.isArray(b.tags) && b.tags.includes('always'))).toBe(true);
    expect(JSON.stringify(lore)).not.toMatch(/tartar|aether/i);
  });

  it('generic WASTELAND encounters are installed (no Tartaria archetypes leak)', () => {
    const w = getGenericWasteland();
    expect(w).toBeTruthy();
    expect(Object.keys(w!).length).toBeGreaterThan(0);
    expect(JSON.stringify(w)).not.toMatch(/tartar|aether/i);
  });

  it("the generic Cleansing Tonic recipe's ingredients all exist as generic materials", () => {
    const mats = new Set(GENERIC_TABLE_ROWS.materials.map((m) => (m as { name: string }).name));
    const tonic = GENERIC_TABLE_ROWS.recipes.find((r) => (r as { result: string }).result === 'Cleansing Tonic') as { ingredients: { name: string }[] };
    expect(tonic).toBeTruthy();
    for (const ing of tonic.ingredients) expect(mats.has(ing.name)).toBe(true);
  });

  it('WORLD LORE: the built-in DEFAULT tone is setting-neutral (no Tartaria leak)', () => {
    expect(DEFAULT_WORLD_TONE).not.toMatch(/tartar|aether|reclaimer/i);
  });

  it('WORLD LORE: the generic game supplies its own world tone/setting (not the default)', () => {
    expect(hasWorldLore()).toBe(true);
    expect(getWorldTone()).not.toBe(DEFAULT_WORLD_TONE);
    expect(getWorldTone()).toMatch(/fallen world|ruins/i);
    expect(getWorldSetting()).toMatch(/Reaches/);
    expect(getWorldTone()).not.toMatch(/tartar|aether/i);
  });

  it('WORLD LORE: an author override still wins over the generic default', () => {
    setLoreOverride('world', { tone: 'A 1943 occult war folded into a single doomed city.' });
    expect(getWorldTone()).toMatch(/1943/);
    setLoreOverride('world', null);
    expect(getWorldTone()).toMatch(/fallen world|ruins/i); // back to generic
  });

  it('WORLD LORE: with the generic pack cleared, the tone falls to the NEUTRAL default', () => {
    clearGenericDefaults();
    expect(hasWorldLore()).toBe(false);
    expect(getWorldTone()).toBe(DEFAULT_WORLD_TONE);
  });
});

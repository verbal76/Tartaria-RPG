// engine_Dev — the named-vendor pool is now author-overridable (the last major built-in
// content type to become reskinnable). Lock: an uploaded vendors array replaces the
// built-in pool for spawning/lookup, and clearing restores the built-ins.

import { getActiveVendors, findVendorByName, VENDORS } from '../app/engine/vendors';
import { setVendorsOverride } from '../app/engine/contentPack';

describe('engine_Dev — vendors override', () => {
  afterEach(() => setVendorsOverride(null));

  it('built-in pool is active when no override is set', () => {
    expect(getActiveVendors()).toBe(VENDORS);
    expect(getActiveVendors().length).toBeGreaterThan(0);
  });

  it('an uploaded vendor array replaces the built-in pool; clearing restores it', () => {
    setVendorsOverride([
      { id: 'onr_quartermaster', name: 'Sergeant Doyle', title: 'ONR Quartermaster', faction: 'us_office_of_naval_research', description: 'Hands out kit, asks no questions.', offers: [{ itemName: 'Trail Rations', price: 8 }] },
    ]);
    const pool = getActiveVendors();
    expect(pool.map((v) => v.name)).toEqual(['Sergeant Doyle']);
    expect(findVendorByName('Sergeant Doyle')?.title).toBe('ONR Quartermaster');
    // a built-in vendor is no longer in the active pool
    expect(findVendorByName('Tellin Mak')).toBeNull();

    setVendorsOverride(null);
    expect(getActiveVendors()).toBe(VENDORS);
    expect(findVendorByName('Sergeant Doyle')).toBeNull();
  });

  it('drops malformed rows (missing name/offers) so a bad upload cannot crash the spawner', () => {
    setVendorsOverride([
      { id: 'ok', name: 'Good Vendor', title: 'T', faction: null, description: 'd', offers: [{ itemName: 'Trail Rations', price: 5 }] },
      { id: 'bad', title: 'no name' },
      { name: 'no offers' },
    ]);
    expect(getActiveVendors().map((v) => v.name)).toEqual(['Good Vendor']);
  });
});

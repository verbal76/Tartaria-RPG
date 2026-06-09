import { resolveItemEffect } from '../app/engine/itemEffect';
import { findGearByName } from '../app/engine/crafting';

// OTA-375 — accessible stamina items. The starter ration was HP-only,
// which is why an exhausted fighter had nothing to drink. Trail Rations
// now restore stamina too, and the Water Bottle is a clear, refillable
// in-combat stamina sip. Both flow through the consumable effect path
// (resolveItemEffect → restoreStamina), usable mid-fight.

describe('accessible stamina items (OTA-375)', () => {
  it('Trail Rations (the starter ration) now restore stamina, not just HP', () => {
    const fx = resolveItemEffect('Trail Rations', [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.restoreStamina).toBeGreaterThan(0);
      expect(fx.healHP).toBeGreaterThan(0);
    }
  });

  it('Water Bottle is a strong, refillable stamina sip (≥10)', () => {
    const fx = resolveItemEffect('Water Bottle', [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.restoreStamina ?? 0).toBeGreaterThanOrEqual(10);
    }
  });

  it('the strong stamina options still resolve (drink/kit tier)', () => {
    const blueDraught = resolveItemEffect('Blue Cap Draught', [findGearByName]);
    const trauma = resolveItemEffect('Trauma Kit', [findGearByName]);
    if (blueDraught?.kind === 'consumable') expect(blueDraught.restoreStamina ?? 0).toBeGreaterThanOrEqual(8);
    if (trauma?.kind === 'consumable') expect(trauma.restoreStamina ?? 0).toBeGreaterThanOrEqual(15);
  });
});

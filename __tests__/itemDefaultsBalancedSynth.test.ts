// OTA-191 — verifies the Phase 1 static-heuristic upgrade in
// itemDefaults.ts:
//
//   - inferGear emits an `effect` for food / drink / fungus / light /
//     compass / rope so use/eat/scrap actions actually fire on
//     uncataloged items.
//   - inferGear emits material tags so canScrap (scrapEngine.ts:34)
//     passes for misc items like ropes, lanterns, compasses.
//   - inferWeapon emits a flavor effect string for sharp/electric/
//     fire/poison names.
//   - inferArmor emits keyword-based resistances so a "Flame-Hardened
//     Vest" comes with burn resistance.
//
// Pure functions, but the inferGear path transitively touches the
// AsyncStorage-backed synth cache — mock it so the test runner
// doesn't choke on the missing native module.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

import { inferGear, inferWeapon, inferArmor, inferAccessory } from '../app/engine/itemDefaults';
import { canScrap, scrapOutputFor } from '../app/engine/scrapEngine';
import { aggregateInventoryPassives, inventoryHasGate, resolveItemEffect } from '../app/engine/itemEffect';

// Local resolver that points at the inferred-gear synthesizer for the
// items we're testing. Mirrors what the engine wires when an item
// name isn't in any hand-authored catalog.
const inferredGearResolver = (name: string) => inferGear(name);

describe('OTA-191 — inferGear emits balanced effects', () => {
  it('food consumable carries a healHP + restoreStamina effect', () => {
    const jerky = inferGear('Rotted Jerky');
    expect(jerky.kind).toBe('consumable');
    expect(jerky.effect).toBeDefined();
    expect(jerky.effect?.kind).toBe('consumable');
    if (jerky.effect?.kind === 'consumable') {
      expect(jerky.effect.healHP).toBeGreaterThan(0);
      expect(jerky.effect.restoreStamina).toBeGreaterThan(0);
    }
  });

  it('aether-tagged food bumps to Uncommon rarity + higher restore', () => {
    const aetherStew = inferGear('Aetheric Stew');
    expect(aetherStew.rarity).toBe('Uncommon');
    if (aetherStew.effect?.kind === 'consumable') {
      expect(aetherStew.effect.healHP).toBeGreaterThanOrEqual(6);
    }
  });

  it('drink carries a stamina-heavy effect; keyword name picks up a buff', () => {
    const mightBrew = inferGear('Mighty Battle Brew');
    expect(mightBrew.kind).toBe('consumable');
    if (mightBrew.effect?.kind === 'consumable') {
      expect(mightBrew.effect.restoreStamina).toBeGreaterThan(0);
      expect(mightBrew.effect.buffStat).toBe('strength');
      expect(mightBrew.effect.buffBonus).toBe(1);
      expect(mightBrew.effect.buffDuration).toBeGreaterThan(0);
    }
  });

  it('inferred rope carries the climb_steep gate (CLIMB button lights up)', () => {
    const cord = inferGear("Reclaimer's Cord");
    // Rope-as-gate matches authored Climbing Rope behavior in
    // exploration.json.
    const hasGate = inventoryHasGate([cord.name], 'climb_steep', [inferredGearResolver]);
    expect(hasGate).toBe(true);
  });

  it('inferred compass contributes a passive wisdom bonus', () => {
    const compass = inferGear('Brass Sextant');
    const passives = aggregateInventoryPassives([compass.name], [inferredGearResolver]);
    expect(passives.wisdom).toBe(1);
  });

  it('inferred light source becomes a relic with an extendLight effect', () => {
    const torch = inferGear('Bone Torch');
    expect(torch.kind).toBe('relic');
    if (torch.effect?.kind === 'consumable') {
      expect(torch.effect.extendLight).toBeGreaterThan(0);
    } else {
      throw new Error('Torch should carry a consumable effect with extendLight');
    }
  });

  it('inferred fungus restores stamina', () => {
    const shroom = inferGear('Cave Sporecap');
    expect(shroom.kind).toBe('consumable');
    if (shroom.effect?.kind === 'consumable') {
      expect(shroom.effect.restoreStamina).toBeGreaterThan(0);
    }
  });
});

describe('OTA-191 — inferGear emits scrap-routable tags', () => {
  it('an unmatched misc item gets the improvised tag so canScrap passes', () => {
    const widget = inferGear('Strange Brass Widget');
    // 'brass' matches inferGearTagPack → 'metal'
    expect(widget.tags).toContain('metal');
    expect(canScrap({
      id: 't1', name: widget.name, kind: widget.kind, quantity: 1, tags: widget.tags,
    })).toBe(true);
  });

  it('rope tags as fiber + scrap output includes Patched Cloth', () => {
    const cord = inferGear("Reclaimer's Cord");
    expect(cord.tags).toContain('fiber');
    // Ropes are misc + carry the climb_steep gate; canScrap routes
    // the misc-with-material-tag branch.
    const item = { id: 't2', name: cord.name, kind: cord.kind, quantity: 1, tags: cord.tags };
    expect(canScrap(item)).toBe(true);
    const out = scrapOutputFor(item);
    expect(out.grants.some((g) => g.name === 'Patched Cloth')).toBe(true);
  });

  it('inferred lantern carries metal + fiber tags', () => {
    const lantern = inferGear('Bone Lantern');
    expect(lantern.tags).toContain('metal');
    expect(lantern.tags).toContain('fiber');
    // Bone keyword adds organic tag as well.
    expect(lantern.tags).toContain('organic');
  });

  it('totally generic misc with no material keyword falls back to improvised', () => {
    const blob = inferGear('Eldritch Knob');
    expect(blob.tags).toContain('improvised');
    const item = { id: 't3', name: blob.name, kind: blob.kind, quantity: 1, tags: blob.tags };
    expect(canScrap(item)).toBe(true);
  });
});

describe('OTA-191 — inferWeapon flavor effect strings', () => {
  it('sharp/bladed names get bleed flavor', () => {
    const w = inferWeapon('Razor Blade');
    expect(w.effect).toBeDefined();
    expect(String(w.effect)).toMatch(/bleed/i);
  });

  it('storm/shock names get stun flavor', () => {
    const w = inferWeapon('Shock Rod');
    expect(w.effect).toBeDefined();
    expect(String(w.effect)).toMatch(/stun/i);
  });

  it('a plain weapon has no flavor effect', () => {
    const w = inferWeapon('Wooden Mace');
    expect(w.effect).toBeUndefined();
  });
});

describe('OTA-191 — inferArmor keyword resistances', () => {
  it('flame-named armor carries burn resistance', () => {
    const a = inferArmor('Flame-Hardened Vest');
    expect(a).not.toBeNull();
    expect(a?.resistances).toContain('burn');
  });

  it('mud-sealed armor carries degradation resistance', () => {
    const a = inferArmor('Mud-Sealed Cloak');
    expect(a).not.toBeNull();
    expect(a?.resistances).toContain('degradation');
  });

  it('aether-themed armor still carries aetheric resistance (parity)', () => {
    const a = inferArmor('Aetheric Plate');
    expect(a).not.toBeNull();
    expect(a?.resistances).toContain('aetheric');
  });
});

describe('OTA-191 — inferAccessory keeps the equipped statBonus path', () => {
  it('a wisdom-themed amulet still emits statBonus for equip resolution', () => {
    const am = inferAccessory("Sage's Pendant");
    expect(am).not.toBeNull();
    expect(am?.statBonus).toEqual({ stat: 'intelligence', amount: 1 });
  });
});

describe('OTA-191 — resolveItemEffect picks up inferred effects', () => {
  it('inferred food effect is reachable through resolveItemEffect', () => {
    const fx = resolveItemEffect('Rotted Jerky', [inferredGearResolver]);
    expect(fx).not.toBeNull();
    expect(fx?.kind).toBe('consumable');
  });
});

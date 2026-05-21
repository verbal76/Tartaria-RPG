// OTA 192 — verifies the new effect-system primitives:
//   - aggregateInventoryPassives caps per-stat at PASSIVE_STAT_CAP
//   - inventoryHasGate finds a gate when an item carries it
//   - findExplorationItemByName resolves a tagged item with effect
//
// These are pure functions; no Zustand / persist plumbing needed.

import {
  aggregateInventoryPassives,
  inventoryHasGate,
  resolveItemEffect,
  searchRequirementFor,
  PASSIVE_STAT_CAP,
} from '../app/engine/itemEffect';
import { findExplorationItemByName } from '../app/engine/crafting';

describe('itemEffect — passive bonus aggregation', () => {
  // Resolver list that delegates only to the exploration catalog;
  // matches what equipment.ts wires for real.
  const resolvers = [findExplorationItemByName];

  it('a Thermal Goggles in inventory contributes +1 wisdom', () => {
    const bonus = aggregateInventoryPassives(['Thermal Goggles'], resolvers);
    expect(bonus.wisdom).toBe(1);
  });

  it('multiple Basic Tents stack but cap at PASSIVE_STAT_CAP', () => {
    // Three +1 wisdom items would naively give +3; cap pulls it
    // back to PASSIVE_STAT_CAP (+2). Prevents backpack-build
    // stat inflation now that 20+ exploration items contribute.
    const bonus = aggregateInventoryPassives(
      ['Basic Tent', 'Aether-Woven Tent', 'Thermal Goggles', 'Basic Tent'],
      resolvers,
    );
    expect(bonus.wisdom).toBe(PASSIVE_STAT_CAP);
  });

  it('returns empty object when no items have passive effects', () => {
    const bonus = aggregateInventoryPassives(['Pulse Scanner', 'Climbing Gear'], resolvers);
    // Pulse Scanner is consumable, Climbing Gear is gate — neither passive
    expect(bonus).toEqual({});
  });
});

describe('itemEffect — gate lookup', () => {
  const resolvers = [findExplorationItemByName];

  it('Climbing Gear in inventory grants climb_steep', () => {
    expect(inventoryHasGate(['Climbing Gear'], 'climb_steep', resolvers)).toBe(true);
  });

  it('Aetheric Mask in inventory grants breathe_toxic', () => {
    expect(inventoryHasGate(['Aetheric Mask'], 'breathe_toxic', resolvers)).toBe(true);
  });

  it('Pulse Scanner does NOT grant breathe_toxic', () => {
    expect(inventoryHasGate(['Pulse Scanner'], 'breathe_toxic', resolvers)).toBe(false);
  });

  it('empty inventory grants nothing', () => {
    expect(inventoryHasGate([], 'breathe_toxic', resolvers)).toBe(false);
  });
});

describe('itemEffect — search noun requirements (OTA 195)', () => {
  // Playtester spec: "certain things can only be searched with a
  // pulse scanner or other item related. Once you search something
  // you remove it from the popup. And if you need a certain item
  // to search it, it is grayed out, and when you hit it, it tells
  // you what you need to equip."
  it('a vent fissure requires an Aether scanner', () => {
    const req = searchRequirementFor('vent fissure');
    expect(req).not.toBeNull();
    expect(req!.scannerBias).toBe('aetheric');
    expect(req!.hint).toContain('Pulse Scanner');
  });

  it('an aether glyph requires an Aether scanner', () => {
    const req = searchRequirementFor('aether glyph');
    expect(req?.scannerBias).toBe('aetheric');
  });

  it('a ley line requires an Aether scanner', () => {
    const req = searchRequirementFor('ley line');
    expect(req?.scannerBias).toBe('aetheric');
  });

  it('a plain bench has no requirement (freely searchable)', () => {
    expect(searchRequirementFor('bench')).toBeNull();
  });

  it('a plain trap has no requirement', () => {
    expect(searchRequirementFor('trap')).toBeNull();
  });
});

describe('itemEffect — Pulse Scanner: Geiger-counter redesign (OTA 193)', () => {
  // The user's mental model from the playtest discussion:
  // "Pulse scanner is like a geiger counter, it's a device to track
  //  Aetheric energy, it should give you a stat boost to finding
  //  Aetheric items when using search. If you search a vent fissure
  //  with it equipped then you might find Aetheric shards or dust or
  //  Aetheric fungus. You would use it in your off hand."
  it('catalog row carries a scanner effect with aetheric bias and off slot', () => {
    const fx = resolveItemEffect('Pulse Scanner', [findExplorationItemByName]);
    expect(fx).toEqual({ kind: 'scanner', bias: 'aetheric', slot: 'off' });
  });
});

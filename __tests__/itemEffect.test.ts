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

describe('itemEffect — search noun requirements (OTA-033, three-way scanner gate)', () => {
  // OTA-033 split the single Aetheric gate into three scanner
  // families. Each noun class routes to its own scanner type.
  it('a vent fissure requires an Aetheric scanner', () => {
    const req = searchRequirementFor('vent fissure');
    expect(req).not.toBeNull();
    expect(req!.scannerBias).toBe('aetheric');
    expect(req!.hint).toContain('Aetheric Scanner');
  });

  it('an aether glyph requires an Aetheric scanner', () => {
    const req = searchRequirementFor('aether glyph');
    expect(req?.scannerBias).toBe('aetheric');
  });

  it('a ley line requires an Aetheric scanner', () => {
    const req = searchRequirementFor('ley line');
    expect(req?.scannerBias).toBe('aetheric');
  });

  it('an automaton requires a Pulse scanner', () => {
    const req = searchRequirementFor('automaton');
    expect(req?.scannerBias).toBe('pulse');
    expect(req?.hint).toContain('Pulse Scanner');
  });

  it('a runic emitter requires a Pulse scanner', () => {
    const req = searchRequirementFor('runic emitter');
    expect(req?.scannerBias).toBe('pulse');
  });

  it('a silt mound requires a Mud scanner', () => {
    const req = searchRequirementFor('silt mound');
    expect(req?.scannerBias).toBe('mud');
    expect(req?.hint).toContain('Mud Scanner');
  });

  it('a sludge pool requires a Mud scanner', () => {
    const req = searchRequirementFor('sludge pool');
    expect(req?.scannerBias).toBe('mud');
  });

  it('a fungal patch requires a Mud scanner', () => {
    const req = searchRequirementFor('fungal patch');
    expect(req?.scannerBias).toBe('mud');
  });

  it('a mud fissure routes to Mud, not Aetheric (mud regex tested first)', () => {
    // The new routing prioritizes mud over aether so "mud fissure" /
    // "silt vent" reach the Mud Scanner instead of the Aetheric one.
    const req = searchRequirementFor('mud fissure');
    expect(req?.scannerBias).toBe('mud');
  });

  it('a plain bench has no requirement (freely searchable)', () => {
    expect(searchRequirementFor('bench')).toBeNull();
  });

  it('a plain trap has no requirement', () => {
    expect(searchRequirementFor('trap')).toBeNull();
  });
});

describe('itemEffect — Scanner catalog rows (OTA-033)', () => {
  // Three scanner families, each with its own bias and recipe.
  it('Pulse Scanner — pulse bias (mechanical / Sentinel detection)', () => {
    const fx = resolveItemEffect('Pulse Scanner', [findExplorationItemByName]);
    expect(fx).toEqual({ kind: 'scanner', bias: 'pulse', slot: 'off' });
  });

  it('Aetheric Scanner — aetheric bias (rare crystal / glyph detection)', () => {
    const fx = resolveItemEffect('Aetheric Scanner', [findExplorationItemByName]);
    expect(fx).toEqual({ kind: 'scanner', bias: 'aetheric', slot: 'off' });
  });

  it('Mud Scanner — mud bias (buried / silt / fungal detection)', () => {
    const fx = resolveItemEffect('Mud Scanner', [findExplorationItemByName]);
    expect(fx).toEqual({ kind: 'scanner', bias: 'mud', slot: 'off' });
  });
});

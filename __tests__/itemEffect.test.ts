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

describe('itemEffect — Pulse Scanner is no longer orphaned', () => {
  // The original complaint that drove OTA 192.
  it('catalog row carries a consumable effect with revealScene:true', () => {
    const fx = resolveItemEffect('Pulse Scanner', [findExplorationItemByName]);
    expect(fx).toEqual({ kind: 'consumable', revealScene: true });
  });
});

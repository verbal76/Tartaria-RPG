// engine_Dev — content-pack leak sweep. Spot-checks the pack-facing, content-
// agnostic mechanisms that replaced hardcoded Tartaria item-name behavior, and
// confirms the Tartaria defaults still work when no pack is loaded.

import { rollThrowDamage, throwDamageNotation } from '../app/engine/itemWeight';
import type { InventoryItem } from '../app/engine/types';
import { resolveItemAlias } from '../app/engine/itemAliases';

function weapon(name: string, tags: string[]): InventoryItem {
  return { id: name, name, kind: 'weapon', rarity: 'Common', quantity: 1, tags };
}

describe('throw damage is pack-authored via a throw:<dice> tag', () => {
  it('a throw:2d20 tag drives both the roll and the notation', () => {
    const item = weapon('Trench Hatchet', ['throwable', 'throw:2d20']);
    expect(throwDamageNotation(item)).toBe('2d20');
    const d = rollThrowDamage(item);
    expect(d).toBeGreaterThanOrEqual(2);
    expect(d).toBeLessThanOrEqual(40);
  });

  it('a throw:1d10+2 tag is honored', () => {
    const item = weapon('Concrete Chunk', ['throwable', 'throw:1d10+2']);
    expect(throwDamageNotation(item)).toBe('1d10+2');
    const d = rollThrowDamage(item);
    expect(d).toBeGreaterThanOrEqual(3);
    expect(d).toBeLessThanOrEqual(12);
  });

  it('the legacy Tartaria name overrides still resolve (no tag)', () => {
    expect(throwDamageNotation(weapon('Aetheric Shard', ['throwable']))).toBe('2d20');
    expect(throwDamageNotation(weapon('Sentinel Core Plate', ['throwable']))).toBe('1d10+2');
  });

  it('an ordinary throwable with no tag falls back to weight-based damage', () => {
    expect(throwDamageNotation(weapon('Hand Axe', ['throwable']))).toBe('1d8+1');
  });
});

describe('item-alias map (Tartaria default, no pack loaded)', () => {
  it('still collapses light-source variants to the Tartaria item when not reskinned', () => {
    // Default test state has no pack loaded → isReskinActive() is false.
    expect(resolveItemAlias('lantern')).toBe('Aetheric Torch');
    expect(resolveItemAlias('definitely not a real noun 12345')).toBeNull();
  });
});

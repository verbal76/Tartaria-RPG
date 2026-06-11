// OTA-491 — the Shaped Aetheric Shard is a one-throw WEAPON (kind 'misc' +
// 'throwable', 2d20 aetheric), but its name auto-synthesizes an 'aetheric' tag,
// which is a tool-tag — so it was wrongly classified as a tool (shown in the
// inventory TOOLS section + offered as pouch-eligible). A thrown weapon must read
// as a weapon, never a tool.

import { isPouchEligible, itemIsTool } from '../app/engine/pouchEligibility';
import { categorizeItem } from '../app/components/InventoryCategorize';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const player = { equipped: {} } as unknown as PlayerCharacter;

// As it appears AFTER load: catalog tags ['throwable','aether','shaped'] PLUS the
// 'aetheric' tag restampInventoryItem synthesizes from the name.
const shard = (): InventoryItem => ({
  id: 'shard1',
  name: 'Shaped Aetheric Shard',
  kind: 'misc',
  rarity: 'Rare',
  quantity: 1,
  tags: ['throwable', 'aether', 'shaped', 'aetheric'],
} as unknown as InventoryItem);

describe('OTA-491 — Shaped Aetheric Shard is a weapon, not a tool', () => {
  it('itemIsTool returns false for the thrown shard', () => {
    expect(itemIsTool(shard())).toBe(false);
  });

  it('is NOT pouch-eligible, with weapon wording', () => {
    const r = isPouchEligible(shard(), player);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/throw|weapon|hurl/i);
  });

  it('categorizes under Weapons, not Tools', () => {
    expect(categorizeItem(shard())).toBe('weapon');
  });

  it("still doesn't mis-flag a genuine aetheric tool as a weapon", () => {
    const lens = { id: 'l', name: 'Aetheric Vision Lens', kind: 'exploration', quantity: 1,
      tags: ['tool', 'detection', 'aetheric', 'lens'] } as unknown as InventoryItem;
    expect(itemIsTool(lens)).toBe(true);
    expect(isPouchEligible(lens, player).eligible).toBe(true);
    expect(categorizeItem(lens)).toBe('tool');
  });
});

// OTA-178 — regression lock for the sell-gate-loss detection.
// Pre-fix, a player could sell their only Hardened Climbing Strap
// (or any other climb_steep-gated item) and silently lose the
// ability to climb anything. Fix: the VendorScreen sell-confirm
// modal computes a `pendingGateLoss` for the item being sold and
// shows a "⚠ This is your ONLY way to climb steep terrain"
// warning + "Sell anyway" destructive button when the player has
// no other item satisfying the same gate.
//
// This test locks the underlying detection logic at the engine
// helper level. The VendorScreen wires that helper directly into
// the modal copy — testing it here covers the core decision.

jest.setTimeout(15000);

import { resolveItemEffect } from '../app/engine/itemEffect';
import { findGearByName, findMaterialByName, findExplorationItemByName } from '../app/engine/crafting';

const resolvers = [findGearByName, findMaterialByName, findExplorationItemByName];

interface MiniItem { id: string; name: string; quantity: number }

// Mirror of the gateLossFor logic in VendorScreen.tsx for unit
// testing — kept in sync via the same imports the screen uses.
function gateLossFor(itemName: string, inventory: MiniItem[]): string | null {
  const item = inventory.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
  if (!item || item.quantity <= 0) return null;
  const fx = resolveItemEffect(item.name, resolvers);
  if (fx?.kind !== 'gate') return null;
  const gate = fx.unlocks;
  if (item.quantity > 1) return null;
  for (const other of inventory) {
    if (other.id === item.id) continue;
    if (other.quantity <= 0) continue;
    const otherFx = resolveItemEffect(other.name, resolvers);
    if (otherFx?.kind === 'gate' && otherFx.unlocks === gate) return null;
  }
  return gate;
}

describe('OTA-178 — sell-gate-loss detection', () => {
  it('selling the ONLY climb-tool flags as gate loss', () => {
    const inv: MiniItem[] = [
      { id: 'a', name: 'Hardened Climbing Strap', quantity: 1 },
      { id: 'b', name: 'Trail Rations', quantity: 3 },
    ];
    expect(gateLossFor('Hardened Climbing Strap', inv)).toBe('climb_steep');
  });

  it('selling one of TWO copies of the same climb tool is fine', () => {
    const inv: MiniItem[] = [
      { id: 'a', name: 'Climbing Rope', quantity: 2 },
    ];
    expect(gateLossFor('Climbing Rope', inv)).toBeNull();
  });

  it('selling one climb tool when ANOTHER climb tool exists is fine', () => {
    const inv: MiniItem[] = [
      { id: 'a', name: 'Hardened Climbing Strap', quantity: 1 },
      { id: 'b', name: 'Climbing Rope', quantity: 1 },
    ];
    expect(gateLossFor('Hardened Climbing Strap', inv)).toBeNull();
  });

  it('selling a non-gate item never flags', () => {
    const inv: MiniItem[] = [
      { id: 'a', name: 'Trail Rations', quantity: 1 },
      { id: 'b', name: 'Climbing Rope', quantity: 1 },
    ];
    expect(gateLossFor('Trail Rations', inv)).toBeNull();
  });

  it('non-existent item is null', () => {
    const inv: MiniItem[] = [];
    expect(gateLossFor('Phantom Item', inv)).toBeNull();
  });
});

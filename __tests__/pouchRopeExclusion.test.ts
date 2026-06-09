import { isPouchEligible } from '../app/engine/pouchEligibility';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

// OTA-385 — rope grants its climb capability from the pack (the climb_steep
// gate checks inventory, not the pouch), so it shouldn't occupy a tool slot.

const player = { equipped: {} } as unknown as PlayerCharacter;
const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', name: 'X', kind: 'relic', quantity: 1, tags: [], ...over,
});

describe('tool pouch — rope is not a pouch tool', () => {
  it("Reclaimer's Rope can't be pouched (it's just rope)", () => {
    const r = isPouchEligible(
      item({ name: "Reclaimer's Rope", kind: 'relic', tags: ['exploration', 'tool', 'rope'] }),
      player,
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/rope|pack/i);
  });

  it('Climbing Rope is excluded too', () => {
    const r = isPouchEligible(
      item({ name: 'Climbing Rope', kind: 'relic', tags: ['utility', 'gate', 'rope'] }),
      player,
    );
    expect(r.eligible).toBe(false);
  });

  it('a real tool (scanner) is still pouch-eligible', () => {
    const r = isPouchEligible(
      item({ name: 'Pulse Scanner', kind: 'exploration', tags: ['tool', 'scanner'] }),
      player,
    );
    expect(r.eligible).toBe(true);
  });
});

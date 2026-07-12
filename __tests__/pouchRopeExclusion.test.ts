import { isPouchEligible, itemIsScanner } from '../app/engine/pouchEligibility';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

// OTA-778 — the pouch is the SCANNER POUCH: it holds ONLY scanners (their
// effect runs at all times, which is why a search surfaces their loot).
// Everything else — rope (works from the pack), the button-use Aetheric Torch,
// pry bars, lenses — is refused.

const player = { equipped: {} } as unknown as PlayerCharacter;
const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', name: 'X', kind: 'relic', quantity: 1, tags: [], ...over,
});

describe('scanner pouch — scanners only', () => {
  it('all three scanners are pouch-eligible', () => {
    for (const name of ['Pulse Scanner', 'Aetheric Scanner', 'Mud Scanner']) {
      expect(itemIsScanner(item({ name }))).toBe(true);
      expect(isPouchEligible(item({ name, kind: 'exploration' }), player).eligible).toBe(true);
    }
  });

  it("the Aetheric Torch can't be pouched — it's a button-use item, not always-on", () => {
    const r = isPouchEligible(item({ name: 'Aetheric Torch', kind: 'relic', tags: ['light', 'relic'] }), player);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/button|torch/i);
    expect(itemIsScanner(item({ name: 'Aetheric Torch' }))).toBe(false);
  });

  it("rope is excluded (it works from the pack, and it isn't a scanner)", () => {
    expect(isPouchEligible(item({ name: "Reclaimer's Rope", kind: 'relic', tags: ['exploration', 'tool', 'rope'] }), player).eligible).toBe(false);
    expect(isPouchEligible(item({ name: 'Climbing Rope', kind: 'relic', tags: ['utility', 'gate', 'rope'] }), player).eligible).toBe(false);
  });

  it('a non-scanner tool (a lens / pry bar) is no longer pouch-eligible', () => {
    const lens = isPouchEligible(item({ name: 'Aetheric Vision Lens', kind: 'exploration', tags: ['relic'] }), player);
    expect(lens.eligible).toBe(false);
    expect(lens.reason).toMatch(/scanner pouch only holds scanners/i);
  });

  it('a weapon / food is still refused', () => {
    expect(isPouchEligible(item({ name: 'Sword', kind: 'weapon' }), player).eligible).toBe(false);
    expect(isPouchEligible(item({ name: 'Ration', kind: 'consumable' }), player).eligible).toBe(false);
  });
});

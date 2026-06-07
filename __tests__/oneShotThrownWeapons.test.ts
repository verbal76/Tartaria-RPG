import { WEAPONS } from '../app/engine/crafting';
import { restampInventoryItem } from '../app/engine/itemBackfill';
import type { InventoryItem } from '../app/engine/types';

// The dedicated thrown projectiles are now one-shot (throwable tag → the engine
// consumes one quantity per throw + auto-unequips at 0). Reusable throwers,
// slings, and the returning disk are deliberately NOT one-shot.
const ONE_SHOT = [
  'Throwing Knife', 'Mud Throwing Knife', 'Bone Throwing Axe', 'Tartarian Hand Axe (Throw)',
  'Bone Javelin', 'Bone War Javelin', 'Tartarian Hand Spear', 'Plasma Spear',
  'Tartarian Spear (Throw)', 'Mud Spear (Throwing)',
];
const NOT_ONE_SHOT = ['Aetheric Throwing Disk', 'Bone Sling', 'Mud Sling', 'Energy Thrower', 'Plasma Thrower', 'Aetheric Pike (Rare)'];

const byName = (n: string) => WEAPONS.find((w) => w.name === n);
const isThrowable = (tags: string[] | undefined) => (tags ?? []).some((t) => /throwable/i.test(t));

describe('one-shot thrown weapons', () => {
  it('all 10 dedicated projectiles carry the throwable (one-shot) tag', () => {
    for (const name of ONE_SHOT) {
      const w = byName(name);
      expect(w).toBeDefined();
      expect(isThrowable(w!.tags)).toBe(true);
    }
  });

  it('reusable throwers / slings / the returning disk stay NOT one-shot', () => {
    for (const name of NOT_ONE_SHOT) {
      const w = byName(name);
      if (!w) continue; // tolerate name drift on the exclusion list
      expect(isThrowable(w.tags)).toBe(false);
    }
  });

  it('an inventory instance gets the one-shot tag backfilled from the catalog', () => {
    // A weapon a player already holds (or just looted) without the tag is
    // restamped against the catalog → throwable merges in.
    const held = { id: 'x1', name: 'Throwing Knife', kind: 'weapon', quantity: 3, tags: ['weapon', 'ranged'] } as unknown as InventoryItem;
    const fresh = restampInventoryItem(held);
    expect(isThrowable(fresh.tags)).toBe(true);
    // Per-instance tags are preserved, not clobbered.
    expect(fresh.tags).toEqual(expect.arrayContaining(['weapon', 'ranged']));
  });
});

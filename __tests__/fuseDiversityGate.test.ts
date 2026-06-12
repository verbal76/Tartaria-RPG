// arb112 — the Crucible's "3 distinct material tags" gate was a dead end for the
// buried world's loot: inferred creature-parts (blood / mucus / feather / moss /
// claw) persist sparse tags (just improvised/aether), so no matter how many you
// reserved you stayed at 2 tags. The gate now ALSO re-derives material tags from
// the item NAME (organic for soft creature-parts), unblocking existing saves with
// no migration.

import { gateFusion } from '../app/engine/itemFusion';
import { inferGearTagPack } from '../app/engine/itemDefaults';
import type { InventoryItem } from '../app/engine/types';

const mk = (name: string, tags: string[]): InventoryItem =>
  ({ id: name, name, kind: 'misc', rarity: 'Common', quantity: 1, reservedForFusion: true, tags } as InventoryItem);

describe('fuse crucible — material-tag diversity', () => {
  it('soft creature-parts now read as organic', () => {
    for (const n of ['Aetheric Blood', 'Leech Mucus', 'Aether Feather', 'Aetheric Moss', 'Shrike Claw']) {
      expect(inferGearTagPack(n)).toContain('organic');
    }
  });

  it("the player's reserved aether/improvised loot now satisfies the 3-tag gate", () => {
    // Exactly the persisted tags from the playtest inventory (no `organic` on them).
    const g = gateFusion([
      mk('Aetheric Blood', ['loot', 'improvised', 'aether']),
      mk('Aether Feather', ['loot', 'improvised', 'aether']),
      mk('Leech Mucus', ['loot', 'improvised']),
    ]);
    expect(g.ok).toBe(true);
    expect(g.tagProfile.sort()).toEqual(['aether', 'improvised', 'organic']);
  });

  it('still blocks when there is genuinely no diversity (all one material)', () => {
    const g = gateFusion([
      mk('Scrap Bit', ['metal']),
      mk('Iron Bit', ['metal']),
      mk('Tin Bit', ['metal']),
    ]);
    expect(g.ok).toBe(false);
    expect(g.tagProfile).toEqual(['metal']);
  });

  it('still requires ≥3 reserved inferred inputs', () => {
    const g = gateFusion([mk('Aetheric Blood', ['aether'])]);
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/at least 3 inferred/i);
  });

  it('a reserved reagent mis-stamped as a consumable (Aetheric Moss) now counts; a real drink does not', () => {
    const k = (name: string, kind: string, tags: string[]): InventoryItem =>
      ({ id: name, name, kind, rarity: 'Common', quantity: 1, reservedForFusion: true, tags } as InventoryItem);
    const g = gateFusion([
      k('Aetheric Moss', 'consumable', ['loot', 'aether']),           // material reagent → counts
      k('Aetheric Blood', 'misc', ['loot', 'improvised', 'aether']),
      k('Leech Mucus', 'misc', ['loot', 'improvised']),
      k('Aether-Distilled Spirit', 'consumable', ['alcohol', 'aether', 'drink']), // real drink → excluded
    ]);
    expect(g.inputs.map((i) => i.name).sort()).toEqual(['Aetheric Blood', 'Aetheric Moss', 'Leech Mucus']);
    expect(g.ok).toBe(true);
  });
});

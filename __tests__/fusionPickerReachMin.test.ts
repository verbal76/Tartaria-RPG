// OTA-682 — the Fusing Crucible picker hid every reserved piece that added no NEW
// material once you'd picked (task #37 declutter). But a single material-rich input
// (an Aetheric Cog = metal + improvised + aether) can cover a whole pool's materials
// in TWO picks, after which the declutter hid ALL remaining filler — so the player
// could never reach the 3-item minimum and the Fuse button never lit ("how come I
// still can't fuse?"). visibleFusionInputs now reveals filler when short of MIN_PICK
// with nothing left that adds a new material. Built from the real reserved pool in
// the 2026-07-05 inventory dump.

import { visibleFusionInputs, gateFusion, eligibleInputs } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

const MIN_PICK = 3;
const mk = (name: string, tags: string[], qty = 1): InventoryItem =>
  ({ id: name, name, kind: 'misc', rarity: 'Common', quantity: qty, reservedForFusion: true, tags } as InventoryItem);

// Verbatim reserved (♥) pool from the reported save: 4 materials total
// (organic / aether / improvised / metal), but the Cog alone carries three of them.
const pool: InventoryItem[] = [
  mk('Aether Venom', ['loot', 'organic', 'aether']),
  mk('Aetheric Blood', ['loot', 'organic', 'aether'], 3),
  mk('Aetheric Cog', ['loot', 'improvised', 'aether', 'metal'], 2),
  mk('Aetheric Residue', ['loot', 'improvised', 'aether']),
  mk('Aetheric Teeth', ['loot', 'improvised', 'aether', 'organic']),
  mk('Crab Meat', ['loot', 'organic']),
  mk('Hound Fur', ['loot', 'organic']),
  mk('Imp Horn', ['loot', 'organic']),
  mk('Leech Mucus', ['loot', 'organic']),
  mk('Slug Slime', ['loot', 'organic']),
  mk('Swamp Shell', ['loot', 'organic']),
];

describe('fusion picker reachability (OTA-682)', () => {
  it('the engine gate accepts this pool (so the block is UI-only)', () => {
    const g = gateFusion(pool);
    expect(g.ok).toBe(true);
    expect(g.tagProfile.length).toBeGreaterThanOrEqual(3);
  });

  it('greedy 2-pick that saturates all materials still leaves a selectable filler', () => {
    const scraps = eligibleInputs(pool);
    // Cog (metal+improvised+aether) + one organic = all 4 materials in 2 picks.
    const picked = ['Aetheric Cog', 'Crab Meat'];
    const visible = visibleFusionInputs(scraps, picked, MIN_PICK);
    const selectable = visible.filter((it) => !picked.includes(it.id));
    // Pre-fix this was 0 → hard deadlock. Now at least one filler is revealed.
    expect(selectable.length).toBeGreaterThan(0);
    // And the player can actually reach the 3-item minimum.
    expect(picked.length + selectable.length).toBeGreaterThanOrEqual(MIN_PICK);
  });

  it('a completed 3-pick spans >= 3 materials, so the confirm gate passes', () => {
    const scraps = eligibleInputs(pool);
    const picked = ['Aetheric Cog', 'Crab Meat'];
    const filler = visibleFusionInputs(scraps, picked, MIN_PICK).find((it) => !picked.includes(it.id))!;
    const finalPick = [...picked, filler.id];
    const chosen = scraps.filter((s) => finalPick.includes(s.id));
    const g = gateFusion(pool, null, chosen);
    expect(g.ok).toBe(true);
  });

  it('still declutters in the normal case — one organic pick hides pure-organic dupes', () => {
    const scraps = eligibleInputs(pool);
    const visible = visibleFusionInputs(scraps, ['Crab Meat'], MIN_PICK);
    // Fresh material-adding items remain (the Cog, aether/improvised pieces), so no
    // filler is force-revealed; the redundant pure-organic dupes are hidden.
    expect(visible.some((it) => it.id === 'Hound Fur')).toBe(false);
    expect(visible.some((it) => it.id === 'Aetheric Cog')).toBe(true);
  });

  it('empty selection shows the whole pool', () => {
    const scraps = eligibleInputs(pool);
    expect(visibleFusionInputs(scraps, [], MIN_PICK).length).toBe(scraps.length);
  });
});

// ⚠⚠ OTA-1318 — HAL KEEPS ITS OWN PICKER AND ITS OWN COLOURS. Owner's ruling:
// *"Golem and steam should both have the colors are Amber with the rarity on the
// left. they should also both have the salvage/take combination. Hal should
// still have the original salvage button and an additional take button and they
// should not have the color change that we discussed. that was the strictly
// Golem move that I did not want to port to hal yet."*
//
// Two separate decisions live on this line and both are easy to undo by accident:
//
//   (1) THE PICKER TRIAL IS NOT HERE. Golem merged TakeModal + SalvageModal into
//       one GatherModal at OTA-1233; HAL still mounts the two modals separately,
//       and that stays true until the owner calls the merge-or-revert.
//   (2) THE AMBER RECOLOUR IS NOT HERE EITHER. It shipped to HAL once, in the
//       OTA-1314 batch, because golem's SalvageModal recolour was ported without
//       noticing that on THIS line SalvageModal is a live screen. It has been
//       reverted; this test is what stops it arriving again on the next sweep.
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const EXPLORATION = read('screens', 'ExplorationScreen.tsx');
const SALVAGE = read('components', 'SalvageModal.tsx');

describe('OTA-1318 — HAL keeps the two-button picker and its original colours', () => {
  it('⚠⚠ TWO buttons, not one: TakeModal AND SalvageModal are both mounted', () => {
    expect(EXPLORATION).toContain('<TakeModal');
    expect(EXPLORATION).toContain('<SalvageModal');
    // The one-picker trial is a golem/steam move. If GatherModal ever appears
    // here, it arrived without the owner's call.
    expect(EXPLORATION).not.toContain('<GatherModal');
  });

  it("⚠⚠ the salvage modal keeps ITS colours — the amber recolour is golem's", () => {
    // Its own accent, unchanged. This is deliberately the ORIGINAL value: the
    // point is not that green is better, it is that this line has not opted in.
    expect(SALVAGE).toContain("chipFullScene: { borderColor: '#9ec96a' }");
    expect(SALVAGE).toContain("resultRarity: { color: '#9ec96a'");
    // And no rarity edge — that is the golem look.
    expect(SALVAGE).not.toContain('rarityHexColor');
    expect(SALVAGE).not.toContain('borderLeftWidth: 4');
  });

  it('⚠ the take modal is untouched too', () => {
    const take = read('components', 'TakeModal.tsx');
    expect(take).toContain("chipArrow: { color: '#9ec96a'");
    expect(take).not.toContain('rarityHexColor');
  });

  it('⚠ but the SHARED PALETTE stays — it is a de-duplication, not a look', () => {
    // OTA-1314 also collapsed four identical copies of the rarity hexes into one
    // module. That changes no pixel anywhere: the values are the same four. It
    // stays, because reverting it would re-scatter the copies for no visual gain.
    const cat = read('components', 'InventoryCategorize.ts');
    expect(cat).toContain('export function rarityHexColor');
    expect(cat).toContain("Uncommon: '#9ec96a'");
    for (const f of [['screens', 'InventoryScreen.tsx'], ['screens', 'VendorScreen.tsx'],
                     ['components', 'RecipesView.tsx'], ['components', 'BrandedModal.tsx']]) {
      expect(read(...f)).not.toMatch(/case 'Legendary': return '#e07a5f'/);
    }
  });
});

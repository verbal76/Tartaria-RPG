// ⚠⚠ OTA-1312, SURVIVING HALF — THE SHARED RARITY PALETTE.
//
// This suite began as the guard on `SalvageModal.tsx`'s amber recolour. That file
// is GONE (punchlist B4, MERGE): once the picker was merged on every line it had
// zero real importers anywhere, and a 507-line component nothing renders is not
// dead weight so much as a trap — the OTA-1312 recolour landed on this exact file
// and shipped invisible, which is the whole reason B4 existed.
//
// ⚠ THE FILE'S TESTS GO WITH THE FILE, BUT THE PALETTE'S DO NOT. The other half of
// OTA-1312 was the de-duplication that PROMPTED the recolour: four files carried
// identical rarity switch statements and a fifth was about to be written. That
// module is live, load-bearing on all three lines, and read by the merged picker's
// left-edge rarity strip. Deleting these assertions along with the modal would
// quietly drop the only guard on it, which is the same class of mistake as the
// dead file itself — so they are kept here, under a name that says what they cover.
//
// The picker's own colour rules live in ota1317AmberGatherPicker, against the
// component the player actually opens.
import { readFileSync } from 'fs';
import { join } from 'path';
import { rarityHexColor, RARITY_COLORS, CATEGORY_COLORS } from '../app/components/InventoryCategorize';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');

describe('OTA-1312 — one rarity palette, read by everything', () => {
  it('⚠⚠ THE DEAD MODAL IS ACTUALLY GONE — not merely unimported', () => {
    // B4's resolution. If this file ever comes back, the recolour trap comes with it.
    expect(() => read('components', 'SalvageModal.tsx')).toThrow();
  });

  it('⚠⚠ ONE palette, not five — the copies are still gone', () => {
    for (const f of [
      ['screens', 'InventoryScreen.tsx'],
      ['screens', 'VendorScreen.tsx'],
      ['components', 'RecipesView.tsx'],
      ['components', 'BrandedModal.tsx'],
      ['components', 'GatherModal.tsx'],
    ]) {
      const src = read(...f);
      expect(src).toContain('rarityHexColor');
      // No local re-declaration of the palette.
      expect(src).not.toMatch(/case 'Legendary': return '#e07a5f'/);
    }
  });

  it('⚠ the palette still answers what it always answered', () => {
    expect(rarityHexColor('Legendary')).toBe('#e07a5f');
    expect(rarityHexColor('Rare')).toBe('#b88ce0');
    expect(rarityHexColor('Uncommon')).toBe('#9ec96a');
    expect(rarityHexColor('Common')).toBe('#c9a86a');
    // ⚠ Unknown/absent falls to the Common beige — the same branch, which is
    // exactly why selection logic must key on the RARITY and never the colour.
    expect(rarityHexColor(undefined)).toBe('#c9a86a');
    expect(rarityHexColor('Mythic')).toBe('#c9a86a');
    expect(RARITY_COLORS.Uncommon).toBe('#9ec96a');
  });

  it('⚠ category colours are left alone — this changed rarity, not categories', () => {
    expect(CATEGORY_COLORS.weapon).toBe('#e07a5f');
    expect(CATEGORY_COLORS.armor).toBe('#6a9bbf');
  });
});

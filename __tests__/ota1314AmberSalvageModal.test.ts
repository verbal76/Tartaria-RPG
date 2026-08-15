// ⚠⚠ OTA-1314 — THE SALVAGE POPUP WAS NOT COLOUR-CODING, IT WAS MIS-CLAIMING.
//
// Owner: *"the colors are the only thing i dont like… just make all of the
// colors amber and leave it sorted like it is, add the rarity color line on the
// left edge like if you were buying it."*
//
// `resultRarity` was hardcoded `#9ec96a`, and that hex is specifically the
// UNCOMMON colour — so the rarity WORD printed Uncommon-green whether it said
// Common, Rare or Legendary. Wrong on three rarities out of four, which is why
// it read as decoration: a colour that makes a claim and does not keep it.
//
// Now the accent is house amber and rarity is said once, by a left edge in the
// same palette the pack and the shop use.
import { readFileSync } from 'fs';
import { join } from 'path';
import { rarityHexColor, RARITY_COLORS, CATEGORY_COLORS } from '../app/components/InventoryCategorize';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const SALVAGE = read('components', 'SalvageModal.tsx');

describe('OTA-1314 — amber modal, rarity on the edge', () => {
  it('⚠⚠ the Uncommon-green is no longer USED anywhere in the salvage modal', () => {
    // ⚠ Check the CODE, not the prose — the comment above resultRow names the
    // offending hex on purpose, to explain what went wrong. A test that banned
    // the string outright would forbid documenting the bug it exists to prevent.
    const code = SALVAGE
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toContain('#9ec96a');
  });

  it('⚠⚠ the result row carries rarity as a LEFT EDGE, the way the shop does', () => {
    expect(SALVAGE).toContain('borderLeftColor: rarityHexColor(r.rarity)');
    // Same 4pt weight the vendor + inventory section headers use.
    const row = SALVAGE.slice(SALVAGE.indexOf('resultRow: {'));
    expect(row.slice(0, 400)).toContain('borderLeftWidth: 4');
    expect(read('screens', 'VendorScreen.tsx')).toContain('borderLeftWidth: 4');
  });

  it('⚠ the rarity badge itself is amber now — the edge is what speaks', () => {
    expect(SALVAGE).toContain("resultRarity: { color: '#c9a86a'");
  });

  it('⚠⚠ ONE palette, not five — the copies are gone', () => {
    // Four files carried identical switch statements before this. A fifth was
    // about to be written for the salvage modal; that is what prompted the move.
    for (const f of [
      ['screens', 'InventoryScreen.tsx'],
      ['screens', 'VendorScreen.tsx'],
      ['components', 'RecipesView.tsx'],
      ['components', 'BrandedModal.tsx'],
      ['components', 'SalvageModal.tsx'],
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

  it('⚠ the chips go amber: a pre-salvage noun has no rarity to show', () => {
    expect(SALVAGE).toContain("chipFullScene: { borderColor: '#c9a86a' }");
    expect(SALVAGE).toContain("chipFullArrow: { color: '#c9a86a'");
  });
});

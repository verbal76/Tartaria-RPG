// OTA-704 — the RECIPES tab splits FOOD & HEALTH from WEAPON COATINGS (coatings
// are consumables tagged 'weapon_coating'), and each coating row now shows its
// actual output so the player can tell the strong variant from the flavorful-name
// one. This pins both: the coating-detection predicate + the preview surfacing.

import { getItemPreview } from '../app/components/itemPreview';
import { lookupCraftedItem } from '../app/engine/crafting';

const isCoating = (result: string): boolean =>
  (lookupCraftedItem(result).tags ?? []).includes('weapon_coating');
const coatingLine = (name: string): string | undefined =>
  getItemPreview(name).stats.find((s) => s.startsWith('Coats weapon'));

describe('OTA-704 — coatings split out of food', () => {
  it('weapon coatings are detected; food/health items are not', () => {
    for (const n of ['Incendiary Paste', 'Poison Vial', 'Plague Vial', 'Static Paste']) {
      expect(isCoating(n)).toBe(true);
    }
    for (const n of ['Trail Rations', 'First Aid Kit']) {
      expect(isCoating(n)).toBe(false);
    }
  });
});

describe('OTA-704 — coating output is legible on the recipe card', () => {
  it('a coating row shows its damage dice + type', () => {
    expect(coatingLine('Incendiary Paste')).toBe('Coats weapon: +1d4 burn (Burning)');
    expect(coatingLine('Poison Vial')).toBe('Coats weapon: +1d4 poison (Poisoned)');
  });

  // ⚠ OTA-1559 — RETARGETED. The PROPERTY is that a premium coating reads
  // stronger on the card than a foraged one, and it still does — the gap simply
  // widened from 1d4→1d6 to 1d4→1d8 when the plague pair was moved onto the rung
  // its Disease Sample actually pays for. See ota1559 for the whole ladder.
  it('a higher-dice variant reads stronger (Plague Vial 1d8 > Poison Vial 1d4)', () => {
    expect(coatingLine('Poison Vial')).toContain('+1d4 poison');
    expect(coatingLine('Plague Vial')).toContain('+1d8 poison');
  });

  it('a stat-bonus variant surfaces the buff (Searing = same 1d4 fire + STR)', () => {
    // The "cooler name" trap: Incendiary and Searing deal identical fire, but
    // Searing also grants a stat — now visible, so the choice is informed.
    expect(coatingLine('Incendiary Paste')).toBe('Coats weapon: +1d4 burn (Burning)');
    expect(coatingLine('Searing Paste')).toBe('Coats weapon: +1d4 burn, +1 STR while coated (Searing)');
  });

  it('food/health items never render a coating line', () => {
    expect(coatingLine('Trail Rations')).toBeUndefined();
    expect(coatingLine('First Aid Kit')).toBeUndefined();
  });
});

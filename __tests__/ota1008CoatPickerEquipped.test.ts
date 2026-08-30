// OTA-1008 — WHICH ONE AM I HOLDING? The weapon- and armor-coating pickers
// listed candidates by bare name; nothing said which piece was currently
// equipped. Category lock: both pickers tag rows through withEquippedTag,
// which rides the SAME resolver as the inventory EQUIPPED badge
// (equippedSlotLabelFor) — one source of truth, no divergent copy.
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'screens', 'InventoryScreen.tsx'),
  'utf8',
);

describe('OTA-1008 — coating pickers show what is equipped', () => {
  it('one helper, riding the badge resolver — no divergent equip detection', () => {
    // Exactly one definition + two call sites (weapon picker, armor picker).
    expect((SRC.match(/withEquippedTag/g) ?? []).length).toBe(3);
    // The helper reads the SAME resolver the EQUIPPED badge uses.
    expect(SRC).toMatch(/const where = equippedSlotLabelFor\(item\);/);
    expect(SRC).toMatch(/· EQUIPPED \(\$\{where\}\)/);
  });

  it('the weapon-coating picker tags its rows (old bare label is gone)', () => {
    // ⚠ OTA-1556 — RETARGETED, NOT RELAXED. The label now passes through
    // `disambiguateCoatRow` first, which appends the weapon's condition when two
    // coatable rows would otherwise carry the identical word (the owner's two
    // Cudgels). The property THIS suite guards — every row still goes through
    // withEquippedTag, so the picker says which one you are holding — is
    // unchanged, and the suffix sits inside the tag rather than replacing it.
    expect(SRC.includes('label: withEquippedTag(disambiguateCoatRow(label, w), w),')).toBe(true);
    // Old shape: the row passed the bare label straight through.
    expect(SRC).not.toMatch(/label,\n\s*onPress: \(\) => \{\n\s*if \(isReplace\) \{/);
  });

  it('the armor-coating picker tags its rows (old bare ternary is gone)', () => {
    expect(SRC.includes('label: withEquippedTag(')).toBe(true);
    expect(SRC).not.toMatch(/label: alreadyType\n/);
  });
});

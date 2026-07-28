// OTA-1031 — WHICH ONE AM I HOLDING? The weapon- and armor-coating pickers
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

describe('OTA-1031 — coating pickers show what is equipped', () => {
  it('one helper, riding the badge resolver — no divergent equip detection', () => {
    // Exactly one definition + two call sites (weapon picker, armor picker).
    expect((SRC.match(/withEquippedTag/g) ?? []).length).toBe(3);
    // The helper reads the SAME resolver the EQUIPPED badge uses.
    expect(SRC).toMatch(/const where = equippedSlotLabelFor\(item\);/);
    expect(SRC).toMatch(/· EQUIPPED \(\$\{where\}\)/);
  });

  it('the weapon-coating picker tags its rows (old bare label is gone)', () => {
    expect(SRC.includes('label: withEquippedTag(label, w),')).toBe(true);
    // Old shape: the row passed the bare label straight through.
    expect(SRC).not.toMatch(/label,\n\s*onPress: \(\) => \{\n\s*if \(isReplace\) \{/);
  });

  it('the armor-coating picker tags its rows (old bare ternary is gone)', () => {
    expect(SRC.includes('label: withEquippedTag(')).toBe(true);
    expect(SRC).not.toMatch(/label: alreadyType\n/);
  });
});

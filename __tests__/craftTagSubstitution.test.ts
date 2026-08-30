// OTA-193 — verifies that misc items carrying the right material tag
// (a synthesized "Brass Sextant" with ['metal'], an inferred
// "Reclaimer's Cord" with ['fiber']) can stand in for a canonical
// scrap material in a recipe. Without this, the OTA-191 + OTA-192
// inference path generated useful items the player could only sell
// or scrap — they couldn't satisfy any recipe directly.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

import {
  canCraft,
  consumeIngredients,
  missingIngredients,
  previewCraftSubstitutions,
  isInferredItem,
  type Recipe,
} from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

// A real-shape inferred misc item carrying a single material tag.
function inferred(name: string, tag: string, opts: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `inf_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: 1,
    tags: [tag],
    rarity: 'Common',
    description: 'Test item.',
    ...opts,
  };
}

function material(name: string, qty: number): InventoryItem {
  return {
    id: `mat_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: qty,
    tags: [],
    rarity: 'Common',
    description: 'Stock material.',
  };
}

const IRON_SPEAR: Recipe = {
  result: 'Iron Spear',
  ingredients: [
    { name: 'Stick', quantity: 1 },
    { name: 'Scrap Metal', quantity: 1 },
  ],
};

const STONE_SPEAR: Recipe = {
  result: 'Stone Spear',
  ingredients: [
    { name: 'Stick', quantity: 1 },
    { name: 'Small Rock', quantity: 1 },
    { name: 'Patched Cloth', quantity: 1 },
  ],
};

describe('OTA-193 — canCraft accepts tag-substitute misc items', () => {
  it('a single Brass Sextant (metal) + a Stick satisfies Iron Spear', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      inferred('Brass Sextant', 'metal'),
    ];
    expect(canCraft(IRON_SPEAR, inv)).toBe(true);
  });

  it("a Reclaimer's Cord (fiber) satisfies Patched Cloth in Stone Spear", () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      material('Small Rock', 1),
      inferred("Reclaimer's Cord", 'fiber'),
    ];
    expect(canCraft(STONE_SPEAR, inv)).toBe(true);
  });

  it('mixed inventory: actual Scrap Metal AND a Brass Sextant — recipe satisfied by either', () => {
    const inv: InventoryItem[] = [
      material('Stick', 2),
      material('Scrap Metal', 1),
      inferred('Brass Sextant', 'metal'),
    ];
    expect(canCraft(IRON_SPEAR, inv)).toBe(true);
  });

  it('a non-material misc item with no relevant tag does NOT satisfy', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      inferred('Wooden Carving', 'organic'), // organic → Patched Cloth, NOT Scrap Metal
    ];
    expect(canCraft(IRON_SPEAR, inv)).toBe(false);
  });

  it('still fails when no substitute and no canonical material is present', () => {
    const inv: InventoryItem[] = [material('Stick', 1)];
    expect(canCraft(IRON_SPEAR, inv)).toBe(false);
  });
});

// OTA-613 — a single misc item carrying two substitute tags must NOT satisfy
// two different ingredients at once. Pre-fix, canCraft counted each ingredient
// independently while the drain consumed the item once, so a 2-material recipe
// crafted for 1.
const METAL_BONE_RELIC: Recipe = {
  result: 'Marrow Fetish',
  ingredients: [
    { name: 'Scrap Metal', quantity: 1 }, // tags: metal/plate/iron/blade
    { name: 'Bone Shard', quantity: 1 },  // tags: organic/bone
  ],
};

describe('OTA-613 — one item cannot substitute for two ingredients at once', () => {
  it('a single [metal, bone] misc item does NOT satisfy both Scrap Metal and Bone Shard', () => {
    const inv: InventoryItem[] = [
      inferred('Whisper Marrow', 'metal', { tags: ['metal', 'bone'] }),
    ];
    expect(canCraft(METAL_BONE_RELIC, inv)).toBe(false);
    expect(missingIngredients(METAL_BONE_RELIC, inv)).toEqual([
      { name: 'Bone Shard', quantity: 1 },
    ]);
  });

  it('two such items DO satisfy it, and the craft drains BOTH (no underpay)', () => {
    const inv: InventoryItem[] = [
      inferred('Whisper Marrow', 'metal', { id: 'wm1', tags: ['metal', 'bone'] }),
      inferred('Whisper Marrow', 'metal', { id: 'wm2', tags: ['metal', 'bone'] }),
    ];
    expect(canCraft(METAL_BONE_RELIC, inv)).toBe(true);
    const after = consumeIngredients(inv, METAL_BONE_RELIC);
    expect(after.reduce((n, i) => n + i.quantity, 0)).toBe(0);
  });
});

describe('OTA-193 — substitution preview lists what will be consumed', () => {
  it('previews a Brass Sextant as the Scrap Metal substitute', () => {
    const inv: InventoryItem[] = [material('Stick', 1), inferred('Brass Sextant', 'metal')];
    const subs = previewCraftSubstitutions(IRON_SPEAR, inv);
    expect(subs).toHaveLength(1);
    // ⚠ OTA-1552 — the preview now also carries the substitute's INSTANCE ID.
    // It always knew which row it was about to drain (it keys its allocation map
    // by item.id); it just threw the identity away, which is why nothing
    // downstream could offer "save THAT stack." `toMatchObject` keeps this
    // assertion about what OTA-193 is for — the ingredient/substitute/quantity
    // mapping — while the id is pinned in ota1552 where it belongs.
    expect(subs[0]).toMatchObject({ ingredient: 'Scrap Metal', substitute: 'Brass Sextant', quantity: 1 });
    expect(subs[0]!.id).toBe('inf_brass_sextant');
  });

  it('does NOT preview a substitution when the canonical material covers it', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      material('Scrap Metal', 1),
      inferred('Brass Sextant', 'metal'),
    ];
    const subs = previewCraftSubstitutions(IRON_SPEAR, inv);
    expect(subs).toHaveLength(0);
  });

  it('aggregates substitutions across multiple ingredients in one recipe', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      inferred('Sharp Stone Wedge', 'stone'),
      inferred('Cordage Loop', 'fiber'),
    ];
    const subs = previewCraftSubstitutions(STONE_SPEAR, inv);
    expect(subs).toHaveLength(2);
    const byIng = new Map(subs.map((s) => [s.ingredient, s.substitute]));
    expect(byIng.get('Small Rock')).toBe('Sharp Stone Wedge');
    expect(byIng.get('Patched Cloth')).toBe('Cordage Loop');
  });
});

describe('OTA-193 — consumeIngredients drains canonical first, then substitutes', () => {
  it('a craft satisfied entirely by canonical materials leaves substitutes untouched', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      material('Scrap Metal', 1),
      inferred('Brass Sextant', 'metal'),
    ];
    const after = consumeIngredients(inv, IRON_SPEAR);
    // Sextant survives — canonical materials drained first.
    expect(after.find((i) => i.name === 'Brass Sextant')).toBeDefined();
    expect(after.find((i) => i.name === 'Scrap Metal')).toBeUndefined();
  });

  it('a craft with no canonical material drains the substitute', () => {
    const inv: InventoryItem[] = [material('Stick', 1), inferred('Brass Sextant', 'metal')];
    const after = consumeIngredients(inv, IRON_SPEAR);
    expect(after.find((i) => i.name === 'Brass Sextant')).toBeUndefined();
    expect(after.find((i) => i.name === 'Stick')).toBeUndefined();
  });

  it('a stack of substitutable items drains the right count per craft', () => {
    const inv: InventoryItem[] = [
      material('Stick', 2),
      { ...inferred('Bronze Bits', 'metal'), quantity: 3 },
    ];
    const after = consumeIngredients(inv, IRON_SPEAR);
    // 1 stick + 1 bit consumed.
    expect(after.find((i) => i.name === 'Stick')?.quantity).toBe(1);
    expect(after.find((i) => i.name === 'Bronze Bits')?.quantity).toBe(2);
  });
});

describe('OTA-193 — substitution safety rails', () => {
  it('a stolen misc item is NOT auto-consumed for a craft', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      { ...inferred('Stolen Brass Box', 'metal'), stolen: true },
    ];
    expect(canCraft(IRON_SPEAR, inv)).toBe(false);
    const after = consumeIngredients(inv, IRON_SPEAR);
    // Stolen box left alone; stick wasn't burned because the craft fails.
    expect(after.find((i) => i.name === 'Stolen Brass Box')).toBeDefined();
  });

  it("a weapon carrying a 'metal' tag is NOT auto-consumed for a craft", () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      {
        id: 'w1',
        name: 'Iron Sword',
        kind: 'weapon',
        quantity: 1,
        tags: ['metal', 'blade'],
        rarity: 'Common',
        description: 'A sword.',
      },
    ];
    // Weapon doesn't substitute — recipe must still fail.
    expect(canCraft(IRON_SPEAR, inv)).toBe(false);
  });

  it('an armor item carrying a fiber tag is NOT auto-consumed', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      material('Small Rock', 1),
      {
        id: 'a1',
        name: 'Cloth Vest',
        kind: 'armor',
        quantity: 1,
        tags: ['cloth', 'fiber'],
        rarity: 'Common',
        description: 'A vest.',
      },
    ];
    expect(canCraft(STONE_SPEAR, inv)).toBe(false);
  });
});

describe('OTA-194 — heart-reserve protects inferred items from auto-substitute', () => {
  it('a reserved Brass Sextant is NOT auto-consumed for an Iron Spear', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      { ...inferred('Brass Sextant', 'metal'), reservedForFusion: true },
    ];
    expect(canCraft(IRON_SPEAR, inv)).toBe(false);
    const after = consumeIngredients(inv, IRON_SPEAR);
    expect(after.find((i) => i.name === 'Brass Sextant')).toBeDefined();
  });

  it('an UN-reserved sextant alongside a reserved one still substitutes', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      { ...inferred('Brass Sextant', 'metal'), id: 'sextant_a', reservedForFusion: true },
      { ...inferred('Bronze Coil', 'metal'), id: 'coil_b' },
    ];
    expect(canCraft(IRON_SPEAR, inv)).toBe(true);
    const after = consumeIngredients(inv, IRON_SPEAR);
    // Reserved sextant survives; un-reserved coil consumed.
    expect(after.find((i) => i.id === 'sextant_a')).toBeDefined();
    expect(after.find((i) => i.id === 'coil_b')).toBeUndefined();
  });

  it('missingIngredients reports the shortfall when only reserved subs exist', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      { ...inferred('Brass Sextant', 'metal'), reservedForFusion: true },
    ];
    expect(missingIngredients(IRON_SPEAR, inv)).toEqual([
      { name: 'Scrap Metal', quantity: 1 },
    ]);
  });

  it('previewCraftSubstitutions ignores reserved items', () => {
    const inv: InventoryItem[] = [
      material('Stick', 1),
      { ...inferred('Brass Sextant', 'metal'), reservedForFusion: true },
    ];
    expect(previewCraftSubstitutions(IRON_SPEAR, inv)).toHaveLength(0);
  });
});

describe('OTA-194 — isInferredItem predicate', () => {
  it('returns true for a synthesized misc name not in any catalog', () => {
    expect(isInferredItem("Whisper Marrow")).toBe(true);
    expect(isInferredItem("Reclaimer's Cord")).toBe(true);
    expect(isInferredItem('Brass Sextant')).toBe(true);
  });

  it('returns false for hand-authored catalog items', () => {
    // Scrap Metal lives in MATERIALS catalog.
    expect(isInferredItem('Scrap Metal')).toBe(false);
    // Iron Spear is a RECIPES result and a WEAPONS catalog entry.
    expect(isInferredItem('Iron Spear')).toBe(false);
  });

  it('returns false for empty / nonsense input', () => {
    expect(isInferredItem('')).toBe(false);
  });
});

describe('OTA-193 — missingIngredients reflects substitution', () => {
  it('reports nothing missing when substitutes cover the shortfall', () => {
    const inv: InventoryItem[] = [material('Stick', 1), inferred('Brass Sextant', 'metal')];
    expect(missingIngredients(IRON_SPEAR, inv)).toHaveLength(0);
  });

  it('reports the precise shortfall when substitutes are partial', () => {
    const inv: InventoryItem[] = [inferred('Brass Sextant', 'metal')];
    const missing = missingIngredients(IRON_SPEAR, inv);
    // Sextant covers the Scrap Metal; Stick still missing.
    expect(missing).toEqual([{ name: 'Stick', quantity: 1 }]);
  });
});

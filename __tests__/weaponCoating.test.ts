import {
  isCoatableWeapon, isCoatableItem, coatedDisplayName, coatingBlurb,
  coatingStatusKind, coatingDotPerTurn, rollLootCoating,
  COATING_DOT_TURNS, ACID_SHRED_PER_HIT, ACID_SHRED_MAX, CORRUPTION_STACK_BONUS, acidShredCap, ACID_SHRED_BOSS_BONUS,
} from '../app/engine/weaponCoating';
import { mergeOrPushItem } from '../app/engine/inventory';
import type { InventoryItem } from '../app/engine/types';
import { resolveItemEffect } from '../app/engine/itemEffect';
import { findGearByName, RECIPES } from '../app/engine/crafting';

// OTA-360 — weapon coatings. A consumable substance (poison / acid /
// corruption) painted onto a single weapon instance. Permanent for
// the weapon's life: survives a repair, lost only when the weapon
// breaks. Coatability is gated on damage type (an edge or a point
// carries the substance), the display name is derived (the base
// `name` is never renamed so stat lookup still resolves), and the
// three coating consumables + recipes are authored data.

describe('isCoatableWeapon — only edges and points hold a coating', () => {
  it('a bladed (slashing) melee weapon is coatable', () => {
    expect(isCoatableWeapon('Rusted Blade')).toBe(true);
  });
  it('a piercing melee weapon is coatable', () => {
    expect(isCoatableWeapon('Stone Spear')).toBe(true);
  });
  it('a piercing ranged weapon (arrows / bolts) is coatable', () => {
    expect(isCoatableWeapon('Salvaged Bow')).toBe(true);
  });
  it('OTA-492 — a bludgeoning melee weapon IS now coatable (per the player)', () => {
    expect(isCoatableWeapon('Mud-fist Wraps')).toBe(true);
  });
  it('an energy ranged weapon is NOT coatable (fires no point)', () => {
    expect(isCoatableWeapon('Rail Cannon')).toBe(false);
  });
  it('a non-weapon name is not coatable', () => {
    expect(isCoatableWeapon('Scrap Metal')).toBe(false);
    expect(isCoatableWeapon('')).toBe(false);
  });

  // OTA-453 — fused weapons are catalog-absent (stats on the instance), so the
  // name-only isCoatableWeapon always missed them and they never showed up under
  // "coat weapon." isCoatableItem reads the instance and allows fused weapons.
  it('a FUSED weapon (uniqueStats, catalog-absent name) IS coatable via isCoatableItem', () => {
    const fused = { name: 'Resonant Spike', kind: 'weapon' as const, uniqueStats: { kind: 'weapon' } };
    expect(isCoatableWeapon(fused.name)).toBe(false); // catalog miss (the bug)
    expect(isCoatableItem(fused)).toBe(true);          // fixed
  });
  it('isCoatableItem does NOT coat fused armor', () => {
    expect(isCoatableItem({ name: 'Woven Mantle', kind: 'armor', uniqueStats: { kind: 'armor' } })).toBe(false);
  });
  it('isCoatableItem allows all physical melee, incl. bludgeoning (OTA-492)', () => {
    expect(isCoatableItem({ name: 'Rusted Blade', kind: 'weapon' })).toBe(true);
    expect(isCoatableItem({ name: 'Mud-fist Wraps', kind: 'weapon' })).toBe(true);
  });
});

describe('coatedDisplayName — derived, never renames the base item', () => {
  it('prefixes the coating label when one is applied', () => {
    expect(
      coatedDisplayName({ name: 'Battle Axe', coating: { kind: 'corruption', dice: '1d4', label: 'Corrupted' } }),
    ).toBe('Corrupted Battle Axe');
  });
  it('returns the plain name when uncoated', () => {
    expect(coatedDisplayName({ name: 'Battle Axe' })).toBe('Battle Axe');
  });
});

describe('coatingBlurb — one line per kind', () => {
  it('describes each coating kind distinctly', () => {
    expect(coatingBlurb('poison')).toMatch(/poison/i);
    expect(coatingBlurb('acid')).toMatch(/armor/i);
    expect(coatingBlurb('corruption')).toMatch(/corruption/i);
  });
});

describe('coating combat math (OTA-362)', () => {
  it('coatingStatusKind maps each family to its DOT kind', () => {
    expect(coatingStatusKind('poison')).toBe('poison_coat');
    expect(coatingStatusKind('acid')).toBe('acid_coat');
    expect(coatingStatusKind('corruption')).toBe('corruption_coat');
  });

  it('poison / acid tick the rolled amount flat (no stack scaling)', () => {
    expect(coatingDotPerTurn('poison', 4, 0)).toBe(4);
    expect(coatingDotPerTurn('acid', 3, 0)).toBe(3);
    // stacks are ignored for non-corruption.
    expect(coatingDotPerTurn('poison', 4, 5)).toBe(4);
  });

  it('corruption ticks harder per accumulated stack', () => {
    // First hit (1 stack): just the rolled amount.
    expect(coatingDotPerTurn('corruption', 4, 1)).toBe(4);
    // Third hit (3 stacks): rolled + 2 × bonus.
    expect(coatingDotPerTurn('corruption', 4, 3)).toBe(4 + 2 * CORRUPTION_STACK_BONUS);
  });

  it('tuning constants are sane', () => {
    expect(COATING_DOT_TURNS).toBeGreaterThan(0);
    expect(ACID_SHRED_PER_HIT).toBeGreaterThan(0);
    expect(ACID_SHRED_MAX).toBeGreaterThanOrEqual(ACID_SHRED_PER_HIT);
  });
});

describe('rollLootCoating (OTA-363) — occasional coated-weapon loot', () => {
  it('never coats a non-coatable weapon, even on a guaranteed roll', () => {
    expect(rollLootCoating('Rail Cannon', { rng: () => 0 })).toBeNull(); // energy ranged — no point to coat
    expect(rollLootCoating('Scrap Metal', { rng: () => 0 })).toBeNull(); // not a weapon
  });

  it('coats a coatable weapon when the roll passes', () => {
    // rng() = 0 → 0 < chance (passes) → kind index floor(0 * 3) = 0 (poison).
    const c = rollLootCoating('Rust Dagger', { rng: () => 0 });
    expect(c).not.toBeNull();
    expect(c!.kind).toBe('poison');
    expect(c!.dice).toBe('1d4');
    expect(c!.label).toBe('Poisoned');
  });

  it('does not coat when the roll exceeds the chance', () => {
    // rng() = 0.99 ≥ default chance → null.
    expect(rollLootCoating('Rust Dagger', { rng: () => 0.99 })).toBeNull();
  });

  it('honors a custom chance', () => {
    expect(rollLootCoating('Rust Dagger', { chance: 0, rng: () => 0 })).toBeNull(); // 0 ≥ 0 → no
    expect(rollLootCoating('Rust Dagger', { chance: 1, rng: () => 0.5 })).not.toBeNull();
  });
});

describe('coated weapons never merge into a stack', () => {
  const blade = (coating?: InventoryItem['coating']): InventoryItem => ({
    id: Math.random().toString(36), name: 'Rust Dagger', kind: 'weapon', quantity: 1, tags: ['weapon'],
    durability: { current: 10, max: 10 }, ...(coating ? { coating } : {}),
  });

  it('a coated blade lands as its own row, not merged onto an uncoated twin', () => {
    let inv: InventoryItem[] = [blade()]; // one uncoated, fully durable
    inv = mergeOrPushItem(inv, blade({ kind: 'poison', dice: '1d4', label: 'Poisoned' }));
    expect(inv.length).toBe(2);
    expect(inv.filter((i) => i.coating).length).toBe(1);
  });

  it('two uncoated fully-durable twins still stack (no regression)', () => {
    let inv: InventoryItem[] = [blade()];
    inv = mergeOrPushItem(inv, blade());
    expect(inv.length).toBe(1);
    expect(inv[0]!.quantity).toBe(2);
  });
});

describe('coating consumables carry a coating effect spec', () => {
  const cases: Array<[string, 'poison' | 'acid' | 'corruption', string]> = [
    ['Poison Vial', 'poison', 'Poisoned'],
    ['Acid Flask', 'acid', 'Acid-Etched'],
    ['Corruption Tonic', 'corruption', 'Corrupted'],
  ];
  it.each(cases)('%s resolves a %s coating spec', (name, kind, label) => {
    const fx = resolveItemEffect(name, [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.coating).toBeDefined();
      expect(fx.coating?.kind).toBe(kind);
      expect(fx.coating?.label).toBe(label);
      expect(fx.coating?.dice).toBe('1d4');
    }
  });

  it('every coating consumable has a craftable recipe', () => {
    for (const [name] of cases) {
      const recipe = RECIPES.find((r) => r.result === name);
      expect(recipe).toBeDefined();
      expect((recipe?.ingredients.length ?? 0)).toBeGreaterThan(0);
    }
  });
});

describe('Disease Sample crafted items (OTA-370)', () => {
  // ⚠ OTA-1559 — RETARGETED, NOT RELAXED. A Plague Tonic demands a DISEASE
  // SAMPLE, the scarcest coating ingredient in the game, and rolled the same die
  // as a foraged Uncommon. The word this suite cares about is PREMIUM, and 1d8
  // is what premium now means; the ladder itself is pinned in ota1559.
  it('Plague Tonic is a premium 1d8 corruption coating', () => {
    const fx = resolveItemEffect('Plague Tonic', [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.coating?.kind).toBe('corruption');
      expect(fx.coating?.dice).toBe('1d8');
      expect(fx.coating?.label).toBe('Plagued');
    }
  });

  // ⚠ OTA-1559 — RETARGETED, same reason as the Tonic above.
  it('Plague Vial is a premium 1d8 poison coating', () => {
    const fx = resolveItemEffect('Plague Vial', [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.coating?.kind).toBe('poison');
      expect(fx.coating?.dice).toBe('1d8');
      expect(fx.coating?.label).toBe('Festering');
    }
  });

  it('Inoculant Draught is a corruption cure (reduceCorruption)', () => {
    const fx = resolveItemEffect('Inoculant Draught', [findGearByName]);
    expect(fx?.kind).toBe('consumable');
    if (fx?.kind === 'consumable') {
      expect(fx.reduceCorruption).toBeGreaterThan(0);
      expect(fx.coating).toBeUndefined(); // it's drunk, not painted on
    }
  });

  it('all three are crafted from Disease Sample (no duplicate-result recipes)', () => {
    for (const name of ['Plague Tonic', 'Plague Vial', 'Inoculant Draught']) {
      const matches = RECIPES.filter((r) => r.result === name);
      expect(matches).toHaveLength(1); // one recipe per result (convention held)
      expect(matches[0]!.ingredients.some((i) => i.name === 'Disease Sample')).toBe(true);
    }
  });

  // OTA-480 — armor-shred cap scales on bosses so acid gets SOME extra headroom
  // against the +6 boss-AC wall (a normal foe still caps at base).
  // ⚠ RETARGETED for OTA-1142 (owner tuning): the bonus was 6 — full parity with
  // the boss AC bonus — which let acid strip a boss 11 AC and, combined with
  // weakness-stagger, turned bosses into training dummies (exploit report E1,
  // stagger-lock). Now 2: acid still pays against bosses, it just can't erase
  // the wall.
  it('acidShredCap: normal foe caps at base, a boss gets modest headroom', () => {
    expect(acidShredCap({ boss: false })).toBe(ACID_SHRED_MAX);
    expect(acidShredCap(null)).toBe(ACID_SHRED_MAX);
    expect(acidShredCap({ boss: true })).toBe(ACID_SHRED_MAX + ACID_SHRED_BOSS_BONUS);
    expect(ACID_SHRED_BOSS_BONUS).toBe(2); // deliberately LESS than the +6 boss AC bonus
  });
});

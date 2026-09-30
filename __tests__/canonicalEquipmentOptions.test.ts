// Strategic repair — Phase 12. Focused, boot-free regression for
// test-utils/canonical/equipmentOptions.ts (equipmentScore + option
// construction across all covered slots) and its interaction with the
// UNMODIFIED policy.ts decide() 'equip'/'buy' branches.

import type { PlayerView } from '../test-utils/canonical/playerView';
import { buildEquipmentOptions, buildVendorEquipOptions, equipmentScore } from '../test-utils/canonical/equipmentOptions';
import { readItemMechanics } from '../test-utils/canonical/itemIntelligence';
import { decide } from '../test-utils/canonical/policy';

function makeView(overrides: { equipped?: Record<string, string>; inventoryNames?: string[] }): PlayerView {
  return {
    hp: 30, hpMax: 34, hpDelta: null, stamina: 20, staminaMax: 20, staminaDelta: null, canBlock: false,
    stats: {} as never, statProgress: {} as never, statusEffects: [] as never, power: 10, ac: 10, tc: 50, corruption: 0,
    inventory: (overrides.inventoryNames ?? []).map((name, i) => ({
      instanceId: `inst-${i}`, name, kind: 'weapon', quantity: 1, tags: [], card: null,
    })),
    equipped: (overrides.equipped ?? {}) as never,
    factionStanding: {} as never, earnedTitles: [], dog: null, golem: null, dead: false,
    position: { currentLocationId: 'test' }, mainQuest: {} as never, arbiter: [] as never, scene: null,
  } as unknown as PlayerView;
}

describe('Strategic repair — equipment build-value scoring', () => {
  it('scores a clearly superior armor piece higher regardless of its lower rarity (rarity-vs-value disagreement)', () => {
    const heirs = readItemMechanics("Heir's Dynastic Plate")!; // Uncommon, AC3, hpRegen2
    const aetherWing = readItemMechanics('Aether-Wing Cloak')!; // Rare, AC1, staminaRegen1
    expect(equipmentScore(heirs, [])).toBeGreaterThan(equipmentScore(aetherWing, []));
  });

  it('never reads item names — two identical mechanical reads under different names score identically (misleading-name negative control)', () => {
    const a = { ...readItemMechanics('Aetheric Locket')!, name: 'Aetheric Locket' };
    const b = { ...a, name: 'Totally Unrelated Amulet Of Nothing' };
    expect(equipmentScore(a, ['aetheric'])).toBe(equipmentScore(b, ['aetheric']));
  });

  it('values a disclosed-vulnerability match higher than an unrelated resist on an otherwise-identical item', () => {
    const locket = readItemMechanics('Aetheric Locket')!;
    expect(equipmentScore(locket, ['aetheric'])).toBeGreaterThan(equipmentScore(locket, ['poison']));
  });
});

describe('Strategic repair — buildEquipmentOptions across real slots', () => {
  it('fills an EMPTY amulet slot with an owned amulet regardless of rarity (empty-slot rule, §8)', () => {
    const view = makeView({ equipped: {}, inventoryNames: ['Aetheric Locket'] });
    const options = buildEquipmentOptions(view, ['aetheric']);
    const amuletOpt = options.find((o) => o.meta?.slot === 'amulet');
    expect(amuletOpt).toBeDefined();
    expect(amuletOpt!.category).toBe('equip');
    expect(Number(amuletOpt!.meta!.powerDelta)).toBeGreaterThan(0);
  });

  it('proposes replacing a worn chest piece with a clearly superior one, and decide() actually picks it (rarity-vs-value integration)', () => {
    const view = makeView({ equipped: { chest: 'Aether-Wing Cloak' }, inventoryNames: ["Heir's Dynastic Plate"] });
    const options = buildEquipmentOptions(view, []);
    const chestOpt = options.find((o) => o.meta?.slot === 'chest');
    expect(chestOpt).toBeDefined();
    expect(Number(chestOpt!.meta!.powerDelta)).toBeGreaterThan(0);
    const decision = decide(view, [chestOpt!]);
    expect(decision.optionId).toBe(chestOpt!.id);
  });

  it('does NOT propose a downgrade — a worn superior piece against a strictly worse candidate yields no option for that slot', () => {
    const view = makeView({ equipped: { chest: "Heir's Dynastic Plate" }, inventoryNames: ['Aether-Wing Cloak'] });
    const options = buildEquipmentOptions(view, []);
    expect(options.find((o) => o.meta?.slot === 'chest')).toBeUndefined();
  });

  it('recognizes a strictly-better main-hand weapon beyond rarity alone (weapon comparator, §14)', () => {
    // Mud-Rend Blade (Uncommon, 1d8) vs a lower catalog dagger the tutorial
    // might issue — using two real weapons with a clear damage gap.
    const view = makeView({ equipped: { main: 'Rusted Blade' }, inventoryNames: ['Mud-Rend Blade'] });
    const options = buildEquipmentOptions(view, []);
    const mainOpt = options.find((o) => o.meta?.slot === 'main');
    expect(mainOpt).toBeDefined();
  });
});

describe('Strategic repair — vendor equipment options (buildVendorEquipOptions)', () => {
  it('proposes buying an affordable, mechanically superior offer for an empty slot', () => {
    const view = makeView({ equipped: {} });
    const options = buildVendorEquipOptions(view, [{ itemName: 'Aetheric Locket', price: 28 }], 100, ['aetheric']);
    expect(options).toHaveLength(1);
    expect(options[0]!.category).toBe('buy');
  });

  it('never proposes an unaffordable item', () => {
    const view = makeView({ equipped: {} });
    const options = buildVendorEquipOptions(view, [{ itemName: 'Aetheric Locket', price: 28 }], 10, ['aetheric']);
    expect(options).toHaveLength(0);
  });

  it('never proposes a cosmetic/higher-rarity offer that is not a real mechanical upgrade over what is already worn', () => {
    const view = makeView({ equipped: { chest: "Heir's Dynastic Plate" } });
    const options = buildVendorEquipOptions(view, [{ itemName: 'Aether-Wing Cloak', price: 110 }], 500, []);
    expect(options).toHaveLength(0);
  });
});

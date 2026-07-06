// OTA-195 — verifies the fusion engine:
//   - gateFusion enforces ≥3 reserved inferred items + ≥3 distinct
//     material tags.
//   - validateFusionResponse parses + clamps + rejects degenerate
//     Qwen output.
//   - synthesizeFusionViaQwen returns null when Qwen isn't ready or
//     the response can't be validated.
//   - applyFusion drains inputs, mints the fused InventoryItem with
//     uniqueStats stamped, and the result name / kind / rarity match
//     the validated row.
//
// AsyncStorage is mocked because the fusion engine pulls in
// `isInferredItem` from crafting.ts, which (transitively, via item
// defaults) loads the synth cache.

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
  gateFusion,
  validateFusionResponse,
  synthesizeFusionViaQwen,
  applyFusion,
  synthesizeFusionNameViaQwen,
  fusionInputHash,
  type FusionSynthEngine,
} from '../app/engine/itemFusion';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

function inferred(name: string, tags: string[], opts: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `inf_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: 1,
    tags,
    rarity: 'Common',
    description: 'Inferred test item.',
    reservedForFusion: true,
    ...opts,
  };
}

class MockQwen implements FusionSynthEngine {
  constructor(private readonly ready: boolean, private readonly reply: string) {}
  isReady(): boolean { return this.ready; }
  async generate(): Promise<string> { return this.reply; }
}

describe('OTA-195 gateFusion — input rules', () => {
  it('refuses when fewer than 3 reserved inferred items are present', () => {
    const inv = [
      inferred('Brass Sextant', ['metal']),
      inferred("Reclaimer's Cord", ['fiber']),
    ];
    const gate = gateFusion(inv);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/at least 3/i);
  });

  it('refuses when reserved items span fewer than 3 distinct material tags', () => {
    const inv = [
      inferred('Brass Bit A', ['metal']),
      inferred('Brass Bit B', ['metal']),
      inferred('Brass Bit C', ['metal']),
    ];
    const gate = gateFusion(inv);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/different material types/i);
    expect(gate.tagProfile).toEqual(['metal']);
  });

  it('accepts when inputs cover 3+ distinct material tags', () => {
    const inv = [
      inferred('Brass Sextant', ['metal']),
      inferred("Reclaimer's Cord", ['fiber']),
      inferred('Wyrm Femur Fragment', ['organic', 'bone']),
    ];
    const gate = gateFusion(inv);
    expect(gate.ok).toBe(true);
    expect(gate.inputs).toHaveLength(3);
    expect(new Set(gate.tagProfile)).toEqual(new Set(['metal', 'fiber', 'organic', 'bone']));
  });

  it('ignores stolen items and items missing the heart flag', () => {
    const inv = [
      inferred('Brass Sextant', ['metal']),
      { ...inferred("Reclaimer's Cord", ['fiber']), stolen: true },
      inferred('Wyrm Femur Fragment', ['organic']),
      { ...inferred('Free Bone', ['organic']), reservedForFusion: false },
    ];
    const gate = gateFusion(inv);
    // Sextant + Femur = 2 eligible → refuses
    expect(gate.ok).toBe(false);
  });

  it('engine_Dev — material-tagged catalog items ARE fusable (widened reservable rule)', () => {
    const inv = [
      inferred('Brass Sextant', ['metal']),
      inferred("Reclaimer's Cord", ['fiber']),
      inferred('Wyrm Femur Fragment', ['organic']),
      // 'Scrap Metal' is a real MATERIALS catalog row (isInferredItem === false). A
      // lore-agnostic reskin catalogs most of its loot, so the old inferred-only gate
      // left players with almost nothing to fuse. engine_Dev now also accepts a
      // material-kind/misc item carrying a material tag, so cataloged scrap counts.
      { ...inferred('Scrap Metal', ['metal']), name: 'Scrap Metal' },
    ];
    const gate = gateFusion(inv);
    expect(gate.ok).toBe(true);
    expect(gate.inputs.find((i) => i.name === 'Scrap Metal')).toBeDefined();
  });
});

describe('OTA-195 validateFusionResponse — schema + clamps', () => {
  it('accepts a well-formed weapon response', () => {
    const r = validateFusionResponse({
      kind: 'weapon',
      name: 'Marrowsong Cleaver',
      description: 'A blade hummed from bone and brass.',
      rarity: 'Rare',
      damageDice: '1d8',
      damageType: 'slashing',
      scalesWith: 'strength',
      special: 'Resonates against organic armor.',
    });
    expect(r).not.toBeNull();
    expect(r?.name).toBe('Marrowsong Cleaver');
    expect(r?.stats.kind).toBe('weapon');
    expect(r?.stats.damageDice).toBe('1d8');
    expect(r?.stats.damageType).toBe('slashing');
    expect(r?.stats.scalesWith).toBe('strength');
    expect(r?.stats.rarity).toBe('Rare');
  });

  it('accepts a well-formed armor response with a slot + AC', () => {
    const r = validateFusionResponse({
      kind: 'armor',
      name: 'Cinderhalt Brace',
      description: 'A chest piece of woven fiber and crystal.',
      rarity: 'Legendary',
      armorSlot: 'chest',
      acBonus: 4,
      resistance: 'burn',
    });
    expect(r).not.toBeNull();
    expect(r?.stats.armorSlot).toBe('chest');
    expect(r?.stats.acBonus).toBe(4);
    expect(r?.stats.resistance).toBe('burn');
  });

  it('accepts a dog_armor response without a slot', () => {
    const r = validateFusionResponse({
      kind: 'dog_armor',
      name: 'Reclaimer Pattern Vigil',
      description: 'A vest fit for a hound.',
      rarity: 'Rare',
      acBonus: 2,
    });
    expect(r).not.toBeNull();
    expect(r?.stats.kind).toBe('dog_armor');
    expect(r?.stats.acBonus).toBe(2);
  });

  it('rejects an out-of-range damage die', () => {
    const r = validateFusionResponse({
      kind: 'weapon',
      name: 'Overkill Sword',
      description: 'No.',
      rarity: 'Legendary',
      damageDice: '4d12', // way out of the clamp
      damageType: 'slashing',
      scalesWith: 'strength',
    });
    expect(r).toBeNull();
  });

  it('rejects an unsupported damage type', () => {
    const r = validateFusionResponse({
      kind: 'weapon',
      name: 'Sonic Maul',
      description: 'Buzz.',
      rarity: 'Rare',
      damageDice: '1d8',
      damageType: 'sonic', // not in VALID_DAMAGE_TYPES
      scalesWith: 'strength',
    });
    expect(r).toBeNull();
  });

  it('rejects AC outside 1-6', () => {
    const r = validateFusionResponse({
      kind: 'armor',
      name: 'Plate of Gods',
      description: 'Too much.',
      rarity: 'Legendary',
      armorSlot: 'chest',
      acBonus: 12,
    });
    expect(r).toBeNull();
  });

  it('strips an unsupported resistance value', () => {
    const r = validateFusionResponse({
      kind: 'armor',
      name: 'Cloak',
      description: 'A cloak.',
      rarity: 'Rare',
      armorSlot: 'chest',
      acBonus: 2,
      resistance: 'nonsense_resist',
    });
    expect(r).not.toBeNull();
    expect(r?.stats.resistance).toBeUndefined();
  });

  it('rejects when kind is missing or unknown', () => {
    expect(validateFusionResponse({ kind: 'beverage', name: 'X', description: 'X', rarity: 'Rare' })).toBeNull();
    expect(validateFusionResponse({ name: 'X', description: 'X', rarity: 'Rare' })).toBeNull();
  });

  it('rejects when name is missing or empty', () => {
    const r = validateFusionResponse({
      kind: 'weapon',
      description: 'foo',
      rarity: 'Rare',
      damageDice: '1d6',
      damageType: 'slashing',
      scalesWith: 'strength',
    });
    expect(r).toBeNull();
  });
});

describe('OTA-195 synthesizeFusionViaQwen — gating + parse', () => {
  const inputs = [
    inferred('Brass Sextant', ['metal']),
    inferred("Reclaimer's Cord", ['fiber']),
    inferred('Wyrm Femur Fragment', ['organic']),
  ];
  const tagProfile = ['metal', 'fiber', 'organic'];

  it('returns null when Qwen is not ready', async () => {
    const qwen = new MockQwen(false, '{}');
    const r = await synthesizeFusionViaQwen(inputs, tagProfile, qwen);
    expect(r).toBeNull();
  });

  it('parses a well-formed Qwen reply', async () => {
    const reply = JSON.stringify({
      kind: 'weapon',
      name: 'Bone-Brass Cleaver',
      description: 'A short blade of brass-bound bone.',
      rarity: 'Rare',
      damageDice: '1d8',
      damageType: 'slashing',
      scalesWith: 'strength',
      special: 'Hums against organic plate.',
    });
    const qwen = new MockQwen(true, reply);
    const r = await synthesizeFusionViaQwen(inputs, tagProfile, qwen);
    expect(r).not.toBeNull();
    expect(r?.name).toBe('Bone-Brass Cleaver');
  });

  it('returns null on garbage', async () => {
    const qwen = new MockQwen(true, 'not even close to json');
    const r = await synthesizeFusionViaQwen(inputs, tagProfile, qwen);
    expect(r).toBeNull();
  });

  it('extracts JSON from markdown-fenced output', async () => {
    const reply = '```json\n' + JSON.stringify({
      kind: 'dog_armor',
      name: 'Reclaimer Vigil',
      description: 'A woven vest.',
      rarity: 'Rare',
      acBonus: 3,
    }) + '\n```';
    const qwen = new MockQwen(true, reply);
    const r = await synthesizeFusionViaQwen(inputs, tagProfile, qwen);
    expect(r).not.toBeNull();
    expect(r?.stats.kind).toBe('dog_armor');
  });
});

describe('OTA-195 applyFusion — mints and drains', () => {
  it('drains inputs by id and adds the fused item with uniqueStats', () => {
    const inv = [
      inferred('Brass Sextant', ['metal']),
      inferred("Reclaimer's Cord", ['fiber']),
      inferred('Wyrm Femur Fragment', ['organic']),
      // Bystander to ensure non-inputs are preserved.
      { id: 'bystander', name: 'Scrap Metal', kind: 'misc' as const, quantity: 2, tags: ['metal'], rarity: 'Common' as const, description: 'X' },
    ];
    const result = {
      name: 'Bone-Brass Cleaver',
      description: 'A short blade of brass-bound bone.',
      stats: {
        kind: 'weapon' as const,
        rarity: 'Rare' as const,
        durability: { current: 30, max: 30 },
        damageDice: '1d8',
        damageType: 'slashing',
        scalesWith: 'strength' as const,
        special: 'Hums.',
      },
    };
    const { inventory, fused } = applyFusion(inv, inv.slice(0, 3), result, 'seed42');
    // Inputs drained.
    expect(inventory.find((i) => i.id === inv[0].id)).toBeUndefined();
    expect(inventory.find((i) => i.id === inv[1].id)).toBeUndefined();
    expect(inventory.find((i) => i.id === inv[2].id)).toBeUndefined();
    // Bystander preserved.
    expect(inventory.find((i) => i.id === 'bystander')?.quantity).toBe(2);
    // Fused item present with uniqueStats stamped.
    expect(fused.name).toBe('Bone-Brass Cleaver');
    expect(fused.uniqueStats?.kind).toBe('weapon');
    expect(fused.uniqueStats?.damageDice).toBe('1d8');
    expect(fused.kind).toBe('weapon');
    expect(fused.tags).toContain('fused');
    expect(fused.tags).toContain('unique');
    expect(fused.durability).toEqual({ current: 30, max: 30 });
  });

  it('routes dog_armor results to the dog_armor InventoryItem kind', () => {
    const inputs = [
      inferred('Brass Sextant', ['metal']),
      inferred("Reclaimer's Cord", ['fiber']),
      inferred('Wyrm Femur Fragment', ['organic']),
    ];
    const result = {
      name: 'Reclaimer Vigil',
      description: 'A woven vest.',
      stats: {
        kind: 'dog_armor' as const,
        rarity: 'Rare' as const,
        durability: { current: 30, max: 30 },
        acBonus: 3,
      },
    };
    const { fused } = applyFusion(inputs, inputs, result, 'seed_d');
    expect(fused.kind).toBe('dog_armor');
    expect(fused.uniqueStats?.acBonus).toBe(3);
  });
});

describe('OTA-195 fusionInputHash — deterministic by sorted names', () => {
  it('same inputs in different order produce the same hash', () => {
    const a = [inferred('Alpha', ['metal']), inferred('Beta', ['fiber']), inferred('Gamma', ['organic'])];
    const b = [inferred('Gamma', ['organic']), inferred('Alpha', ['metal']), inferred('Beta', ['fiber'])];
    expect(fusionInputHash(a)).toBe(fusionInputHash(b));
  });

  it('different input sets produce different hashes', () => {
    const a = [inferred('Alpha', ['metal']), inferred('Beta', ['fiber']), inferred('Gamma', ['organic'])];
    const c = [inferred('Alpha', ['metal']), inferred('Beta', ['fiber']), inferred('Delta', ['stone'])];
    expect(fusionInputHash(a)).not.toBe(fusionInputHash(c));
  });
});


describe('OTA-704 — Qwen fusion name is sanitized against generic / cross-kind names', () => {
  const armorStats: UniqueItemStats = {
    kind: 'armor', rarity: 'Legendary', acBonus: 5, armorSlot: 'head',
    durability: { current: 45, max: 45 },
  } as unknown as UniqueItemStats;
  const inputs = [inferred('Aetheric Cog', ['aether', 'metal'])];
  const reply = (name) => JSON.stringify({ name, description: 'A ward of humming aether-plate.' });

  it('rejects "Aetheric Armor" (a real runecaster WEAPON) for an armor forge', async () => {
    expect(await synthesizeFusionNameViaQwen(armorStats, inputs, ['aether', 'metal'], new MockQwen(true, reply('Aetheric Armor')))).toBeNull();
  });
  it('rejects a bare "<theme> Armor" name', async () => {
    expect(await synthesizeFusionNameViaQwen(armorStats, inputs, ['aether'], new MockQwen(true, reply('Woven Armor')))).toBeNull();
  });
  it('accepts a distinct structured name', async () => {
    const out = await synthesizeFusionNameViaQwen(armorStats, inputs, ['aether'], new MockQwen(true, reply('Resonant Aegis')));
    expect(out?.name).toBe('Resonant Aegis');
  });
});

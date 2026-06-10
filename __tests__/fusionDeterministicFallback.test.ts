// OTA-221 — verifies the deterministic fusion fallback.
//
// Playtest log on OTA-219: player tapped fuse 20+ times after
// meeting every input gate. Qwen returned isReady()===false every
// time and the engine refused. They earned the fusion (3 reserved
// items, 3 distinct material tags) but the Qwen state issue
// permanently blocked them.
//
// The deterministic synth always returns a clamped valid
// UniqueItemStats from the input tag profile. Same shape as the
// Qwen path; less varied but always serviceable.

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

import { synthesizeFusionDeterministic } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

function mkInferred(name: string, tags: string[]): InventoryItem {
  return {
    id: `i_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: 1,
    tags,
    rarity: 'Common',
    description: 'inferred test',
    reservedForFusion: true,
  };
}

describe('OTA-221 — deterministic fusion fallback', () => {
  const inputs = [
    mkInferred('Aetheric Cog', ['loot', 'improvised', 'aether']),
    mkInferred('Mud Cloth', ['loot', 'cloth']),
    mkInferred('Tortoise Shell', ['loot', 'improvised']),
  ];
  const tagProfile = ['aether', 'cloth', 'improvised'];

  it('returns a name, description, and uniqueStats shape', () => {
    const r = synthesizeFusionDeterministic(inputs, tagProfile);
    expect(r.name.length).toBeGreaterThan(0);
    expect(r.description.length).toBeGreaterThan(0);
    expect(r.stats).toBeDefined();
    expect(['weapon', 'armor', 'dog_armor']).toContain(r.stats.kind);
    expect(['Rare', 'Legendary']).toContain(r.stats.rarity);
  });

  it('produces the same name for identical inputs (deterministic via hash)', () => {
    const a = synthesizeFusionDeterministic(inputs, tagProfile);
    const b = synthesizeFusionDeterministic(inputs, tagProfile);
    expect(a.name).toBe(b.name);
  });

  it('weapon results carry damageDice, damageType, and scalesWith', () => {
    // aether-dominant should pick weapon kind. Force aether dominance.
    const aetherInputs = [
      mkInferred('Aether Shard A', ['aether', 'crystal', 'loot']),
      mkInferred('Aether Shard B', ['aether', 'loot']),
      mkInferred('Aether Shard C', ['aether', 'metal']),
    ];
    const r = synthesizeFusionDeterministic(aetherInputs, ['aether', 'crystal', 'metal']);
    if (r.stats.kind === 'weapon') {
      expect(r.stats.damageDice).toMatch(/^\d+d\d+$/);
      expect(r.stats.damageType).toBeDefined();
      expect(r.stats.scalesWith).toBeDefined();
    }
  });

  it('armor results carry acBonus', () => {
    // cloth-dominant should produce dog_armor (no aether) per current rules.
    const clothInputs = [
      mkInferred('Cloth A', ['cloth', 'fiber']),
      mkInferred('Cloth B', ['cloth']),
      mkInferred('Cloth C', ['fiber', 'organic']),
    ];
    const r = synthesizeFusionDeterministic(clothInputs, ['cloth', 'fiber', 'organic']);
    if (r.stats.kind === 'armor' || r.stats.kind === 'dog_armor') {
      expect(r.stats.acBonus).toBeGreaterThanOrEqual(2);
      expect(r.stats.acBonus).toBeLessThanOrEqual(6);
    }
  });

  // OTA-445 — fusion is an investment, so the payoff is above-rare. Legendary
  // now lands at 4+ tags (was 5+); exactly 3 tags is the Rare floor.
  it('rarity is Legendary when 4+ tags are present', () => {
    const r4 = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised', 'metal']);
    expect(r4.stats.rarity).toBe('Legendary');
    const r5 = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised', 'metal', 'organic']);
    expect(r5.stats.rarity).toBe('Legendary');
  });

  it('rarity is Rare for exactly 3 tags', () => {
    const r = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised']);
    expect(r.stats.rarity).toBe('Rare');
  });

  // OTA-445 — every fused piece carries a real perk and above-rare power.
  it('fused gear is above-rare: a real perk + premium stats', () => {
    const r = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised', 'metal']);
    expect(r.stats.statBonus).toBeDefined();
    expect(r.stats.statBonus!.amount).toBeGreaterThanOrEqual(1);
    if (r.stats.kind === 'weapon') {
      // 2d6 (Rare) or 2d8 (Legendary) — never the old weak 1d8.
      expect(r.stats.damageDice).toMatch(/^2d[68]$/);
    } else {
      expect(r.stats.acBonus).toBeGreaterThanOrEqual(3);
    }
  });

  it('durability scales with rarity (35 Rare / 45 Legendary)', () => {
    const rare = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised']);
    expect(rare.stats.durability).toEqual({ current: 35, max: 35 });
    const legendary = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised', 'metal']);
    expect(legendary.stats.durability).toEqual({ current: 45, max: 45 });
  });

  it('description mentions the Crucible', () => {
    const r = synthesizeFusionDeterministic(inputs, tagProfile);
    expect(r.description).toMatch(/Crucible/i);
  });

  it('special line acknowledges the field-forged nature', () => {
    const r = synthesizeFusionDeterministic(inputs, tagProfile);
    expect(r.stats.special).toMatch(/field-forged/i);
  });
});

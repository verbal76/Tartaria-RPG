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
import type { InventoryItem, Rarity } from '../app/engine/types';

// OTA-1536 — the fixture now says what grade of scrap it is. Every input here
// was 'Common' and the assertions below still expected Legendary out, which is
// precisely the defect the owner reported ("fuse just keeps spitting out AC5
// gear"). Rarity is a parameter now because it is an INPUT to the answer.
function mkInferred(name: string, tags: string[], rarity: Rarity = 'Common'): InventoryItem {
  return {
    id: `i_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: 1,
    tags,
    rarity,
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
  // OTA-1536 — the same three pieces, but Rare. This is what an EARNED fusion
  // looks like, and it is what the OTA-445 power assertions below now measure.
  const richInputs = [
    mkInferred('Aetheric Cog', ['loot', 'improvised', 'aether'], 'Rare'),
    mkInferred('Mud Cloth', ['loot', 'cloth'], 'Rare'),
    mkInferred('Tortoise Shell', ['loot', 'improvised'], 'Rare'),
  ];

  it('returns a name, description, and uniqueStats shape', () => {
    const r = synthesizeFusionDeterministic(inputs, tagProfile);
    expect(r.name.length).toBeGreaterThan(0);
    expect(r.description.length).toBeGreaterThan(0);
    expect(r.stats).toBeDefined();
    expect(['weapon', 'armor', 'dog_armor']).toContain(r.stats.kind);
    // OTA-1536 — Uncommon joined the ladder as the scrap-fuse floor. Common
    // never appears: the Crucible costs a fee and three reserved pieces.
    expect(['Uncommon', 'Rare', 'Legendary']).toContain(r.stats.rarity);
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

  // ⚠⚠⚠ OTA-1536 — THIS PAIR ENCODED THE DEFECT AS INTENT. OTA-445 read the
  // tag count as the whole story ("4+ tags is Legendary, 3 is the Rare floor"),
  // and since the fixture is Common scrap, the suite was asserting that four
  // pieces of junk forge the best armor in the game — the exact behaviour the
  // owner reported. The tag count is still the +1; what it is added to is now
  // the best rarity among the inputs. Both halves are pinned below.
  it('4+ tags earns a tier ABOVE what the pack is worth, not Legendary outright', () => {
    const r4 = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised', 'metal']);
    expect(r4.stats.rarity).toBe('Uncommon');
    const r5 = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised', 'metal', 'organic']);
    expect(r5.stats.rarity).toBe('Uncommon');
    // …and on Rare scrap the same breadth reaches Legendary, so the variety
    // reward itself is intact.
    const rich = synthesizeFusionDeterministic(richInputs, ['aether', 'cloth', 'improvised', 'metal']);
    expect(rich.stats.rarity).toBe('Legendary');
  });

  it('exactly 3 tags returns the pack\'s own grade, floored at Uncommon', () => {
    const r = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised']);
    expect(r.stats.rarity).toBe('Uncommon');
    const rich = synthesizeFusionDeterministic(richInputs, ['aether', 'cloth', 'improvised']);
    expect(rich.stats.rarity).toBe('Rare');
  });

  // OTA-445 — every fused piece carries a real perk and above-rare power.
  // ⚠ OTA-1536 — measured on richInputs now. "Above-rare power" was always a
  // claim about an EARNED fusion; asserting it on Common scrap is what let the
  // scrap path reach AC 5. The perk half still holds at every tier (see the
  // separate floor test below).
  it('an EARNED fusion is above-rare: a real perk + premium stats', () => {
    const r = synthesizeFusionDeterministic(richInputs, ['aether', 'cloth', 'improvised', 'metal']);
    expect(r.stats.statBonus).toBeDefined();
    expect(r.stats.statBonus!.amount).toBeGreaterThanOrEqual(1);
    if (r.stats.kind === 'weapon') {
      // 2d6 (Rare) or 2d8 (Legendary) — never the old weak 1d8.
      expect(r.stats.damageDice).toMatch(/^2d[68]$/);
    } else {
      expect(r.stats.acBonus).toBeGreaterThanOrEqual(3);
    }
  });

  it('durability scales with rarity (25 Uncommon / 35 Rare / 45 Legendary)', () => {
    // OTA-1536 — same numbers OTA-445 set for Rare and Legendary; the pack that
    // reaches each tier is what changed. Uncommon is the new scrap floor.
    const scrap = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised']);
    expect(scrap.stats.durability).toEqual({ current: 25, max: 25 });
    const rare = synthesizeFusionDeterministic(richInputs, ['aether', 'cloth', 'improvised']);
    expect(rare.stats.durability).toEqual({ current: 35, max: 35 });
    const legendary = synthesizeFusionDeterministic(richInputs, ['aether', 'cloth', 'improvised', 'metal']);
    expect(legendary.stats.durability).toEqual({ current: 45, max: 45 });
  });

  // ⚠ OTA-1536 — the half of OTA-445's promise that must hold at EVERY tier: a
  // fused piece is never inert, however humble the scrap that made it.
  it('even the scrap-floor fusion carries a real perk', () => {
    const r = synthesizeFusionDeterministic(inputs, ['aether', 'cloth', 'improvised']);
    expect(r.stats.rarity).toBe('Uncommon');
    expect(r.stats.statBonus).toBeDefined();
    expect(r.stats.statBonus!.amount).toBeGreaterThanOrEqual(1);
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

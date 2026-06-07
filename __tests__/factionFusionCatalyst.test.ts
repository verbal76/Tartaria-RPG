import {
  gateFusion,
  findFactionCatalyst,
  applyFusion,
  synthesizeFusionDeterministic,
  type FactionTheme,
} from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

// arb105 — a reserved faction-gear item acts as an optional fusion
// CATALYST. It must NOT count toward the 3-scrap / 3-tag gate, but when
// present at fuse time it themes the output into a unique faction item
// (faction-prefixed name, faction_gear + factionId tags, Legendary) and is
// consumed alongside the scrap inputs.

function scrap(id: string, name: string, tags: string[]): InventoryItem {
  return { id, name, kind: 'misc', quantity: 1, tags, reservedForFusion: true };
}

const SCRAPS: InventoryItem[] = [
  scrap('s1', 'Inferred Aether Sliver', ['aether']),
  scrap('s2', 'Inferred Iron Strip', ['metal', 'iron']),
  scrap('s3', 'Inferred Bone Shard', ['bone', 'organic']),
];

const FACTION_GEAR: InventoryItem = {
  id: 'mc1',
  name: "Monarch's Court Blade",
  kind: 'weapon',
  quantity: 1,
  tags: ['weapon', 'faction_gear', 'mud_monarchs'],
  rarity: 'Uncommon',
  reservedForFusion: true,
};

describe('faction fusion catalyst (arb105)', () => {
  it('faction gear does NOT count toward the 3-scrap gate', () => {
    // Only 2 scraps + a reserved faction item → gate must still fail
    // (faction gear is not an eligible scrap input).
    const inv = [SCRAPS[0]!, SCRAPS[1]!, FACTION_GEAR];
    const gate = gateFusion(inv);
    expect(gate.ok).toBe(false);
  });

  it('3 scraps + a faction catalyst passes the gate (catalyst ignored by gate)', () => {
    const inv = [...SCRAPS, FACTION_GEAR];
    const gate = gateFusion(inv);
    expect(gate.ok).toBe(true);
    // The catalyst is NOT one of the consumed scrap inputs.
    expect(gate.inputs.find((i) => i.id === 'mc1')).toBeUndefined();
    expect(gate.inputs.length).toBe(3);
  });

  it('findFactionCatalyst finds only a RESERVED faction-gear item', () => {
    expect(findFactionCatalyst([...SCRAPS, FACTION_GEAR])?.id).toBe('mc1');
    // Not reserved → not a catalyst.
    expect(findFactionCatalyst([{ ...FACTION_GEAR, reservedForFusion: false }])).toBeNull();
    // Reserved scraps are not catalysts (no faction_gear tag).
    expect(findFactionCatalyst(SCRAPS)).toBeNull();
  });

  it('applyFusion with a faction theme produces a unique faction item + consumes the catalyst', () => {
    const inv = [...SCRAPS, FACTION_GEAR];
    const gate = gateFusion(inv);
    const result = synthesizeFusionDeterministic(gate.inputs, gate.tagProfile);
    // 5 distinct material tags → caller computes Legendary (≥4 tags).
    const theme: FactionTheme = { id: 'mud_monarchs', label: 'Mud Monarchs', catalystId: 'mc1', rarity: 'Legendary' };
    const { inventory: out, fused } = applyFusion(inv, gate.inputs, result, 'seed1', theme);

    // Output reads as a faction item.
    expect(fused.tags).toContain('faction_gear');
    expect(fused.tags).toContain('mud_monarchs');
    expect(fused.tags).toContain('fused');
    expect(fused.tags).toContain('unique');
    expect(fused.rarity).toBe('Legendary');
    expect(fused.uniqueStats?.rarity).toBe('Legendary');
    expect(fused.name.startsWith('Mud Monarchs ')).toBe(true);

    // The catalyst is consumed (drained to 0 → removed), along with the 3 scraps.
    expect(out.find((i) => i.id === 'mc1')).toBeUndefined();
    expect(out.find((i) => i.id === 's1')).toBeUndefined();
    // The fused item is in the output.
    expect(out.find((i) => i.id === fused.id)).toBeTruthy();
  });

  it('applyFusion WITHOUT a faction theme is unchanged (no faction tags, original rarity)', () => {
    const gate = gateFusion(SCRAPS);
    const result = synthesizeFusionDeterministic(gate.inputs, gate.tagProfile);
    const { fused } = applyFusion(SCRAPS, gate.inputs, result, 'seed2');
    expect(fused.tags).not.toContain('faction_gear');
    expect(fused.rarity).toBe(result.stats.rarity);
  });

  it('arb107 — faction rarity is bump-one-tier, not forced Legendary (a Rare theme stays Rare)', () => {
    // A minimal 3-distinct-tag set → caller computes Rare (< 4 tags).
    const minimal: InventoryItem[] = [
      scrap('m1', 'Inferred Aether Sliver', ['aether']),
      scrap('m2', 'Inferred Iron Strip', ['metal']),
      scrap('m3', 'Inferred Bone Shard', ['bone']),
    ];
    const gate = gateFusion(minimal);
    expect(gate.tagProfile.length).toBe(3);
    const result = synthesizeFusionDeterministic(gate.inputs, gate.tagProfile);
    const theme: FactionTheme = { id: 'mud_monarchs', label: 'Mud Monarchs', catalystId: 'x', rarity: 'Rare' };
    const { fused } = applyFusion(minimal, gate.inputs, result, 'seedR', theme);
    // Faction-themed (tags present) but NOT auto-Legendary.
    expect(fused.tags).toContain('faction_gear');
    expect(fused.rarity).toBe('Rare');
  });

  it('arb107 — applyFusion never DOWNGRADES below the synth rarity', () => {
    const gate = gateFusion(SCRAPS); // 5 tags → synth Legendary
    const result = synthesizeFusionDeterministic(gate.inputs, gate.tagProfile);
    expect(result.stats.rarity).toBe('Legendary');
    // Even if a (wrong) Rare theme were passed, the Legendary synth wins.
    const theme: FactionTheme = { id: 'mud_monarchs', label: 'Mud Monarchs', catalystId: 'x', rarity: 'Rare' };
    const { fused } = applyFusion(SCRAPS, gate.inputs, result, 'seedND', theme);
    expect(fused.rarity).toBe('Legendary');
  });
});

// OTA-202 — locks the format of the COPY-LOG inventory snapshot
// block. Player ask: a way to copy the inventory alongside the
// log for recurring-theme analysis. The snapshot has to read
// cleanly when pasted into chat AND survive light reshuffling
// (the player might re-equip / drop / pick up between log copies).

import { buildInventorySnapshot, stampInventoryExport } from '../app/diagnostics/inventorySnapshot';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

function mkItem(over: Partial<InventoryItem>): InventoryItem {
  return {
    id: `i_${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Item',
    kind: 'misc',
    quantity: 1,
    tags: [],
    rarity: 'Common',
    description: 'X',
    ...over,
  };
}

function mkPlayer(over: Partial<PlayerCharacter>): PlayerCharacter {
  return {
    name: 'Verbal',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: 40, hpMax: 50,
    stamina: 18, staminaMax: 20,
    ac: 12, tc: 88,
    corruption: 3,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'outskirts',
    activeQuests: [],
    ...over,
  } as PlayerCharacter;
}

describe('OTA-202 — buildInventorySnapshot', () => {
  it('handles a null player gracefully', () => {
    expect(buildInventorySnapshot(null)).toMatch(/no active character/i);
  });

  it('handles an empty pack', () => {
    const p = mkPlayer({ inventory: [] });
    const out = buildInventorySnapshot(p);
    expect(out).toMatch(/Pack: empty/);
    expect(out).toMatch(/Verbal/);
  });

  it('groups items by UI category (Weapons / Materials / Loot etc.) and sorts inside each bucket', () => {
    const inv: InventoryItem[] = [
      mkItem({ name: 'Iron Spear', kind: 'weapon', quantity: 1 }),
      mkItem({ name: 'Trail Rations', kind: 'consumable', quantity: 4, tags: ['food'] }),
      mkItem({ name: 'Scrap Metal', kind: 'misc', quantity: 8, tags: ['metal'] }),
      mkItem({ name: 'Patched Cloth', kind: 'misc', quantity: 3, tags: ['cloth'] }),
    ];
    const out = buildInventorySnapshot(mkPlayer({ inventory: inv }));
    expect(out).toMatch(/Weapons \(1\)/);
    expect(out).toMatch(/Iron Spear/);
    // Trail Rations + Patched Cloth + Scrap Metal are all in MATERIALS
    // catalog → 'material' bucket → "Materials" label per the UI.
    expect(out).toMatch(/Materials/);
    expect(out).toMatch(/Trail Rations ×4/);
    expect(out).toMatch(/Scrap Metal ×8/);
  });

  it('OTA-204/491 — uncatalogued kind:misc loot → LOOT; a throwable misc → Weapons', () => {
    const inv: InventoryItem[] = [
      // OTA-491 — Shaped Aetheric Shard (gear.json kind:'misc' + 'throwable') is a
      // one-throw WEAPON now, so the categorizer routes it to Weapons, not Loot.
      mkItem({ name: 'Shaped Aetheric Shard', kind: 'misc', tags: ['throwable', 'aether'] }),
      // Tortoise Shell is NOT in any catalog AND has no material-tag
      // match (only 'loot', 'improvised') → falls through to LOOT.
      mkItem({ name: 'Tortoise Shell', kind: 'misc', tags: ['loot', 'improvised'] }),
    ];
    const out = buildInventorySnapshot(mkPlayer({ inventory: inv }));
    expect(out).toMatch(/Loot \(1\)/);
    expect(out).toMatch(/Weapons \(1\)/);
    expect(out).toMatch(/Shaped Aetheric Shard/);
    expect(out).toMatch(/Tortoise Shell/);
  });

  it('OTA-204 — surfaces weapon damage dice + damage type from the catalog', () => {
    // Iron Spear is in WEAPONS catalog. Snapshot should include
    // damage dice like "1d6 piercing".
    const inv: InventoryItem[] = [
      mkItem({ name: 'Iron Spear', kind: 'weapon' }),
    ];
    const out = buildInventorySnapshot(mkPlayer({ inventory: inv }));
    expect(out).toMatch(/Iron Spear.*\dd\d+ \w+/);
  });

  it('OTA-206 — actions line surfaces use/equip/scrap/drop/repair/save-for-fusion gates', () => {
    const sword: InventoryItem = {
      id: 'w_iron',
      name: 'Iron Spear',
      kind: 'weapon',
      quantity: 1,
      tags: ['weapon', 'melee', 'piercing'],
      rarity: 'Common',
      description: 'A spear.',
      durability: { current: 6, max: 20 },
    };
    const reservedJunk: InventoryItem = {
      id: 'j_widget',
      name: 'Brass Widget',
      kind: 'misc',
      quantity: 1,
      tags: ['metal', 'improvised'],
      rarity: 'Common',
      description: 'A widget.',
      reservedForFusion: true,
    };
    const equipped: InventoryItem = {
      id: 'w_equipped',
      name: 'Bolt-Caster',
      kind: 'weapon',
      quantity: 1,
      tags: ['weapon', 'ranged'],
      rarity: 'Uncommon',
      description: 'X',
      durability: { current: 25, max: 25 },
    };
    const p = mkPlayer({
      inventory: [sword, reservedJunk, equipped],
      equipped: { main: 'Bolt-Caster' },
    });
    const out = buildInventorySnapshot(p);
    // Constrain regex to the same item block: name line + actions
    // line on the next line. [^\n] keeps us inside one item.
    const ironSpearActs = out.match(/Iron Spear[^\n]*\n[^\n]*actions:\s*([^\n]+)/)?.[1] ?? '';
    expect(ironSpearActs).toMatch(/equip:/);
    expect(ironSpearActs).toMatch(/repair/);
    expect(ironSpearActs).toMatch(/drop/);
    const brassActs = out.match(/Brass Widget[^\n]*\n[^\n]*actions:\s*([^\n]+)/)?.[1] ?? '';
    expect(brassActs).toMatch(/release-from-fusion/);
    expect(brassActs).toMatch(/drop/);
    expect(brassActs).toMatch(/scrap/);
    const boltActs = out.match(/Bolt-Caster[^\n]*\n[^\n]*actions:\s*([^\n]+)/)?.[1] ?? '';
    expect(boltActs).toMatch(/unequip:main/);
    // Bolt-Caster is equipped → no drop offered.
    expect(boltActs).not.toMatch(/drop/);
  });

  it('OTA-207 — Sentinel Core Plate (crafting material) does NOT get equip:chest', () => {
    const plate: InventoryItem = {
      id: 'scp',
      name: 'Sentinel Core Plate',
      kind: 'misc',
      quantity: 1,
      tags: ['automation', 'tech', 'salvage', 'scrap'],
      rarity: 'Uncommon',
      description: 'X',
    };
    const out = buildInventorySnapshot(mkPlayer({ inventory: [plate] }));
    const acts = out.match(/Sentinel Core Plate[^\n]*\n[^\n]*actions:\s*([^\n]+)/)?.[1] ?? '';
    expect(acts).not.toMatch(/equip:/);
    expect(acts).not.toMatch(/use/);
  });

  it('OTA-208 — Shaped Aetheric Shard surfaces equip:main/equip:off (it IS a weapon now)', () => {
    const shard: InventoryItem = {
      id: 'shard',
      name: 'Shaped Aetheric Shard',
      kind: 'misc',
      quantity: 1,
      tags: ['throwable', 'aether', 'shaped'],
      rarity: 'Rare',
      description: 'X',
    };
    const out = buildInventorySnapshot(mkPlayer({ inventory: [shard] }));
    const acts = out.match(/Shaped Aetheric Shard[^\n]*\n[^\n]*actions:\s*([^\n]+)/)?.[1] ?? '';
    expect(acts).toMatch(/equip:main/);
    expect(acts).toMatch(/equip:off/);
    expect(acts).toMatch(/drop/);
    // No standalone 'throw' label — the throw is the attack.
    expect(acts).not.toMatch(/\bthrow\b/);
  });

  it('OTA-208 — non-throwable items still do NOT show weapon-equip actions', () => {
    const cloth: InventoryItem = {
      id: 'cs',
      name: 'Cloth Scrap',
      kind: 'misc',
      quantity: 1,
      tags: ['fiber', 'junk', 'scrap'],
      rarity: 'Common',
      description: 'X',
    };
    const out = buildInventorySnapshot(mkPlayer({ inventory: [cloth] }));
    const acts = out.match(/Cloth Scrap[^\n]*\n[^\n]*actions:\s*([^\n]+)/)?.[1] ?? '';
    expect(acts).not.toMatch(/equip:/);
  });

  it('OTA-206 — Aetheric Vision Lens (gate effect) surfaces use action', () => {
    const lens: InventoryItem = {
      id: 'lens',
      name: 'Aetheric Vision Lens',
      kind: 'relic',
      quantity: 1,
      tags: ['exploration', 'relic'],
      rarity: 'Common',
      description: 'X',
    };
    const p = mkPlayer({ inventory: [lens] });
    const out = buildInventorySnapshot(p);
    const acts = out.match(/Aetheric Vision Lens[^\n]*\n[^\n]*actions:\s*([^\n]+)/)?.[1] ?? '';
    expect(acts).toMatch(/use/);
  });

  it('OTA-204 — prefixes inferred items with ◆ marker but NOT catalog items', () => {
    const inv: InventoryItem[] = [
      mkItem({ name: 'Shaped Aetheric Shard', kind: 'misc' }), // catalog
      mkItem({ name: "Whisper Marrow", kind: 'misc', tags: ['organic'] }), // inferred
    ];
    const out = buildInventorySnapshot(mkPlayer({ inventory: inv }));
    // Inferred gets the ◆.
    expect(out).toMatch(/◆ Whisper Marrow/);
    // Catalog does NOT.
    expect(out).not.toMatch(/◆ Shaped Aetheric Shard/);
  });

  it('surfaces per-instance metadata: rarity, durability, equipped slot, stolen, reserved, unique', () => {
    const equippedSword = mkItem({
      id: 'sword_main',
      name: 'Iron Sword',
      kind: 'weapon',
      quantity: 1,
      durability: { current: 12, max: 20 },
      rarity: 'Uncommon',
    });
    const stolenLocket = mkItem({
      name: 'Aetheric Locket',
      kind: 'relic',
      stolen: true,
      rarity: 'Rare',
    });
    const reservedScrap = mkItem({
      name: "Reclaimer's Cord",
      kind: 'misc',
      tags: ['fiber'],
      reservedForFusion: true,
    });
    const fused = mkItem({
      name: 'Marrowsong Cleaver',
      kind: 'weapon',
      rarity: 'Rare',
      uniqueStats: {
        kind: 'weapon',
        rarity: 'Rare',
        durability: { current: 30, max: 30 },
        damageDice: '2d6',
        damageType: 'slashing',
        scalesWith: 'strength',
        resistance: 'burn',
        special: 'Hums against organic plate.',
      },
    });
    const p = mkPlayer({
      inventory: [equippedSword, stolenLocket, reservedScrap, fused],
      equipped: { main: 'Iron Sword' },
    });
    const out = buildInventorySnapshot(p);
    expect(out).toMatch(/Iron Sword.*dur 12\/20/);
    expect(out).toMatch(/Iron Sword.*equipped:main/);
    expect(out).toMatch(/Aetheric Locket.*Rare/);
    expect(out).toMatch(/Aetheric Locket.*stolen/);
    expect(out).toMatch(/Reclaimer's Cord.*♥reserved/);
    expect(out).toMatch(/Marrowsong Cleaver.*2d6 slashing/);
    expect(out).toMatch(/Marrowsong Cleaver.*resist:burn/);
    expect(out).toMatch(/unique/);
  });

  it('includes the HP / stamina / TC / corruption header', () => {
    const p = mkPlayer({
      hp: 22, hpMax: 50,
      stamina: 7, staminaMax: 20,
      tc: 124,
      corruption: 8,
      inventory: [mkItem({ name: 'Stick' })],
    });
    const out = buildInventorySnapshot(p);
    expect(out).toMatch(/HP: 22\/50/);
    expect(out).toMatch(/Stamina: 7\/20/);
    expect(out).toMatch(/TC: 124/);
    expect(out).toMatch(/Corruption: 8/);
  });

  it('OTA-203 — stampInventoryExport wraps the snapshot in a greppable BEGIN/END envelope', () => {
    const out = stampInventoryExport(
      'Inventory (Verbal)\n  Pack: empty',
      'Device\n  Platform: android\n',
      'Verbal',
    );
    expect(out).toMatch(/=== TARTARIA INVENTORY · \d+ CHARS · BEGIN ===/);
    expect(out).toMatch(/=== END INVENTORY · \d+ CHARS ===/);
    expect(out).toMatch(/Tartaria Realms · Verbal/);
    expect(out).toMatch(/Pack: empty/);
    expect(out).toMatch(/Platform: android/);
  });

  it('OTA-203 — envelope tolerates a missing player name', () => {
    const out = stampInventoryExport('snap', 'dev');
    expect(out).toMatch(/Tartaria Realms\n\ndev/);
  });

  it('includes the dog line when a dog is with the player', () => {
    const p = mkPlayer({
      inventory: [mkItem({ name: 'Stick' })],
      dog: {
        id: 'rocky',
        name: 'Rocky',
        breed: 'mongrel',
        sex: { raw: 'boy', pronoun: 'he' },
        startingProfile: 'mongrel',
        hp: 10, hpMax: 14,
        stats: { strength: 10, dexterity: 10, intelligence: 10 },
        statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
        loyalty: 65,
        lastFedAtHour: 0,
        equipped: { vest: null },
        status: 'with_player',
      },
    } as Partial<PlayerCharacter>);
    const out = buildInventorySnapshot(p);
    expect(out).toMatch(/Dog: Rocky/);
    expect(out).toMatch(/loyalty 65/);
  });
});

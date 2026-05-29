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

  it('groups items by kind and sorts inside each bucket', () => {
    const inv: InventoryItem[] = [
      mkItem({ name: 'Iron Spear', kind: 'weapon', quantity: 1 }),
      mkItem({ name: 'Aetheric Cleaver', kind: 'weapon', quantity: 1 }),
      mkItem({ name: 'Trail Rations', kind: 'consumable', quantity: 4 }),
      mkItem({ name: 'Scrap Metal', kind: 'misc', quantity: 8 }),
      mkItem({ name: 'Patched Cloth', kind: 'misc', quantity: 3 }),
    ];
    const out = buildInventorySnapshot(mkPlayer({ inventory: inv }));
    // Weapons bucket present; Aetheric Cleaver comes first alphabetically.
    expect(out).toMatch(/Weapons \(2\)/);
    const weaponIdx = out.indexOf('Weapons');
    const aethericIdx = out.indexOf('Aetheric Cleaver');
    const ironIdx = out.indexOf('Iron Spear');
    expect(aethericIdx).toBeGreaterThan(weaponIdx);
    expect(ironIdx).toBeGreaterThan(aethericIdx);
    expect(out).toMatch(/Materials & Misc \(2\)/);
    expect(out).toMatch(/Trail Rations ×4/);
    expect(out).toMatch(/Scrap Metal ×8/);
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

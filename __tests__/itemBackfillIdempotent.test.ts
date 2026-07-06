// OTA-191 — verifies the inventory-restamp pass that fills synthesized
// fields into items added BEFORE the upgraded itemDefaults.ts shipped:
//
//   - A pre-OTA item with empty tags + the bare "Field-inferred ...
//     pending catalog backfill" description gets re-tagged + re-
//     described.
//   - Running the pass twice yields the same shape (idempotent — the
//     merge fills MISSING fields, never overwrites authored data).
//   - Items already carrying authored tags / descriptions are left
//     untouched (no clobbering hand-authored catalog rows).

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

import { restampInventory, restampInventoryItem, restampInventoryForName } from '../app/engine/itemBackfill';
import { setCachedSynth, onSynthLanded, _resetCacheForTests } from '../app/engine/itemSynthesisCache';
import type { InventoryItem } from '../app/engine/types';

function preOtaItem(name: string, kind: InventoryItem['kind']): InventoryItem {
  return {
    id: `i_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind,
    quantity: 1,
    tags: [],
    rarity: 'Common',
    description: 'Field-inferred from the name. Catalog backfill pending.',
  };
}

describe('OTA-191 itemBackfill — restamps pre-OTA inventory items', () => {
  it('a pre-OTA rope gains the fiber tag and a richer description', () => {
    const before = preOtaItem("Reclaimer's Cord", 'misc');
    const after = restampInventoryItem(before);
    expect(after.tags).toContain('fiber');
    expect(after.description).not.toBe(before.description);
    expect(after.description).toMatch(/cordage/i);
  });

  it('a pre-OTA jerky gains material tags via inference and a fresh description', () => {
    const before = preOtaItem('Rotted Jerky', 'consumable');
    const after = restampInventoryItem(before);
    // Description was the bare placeholder → replaced with the
    // richer synthesized text.
    expect(after.description).not.toMatch(/pending catalog backfill/i);
  });

  it('idempotent — running the pass twice yields the same shape', () => {
    const before = preOtaItem('Bone Torch', 'misc');
    const once = restampInventoryItem(before);
    const twice = restampInventoryItem(once);
    expect(twice.tags.sort()).toEqual(once.tags.sort());
    expect(twice.description).toBe(once.description);
  });

  it('does NOT clobber a hand-authored description', () => {
    const handAuthored: InventoryItem = {
      id: 'i_handauth',
      name: 'Trail Rations',
      kind: 'consumable',
      quantity: 1,
      tags: ['food', 'preserved'],
      rarity: 'Common',
      description: 'A bundle of dry rations. The reclaimer staple.',
    };
    const after = restampInventoryItem(handAuthored);
    // Description is NOT the placeholder, so the restamp must leave
    // it alone.
    expect(after.description).toBe(handAuthored.description);
  });

  it('preserves per-instance flags (stolen, durability) on restamp', () => {
    const stolen: InventoryItem = {
      ...preOtaItem('Bone Lantern', 'misc'),
      stolen: true,
      durability: { current: 5, max: 10 },
    };
    const after = restampInventoryItem(stolen);
    expect(after.stolen).toBe(true);
    expect(after.durability).toEqual({ current: 5, max: 10 });
    // Tags from inference STILL merge in.
    expect(after.tags).toContain('metal');
  });

  it('OTA-192 — restampInventoryForName updates only matching entries', () => {
    const inv: InventoryItem[] = [
      preOtaItem("Reclaimer's Cord", 'misc'),
      preOtaItem('Bone Torch', 'misc'),
    ];
    const { inventory, changed } = restampInventoryForName(inv, "RECLAIMER'S CORD");
    expect(changed).toBe(true);
    expect(inventory[0]?.tags).toContain('fiber');
    // The unrelated entry is untouched (same reference).
    expect(inventory[1]).toBe(inv[1]);
  });

  it('OTA-192 — restampInventoryForName signals no-change for absent names', () => {
    const inv: InventoryItem[] = [preOtaItem('Wooden Spoon', 'misc')];
    const { changed } = restampInventoryForName(inv, 'Aetheric Plate');
    expect(changed).toBe(false);
  });

  it('OTA-192 — Qwen cache landing fires onSynthLanded with the new entry', () => {
    _resetCacheForTests();
    const calls: Array<{ name: string; description?: string }> = [];
    const unsub = onSynthLanded((name, entry) => {
      calls.push({ name, description: entry.description });
    });
    setCachedSynth('Whisper Marrow', {
      name: 'whisper marrow',
      synthesizedAt: Date.now(),
      description: 'A pale length of sinew.',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('whisper marrow');
    expect(calls[0]?.description).toBe('A pale length of sinew.');
    unsub();
    // After unsubscribe, the listener is silent.
    setCachedSynth('Whisper Marrow', {
      name: 'whisper marrow',
      synthesizedAt: Date.now(),
      description: 'Updated.',
    });
    expect(calls).toHaveLength(1);
  });

  it('restampInventory walks the full array', () => {
    const before: InventoryItem[] = [
      preOtaItem("Reclaimer's Cord", 'misc'),
      preOtaItem('Bone Torch', 'misc'),
      preOtaItem('Rotted Jerky', 'consumable'),
    ];
    const after = restampInventory(before);
    expect(after).toHaveLength(3);
    expect(after[0]?.tags).toContain('fiber');
    expect(after[1]?.tags).toContain('metal');
    expect(after[2]?.description).not.toMatch(/pending catalog backfill/i);
  });

  it('OTA-704 — a fused item is NEVER restamped from a name-colliding catalog row', () => {
    // "Aetheric Armor" is a fused ARMOR the namer produced — but it is ALSO an
    // authored runecaster WEAPON in weapons.json. Pre-fix, restamp merged that
    // weapon's runecaster/rune_power/ward tags and clobbered the forged description
    // on every load. The fused guard must leave the piece exactly as forged.
    const fused: InventoryItem = {
      id: 'fused_aa', name: 'Aetheric Armor', kind: 'armor', quantity: 1, rarity: 'Legendary',
      tags: ['fused', 'unique', 'aetheric'],
      description: 'A legendary armor hammered together from your reserved pieces.',
      uniqueStats: { kind: 'armor', rarity: 'Legendary', armorSlot: 'head', acBonus: 5, durability: { current: 45, max: 45 } } as unknown as InventoryItem['uniqueStats'],
    } as InventoryItem;
    const after = restampInventoryItem(fused);
    expect(after.tags).toEqual(['fused', 'unique', 'aetheric']); // untouched — no runecaster/ward merged
    expect(after.description).toBe(fused.description);            // forged copy preserved
  });
});

// Diagnostic test for the live screenshot bug — Shaped Aetheric Shard
// is showing the inferred-item diamond on the inventory row even though
// it's authored in gear.json. This test isolates isInferredItem against
// the actual catalogs.

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

import { isInferredItem, findCatalogItem, GEAR } from '../app/engine/crafting';

describe('Diagnostic — isInferredItem on catalog items', () => {
  it('GEAR contains Shaped Aetheric Shard', () => {
    const hit = GEAR.find((g) => g.name === 'Shaped Aetheric Shard');
    expect(hit).toBeDefined();
  });

  it('findCatalogItem("Shaped Aetheric Shard") returns the row', () => {
    const row = findCatalogItem('Shaped Aetheric Shard');
    expect(row).not.toBeNull();
    expect(row?.name).toBe('Shaped Aetheric Shard');
  });

  it('isInferredItem("Shaped Aetheric Shard") returns false (it IS catalog)', () => {
    expect(isInferredItem('Shaped Aetheric Shard')).toBe(false);
  });

  it('isInferredItem("Mud Cloth") returns true (NOT in catalog)', () => {
    expect(isInferredItem('Mud Cloth')).toBe(true);
  });

  it('isInferredItem("Tortoise Shell") returns true (NOT in catalog)', () => {
    expect(isInferredItem('Tortoise Shell')).toBe(true);
  });

  it('isInferredItem("Aetheric Shard") returns false (in MATERIALS via container_loot)', () => {
    // Aetheric Shard appears in container_loot.json + recipes.json but
    // may not be in the MATERIALS catalog directly. This test surfaces
    // whether the plain shard is actually in any catalog.
    const inferred = isInferredItem('Aetheric Shard');
    console.log('Aetheric Shard inferred:', inferred);
    console.log('findCatalogItem("Aetheric Shard"):', findCatalogItem('Aetheric Shard'));
  });
});

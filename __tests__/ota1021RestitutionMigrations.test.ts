// OTA-1021 — restitution (snapshot-audit batch A): retired catalog names now
// MIGRATE on load instead of silently degrading to inferred Commons, and a
// gem resurrection loads the same migrated world memory as a normal load.
import * as fs from 'fs';
import * as path from 'path';
import { LEGACY_ITEM_RENAMES, applyLegacyItemRenames, migrateLegacyName } from '../app/engine/itemMigrations';
const STORE = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
// The finders INFER on a miss (that is the very degradation this batch fixes),
// so catalog membership must be checked against the raw data files.
const CATALOG_NAMES = new Set<string>();
for (const f of ['weapons', 'armor', 'gear', 'exploration', 'materials']) {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'items', `${f}.json`), 'utf8'));
  const rows: any[] = Array.isArray(d) ? d : (Object.values(d).find((v) => Array.isArray(v)) as any[]) ?? [];
  for (const r of rows) if (r && r.name) CATALOG_NAMES.add(r.name);
}

describe('OTA-1021 — every retired name maps to a REAL surviving catalog row', () => {
  it('all 8 known orphans are covered', () => {
    for (const orphan of [
      'Skyreacher Boltcaster', 'Skyreacher Greaves',
      'Advanced Aetheric Torch', 'Endless Aether Torch',
      'Mire Maul', 'Sentinel Greatcleaver', 'Shard Glaive', 'Aetheric Lance',
    ]) {
      expect(`${orphan}: ${!!LEGACY_ITEM_RENAMES[orphan]}`).toBe(`${orphan}: true`);
    }
  });
  it('every target resolves in the live catalog (the map can never point at another dead name)', () => {
    for (const [from, to] of Object.entries(LEGACY_ITEM_RENAMES)) {
      expect(`${from} -> ${to}: ${CATALOG_NAMES.has(to)}`).toBe(`${from} -> ${to}: true`);
      // ...and every KEY is genuinely dead (else the map would shadow a live row).
      expect(`${from} still live: ${CATALOG_NAMES.has(from)}`).toBe(`${from} still live: false`);
    }
  });
});

describe('OTA-1021 — the applier renames every reference on the player', () => {
  const legacy = {
    inventory: [
      { id: 'w1', name: 'Skyreacher Boltcaster', kind: 'weapon', quantity: 1, tags: ['weapon'] },
      { id: 'a1', name: 'Skyreacher Greaves', kind: 'armor', quantity: 1, tags: ['armor'] },
      { id: 'x1', name: 'Trail Rations', kind: 'consumable', quantity: 2, tags: ['food'] },
    ],
    equipped: { main: 'Skyreacher Boltcaster', mainId: 'w1', legs: 'Skyreacher Greaves', legsId: 'a1' },
    golem: { weapon: { id: 'g1', name: 'Shard Glaive', kind: 'weapon', quantity: 1, tags: ['weapon'] } },
    knownRecipes: ['Golem Aether-Lance', 'First Aid Kit'],
  } as any;

  it('inventory, equipped (with the legs->cloak slot move), golem armament and recipes all migrate', () => {
    const out = applyLegacyItemRenames(legacy) as any;
    expect(out.inventory.map((i: any) => i.name)).toEqual(['Beacon Rifle', 'Skyreacher Mantle', 'Trail Rations']);
    expect(out.equipped.main).toBe('Beacon Rifle');
    expect(out.equipped.mainId).toBe('w1');
    expect(out.equipped.legs).toBeUndefined();
    expect(out.equipped.cloak).toBe('Skyreacher Mantle');
    expect(out.equipped.cloakId).toBe('a1');
    expect(out.golem.weapon.name).toBe('Elder Golem Pike');
    expect(out.knownRecipes).toEqual(['Golem Aether-Lance', 'First Aid Kit']);
    expect(migrateLegacyName('Mire Maul')).toBe('Golem Sledge');
  });
  it('a clean player passes through untouched (same reference)', () => {
    const clean = { inventory: [{ id: 'x', name: 'Trail Rations', kind: 'consumable', quantity: 1, tags: [] }], equipped: {} } as any;
    expect(applyLegacyItemRenames(clean)).toBe(clean);
  });
});

describe('OTA-1021 — the load paths are wired', () => {
  it('backfillPlayer applies the renames FIRST and heals the golem armament', () => {
    expect(STORE).toContain('const pm = applyLegacyItemRenames(p);');
    expect(STORE).toContain('out = backfillPlayerInner(pm);');
    expect(STORE).toContain('weapon: restampInventoryItem(stampDurability(out.golem.weapon))');
  });
  it('resurrection loads MIGRATED world memory + resyncs canon locations (raw read gone)', () => {
    expect(STORE).toContain('const revivedWorldMemory = migrateLoadedWorldMemory(saved.worldMemory);');
    expect(STORE).toContain('setCanonExtraLocations(revivedWorldMemory.canonLocations ?? []);');
    expect(STORE).not.toContain('worldMemory: saved.worldMemory,');
    // Both load doors share ONE migration helper.
    expect(STORE).toContain('const migratedWorldMemory = migrateLoadedWorldMemory(saved.worldMemory);');
  });
});

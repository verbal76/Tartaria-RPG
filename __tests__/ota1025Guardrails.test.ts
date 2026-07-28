// OTA-1025 — guard-rails (snapshot-audit batch E): the recurrence lock for the
// whole stale-snapshot category. THE RATCHET: a catalog name that disappears
// without a LEGACY_ITEM_RENAMES migration fails this suite — the Boltcaster
// class of silent loss can never ship again.
import * as fs from 'fs';
import * as path from 'path';
import { LEGACY_ITEM_RENAMES } from '../app/engine/itemMigrations';

const ROOT = path.join(__dirname, '..');
const CATALOG_FILES = ['weapons', 'armor', 'gear', 'exploration', 'materials', 'amulets', 'rings', 'dogGear', 'runecasters'];
const currentNames = new Set<string>();
for (const f of CATALOG_FILES) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'items', `${f}.json`), 'utf8'));
  const rows: any[] = Array.isArray(d) ? d : (Object.values(d).find((v) => Array.isArray(v)) as any[]) ?? [];
  for (const r of rows) if (r && typeof r.name === 'string') currentNames.add(r.name);
}
const snapshot: string[] = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'app', 'data', 'items', 'catalog-names.snapshot.json'), 'utf8'),
);

describe('OTA-1025 — THE CATALOG-NAME RATCHET', () => {
  it('the snapshot exists and covers the full catalog', () => {
    expect(snapshot.length).toBeGreaterThan(400);
  });
  it('every snapshot name is still in the catalogs OR carries a LEGACY_ITEM_RENAMES migration', () => {
    const orphans = snapshot.filter((n) => !currentNames.has(n) && !(n in LEGACY_ITEM_RENAMES));
    // Failing here means a catalog rename/removal shipped WITHOUT a save
    // migration. Add the retired name to LEGACY_ITEM_RENAMES (itemMigrations.ts)
    // pointing at its surviving row, then refresh the snapshot:
    //   node scripts/update-catalog-name-snapshot.mjs
    expect(orphans).toEqual([]);
  });
  it('every migration key is genuinely retired and every value alive', () => {
    for (const [from, to] of Object.entries(LEGACY_ITEM_RENAMES)) {
      expect(`${from} retired: ${!currentNames.has(from)}`).toBe(`${from} retired: true`);
      expect(`${to} alive: ${currentNames.has(to)}`).toBe(`${to} alive: true`);
    }
  });
});

describe('OTA-1025 — orphan-safe contract handling', () => {
  const STORE = fs.readFileSync(path.join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
  it('ABANDON drops a record even when its def was retired (all four def-gated kinds)', () => {
    expect(STORE.match(/if \(!rec\) return;/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(STORE).not.toContain('if (!def || !rec) return;');
    expect(STORE).toContain("def ? theLower(def.title) : 'the hunt'");
  });
  it('the faction turn-in gate reads the STAGED records union, not the legacy mirror alone', () => {
    expect(STORE).toContain('...(player.activeFactionQuests ?? []).map((q) => q.id),');
  });
  it('the Contracts header counts only records whose def resolves', () => {
    const cs = fs.readFileSync(path.join(ROOT, 'app', 'screens', 'ContractsScreen.tsx'), 'utf8');
    expect(cs).toContain('hunts.filter((h) => h.def).length');
    expect(cs).not.toContain('hunts.length + mysteries.length + storylines.length');
  });
});

describe('OTA-1025 — the last routing reads are canonical, and the fallback is loud', () => {
  const STORE = fs.readFileSync(path.join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
  it('deep-link files by categorizeItem; relic-trade + trade-away read canonical', () => {
    expect(STORE).toContain('inventoryCategory: categorizeItem(item)');
    expect(STORE).toContain("const isRelicTrade = canonicalItemKind(item) === 'relic';");
    expect(STORE).toContain("canonicalItemRarity(i) === 'Common' &&");
  });
  it('getLocationById warns before falling back', () => {
    const en = fs.readFileSync(path.join(ROOT, 'app', 'engine', 'encounter.ts'), 'utf8');
    expect(en).toContain("getLocationById: unknown id");
  });
});

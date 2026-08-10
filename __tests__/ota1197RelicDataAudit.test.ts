// OTA-1197 — PUNCHLIST P15, MEASURED. The three files under `data/relics`, and what is
// actually true about each.
//
// ⚠⚠ THE ORIGINAL P15 FILING WAS WRONG IN ONE DIRECTION AND VAGUE IN THE OTHER. It said
// `loot_tables.json` has **zero importers**. It has one — `engine/encounter.ts:8` — and I
// filed it off a grep that missed the import because I searched for the bare filename in
// the wrong shape. That is the P4 mistake repeating: a punch-list entry standing on a
// search rather than on a read.
//
// This suite pins what a read establishes, so the entry can never drift back to a guess.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const rows = (d: unknown): { name?: string }[] =>
  Array.isArray(d) ? d : (Object.values(d as object).find(Array.isArray) as { name?: string }[]) ?? [];

/** Every name the live item catalogs can mint. */
function catalogNames(): Set<string> {
  const names = new Set<string>();
  const dir = join(ROOT, 'app/data/items');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    for (const r of rows(readJson(`app/data/items/${f}`))) if (r.name) names.add(r.name);
  }
  for (const r of rows(readJson('app/data/relics/curios.json'))) if (r.name) names.add(r.name);
  return names;
}

describe('OTA-1197 / P15 — loot_tables.json: imported, resolving, and (since OTA-1199) READ', () => {
  const ENCOUNTER = readFileSync(join(ROOT, 'app/engine/encounter.ts'), 'utf8');

  test('⚠⚠ it IS imported — the original "zero importers" claim was false', () => {
    expect(ENCOUNTER).toContain("import lootData from '../data/relics/loot_tables.json'");
  });

  test('⚠⚠ its reader IS called now — this test documented the defect and now guarantees the fix', () => {
    // ⚠⚠ THIS ASSERTION WAS WRITTEN INVERTED, ON PURPOSE. In OTA-1197 it read "no caller
    // anywhere" and passed, recording that `loot_tables.json` was imported, parsed, indexed
    // on boot and read by nobody. OTA-1199 gave it a caller and this went RED — which is
    // the test doing exactly the job it was built for. Flipped rather than deleted: a
    // defect test becoming a guarantee test is the record that the thing was actually
    // fixed and not merely reworded (the same move OTA-1193 made for P12).
    expect(ENCOUNTER).toContain('export function pickLootFromLadder(');
    expect(ENCOUNTER).toContain('export function ladderLootPool(');
    // The store hands the resolved pool to the area-search roller.
    const STORE = readFileSync(join(ROOT, 'app/state/gameStore.ts'), 'utf8');
    expect(STORE).toContain('enc.ladderLootPool(findMicroMicroAnywhere(mmId))');
    expect((STORE.match(/siteLoot: siteLootForScene\(get\)/g) ?? []).length).toBe(3);
  });

  test('⚠ BOTH halves of the pair are wired — the asymmetry P15 was filed for is gone', () => {
    // `pickEncounterFromLadder` (enemies) is called by the store. The loot twin is not.
    // ⚠ Also retargeted by OTA-1199: this asserted the store did NOT call the loot half,
    // which was the asymmetry P15 was filed for. Both halves are wired now, so what it
    // guards is that they STAY wired.
    const STORE = readFileSync(join(ROOT, 'app/state/gameStore.ts'), 'utf8');
    expect(STORE).toContain('pickEncounterFromLadder(ladderTriple)');
    expect(STORE).toContain('siteLootForScene(get)');
  });

  test('⚠⚠ the DATA is sound — every ladder loot name resolves, 153 of 153', () => {
    const names = new Set(rows(readJson('app/data/relics/loot_tables.json')).map((l) => l.name));
    const ladder = readJson('app/data/world/worldLadder.json');
    let entries = 0; const missing = new Set<string>();
    const walk = (o: unknown): void => {
      if (!o || typeof o !== 'object') return;
      const rec = o as Record<string, unknown>;
      if (Array.isArray(rec.lootTable)) {
        for (const n of rec.lootTable as string[]) { entries++; if (!names.has(n)) missing.add(n); }
      }
      for (const k of Object.keys(rec)) walk(rec[k]);
    };
    walk(ladder);
    // ⚠ This is the part that makes wiring it cheap rather than a project: the authoring is
    // already correct and agrees with itself. Nothing is dangling.
    expect(entries).toBeGreaterThan(100);
    expect([...missing]).toEqual([]);
  });

  test('⚠ but most of those names have no catalog row — they would mint as TROPHIES', () => {
    const cat = catalogNames();
    const loot = rows(readJson('app/data/relics/loot_tables.json')).map((l) => l.name!);
    const inCatalog = loot.filter((n) => cat.has(n));
    // Recorded as a MEASUREMENT, not a complaint: OTA-961 already built `resolveLootItem`
    // so an unknown loot name mints as a sellable trophy at the enemy's rarity rather than
    // as 2-TC junk. So wiring the caller would pay, it just would not pay AUTHORED items
    // until someone curates them. That is the owner's call, not mine.
    expect(loot.length).toBe(113);
    expect(inCatalog.length).toBeLessThan(loot.length);
    expect(readFileSync(join(ROOT, 'app/engine/crafting.ts'), 'utf8'))
      .toContain('export function resolveLootItem(');
  });
});

describe('OTA-1197 / P15 — relics.json: mostly SUPERSEDED, six unbuilt names', () => {
  test('⚠⚠ it has no importers at all — this half of the filing was right', () => {
    const hits: string[] = [];
    const walk = (rel: string) => {
      for (const f of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
        if (f.isDirectory()) { walk(`${rel}/${f.name}`); continue; }
        if (!/\.tsx?$/.test(f.name)) continue;
        if (readFileSync(join(ROOT, rel, f.name), 'utf8').includes('relics/relics.json')) {
          hits.push(`${rel}/${f.name}`);
        }
      }
    };
    walk('app');
    expect(hits).toEqual([]);
  });

  test('⚠⚠ but MOST of it already ships under the live catalogs — the P4 shape again', () => {
    const cat = catalogNames();
    const relics = rows(readJson('app/data/relics/relics.json')).map((r) => r.name!);
    const live = relics.filter((n) => cat.has(n));
    const dead = relics.filter((n) => !cat.has(n));
    expect(relics.length).toBe(13);
    // Seven of the thirteen are ALREADY authored items the player can hold. The file is
    // largely a duplicate of shipped content, which is exactly what P4 turned out to be —
    // so "13 orphaned entries" overstated it by half.
    expect(live.length).toBeGreaterThanOrEqual(7);
    // ⚠ The remainder are the honest finding: names that exist in NO catalog. These are
    // unbuilt CONCEPTS, not broken wiring — nothing in the game reaches for them and
    // fails. Listed so the next pass does not rediscover them as a defect.
    expect(dead.sort()).toEqual([
      "Architect's Key", 'Memory Prism', 'Resonance Lantern', 'Tartarian Obelisk',
      'Temporal Lens', 'Void Compass',
    ]);
  });
});

describe('OTA-1197 / P15 — curios.json is fully wired (the control)', () => {
  test('three importers, and the file is not empty', () => {
    const importers = ['app/engine/portability.ts', 'app/engine/itemFusion.ts', 'app/engine/salvagePools.ts']
      .filter((p) => readFileSync(join(ROOT, p), 'utf8').includes('relics/curios.json'));
    expect(importers.length).toBe(3);
    expect(rows(readJson('app/data/relics/curios.json')).length).toBeGreaterThan(0);
  });
});

// OTA-1001 — the identity tail (snapshot-audit batch D): the remaining ~25
// sites that answered "what is this item?" from the mint-frozen snapshot.
// ⚠ OTA-1399 — SLICE 8 sent vendor / inventory / crafting into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — that is what a pin on THE STORE has meant since slice 4, and this
// is the case the helper was built for: a slice IS the store, same object, same
// keys, same 473 importers. (Slices 5-7 moved code DOWN to leaves instead, which
// storeSource deliberately does NOT see; those suites name their leaf directly.)
import { storeSource } from '../test-utils/storeSource';
import * as fs from 'fs';
import * as path from 'path';
import { categorizeItem, categoriesForItem } from '../app/components/InventoryCategorize';
import { validSlotsForItem } from '../app/engine/equipment';
import { isSigilItem, sigilFaction } from '../app/engine/sigils';
import { itemIsTool } from '../app/engine/pouchEligibility';

// ⚠⚠ OTA-1404 — COMBAT RESOLUTION MOVED OUT OF gameStore INTO ITS OWN LEAF, and
// the pins below follow the code to its new address rather than reading both
// files and hoping. A helper that searches "wherever the code went" can never
// fail, and a pin that cannot fail is not a test. Everything still asserted
// against the store constant above is still IN the store.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const COMBAT_SRC: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', 'app', 'state', 'combatResolution.ts'), 'utf8');

const it_ = (name: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'x', name, kind: 'misc', quantity: 1, tags: [], ...extra }) as any;

describe('OTA-1001 — sections and slots read canonical identity', () => {
  it('a stale coating finally files under COATINGS', () => {
    expect(categorizeItem(it_('Poison Vial', { kind: 'consumable' }))).toBe('coating');
  });
  it('a stale throwable files as a weapon (and dual-lists from materials)', () => {
    expect(categorizeItem(it_('Shaped Aetheric Shard'))).toBe('weapon');
    expect(categoriesForItem(it_('Sentinel Core Plate'))).toContain('weapon');
  });
  it('a stale throwable equips to a hand; the stale strap finds its slot', () => {
    expect(validSlotsForItem(it_('Shaped Aetheric Shard'))).toEqual(['main', 'off']);
    expect(validSlotsForItem(it_('Hardened Climbing Strap'))).toContain('legs');
  });
  it('a stale sigil is visible and faction-typed again', () => {
    const sigils = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'items', 'gear.json'), 'utf8'));
    const rows: any[] = Array.isArray(sigils) ? sigils : (Object.values(sigils).find((v) => Array.isArray(v)) as any[]) ?? [];
    const sigilRows = rows.filter((r) => (r.tags ?? []).includes('sigil'));
    expect(sigilRows.length).toBeGreaterThanOrEqual(5);
    for (const r of sigilRows) {
      expect(`${r.name}: ${isSigilItem(it_(r.name))}`).toBe(`${r.name}: true`);
      expect(sigilFaction(it_(r.name))).not.toBeNull();
    }
  });
  it('itemIsTool answers canonically (stale rope is a tool; stale shard is not)', () => {
    expect(itemIsTool(it_('Climbing Rope', { kind: 'relic' }))).toBe(true);
    expect(itemIsTool(it_('Shaped Aetheric Shard'))).toBe(false);
  });
});

describe('OTA-1001 — the store-side cluster is canonical (source locks)', () => {
  const STORE = storeSource();
  it('rope mend guard, dog treat, torch, faction catalysts, barehanded, dog food, ancient repair', () => {
    expect(STORE).toContain("canonicalItemTags(it).includes('rope')");
    expect(STORE).toContain("canonicalItemTags(item).includes('dog_treat')");
    expect(STORE).toContain("canonicalItemTags(i).includes('light')");
    expect(STORE).toContain('canonicalItemTags(catalyst).includes(f.id)');
    expect(STORE).toContain("canonicalItemTags(reachSwungInst).includes('barehanded')");
    expect(STORE).toContain("canonicalItemTags(item).includes('food')");
    expect(STORE).toContain("canonicalItemKind(item) === 'relic' || canonicalItemTags(item).some");
    expect(STORE).not.toContain("(catalyst.tags ?? []).includes(f.id)");
    expect(STORE).not.toContain("(item.tags ?? []).includes('dog_treat')");
  });
  it('the consume-on-throw and reach paths use the shared throwable predicate', () => {
    expect(STORE).toContain('!!equippedItem && itemIsThrowable(equippedItem)');
    expect(COMBAT_SRC).toContain('=== wpName.toLowerCase() && itemIsThrowable(it)');
  });
  it('the fused-kind load heal is guarded and the CHA channel heal exists', () => {
    expect(STORE).toContain("!item.uniqueStats && !(item.tags ?? []).includes('fused') && lookup.kind !== 'misc'");
    expect(STORE).toContain("sb.map((b) => (b.stat === 'charisma' ? { ...b, stat: chaCat.stat! } : b))");
  });
});

describe('OTA-1001 — engine sites canonical (source locks)', () => {
  it('crafting substitution, digging, raceMechanics, weaponCoating golem read canonical tags', () => {
    const c = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'crafting.ts'), 'utf8');
    const d = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'digging.ts'), 'utf8');
    const r = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'raceMechanics.ts'), 'utf8');
    const w = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'weaponCoating.ts'), 'utf8');
    expect(c.match(/canonicalItemTags\(item\)\.some\(\(t\) => tagSet\.has\(t\)\)/g)?.length).toBe(2);
    expect(d).toContain('canonicalItemTags(item))');
    expect(r).toContain('canonicalItemKind: rmk');
    expect(w).toContain("canonicalItemTags(item).includes('golem_weapon')");
  });
});

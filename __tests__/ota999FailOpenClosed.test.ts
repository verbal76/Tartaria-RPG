// OTA-999 — the fail-open loss holes, closed (snapshot-audit batch B). Four
// protections read the instance snapshot and failed OPEN for items acquired
// before their catalog marking shipped. They now read canonical identity.
import * as fs from 'fs';
import * as path from 'path';
import { isQuestLockedItem } from '../app/engine/questItems';
import { canScrap } from '../app/engine/scrapEngine';
import { isUnsellable, sellPriceFor } from '../app/engine/sellPrice';
import { isForgeableLootReagent, isForgeReservableItem } from '../app/engine/itemFusion';
import { canonicalItemKind, canonicalItemRarity } from '../app/engine/crafting';

const load = (f: string) => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'items', `${f}.json`), 'utf8'));
  return (Array.isArray(d) ? d : (Object.values(d).find((v) => Array.isArray(v)) as any[]) ?? []) as any[];
};
const gearRows = load('gear');
const armorRows = load('armor');
const matRows = load('materials');
const stale = (name: string, extra: Record<string, unknown> = {}) =>
  ({ id: 's1', name, kind: 'misc', quantity: 1, tags: [], ...extra }) as any;

describe('OTA-999 — the quest lock fails CLOSED for every catalog quest item', () => {
  const questRows = [...gearRows, ...load('exploration')].filter((g) => (g.tags ?? []).includes('quest'));
  it('every quest-tagged row locks even as a stale tagless instance (drop/sell/scrap doors)', () => {
    expect(questRows.length).toBeGreaterThanOrEqual(10);
    for (const q of questRows) {
      expect(`${q.name} locked: ${isQuestLockedItem(stale(q.name))}`).toBe(`${q.name} locked: true`);
      expect(`${q.name} unsellable: ${isUnsellable(stale(q.name))}`).toBe(`${q.name} unsellable: true`);
      expect(`${q.name} scrappable: ${canScrap(stale(q.name))}`).toBe(`${q.name} scrappable: false`);
    }
  });
  it('a name-less tag-only check still works (legacy callers)', () => {
    expect(isQuestLockedItem({ tags: ['quest'] })).toBe(true);
    expect(isQuestLockedItem({ tags: ['weapon'] })).toBe(false);
  });
});

describe('OTA-999 — the forge blocklists fail CLOSED', () => {
  it('a stale sigil / coating / quest core can no longer be reserved or consumed as fodder', () => {
    const sigil = gearRows.find((g) => (g.tags ?? []).includes('sigil'));
    const vial = gearRows.find((g) => g.effect && g.effect.coating);
    const core = load('exploration').find((g: any) => (g.tags ?? []).includes('quest'));
    expect(sigil && vial && core).toBeTruthy();
    for (const it of [sigil, vial, core]) {
      const staleLoot = stale(it.name, { tags: ['loot'] });
      expect(`${it.name} reagent: ${isForgeableLootReagent(staleLoot)}`).toBe(`${it.name} reagent: false`);
      expect(`${it.name} reservable: ${isForgeReservableItem(staleLoot)}`).toBe(`${it.name} reservable: false`);
    }
  });
});

describe('OTA-999 — canonical kind and rarity', () => {
  it('rarity: the catalog wins over a stale mint-time snapshot; fused keeps its own', () => {
    const promoted = matRows.find((m) => m.name === 'Titan Core') ?? matRows.find((m) => m.rarity === 'Legendary');
    expect(canonicalItemRarity(stale(promoted.name, { rarity: 'Common' }))).toBe(promoted.rarity);
    expect(canonicalItemRarity({ name: 'Duskrender, Oath of Cinders', rarity: 'Common', uniqueStats: { rarity: 'Legendary' } } as any)).toBe('Legendary');
    expect(canonicalItemRarity({ name: 'zz-not-real', rarity: 'Rare' } as any)).toBe('Rare');
  });
  it('kind: catalog answers by name, uniqueStats stays authoritative, non-catalog keeps instance', () => {
    expect(canonicalItemKind(stale('Climbing Rope', { kind: 'relic' }))).toBe('misc');
    expect(canonicalItemKind({ name: 'zz-fused-thing', kind: 'misc', uniqueStats: { kind: 'armor' } } as any)).toBe('armor');
    expect(canonicalItemKind({ name: 'zz-not-real', kind: 'consumable' } as any)).toBe('consumable');
  });
  it('the substitute drain can no longer eat a stale-Common Legendary (source lock)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'crafting.ts'), 'utf8');
    expect(src).toContain('const subRarity = canonicalItemRarity(item);');
    expect(src).not.toContain("if (item.rarity === 'Rare' || item.rarity === 'Legendary') return false;");
  });
});

describe('OTA-999 — collect_only fails CLOSED for every Skyreacher reward', () => {
  it('every collect_only catalog piece pins to 1 TC even as a stale instance', () => {
    const pieces = [...armorRows, ...gearRows, ...load('weapons')].filter((r) => (r.tags ?? []).includes('collect_only'));
    expect(pieces.length).toBeGreaterThanOrEqual(7);
    for (const p of pieces) {
      const price = sellPriceFor(stale(p.name, { kind: p.slot ? 'armor' : 'weapon', rarity: 'Legendary' }), undefined);
      expect(`${p.name}: ${price}`).toBe(`${p.name}: 1`);
    }
  });
  it('the Crucible upgrade gate reads canonical tags (source lock)', () => {
    const store = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(store).toContain("canonicalItemTags(piece).includes('collect_only')");
    expect(store).not.toContain("(piece.tags ?? []).some((t) => t.toLowerCase() === 'collect_only')");
  });
});

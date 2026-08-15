// OTA-1000 — the economy reads canonical values (snapshot-audit batch C).
// Kind heals upgrade-only, rarity is NEVER healed, and stack-merges spread a
// stale row to every new copy — so prices/yields/repairs quietly diverged on
// months-old installs. All of them now resolve against the live catalog.
import * as fs from 'fs';
import * as path from 'path';
import { sellPriceFor, applySellCaps } from '../app/engine/sellPrice';
import { canScrap, scrapOutputFor } from '../app/engine/scrapEngine';
import { repairCost } from '../app/engine/durability';
import { golemSubstituteHeal, isGolemSubstitutePart } from '../app/engine/golems';

const it_ = (name: string, extra: Record<string, unknown> = {}) =>
  ({ id: 'x', name, kind: 'misc', quantity: 1, tags: [], ...extra }) as any;

describe('OTA-1000 — stale and fresh copies of the same item price identically', () => {
  it('a pre-promotion Beast Fang (stale Common) sells at the Rare rate, same as a fresh one', () => {
    const staleFang = it_('Beast Fang', { rarity: 'Common' });
    const freshFang = it_('Beast Fang', { rarity: 'Rare', tags: ['organic', 'fang'] });
    expect(sellPriceFor(staleFang, undefined)).toBe(sellPriceFor(freshFang, undefined));
    expect(sellPriceFor(staleFang, undefined)).toBeGreaterThan(10);
  });
  it('the retired trophy stamp dies once the name is in the catalog (no permanent half-price)', () => {
    const promoted = it_('Beast Fang', { rarity: 'Rare', tags: ['trophy'] });
    const clean = it_('Beast Fang', { rarity: 'Rare', tags: [] });
    expect(sellPriceFor(promoted, undefined)).toBe(sellPriceFor(clean, undefined));
    // A genuinely uncatalogued part keeps the discount.
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'sellPrice.ts'), 'utf8');
    expect(src).toContain("!findCatalogItem(item.name, { aliases: false }) ? 0.5 : 1");
  });
  it('the arbitrage floor and armor-floor gate read canonical values (source lock)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'sellPrice.ts'), 'utf8');
    expect(src).toContain('const capRarity = canonicalItemRarity(item);');
    expect(src).toContain("if (canonicalItemKind(item) !== 'armor') return undefined;");
    expect(src).toContain('const sellKind = canonicalItemKind(item);');
  });
});

describe('OTA-1000 — scrap and repair agree between stale and fresh copies', () => {
  it('two Climbing Ropes (stale relic vs healed misc) get the SAME scrap verdict', () => {
    expect(canScrap(it_('Climbing Rope', { kind: 'relic' })))
      .toBe(canScrap(it_('Climbing Rope', { kind: 'misc', tags: ['utility', 'gate', 'rope'] })));
  });
  it('a stale-Common copy of a Legendary material scraps at the Legendary tier', () => {
    const stale = scrapOutputFor(it_('Titan Core', { rarity: 'Common' }));
    const fresh = scrapOutputFor(it_('Titan Core', { rarity: 'Legendary', tags: ['aether', 'core', 'boss', 'legendary'] }));
    const total = (o: any) => (o.grants ?? o ?? []).length ?? 0;
    expect(JSON.stringify(stale)).toBe(JSON.stringify(fresh));
    expect(total(stale)).toBeGreaterThan(0);
  });
  it('repair cost scales by canonical rarity (source lock)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'durability.ts'), 'utf8');
    expect(src).toContain('canonicalItemRarity(item)');
    expect(src).not.toContain('REPAIR_RARITY_MULT[item.rarity]');
    // Behavior: stale-Common vs fresh-Legendary same-name armor repair identically.
    const staleP = it_('Skyreacher Cuirass', { kind: 'armor', rarity: 'Common', durability: { current: 2, max: 12 } });
    const freshP = it_('Skyreacher Cuirass', { kind: 'armor', rarity: 'Legendary', durability: { current: 2, max: 12 } });
    expect(repairCost(staleP)).toBe(repairCost(freshP));
  });
});

describe('OTA-1000 — golem feeding and coating drinks read canonical values', () => {
  it('a stale aether material is recognized as substitute fuel and heals at its true tier', () => {
    const staleCore = it_('Titan Core', { rarity: 'Common' });
    expect(isGolemSubstitutePart('aether_golem' as any, staleCore)).toBe(true);
    // The heal call sites pass canonical rarity (source locks).
    const store = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const inv = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'InventoryScreen.tsx'), 'utf8');
    expect(store).toContain('golemSubstituteHeal(golem.kind, canonicalItemRarity(item))');
    expect(store).not.toContain('golemSubstituteHeal(golem.kind, item.rarity)');
    expect(inv).toContain('golemSubstituteHeal(golem.kind, canonicalItemRarity(pending.item))');
    expect(store).toContain('coatingDrinkRemedy(p, fx.coating.kind, canonicalItemRarity(used))');
    expect(golemSubstituteHeal('aether_golem' as any, 'Legendary')).toBeGreaterThan(golemSubstituteHeal('aether_golem' as any, 'Common'));
  });
});

describe('OTA-1000 — provenance stamps stay instance-read (design lock)', () => {
  it('selfCrafted/fused/stolen semantics untouched', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'sellPrice.ts'), 'utf8');
    expect(src).toContain('if (item.selfCrafted) {');
    expect(src).toContain("item.tags?.includes('unsellable')");
  });
});

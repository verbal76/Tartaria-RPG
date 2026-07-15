// OTA-825 — exploit close (reverify workflow, CONFIRMED high-severity). Fusion is
// FREE at an outpost/market Crucible, and applyFusion stamps every fused item
// `selfCrafted: true`. But scrapEngine's OTA-756 fused branch RETURNED before the
// OTA-611 selfCrafted strip/halve guard, so a fused (self-crafted) weapon scrapped
// for its FULL premium yield — incl. a free Golem Core (the Iron-Golem bottleneck).
// fuse→scrap was a renewable mint of the scarce Core + Aetheric stock from cheap
// inferred inputs, reopening the EXACT hole OTA-611 closed. A fused item is
// player-made, so it now obeys the same rule as any self-craft: recycling never
// out-earns the inputs. A genuinely-earned fusion still breaks into token mats,
// never the scarce Core/Cloth/Shard for free. LEGACY fused items (forged pre-611,
// no selfCrafted flag) are a finite, non-renewable set → they keep the old yield.

import { scrapOutputFor } from '../app/engine/scrapEngine';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

const mk = (p: Partial<InventoryItem> & { name: string }): InventoryItem =>
  ({ id: p.name, kind: 'misc', quantity: 1, rarity: 'Common', tags: [], ...p } as InventoryItem);

// The scarce / high-sell mats a free renewable forge must NEVER mint from itself.
const PREMIUM = ['Golem Core', 'Aetheric Shard', 'Aetheric Dust', 'Aetheric Cloth', 'Aether Crystal', 'Aether Dust'];

describe('OTA-825 — a SELF-CRAFTED fused piece can no longer be scrapped for premium mats', () => {
  const fusedWeapon = mk({
    name: 'Ghost-Charged Gouge', kind: 'weapon', rarity: 'Legendary',
    tags: ['fused', 'unique', 'aetheric'], uniqueStats: {} as UniqueItemStats, selfCrafted: true,
  });
  const fusedArmor = mk({
    name: 'Pulse-Woven Cuirass', kind: 'armor', rarity: 'Rare',
    tags: ['fused', 'unique', 'aetheric'], uniqueStats: {} as UniqueItemStats, selfCrafted: true,
  });

  it('a fused weapon mints NO Golem Core (the Iron-Golem bottleneck)', () => {
    const names = scrapOutputFor(fusedWeapon).grants.map((g) => g.name);
    expect(names).not.toContain('Golem Core');
  });

  it('a fused weapon mints NONE of the premium aether stock', () => {
    const names = scrapOutputFor(fusedWeapon).grants.map((g) => g.name);
    for (const p of PREMIUM) expect(names).not.toContain(p);
  });

  it('a fused armor mints NO Aetheric Cloth (Rare fiber) for free', () => {
    const names = scrapOutputFor(fusedArmor).grants.map((g) => g.name);
    expect(names).not.toContain('Aetheric Cloth');
    for (const p of PREMIUM) expect(names).not.toContain(p);
  });

  it('still returns SOMETHING (a scrap click is never wasted)', () => {
    expect(scrapOutputFor(fusedWeapon).grants.length).toBeGreaterThan(0);
    expect(scrapOutputFor(fusedArmor).grants.length).toBeGreaterThan(0);
  });
});

describe('OTA-825 — LEGACY fused items (no selfCrafted flag) keep the old full yield', () => {
  // Non-renewable: a player can no longer mint NEW pre-611 fused items, so this
  // finite set is left untouched — it still scraps to the OTA-756 aether stock.
  const legacyFused = mk({
    name: 'Old Ghostblade', kind: 'weapon', rarity: 'Legendary',
    tags: ['fused', 'unique', 'aetheric'], uniqueStats: {} as UniqueItemStats, // no selfCrafted
  });

  it('a legacy (unflagged) fused weapon still yields the Core + aether staples', () => {
    const names = scrapOutputFor(legacyFused).grants.map((g) => g.name);
    expect(names).toContain('Golem Core');
    expect(names).toContain('Aetheric Shard');
  });
});

import { isAreaSearch, isGroundSearch, rollAreaSearch } from '../app/engine/areaSearch';

describe('areaSearch', () => {
  it('recognises spatial / surface / direction terms', () => {
    expect(isAreaSearch('the mud')).toBe(true);
    expect(isAreaSearch('the rubble')).toBe(true);
    expect(isAreaSearch('the doorway')).toBe(true);
    expect(isAreaSearch('the area to my left')).toBe(true);
    expect(isAreaSearch('the area to my right')).toBe(true);
    expect(isAreaSearch('behind me')).toBe(true);
    expect(isAreaSearch('the floor')).toBe(true);
    expect(isAreaSearch('the corner')).toBe(true);
    expect(isAreaSearch('the wagon')).toBe(true);
  });

  it('rejects object-specific terms not in the area vocab', () => {
    expect(isAreaSearch('the obelisk')).toBe(false);
    expect(isAreaSearch('the handprint')).toBe(false);
    expect(isAreaSearch('the merchant')).toBe(false);
  });

  it('rollAreaSearch produces a valid outcome shape', () => {
    for (let i = 0; i < 50; i++) {
      const r = rollAreaSearch('the mud');
      expect(['nothing', 'material', 'tc', 'hook']).toContain(r.kind);
      expect(typeof r.line).toBe('string');
      expect(r.line.length).toBeGreaterThan(0);
      if (r.kind === 'material') {
        expect(r.itemName.length).toBeGreaterThan(0);
        expect(['Common', 'Uncommon', 'Rare', 'Legendary']).toContain(r.rarity);
      }
      if (r.kind === 'tc') {
        expect(r.amount).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('rollAreaSearch produces a varied distribution over many rolls', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const r = rollAreaSearch('the mud');
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    }
    // Expect all four outcomes to land at least once across 400 rolls.
    expect(counts.nothing).toBeGreaterThan(0);
    expect(counts.material).toBeGreaterThan(0);
    expect(counts.tc).toBeGreaterThan(0);
    expect(counts.hook).toBeGreaterThan(0);
  });

  // Audit follow-up: isGroundSearch fires BEFORE isAreaSearch in the
  // gameStore's investigate handler, so overlapping inputs ("search
  // the rubble on the floor") need to resolve to ground-search even
  // when they contain non-ground area tokens. Both sets share ground
  // tokens (mud, silt, etc.), so we lock the precedence with tests.
  describe('isGroundSearch precedence over generic area search', () => {
    it('recognises every ground-type token as ground AND area', () => {
      for (const t of ['mud', 'silt', 'ground', 'floor', 'rubble', 'patch', 'spot']) {
        expect(isGroundSearch(`the ${t}`)).toBe(true);
        expect(isAreaSearch(`the ${t}`)).toBe(true);
      }
    });

    it('non-ground area tokens stay area-only', () => {
      for (const t of ['doorway', 'wagon', 'shelf', 'crate', 'wall']) {
        expect(isGroundSearch(`the ${t}`)).toBe(false);
        expect(isAreaSearch(`the ${t}`)).toBe(true);
      }
    });

    it('mixed input matches ground (the gameStore checks ground first)', () => {
      // "search the rubble on the floor" contains both ground tokens —
      // both fire true; ordering in the caller decides which path wins.
      expect(isGroundSearch('the rubble on the floor')).toBe(true);
      expect(isAreaSearch('the rubble on the floor')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// OTA-444 — crafting-material drop weights (playability)
// ---------------------------------------------------------------------------

import enemiesData from '../app/data/enemies/enemies.json';

describe('OTA-444 — golem/recipe material availability', () => {
  it('Aether Dust is now forageable (was unobtainable from search)', () => {
    const found = new Set<string>();
    for (let i = 0; i < 8000; i++) {
      const o = rollAreaSearch('the mud', { intent: 'search' });
      if (o.kind === 'material') found.add(o.itemName);
    }
    expect(found.has('Aether Dust')).toBe(true);
    // The golem-fuel staples are reachable too.
    expect(found.has('Aether Crystal')).toBe(true);
    expect(found.has('Aether Mud')).toBe(true);
    // OTA-447 — Mudstone now forageable so a combat-light wanderer can still
    // gather the last Mud-Golem fuel without relying on a mud-enemy kill.
    expect(found.has('Mudstone')).toBe(true);
  });

  it('common mud enemies drop Mudstone (Mud-Golem fuel)', () => {
    const arr = (enemiesData as Array<{ name: string; loot?: string[] }>);
    const boar = arr.find((e) => e.name === 'Mud Boar');
    const tortoise = arr.find((e) => e.name === 'Mud Tortoise');
    expect(boar?.loot).toContain('Mudstone');
    expect(tortoise?.loot).toContain('Mudstone');
  });
});

describe('OTA-446 — wandering can yield real gear upgrades', () => {
  it('investigate can surface Rare gear (the lucky upgrade)', () => {
    const names = new Set<string>();
    let sawRare = false;
    for (let i = 0; i < 12000; i++) {
      const o = rollAreaSearch('the rubble', { intent: 'investigate' });
      if (o.kind === 'material') {
        names.add(o.itemName);
        if (o.rarity === 'Rare') sawRare = true;
      }
    }
    // The two new Rare drops are reachable.
    expect(sawRare).toBe(true);
    expect(names.has('Sentinel Cleaver') || names.has("Aether-Seeker's Hood")).toBe(true);
    // Uncommon gear still shows up too.
    expect(names.has('Mud-Rend Blade')).toBe(true);
  });
});

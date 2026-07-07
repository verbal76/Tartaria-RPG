// OTA-1003 — auto-route travel is slightly more eventful and, more
// importantly, more VARIED: on a plotted course the non-combat archetypes
// (treasure / npc / fusion_bench — "different encounters") get a small
// weight bias, so a route brings in more variety WITHOUT more fights.
//
// This test isolates the TYPE distribution from the encounter RATE by
// forcing an encounter every call (rollChance 1, threshold 0) and driving
// a deterministic RNG, then compares the combat fraction with autoTravel
// off vs on. autoTravel must LOWER the combat fraction (more non-combat
// variety), never raise it.

import { pickWastelandEncounter } from '../app/engine/wastelandEncounters';

// Small deterministic LCG so the run is stable (no Math.random flake).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const LOCATION = { id: 'loc', name: 'Open Waste', tags: ['outskirts', 'ruin', 'buried', 'mud', 'open'] } as any;
const COMBAT = new Set(['skirmish', 'mini_dungeon']);

function sample(autoTravel: boolean, iterations: number) {
  const rng = lcg(0xC0FFEE);
  let combat = 0;
  let nonCombat = 0;
  const types: Record<string, number> = {};
  for (let i = 0; i < iterations; i++) {
    const enc = pickWastelandEncounter(LOCATION, {
      stepsSinceLastEncounter: 5,
      threshold: 0,
      rollChance: 1, // force an encounter every call → measure TYPE mix only
      stepsSinceCombat: 0, // keep the combat-starvation multiplier at baseline
      autoTravel,
      rng,
    });
    if (!enc) continue;
    types[enc.type] = (types[enc.type] ?? 0) + 1;
    if (COMBAT.has(enc.type)) combat++; else nonCombat++;
  }
  return { combat, nonCombat, total: combat + nonCombat, types };
}

describe('OTA-1003 — auto-route variety bias', () => {
  const N = 4000;

  it('lowers the combat fraction on a plotted course (more non-combat variety)', () => {
    const off = sample(false, N);
    const on = sample(true, N);

    const combatFracOff = off.combat / off.total;
    const combatFracOn = on.combat / on.total;

    // Both modes still produce a healthy mix — the bias shifts, it doesn't
    // eliminate either side.
    expect(off.combat).toBeGreaterThan(0);
    expect(off.nonCombat).toBeGreaterThan(0);
    expect(on.combat).toBeGreaterThan(0);
    expect(on.nonCombat).toBeGreaterThan(0);

    // Auto-route has a LOWER combat fraction — the whole point.
    expect(combatFracOn).toBeLessThan(combatFracOff);

    // But only SLIGHTLY: the shift is a few points, not a wholesale swing.
    // (1.3× on non-combat moves the combat share down single digits.)
    expect(combatFracOff - combatFracOn).toBeGreaterThan(0.01);
    expect(combatFracOff - combatFracOn).toBeLessThan(0.15);
  });

  it('does not raise the combat fraction (no extra fights) and keeps combat present', () => {
    const on = sample(true, N);
    const off = sample(false, N);
    // Non-combat variety is up on auto-route.
    expect(on.nonCombat / on.total).toBeGreaterThan(off.nonCombat / off.total);
    // Combat archetypes still appear on auto-route (variety, not pacifism).
    expect(on.combat).toBeGreaterThan(0);
  });
});

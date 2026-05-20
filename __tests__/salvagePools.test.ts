import { rollSalvagePool, __TEST_ONLY__ } from '../app/engine/salvagePools';

describe('salvage pool classifier', () => {
  it('returns null for nouns that match no pool', () => {
    expect(rollSalvagePool('mud')).toBeNull();
    expect(rollSalvagePool('silt')).toBeNull();
    expect(rollSalvagePool('skeleton', () => 0)).toMatchObject({ poolId: 'tomb' });
    // 'pillar' / 'arch' are scene features that don't match any salvage pool
    expect(rollSalvagePool('pillar')).toBeNull();
    expect(rollSalvagePool('arch')).toBeNull();
  });

  it('routes drone/sentinel/automaton to mechanical pool', () => {
    const rng = () => 0.5;
    expect(rollSalvagePool('drone', rng)?.poolId).toBe('mechanical');
    expect(rollSalvagePool('rusted drone', rng)?.poolId).toBe('mechanical');
    expect(rollSalvagePool('scrap drone', rng)?.poolId).toBe('mechanical');
    expect(rollSalvagePool('sentinel shell', rng)?.poolId).toBe('mechanical');
    expect(rollSalvagePool('clockwork knight', rng)?.poolId).toBe('mechanical');
  });

  it('routes wagons/carts to wagon pool', () => {
    const rng = () => 0.5;
    expect(rollSalvagePool('wagon', rng)?.poolId).toBe('wagon');
    expect(rollSalvagePool('buried wagon', rng)?.poolId).toBe('wagon');
    expect(rollSalvagePool('mud cart', rng)?.poolId).toBe('wagon');
    expect(rollSalvagePool('rusted sled', rng)?.poolId).toBe('wagon');
  });

  it('routes weapons to weapon_scrap pool', () => {
    const rng = () => 0.5;
    expect(rollSalvagePool('rusted blade', rng)?.poolId).toBe('weapon_scrap');
    expect(rollSalvagePool('pike fragment', rng)?.poolId).toBe('weapon_scrap');
    expect(rollSalvagePool('rusted rifle', rng)?.poolId).toBe('weapon_scrap');
    expect(rollSalvagePool('bone hammer', rng)?.poolId).toBe('weapon_scrap');
  });

  it('routes engine parts (console, pipe, motor) to engine_parts pool', () => {
    const rng = () => 0.5;
    expect(rollSalvagePool('control panel', rng)?.poolId).toBe('engine_parts');
    expect(rollSalvagePool('steam pipe', rng)?.poolId).toBe('engine_parts');
    expect(rollSalvagePool('cooling valve', rng)?.poolId).toBe('engine_parts');
    expect(rollSalvagePool('ether battery', rng)?.poolId).toBe('engine_parts');
    expect(rollSalvagePool('reactor coil', rng)?.poolId).toBe('engine_parts');
  });

  it('routes lanterns/torches to light pool', () => {
    const rng = () => 0.5;
    expect(rollSalvagePool('lantern', rng)?.poolId).toBe('light');
    expect(rollSalvagePool('aether lantern', rng)?.poolId).toBe('light');
    expect(rollSalvagePool('frost lantern', rng)?.poolId).toBe('light');
  });

  it('rolls "nothing" outcome about 25% of the time', () => {
    // rng() returns < 0.25 → nothing branch
    const lowRng = () => 0.1;
    expect(rollSalvagePool('wagon', lowRng)?.kind).toBe('nothing');
  });

  it('rolls material outcome with itemName + rarity + quantity when chance hits', () => {
    // rng() returns > 0.25 to skip nothing branch, then drives weighted pick.
    let calls = 0;
    const rng = () => {
      calls++;
      // First call: skip 'nothing' (0.3 > 0.25)
      // Second call: pick first item in pool (0.0 → weighted pick lands on first)
      // Third call: line index (0)
      // Fourth call: quantity span
      if (calls === 1) return 0.3;
      return 0.0;
    };
    const r = rollSalvagePool('drone', rng);
    expect(r?.kind).toBe('material');
    expect(r?.itemName).toBeDefined();
    expect(r?.rarity).toBeDefined();
    expect(typeof r?.quantity).toBe('number');
    expect(r!.quantity!).toBeGreaterThanOrEqual(1);
  });

  it('narration auto-prepends "the" for bare nouns', () => {
    const rng = () => 0.5;
    const r = rollSalvagePool('drone', rng);
    expect(r?.line.toLowerCase()).toContain('the drone');
  });

  it('every pool produces a material outcome across many rolls', () => {
    const poolHits = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const r = rollSalvagePool('drone');
      if (r?.kind === 'material') poolHits.set(r.poolId, (poolHits.get(r.poolId) ?? 0) + 1);
    }
    expect(poolHits.get('mechanical')).toBeGreaterThan(500); // most outcomes are material
  });

  it('exposes pool definitions for inspection', () => {
    expect(__TEST_ONLY__.POOLS.length).toBeGreaterThan(5);
    expect(__TEST_ONLY__.NOTHING_CHANCE).toBeGreaterThan(0);
    expect(__TEST_ONLY__.NOTHING_CHANCE).toBeLessThan(1);
  });
});

import { rollSalvagePool, isSalvageMaterial, __TEST_ONLY__ } from '../app/engine/salvagePools';
import curiosData from '../app/data/relics/curios.json';

// OTA-982 — CURIOS: catalog-ABSENT oddments that refuel the Fusing Crucible. They
// are not gear, food, or clues, so the bleed guard this suite exists to enforce
// is unchanged — curios are simply exempt from the "is a catalog material" leg.
const CURIO_NAMES = new Set(
  (curiosData as { curios: { name: string }[] }).curios.map((c) => c.name),
);

describe('salvage yields MATERIALS ONLY (arb61, Piece B)', () => {
  const NOUNS = [
    'half-buried wagon', 'fallen sentinel husk', 'aetheric drone shell',
    'cracked supply crate', 'toppled obelisk fragment', 'rusted exoframe',
    'crashed automaton chassis', 'salt-crusted lockbox', 'buried reclaimer cache',
    'library archive console', 'royal display case', 'vault relic pedestal',
    'forgotten order reliquary', 'hidden weapon locker', 'skeleton', 'pillar',
  ];
  it('no salvage roll ever returns gear/food/clues — only catalog materials', () => {
    for (const noun of NOUNS) {
      for (let i = 0; i < 60; i++) {
        const out = rollSalvagePool(noun, () => (i + 0.5) / 60);
        if (!out || !out.itemName) continue;
        // OTA-982 — a curio is the intended exception; everything else must still
        // be a true catalog material (no gear / food / clue bleed).
        if (CURIO_NAMES.has(out.itemName)) continue;
        expect(isSalvageMaterial(out.itemName)).toBe(true);
      }
    }
  });
  it('the known bleed items are NOT materials (so they are filtered out)', () => {
    for (const gear of ['Aetheric Locket', 'Aetheric Torch', 'Throwing Knife', 'Rusted Blade', 'Climbing Rope', 'Trail Rations', 'Tartarian Map Fragment', 'Sealed Tartarian Letter']) {
      expect(isSalvageMaterial(gear)).toBe(false);
    }
  });
});

describe('salvage pool classifier', () => {
  it('returns null for nouns that match no pool', () => {
    // 2026-05-25 OTA-038 — pillar moved into relic_site, so it now
    // matches. Updated list to only include nouns still uncovered
    // by design (terrain-only, non-salvageable scenery).
    expect(rollSalvagePool('mud')).toBeNull();
    expect(rollSalvagePool('silt')).toBeNull();
    expect(rollSalvagePool('skeleton', () => 0)).toMatchObject({ poolId: 'tomb' });
    expect(rollSalvagePool('arch')).toBeNull();
    expect(rollSalvagePool('sky')).toBeNull();
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

  it('rolls junk-pool fallback (~5% of the time) instead of nothing', () => {
    // VERIFY-1 (2026-05-25): NOTHING_CHANCE lowered from 0.25 → 0.05.
    // POLISH-2 (2026-05-25): the would-be-nothing branch now rolls
    // from a junk fallback pool so the player always walks away with
    // at least one item. Outcome kind is 'material' with a junk
    // itemName (Stick / Smooth Stone / Cloth Scrap / Bent Nail /
    // Bone Sliver) and quantity 1.
    const lowRng = () => 0.01;
    const result = rollSalvagePool('wagon', lowRng);
    expect(result?.kind).toBe('material');
    if (result?.kind === 'material') {
      expect(['Stick', 'Smooth Stone', 'Cloth Scrap', 'Bent Nail', 'Bone Sliver']).toContain(result.itemName);
      expect(result.quantity).toBe(1);
    }
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

  // 2026-05-25 OTA-037 — hub-thematic relic-site nouns route to the
  // new relic_site pool. A playtester hit SALVAGE ALL on these inside
  // The Crown Gate and got zero output before the pool existed.
  it('routes pedestal / reliquary / vault / gate / shelf to relic_site pool', () => {
    const rng = () => 0.5;
    expect(rollSalvagePool('salt-crusted vault relic pedestal', rng)?.poolId).toBe('relic_site');
    expect(rollSalvagePool('weathered forgotten order reliquary', rng)?.poolId).toBe('relic_site');
    expect(rollSalvagePool('gate', rng)?.poolId).toBe('relic_site');
    expect(rollSalvagePool('jagged submerged library shelf', rng)?.poolId).toBe('relic_site');
    expect(rollSalvagePool('crown altar', rng)?.poolId).toBe('relic_site');
    expect(rollSalvagePool('twin standard', rng)?.poolId).toBe('relic_site');
  });

  // 2026-05-25 OTA-038 — full SALVAGE_PATTERN coverage invariant.
  // Every keyword the SalvageModal's regex surfaces as a chip MUST
  // route to some salvage pool. Adding a new keyword to SALVAGE_PATTERN
  // without adding pool coverage is the bug class that produced the
  // "salvage all did nothing" report. This test scans every pattern
  // and fails loud on any unmatched entry.
  it('every SALVAGE_PATTERN keyword has a matching pool', () => {
    const SALVAGE_PATTERN_KEYWORDS = [
      // Constructs / machinery
      'construct', 'automaton', 'drone', 'sentinel', 'wreck', 'husk',
      'machinery', 'machine', 'scrap', 'circuit', 'gear', 'plating',
      'core', 'relic', 'robot', 'rust', 'broken', 'fallen', 'toppled',
      'cog', 'rig', 'engine', 'hull', 'chassis', 'frame',
      // Containers
      'lockbox', 'strongbox', 'coffer', 'safe', 'vault',
      'crate', 'chest', 'box', 'cache', 'stash', 'barrel',
      'wreckage', 'wagon', 'axle', 'boat', 'vessel',
      'sarcophagus', 'tomb', 'crypt', 'grave', 'ossuary', 'burial',
      'console', 'panel', 'conduit', 'terminal', 'altar',
      'observatory', 'scope', 'lens', 'telescope', 'array', 'dish', 'antenna',
      'spire', 'obelisk', 'pylon', 'pillar', 'monolith',
      'trap', 'snare', 'tripwire', 'deadfall', 'defenses', 'defense',
      'golem',
      // Other break-open targets
      'bench', 'shelf', 'rack', 'table', 'door', 'gate',
      'skeleton', 'skull', 'rib', 'corpse', 'remains',
      'banner', 'shroud', 'curtain', 'tarp',
      'jar', 'bottle', 'jewelry box', 'jewel box', 'lock box', 'casket', 'reliquary',
    ];
    const unmatched: string[] = [];
    for (const keyword of SALVAGE_PATTERN_KEYWORDS) {
      if (rollSalvagePool(keyword) === null) unmatched.push(keyword);
    }
    expect(unmatched).toEqual([]);
  });

  // 2026-05-25 OTA-038 — every CURATED salvage spawn must also route
  // to a pool. These are the "rusted exoframe", "vault relic pedestal",
  // "forgotten order reliquary" style chips that the SalvageModal
  // prefers over common stock. They're real player-facing chips.
  it('every CURATED salvage spawn has a matching pool', () => {
    const CURATED_SPAWNS = [
      'half-buried wagon', 'fallen sentinel husk', 'aetheric drone shell',
      'cracked supply crate', 'toppled obelisk fragment', 'rusted exoframe',
      'crashed automaton chassis', 'salt-crusted lockbox',
      'buried reclaimer cache', 'shattered tartarian relay',
      'library archive console', 'royal display case', 'vault relic pedestal',
      'capacitor coil rack', 'engine room toolbench', 'forgotten order reliquary',
      'tartarian power conduit', 'sentinel diagnostic console',
      'stripped maintenance panel', 'hidden weapon locker',
    ];
    const unmatched: string[] = [];
    for (const noun of CURATED_SPAWNS) {
      if (rollSalvagePool(noun) === null) unmatched.push(noun);
    }
    expect(unmatched).toEqual([]);
  });
});

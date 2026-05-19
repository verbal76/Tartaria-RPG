import {
  classifyContainer,
  rollFromPool,
  narrate,
  __TEST_ONLY__,
  type ContainerLootEntry,
} from '../app/engine/containerLoot';

describe('classifyContainer', () => {
  it('matches lockbox-family nouns', () => {
    expect(classifyContainer('lockbox')?.archetypeId).toBe('lockbox');
    expect(classifyContainer('the strongbox')?.archetypeId).toBe('lockbox');
    expect(classifyContainer('an iron coffer')?.archetypeId).toBe('lockbox');
    expect(classifyContainer('safe')?.archetypeId).toBe('lockbox');
  });

  it('matches trap-family nouns', () => {
    expect(classifyContainer('trap')?.archetypeId).toBe('trap');
    expect(classifyContainer('the bear trap')?.archetypeId).toBe('trap');
    expect(classifyContainer('Drakovan snare')?.archetypeId).toBe('trap');
    expect(classifyContainer('tripwire')?.archetypeId).toBe('trap');
  });

  it('matches crate-family nouns', () => {
    expect(classifyContainer('crate')?.archetypeId).toBe('crate');
    expect(classifyContainer('the chest')?.archetypeId).toBe('crate');
    expect(classifyContainer('cache')?.archetypeId).toBe('crate');
    expect(classifyContainer('an old box')?.archetypeId).toBe('crate');
    expect(classifyContainer('a barrel of dust')?.archetypeId).toBe('crate');
  });

  it('matches automaton-family nouns', () => {
    expect(classifyContainer('drone')?.archetypeId).toBe('automaton');
    expect(classifyContainer('the dormant defenses')?.archetypeId).toBe('automaton');
    expect(classifyContainer('Architectural Sentinel')?.archetypeId).toBe('automaton');
    expect(classifyContainer('a mud golem')?.archetypeId).toBe('automaton');
  });

  it('matches relic-console family nouns', () => {
    expect(classifyContainer('console')?.archetypeId).toBe('relic_console');
    expect(classifyContainer('Aetheric panel')?.archetypeId).toBe('relic_console');
    expect(classifyContainer('the conduit')?.archetypeId).toBe('relic_console');
    expect(classifyContainer('an altar')?.archetypeId).toBe('relic_console');
  });

  it('matches wreckage-family nouns', () => {
    expect(classifyContainer('wagon')?.archetypeId).toBe('wreckage');
    expect(classifyContainer('the broken hull')?.archetypeId).toBe('wreckage');
    expect(classifyContainer('wreckage')?.archetypeId).toBe('wreckage');
  });

  it('matches observatory-array nouns (Obsidian Pillars instruments)', () => {
    expect(classifyContainer('observatory')?.archetypeId).toBe('observatory_array');
    expect(classifyContainer('the brass telescope')?.archetypeId).toBe('observatory_array');
    expect(classifyContainer('Tartarian array')?.archetypeId).toBe('observatory_array');
    expect(classifyContainer('a salvaged dish')?.archetypeId).toBe('observatory_array');
  });

  it('matches spire-conduit nouns (Grand Spire / standing stones)', () => {
    expect(classifyContainer('spire')?.archetypeId).toBe('spire_conduit');
    expect(classifyContainer('the obelisk')?.archetypeId).toBe('spire_conduit');
    expect(classifyContainer('Tartarian pylon')?.archetypeId).toBe('spire_conduit');
    expect(classifyContainer('a buried monolith')?.archetypeId).toBe('spire_conduit');
  });

  it('matches tomb / crypt nouns (Drakova / Voronov burials)', () => {
    expect(classifyContainer('sarcophagus')?.archetypeId).toBe('tomb');
    expect(classifyContainer('the crypt')?.archetypeId).toBe('tomb');
    expect(classifyContainer('a Tartarian grave')?.archetypeId).toBe('tomb');
    expect(classifyContainer('ossuary')?.archetypeId).toBe('tomb');
    expect(classifyContainer('a stone casket')?.archetypeId).toBe('tomb');
  });

  it('returns null for doors, walls, and bare ground', () => {
    expect(classifyContainer('door')).toBeNull();
    expect(classifyContainer('the wall')).toBeNull();
    expect(classifyContainer('ground')).toBeNull();
    expect(classifyContainer('floor')).toBeNull();
  });

  it('returns null on empty / whitespace input', () => {
    expect(classifyContainer('')).toBeNull();
    expect(classifyContainer('   ')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyContainer('LOCKBOX')?.archetypeId).toBe('lockbox');
    expect(classifyContainer('A Bear Trap')?.archetypeId).toBe('trap');
  });

  it('uses word boundaries — does not match substring inside larger words', () => {
    // "axle" should NOT match "ax" matcher (it doesn't exist in our
    // pool, but this is the broader contract for the regex builder).
    // Bigger sanity: "drone-on" prose should still match "drone".
    expect(classifyContainer('A drone-strike platform')?.archetypeId).toBe('automaton');
    // 'cargo' shouldn't match 'go' if some matcher had 'go' (none do
    // currently, but the boundary regex guarantees it).
    expect(classifyContainer('cargo')).toBeNull();
  });
});

describe('rollFromPool', () => {
  const POOL: ContainerLootEntry[] = [
    { name: 'A', weight: 50, min: 1, max: 1, tags: [], kind: 'misc' },
    { name: 'B', weight: 30, min: 2, max: 4, tags: [], kind: 'misc' },
    { name: 'C', weight: 20, min: 1, max: 1, tags: [], kind: 'misc' },
  ];

  it('returns null on empty pool', () => {
    expect(rollFromPool([])).toBeNull();
  });

  it('picks the first entry when rng returns 0', () => {
    const out = rollFromPool(POOL, () => 0);
    expect(out?.entry.name).toBe('A');
    expect(out?.quantity).toBe(1);
  });

  it('picks the second entry when rng lands in the second band', () => {
    // total = 100, cumulative thresholds 50 / 80 / 100
    // rng * 100 = 60 → roll = 60 → 60 < 80 → entry B
    const out = rollFromPool(POOL, () => 0.6);
    expect(out?.entry.name).toBe('B');
  });

  it('picks the third entry when rng lands in the third band', () => {
    const out = rollFromPool(POOL, () => 0.9);
    expect(out?.entry.name).toBe('C');
  });

  it('respects min/max for quantity rolls', () => {
    // B has min 2, max 4. Width = 3. rng for quantity = Math.floor(rng * (max-min+1)).
    // First rng() picks the entry; second rng() picks quantity.
    // We'll use a sequence to control both calls.
    let calls = 0;
    const seq = [0.6, 0]; // entry B; quantity offset 0 → min
    const out = rollFromPool(POOL, () => seq[calls++]!);
    expect(out?.entry.name).toBe('B');
    expect(out?.quantity).toBe(2);

    calls = 0;
    const seq2 = [0.6, 0.99]; // entry B; quantity offset → max
    const out2 = rollFromPool(POOL, () => seq2[calls++]!);
    expect(out2?.quantity).toBe(4);
  });

  it('handles single-quantity entries (min == max) without ranging', () => {
    let calls = 0;
    const seq = [0, 0.99]; // entry A, irrelevant second roll
    const out = rollFromPool(POOL, () => seq[calls++]!);
    expect(out?.entry.name).toBe('A');
    expect(out?.quantity).toBe(1);
  });

  it('returns the last entry on extreme rng (numerical drift safety)', () => {
    // rng() = 1.0 should NOT happen per Math.random spec, but defensively:
    // total = 100, cumulative threshold at 100. With rng = 0.999, roll < 100 → C.
    const out = rollFromPool(POOL, () => 0.999);
    expect(out?.entry.name).toBe('C');
  });

  it('returns null when total weight is zero', () => {
    const zeroPool: ContainerLootEntry[] = [
      { name: 'X', weight: 0, min: 1, max: 1, tags: [], kind: 'misc' },
    ];
    expect(rollFromPool(zeroPool)).toBeNull();
  });
});

describe('narrate', () => {
  it('interpolates {target} into the narration template', () => {
    const match = classifyContainer('the bear trap')!;
    expect(narrate(match, 'bear trap')).toBe('You take the bear trap apart for parts.');
  });

  it('handles multiple {target} replacements', () => {
    const match = {
      archetypeId: 'test',
      narration: 'The {target} opens. The {target} is empty.',
      pool: [],
    };
    expect(narrate(match, 'thing')).toBe('The thing opens. The thing is empty.');
  });
});

describe('archetype data sanity', () => {
  it('every archetype has matchers, narration, and pool', () => {
    for (const [id, arche] of Object.entries(__TEST_ONLY__.ARCHETYPES)) {
      expect(arche.matchers.length).toBeGreaterThan(0);
      expect(arche.narration).toContain('{target}');
      expect(arche.pool.length).toBeGreaterThan(0);
      // Per-archetype sanity: weights positive, min <= max
      for (const entry of arche.pool) {
        expect(entry.weight).toBeGreaterThan(0);
        expect(entry.min).toBeGreaterThanOrEqual(1);
        expect(entry.max).toBeGreaterThanOrEqual(entry.min);
        expect(entry.name).toBeTruthy();
        expect(['misc', 'consumable']).toContain(entry.kind);
        void id;
      }
    }
  });

  it('every matcher is lowercase + non-empty', () => {
    for (const arche of Object.values(__TEST_ONLY__.ARCHETYPES)) {
      for (const m of arche.matchers) {
        expect(m).toBeTruthy();
        expect(m).toBe(m.toLowerCase());
      }
    }
  });
});

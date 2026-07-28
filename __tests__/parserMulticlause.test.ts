// OTA 205 — covers the three workstreams:
//   1. splitClauses() multi-clause splitter (clause-level coordination)
//   2. Layer 4 selectional restrictions in parseValidator
//   3. parsed.args back-compat sanity for migrated handlers
//
// References:
//   - J&M Ch.12 §12.3.7 (Coordination) — clause splitting on 'then',
//     'and then', ';'
//   - Sleator & Temperley §7.3 (Selectional restrictions) — type
//     checks on resolved args

import { parseInput, splitClauses } from '../app/engine/parser';
import { validateParse } from '../app/engine/parseValidator';

describe('OTA 205 — splitClauses (multi-clause input)', () => {
  it('"attack the drone then retreat" splits into two clauses', () => {
    const parts = splitClauses('attack the drone then retreat');
    expect(parts).toEqual(['attack the drone', 'retreat']);
  });

  it('"search the trap and then take the bone" splits into two', () => {
    const parts = splitClauses('search the trap and then take the bone');
    expect(parts).toEqual(['search the trap', 'take the bone']);
  });

  it('"look around; rest" splits on semicolon', () => {
    const parts = splitClauses('look around; rest');
    expect(parts).toEqual(['look around', 'rest']);
  });

  it('does NOT split on bare "and" (object coordination, V2 territory)', () => {
    const parts = splitClauses('search the trap and the bench');
    expect(parts).toEqual(['search the trap and the bench']);
  });

  it('short input is never split (guards against "well then" / "ok then")', () => {
    expect(splitClauses('then')).toEqual(['then']);
    expect(splitClauses('go east')).toEqual(['go east']);
  });

  it('single clause returns the trimmed raw unchanged', () => {
    expect(splitClauses('attack the drone with the bolt-caster')).toEqual([
      'attack the drone with the bolt-caster',
    ]);
  });

  it('"open the chest. take the gold." splits on period (when followed by space)', () => {
    const parts = splitClauses('open the chest. take the gold');
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('OTA 205 — Layer 4 selectional restrictions (Sleator §7.3)', () => {
  const RATIONS = {
    id: 'r1',
    name: 'Trail Rations',
    kind: 'consumable' as const,
    quantity: 5,
    tags: [],
  };
  const BLADE = {
    id: 'b1',
    name: 'Rusted Blade',
    kind: 'weapon' as const,
    quantity: 1,
    tags: [],
  };

  it('rejects "attack the drone with the trail rations" (instrument not a tool)', () => {
    const p = parseInput('attack the drone with the trail rations', {
      inventory: [RATIONS],
      enemyNames: ['Aetheric Drone'],
      enemyPresent: true,
    });
    expect(p.intent).toBe('unknown');
    expect(p.validationIssues).toContain('instrument_not_a_tool');
  });

  it('allows "attack the drone with the rusted blade" (weapon kind)', () => {
    const p = parseInput('attack the drone with the rusted blade', {
      inventory: [BLADE],
      enemyNames: ['Aetheric Drone'],
      enemyPresent: true,
    });
    expect(p.intent).toBe('attack');
    expect(p.validationIssues).toBeUndefined();
    expect(p.args?.find((a) => a.role === 'instrument')?.resolvedItemId).toBe('b1');
  });

  // OTA-803 — the `gift` intent + its recipient validation were removed (gifting
  // deleted). "give the locket to the wall" / "…to Yulka" no longer route to a
  // gift; "give" falls through to unknown with no gift-specific validation.

  it('validator pure-function: clean parse with ctx returns no issues', () => {
    const p = parseInput('attack the drone with the rusted blade', {
      inventory: [BLADE],
      enemyNames: ['Aetheric Drone'],
      enemyPresent: true,
    });
    expect(
      validateParse(p, { inventory: [BLADE], enemyNames: ['Aetheric Drone'] }),
    ).toEqual([]);
  });
});

describe('OTA 205 — Phase 2 back-compat (legacy fields stay populated)', () => {
  // The parser's legacy back-compat mirror was reverted in OTA 205 so
  // unmigrated handlers still see the full joined target text for
  // multi-segment inputs ("throw the rock at the goblin").
  it('"throw the rock at the goblin" — legacy parsed.target retains full token list', () => {
    const p = parseInput('throw the rock at the goblin', {
      enemyNames: ['Goblin'],
      enemyPresent: true,
    });
    // The handlers that haven't been migrated read parsed.target and
    // do their own substring matching. They expect the full noun
    // cluster, not just the direct.
    expect(p.target).toContain('rock');
    expect(p.target).toContain('goblin');
    // Migrated handlers (throw, OTA 205 Phase 2) read args.destination
    // for cleaner role separation.
    const dest = p.args?.find((a) => a.role === 'destination');
    expect(dest?.text.toLowerCase()).toContain('goblin');
  });
});

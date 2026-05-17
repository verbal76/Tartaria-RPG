import { rollMods } from '../app/engine/combatRules';
import type { StatusEffect } from '../app/engine/types';

function eff(kind: StatusEffect['kind'], label?: string): StatusEffect {
  return { kind, remainingRounds: 1, label };
}

// New action-card layer — every actionable verb in the engine writes a
// status effect, and rollMods aggregates them into a net die modifier
// for the next roll. This test pins the contract.

describe('rollMods — empty pool returns zero', () => {
  it('no effects, no modifier', () => {
    const m = rollMods([], 'attack_ranged');
    expect(m.bonus).toBe(0);
    expect(m.penalty).toBe(0);
    expect(m.net).toBe(0);
    expect(m.sources).toEqual([]);
    expect(m.consume).toEqual([]);
  });

  it('undefined effects, same result', () => {
    const m = rollMods(undefined, 'attack_melee');
    expect(m.net).toBe(0);
  });
});

describe('rollMods — aim status', () => {
  it('grants +2 to ranged attack and queues consume', () => {
    const m = rollMods([eff('aiming')], 'attack_ranged');
    expect(m.bonus).toBe(2);
    expect(m.net).toBe(2);
    expect(m.consume).toContain('aiming');
    expect(m.sources.some((s) => s.includes('aim'))).toBe(true);
  });

  it('does NOT grant the bonus on a melee swing', () => {
    const m = rollMods([eff('aiming')], 'attack_melee');
    expect(m.bonus).toBe(0);
  });
});

describe('rollMods — sprint status', () => {
  it('applies -2 to attack rolls (ranged and melee)', () => {
    expect(rollMods([eff('sprinting')], 'attack_ranged').net).toBe(-2);
    expect(rollMods([eff('sprinting')], 'attack_melee').net).toBe(-2);
  });

  it('does NOT penalize defense rolls', () => {
    expect(rollMods([eff('sprinting')], 'defense').net).toBe(0);
  });
});

describe('rollMods — cover / dodge / block stack on defense', () => {
  it('in_cover gives +4 defense', () => {
    expect(rollMods([eff('in_cover', 'partial cover')], 'defense').net).toBe(4);
  });

  it('blocking gives +4 defense', () => {
    expect(rollMods([eff('blocking')], 'defense').net).toBe(4);
  });

  it('dodging gives +4 defense', () => {
    expect(rollMods([eff('dodging', 'disengaging')], 'defense').net).toBe(4);
  });
});

describe('rollMods — overwhelmed penalizes defense', () => {
  it('-2 on evasive rolls', () => {
    expect(rollMods([eff('overwhelmed')], 'defense').net).toBe(-2);
  });

  it('does not affect attack rolls', () => {
    expect(rollMods([eff('overwhelmed')], 'attack_ranged').net).toBe(0);
  });
});

describe('rollMods — surprise consumed on use', () => {
  it('-2 once, then drops', () => {
    const m = rollMods([eff('surprised')], 'attack_melee');
    expect(m.net).toBe(-2);
    expect(m.consume).toContain('surprised');
  });
});

describe('rollMods — combined pool sums correctly', () => {
  it('aim + sprint cancel out on a ranged attack', () => {
    const m = rollMods([eff('aiming'), eff('sprinting')], 'attack_ranged');
    expect(m.net).toBe(0);
    expect(m.sources.length).toBe(2);
  });

  it('cover + overwhelmed on defense', () => {
    const m = rollMods([eff('in_cover'), eff('overwhelmed')], 'defense');
    expect(m.net).toBe(2);
  });
});

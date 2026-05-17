import {
  traitACBonus,
  traitAttackBonus,
  traitDamageMultiplier,
  traitOnHitStatus,
  traitRegen,
  traitAmbushBonus,
  describeTrait,
  describeTraits,
} from '../app/engine/enemyTraits';

// Enemies were previously homogenized — `attack` and `abilityPoint` defaulted
// when the data file used string-prefixed values. The new `traits` array lets
// each enemy bring perks to the combat math without changing its `type`.

describe('traitACBonus', () => {
  it('layers armored / weak_armor / agile', () => {
    expect(traitACBonus(['armored'])).toBe(2);
    expect(traitACBonus(['weak_armor'])).toBe(-2);
    expect(traitACBonus(['armored', 'agile'])).toBe(3);
  });
  it('returns 0 for missing or empty traits', () => {
    expect(traitACBonus(undefined)).toBe(0);
    expect(traitACBonus([])).toBe(0);
    expect(traitACBonus(['unknown'])).toBe(0);
  });
});

describe('traitAttackBonus', () => {
  it('quick / slow / savage stack', () => {
    expect(traitAttackBonus(['quick'])).toBe(1);
    expect(traitAttackBonus(['slow'])).toBe(-1);
    expect(traitAttackBonus(['quick', 'savage'])).toBe(2);
  });
});

describe('traitDamageMultiplier', () => {
  it('halves resisted damage type', () => {
    const out = traitDamageMultiplier(['resist:slashing'], 'slashing');
    expect(out.multiplier).toBe(0.5);
    expect(out.match).toBe('resist');
  });
  it('boosts vulnerable damage type', () => {
    const out = traitDamageMultiplier(['vulnerable:burn'], 'burn');
    expect(out.multiplier).toBe(1.5);
    expect(out.match).toBe('vulnerable');
  });
  it('case-insensitive match', () => {
    const out = traitDamageMultiplier(['resist:SLASHING'], 'slashing');
    expect(out.match).toBe('resist');
  });
  it('returns normal when no trait matches', () => {
    const out = traitDamageMultiplier(['armored'], 'slashing');
    expect(out.multiplier).toBe(1);
    expect(out.match).toBe('normal');
  });
});

describe('traitOnHitStatus', () => {
  it('bleeder fires at 50%', () => {
    const yes = traitOnHitStatus(['bleeder'], () => 0.4);
    expect(yes?.kind).toBe('bleed');
    const no = traitOnHitStatus(['bleeder'], () => 0.9);
    expect(no).toBeNull();
  });
  it('venomous fires at 35%', () => {
    const yes = traitOnHitStatus(['venomous'], () => 0.3);
    expect(yes?.kind).toBe('poisoned');
  });
  it('concussive fires at 20%', () => {
    const yes = traitOnHitStatus(['concussive'], () => 0.1);
    expect(yes?.kind).toBe('stun');
  });
  it('returns null for traitless enemy', () => {
    expect(traitOnHitStatus(undefined)).toBeNull();
    expect(traitOnHitStatus(['armored'])).toBeNull();
  });
});

describe('traitRegen + traitAmbushBonus', () => {
  it('regenerate = +1, fast_regen = +2', () => {
    expect(traitRegen(['regenerate'])).toBe(1);
    expect(traitRegen(['fast_regen'])).toBe(2);
    expect(traitRegen([])).toBe(0);
  });
  it('ambush_strike = +2 first-strike', () => {
    expect(traitAmbushBonus(['ambush_strike'])).toBe(2);
    expect(traitAmbushBonus([])).toBe(0);
  });
});

describe('describeTrait / describeTraits', () => {
  it('formats colon traits with capitalized arg', () => {
    expect(describeTrait('resist:slashing')).toBe('Resist Slashing');
    expect(describeTrait('vulnerable:burn')).toBe('Vuln Burn');
  });
  it('uses readable labels for known plain traits', () => {
    expect(describeTrait('armored')).toBe('Armored');
    expect(describeTrait('bleeder')).toBe('Bleeder');
  });
  it('passes unknown traits through verbatim', () => {
    expect(describeTrait('time_thief')).toBe('time_thief');
  });
  it('joins with bullet separator', () => {
    expect(describeTraits(['armored', 'quick'])).toBe('Armored · Quick');
    expect(describeTraits([])).toBe('');
  });
});

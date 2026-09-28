import {
  traitACBonus,
  traitAttackBonus,
  traitDamageMultiplier,
  traitOnHitStatus,
  traitRegen,
  traitAmbushBonus,
  traitDodgeChance,
  traitDefenses,
  describeTrait,
  describeTraits,
  portraitTraitChips,
  enemyIsAerial,
} from '../app/engine/enemyTraits';
import { isAetherkin } from '../app/engine/aetherkin';
import { enemyTypeDefenses } from '../app/engine/crafting';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  // ⚠⚠⚠ Owner-directed repair (physical Golem screenshot session): a Bleeder
  // proc built a status with no `perRoundDamage`, so `tickEffects` never
  // summed it into DOT and the status sat on the player for 3 rounds doing
  // nothing. Fixed by reusing the ONE existing authority for what a 'bleed'
  // status deals — statusEffects.ts's TYPE_TO_EFFECT.piercing rule
  // (`Math.max(1, rollDie(6) - 2)`) — rather than inventing a new number.
  it('⚠⚠⚠ a bleeder proc now carries real DOT: perRoundDamage is the same 1d6-2 (min 1) the piercing-type bleed already uses, never 0 or undefined', () => {
    for (let i = 0; i < 50; i++) {
      const hit = traitOnHitStatus(['bleeder'], () => 0.1);
      expect(hit?.kind).toBe('bleed');
      expect(hit?.perRoundDamage).toBeGreaterThanOrEqual(1);
      expect(hit?.perRoundDamage).toBeLessThanOrEqual(4);
    }
  });
  it('⚠⚠ stun and poisoned are untouched — neither carries perRoundDamage, exactly as before this repair', () => {
    // Stun already worked end-to-end via isIncapacitated and was not to be
    // altered. Poisoned's real consequence is the attack penalty in
    // combatRules.ts, not a damage tick — true for the type-based poison
    // rule too (statusEffects.ts's TYPE_TO_EFFECT.poison sets no
    // perRoundDamage either), so leaving it out here matches the existing
    // design rather than deviating from it.
    expect(traitOnHitStatus(['concussive'], () => 0.1)?.perRoundDamage).toBeUndefined();
    expect(traitOnHitStatus(['venomous'], () => 0.3)?.perRoundDamage).toBeUndefined();
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

describe('traitDodgeChance — agile / quick enemies dodge', () => {
  it('agile returns the strongest dodge', () => {
    expect(traitDodgeChance(['agile'])).toBe(0.18); // OTA-912 — trimmed from 0.25
  });
  it('quick alone returns a slimmer dodge', () => {
    expect(traitDodgeChance(['quick'])).toBe(0.12); // OTA-912 — trimmed from 0.15
  });
  it('agile + quick takes the higher value', () => {
    expect(traitDodgeChance(['quick', 'agile'])).toBe(0.18); // OTA-912 — trimmed from 0.25
  });
  it('returns 0 for nothing matching', () => {
    expect(traitDodgeChance(['armored', 'slow'])).toBe(0);
    expect(traitDodgeChance(undefined)).toBe(0);
  });
});

describe('describeTrait / describeTraits', () => {
  it('formats colon traits with capitalized arg', () => {
    expect(describeTrait('resist:slashing')).toBe('Resist Slashing');
    expect(describeTrait('vulnerable:burn')).toBe('Vuln Burn');
  });
  it('uses readable labels for known plain traits', () => {
    expect(describeTrait('armored')).toBe('Armored — +2 to its own Armor Class');
    expect(describeTrait('bleeder')).toBe(
      'Bleeder — each successful hit has a 50% chance to inflict Bleed on you for 3 rounds',
    );
  });
  it('passes unknown traits through verbatim', () => {
    expect(describeTrait('time_thief')).toBe('time_thief');
  });
  it('joins with bullet separator', () => {
    expect(describeTraits(['armored', 'quick'])).toBe(
      'Armored — +2 to its own Armor Class · Quick — +1 to its own attack rolls; 12% chance to dodge your attacks',
    );
    expect(describeTraits([])).toBe('');
  });
});

describe('aerial / aetherkin — adjacent presentation finding from the enemy conditional-effect class audit', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = JSON.parse(readFileSync(join(__dirname, '../app/data/enemies/enemies.json'), 'utf8'));
  const ROSTER: Array<{ name: string; traits?: string[] }> =
    Array.isArray(raw) ? raw : (Object.values(raw).find((v) => Array.isArray(v)) as typeof raw);

  it('⚠ both traits are reachable in the real bestiary, not hypothetical', () => {
    const aerialEnemies = ROSTER.filter((e) => (e.traits ?? []).includes('aerial')).map((e) => e.name);
    const aetherkinEnemies = ROSTER.filter((e) => (e.traits ?? []).includes('aetherkin')).map((e) => e.name);
    expect(aerialEnemies.length).toBeGreaterThan(0);
    expect(aetherkinEnemies.length).toBeGreaterThan(0);
  });

  it('⚠ aerial no longer falls through to the raw id — the label states its real mechanics', () => {
    const label = describeTrait('aerial');
    expect(label).not.toBe('aerial');
    // the three real production consequences (dogCanAct, escapePursuit +3,
    // weaponEffects' 'aerial' bonus condition) — stated in plain language,
    // not invented.
    expect(label).toContain('dog');
    expect(label).toContain('outrun');
    expect(label).toContain('ranged weapons');
  });

  it('⚠ aetherkin no longer falls through to the raw id — the label states its real consequence', () => {
    const label = describeTrait('aetherkin');
    expect(label).not.toBe('aetherkin');
    // AETHERKIN_KILL_REP / AETHERKIN_SPARE_REP — a real reputation swing,
    // not lore alone.
    expect(label).toContain('standing');
    expect(label).toContain('talking it down');
  });

  it('portraitTraitChips still carries both through unfiltered — the repair changed the LABEL, not the filter', () => {
    expect(portraitTraitChips(['aerial'], false)).toEqual(['aerial']);
    expect(portraitTraitChips(['aetherkin'], false)).toEqual(['aetherkin']);
  });

  it('the trait alone (with no name/type hint) is sufficient to make enemyIsAerial / isAetherkin true — proving the label describes the same signal the mechanics read', () => {
    expect(enemyIsAerial({ traits: ['aerial'], name: 'Unnamed Thing', type: 'Nothing Special' })).toBe(true);
    expect(isAetherkin({ traits: ['aetherkin'], name: 'Unnamed Thing' })).toBe(true);
  });

  it('internal markers stay filtered and unrelated trait descriptions stay unchanged (no broadening)', () => {
    expect(portraitTraitChips(['profiled', 'static_power_scaled', 'aerial'], false)).toEqual(['aerial']);
    expect(describeTrait('armored')).toBe('Armored — +2 to its own Armor Class');
    expect(describeTrait('bleeder')).toBe(
      'Bleeder — each successful hit has a 50% chance to inflict Bleed on you for 3 rounds',
    );
  });
});

describe('resist/weakness surfacing (EnemyPanel)', () => {
  it('traitDefenses collapses resist:/vulnerable: traits', () => {
    expect(traitDefenses(['resist:slashing', 'vulnerable:burn', 'armored'])).toEqual({
      resists: ['slashing'],
      weaknesses: ['burn'],
    });
    expect(traitDefenses(undefined)).toEqual({ resists: [], weaknesses: [] });
  });

  it('enemyTypeDefenses returns the macro type-resistance row', () => {
    // Construct (metal-bodied): resists slashing/piercing + shrugs off corruption;
    // weak to bludgeoning/electrical and — as a rigid, brittle frame — cold/acid.
    expect(enemyTypeDefenses('Construct')).toEqual({
      resist: ['slashing', 'piercing', 'corruption'],
      weak: ['bludgeoning', 'electrical', 'cold', 'acid'],
    });
    // Unknown / missing type → empty (no crash).
    expect(enemyTypeDefenses('Nonexistent Type')).toEqual({ resist: [], weak: [] });
    expect(enemyTypeDefenses(undefined)).toEqual({ resist: [], weak: [] });
  });
});

describe('⚠⚠⚠ Bleeder repair — it is wired, not merely built', () => {
  // A perRoundDamage this function returns and combatResolution.ts never reads
  // is the exact bug being repaired, with one extra step. Read the production
  // source rather than trust that the plumbing was updated.
  const CR: string = readFileSync(join(__dirname, '..', 'app', 'state', 'combatResolution.ts'), 'utf8');

  it('the applyEffect call for a trait proc actually reads perRoundDamage off it', () => {
    const at = CR.indexOf('if (landedTraitHit) {');
    expect(at).toBeGreaterThan(-1);
    const block = CR.slice(at, CR.indexOf('}', CR.indexOf('applyEffect', at)) + 200);
    expect(block).toContain('perRoundDamage: landedTraitHit.perRoundDamage');
  });
});

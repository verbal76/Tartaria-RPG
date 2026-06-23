// engine_Dev — summoned companions are "sidekicks", not "golems":
//  - getSummonNoun() defaults to "sidekick"
//  - a reskin that skips the SUMMONED SIDEKICKS box falls to the generic-default
//    sidekicks (via installGenericDefaults), not the Tartaria golems
//  - an uploaded summons pack still wins and can rename the noun
//  - the WEAPON tag system and SKILL-advancement fields are preserved

import {
  getSummonNoun,
  resolveGolemDefs,
  parseGolemKind,
  isGolemWeapon,
  makeCompanion,
  getGolemDefinition,
} from '../app/engine/golems';
import {
  installGenericDefaults,
  clearGenericDefaults,
  setSummonsOverride,
  clearAllOverrides,
} from '../app/engine/contentPack';
import { GENERIC_GAME } from '../app/engine/genericGame';

afterEach(() => {
  clearAllOverrides();
  clearGenericDefaults();
});

describe('summon noun — "sidekick" by default', () => {
  it('defaults to "sidekick" with no override and no generic pack', () => {
    expect(getSummonNoun()).toBe('sidekick');
  });

  it('the generic-default pack provides generic SIDEKICKS, not Tartaria golems', () => {
    installGenericDefaults(GENERIC_GAME);
    expect(getSummonNoun()).toBe('sidekick');
    const names = resolveGolemDefs().map((d) => d.name);
    expect(names).toContain('Scrap Sentry');
    expect(names.some((n) => /golem/i.test(n))).toBe(false);
  });

  it('an uploaded summons pack wins and can rename the noun', () => {
    setSummonsOverride({
      noun: 'automaton',
      defs: [{ kind: 'brass_automaton', name: 'Brass Automaton', fuel: [{ name: 'Brass', quantity: 2 }], hpMax: 30, attackDie: '1d8', attackMod: 1, hitBonus: 0, damageType: 'bludgeoning', blurb: 'x', aliases: ['brass'] }],
    });
    expect(getSummonNoun()).toBe('automaton');
    expect(parseGolemKind('summon automaton')).toBe('brass_automaton');
    expect(parseGolemKind('summon brass')).toBe('brass_automaton');
  });

  it('"summon sidekick" resolves to the first active def (generic fallback)', () => {
    installGenericDefaults(GENERIC_GAME);
    const first = resolveGolemDefs()[0]!.kind;
    expect(parseGolemKind('summon sidekick')).toBe(first);
  });
});

describe('weapons + skill advancement preserved', () => {
  it('isGolemWeapon still keys off the golem_weapon tag', () => {
    expect(isGolemWeapon(['golem_weapon'])).toBe(true);
    expect(isGolemWeapon(['melee'])).toBe(false);
    expect(isGolemWeapon(undefined)).toBe(false);
  });

  it('makeCompanion seeds trainable stats + progress (skill advancement intact)', () => {
    const def = getGolemDefinition('mud_golem');
    const c = makeCompanion(def);
    expect(c.stats).toEqual({ power: 0, resilience: 0 });
    expect(c.statProgress).toEqual({ power: 0, resilience: 0 });
    expect(c.hpMax).toBeGreaterThan(0);
  });
});

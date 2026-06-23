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
  trainGolemStat,
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

  it('trainGolemStat actually GROWS power/resilience through repeated success', () => {
    let c = makeCompanion(getGolemDefinition('mud_golem'));
    // power trains on attacking; ~34 successful hits at stat 0 (award 3/use) -> +1.
    let leveledOnce = false;
    for (let i = 0; i < 40; i++) {
      const r = trainGolemStat(c, 'power', true);
      c = r.golem;
      if (r.leveled) leveledOnce = true;
    }
    expect(leveledOnce).toBe(true);
    expect(c.stats!.power).toBeGreaterThanOrEqual(1);
    // a level-up also toughens the frame (HP grows through use).
    expect(c.hpMax).toBeGreaterThan(makeCompanion(getGolemDefinition('mud_golem')).hpMax);

    // failures never train; resilience grows on surviving hits.
    const before = c.stats!.resilience;
    c = trainGolemStat(c, 'resilience', false).golem;
    expect(c.stats!.resilience).toBe(before);
    for (let i = 0; i < 40; i++) c = trainGolemStat(c, 'resilience', true).golem;
    expect(c.stats!.resilience).toBeGreaterThanOrEqual(1);
  });
});

// OTA-1112 [Group-K] — engine_Dev port of HAL OTA-827. Adds `cold` as a real
// damage type, canonicalizes force→aetheric / frost→cold everywhere (not just the
// proc layer), makes poison anti-organic and cold anti-machine in the DEFAULT type
// map, and rebuilds the provokable Roused Construct into a scaling mid-tier boss.
// engine's DEFAULT map is lore-neutral and smaller than HAL's (a content pack
// overrides the whole map), so this asserts only the types engine ships by default:
// Animal, Aetheric Mutation, Aetheric Creature, Automation, Construct.

import { applyDamageTypeModifier } from '../app/engine/crafting';
import { traitDamageMultiplier, combineDamageTypeMatch } from '../app/engine/enemyTraits';
import { canonicalDamageType, parseDamageTypeKeyword } from '../app/engine/damageTypes';

describe('OTA-1112 (cold) — cold is a real, reachable damage type', () => {
  it('frost/ice canonicalize to cold and cold parses out of a string', () => {
    expect(canonicalDamageType('frost')).toBe('cold');
    expect(canonicalDamageType('ice')).toBe('cold');
    expect(canonicalDamageType('cold')).toBe('cold');
    expect(parseDamageTypeKeyword('1d8 cold')).toBe('cold');
  });

  it('a cold/frost weapon fires an authored vulnerable:cold trait', () => {
    expect(traitDamageMultiplier(['vulnerable:cold'], 'cold').match).toBe('vulnerable');
    expect(traitDamageMultiplier(['resist:cold'], 'cold').match).toBe('resist');
    expect(traitDamageMultiplier(['vulnerable:cold'], 'frost').match).toBe('vulnerable');
  });

  it('cold is anti-machine: Automation/Construct are weak to it', () => {
    expect(applyDamageTypeModifier(10, 'cold', 'Automation').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'cold', 'Construct').match).toBe('weak');
    // ...but does nothing special to a plain Animal.
    expect(applyDamageTypeModifier(10, 'cold', 'Animal').match).toBe('normal');
  });
});

describe('OTA-1112 (force) — force weapons interact as aetheric', () => {
  it('a force weapon is resisted by an aetheric-resistant foe (was neutral pre-fix)', () => {
    expect(canonicalDamageType('force')).toBe('aetheric');
    expect(applyDamageTypeModifier(10, 'force', 'Aetheric Mutation').match).toBe('resist');
    expect(traitDamageMultiplier(['resist:aetheric'], 'force').match).toBe('resist');
  });
});

describe('OTA-1112 (poison) — poison is anti-organic in the default map', () => {
  it('living/organic enemies are weak to poison; machines still resist it', () => {
    expect(applyDamageTypeModifier(10, 'poison', 'Animal').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'poison', 'Aetheric Mutation').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'poison', 'Automation').match).toBe('resist');
  });
});

describe('OTA-1112 — the double-weak reconcile still compounds', () => {
  it('a Construct weak to cold (type) AND vulnerable:cold (trait) compounds to 2.25x', () => {
    const typeMatch = applyDamageTypeModifier(10, 'cold', 'Construct').match;
    const traitMatch = traitDamageMultiplier(['vulnerable:cold'], 'cold').match;
    expect(combineDamageTypeMatch(typeMatch, traitMatch).multiplier).toBeCloseTo(2.25, 5);
  });
});

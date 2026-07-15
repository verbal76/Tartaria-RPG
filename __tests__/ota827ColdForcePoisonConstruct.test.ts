// OTA-827 [Group-K] — close the four content/damage-type gaps the audit surfaced
// (the player's rulings): (1) add `cold` as a real damage type so the two Core
// Guardians' authored vulnerable:cold/resist:cold traits can finally fire (frost
// weapons now exist); (2) `force` weapons canonicalize to aetheric so they interact
// instead of staying neutral; (3) `poison` is now a real weakness on living/organic
// enemies (still resisted by machines/undead); (4) `cold` is anti-machine so the
// provokable Roused Construct boss has a real weakness. This locks the pure
// damage-math wiring the rest depends on.

import { applyDamageTypeModifier } from '../app/engine/crafting';
import { traitDamageMultiplier, combineDamageTypeMatch } from '../app/engine/enemyTraits';
import { canonicalDamageType, parseDamageTypeKeyword } from '../app/engine/damageTypes';

describe('OTA-827 (cold) — cold is a real, reachable damage type', () => {
  it('a frost weapon canonicalizes to cold and a "Frost Maul" string parses as cold', () => {
    expect(canonicalDamageType('frost')).toBe('cold');
    expect(canonicalDamageType('ice')).toBe('cold');
    expect(canonicalDamageType('cold')).toBe('cold');
    expect(parseDamageTypeKeyword('1d8 cold')).toBe('cold');
    expect(parseDamageTypeKeyword('a Frost Maul')).toBe('cold');
  });

  it("a cold weapon fires the Core Guardian's authored vulnerable:cold trait", () => {
    // Chord Break is authored vulnerable:cold; Giant Vigil resist:cold. Pre-fix no
    // weapon dealt cold, so neither could ever be hit.
    expect(traitDamageMultiplier(['vulnerable:cold'], 'cold').match).toBe('vulnerable');
    expect(traitDamageMultiplier(['resist:cold'], 'cold').match).toBe('resist');
    // A frost-typed weapon reaches the same trait (frost -> cold canon).
    expect(traitDamageMultiplier(['vulnerable:cold'], 'frost').match).toBe('vulnerable');
  });

  it('cold is anti-machine: Automation/Construct are weak to it', () => {
    expect(applyDamageTypeModifier(10, 'cold', 'Automation').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'cold', 'Construct').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'cold', 'Mechanism').match).toBe('weak');
    // ...but does nothing special to plain flesh.
    expect(applyDamageTypeModifier(10, 'cold', 'Human').match).toBe('normal');
  });
});

describe('OTA-827 (force) — force weapons interact as aetheric', () => {
  it('a force weapon is resisted by an aetheric-resistant foe (was neutral pre-fix)', () => {
    expect(canonicalDamageType('force')).toBe('aetheric');
    // Aetheric Mutation resists aetheric → a force runecaster is now resisted.
    expect(applyDamageTypeModifier(10, 'force', 'Aetheric Mutation').match).toBe('resist');
    // and a resist:aetheric trait catches a force weapon too.
    expect(traitDamageMultiplier(['resist:aetheric'], 'force').match).toBe('resist');
  });
});

describe('OTA-827 (poison) — poison is anti-organic', () => {
  it('living/organic enemies are weak to poison; machines/undead still resist it', () => {
    expect(applyDamageTypeModifier(10, 'poison', 'Human').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'poison', 'Animal').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'poison', 'Aetheric Mutation').match).toBe('weak');
    expect(applyDamageTypeModifier(10, 'poison', 'Automation').match).toBe('resist');
    expect(applyDamageTypeModifier(10, 'poison', 'Etheric Undead').match).toBe('resist');
  });
});

describe('OTA-827 — the double-weak reconcile still compounds', () => {
  it('a Construct weak to cold (type) AND vulnerable:cold (trait) compounds to 2.25x', () => {
    const typeMatch = applyDamageTypeModifier(10, 'cold', 'Construct').match; // weak
    const traitMatch = traitDamageMultiplier(['vulnerable:cold'], 'cold').match; // vulnerable
    expect(combineDamageTypeMatch(typeMatch, traitMatch).multiplier).toBeCloseTo(2.25, 5);
  });
});

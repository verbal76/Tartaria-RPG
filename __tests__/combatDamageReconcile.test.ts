// OTA-1005 — reconcile the creature-TYPE damage table with an enemy's
// authored resist/vulnerable TRAIT for the SAME damage type.
//
// Playtest log: the Aetheric Banshee (type "Aetheric Creature", which the
// type table RESISTS aetheric on) was authored `vulnerable:aetheric`. The
// old code multiplied 0.5 × 1.5 = 0.75, printed BOTH "shrugs off the
// aetheric" AND "vulnerable to aetheric" on the same hit, and the swap-nag
// told the player to "try slashing" — which the Banshee ALSO resists.
//
// New rule: the two systems STACK when they agree (double-resist ×0.25);
// on a DISCORD (one resists, the other is vulnerable) the per-enemy
// authored trait wins.

import { combineDamageTypeMatch } from '../app/engine/enemyTraits';
import { applyDamageTypeModifier } from '../app/engine/crafting';
import { traitDamageMultiplier } from '../app/engine/enemyTraits';
import { findEnemyByName } from '../app/engine/encounter';

describe('OTA-1005 — combineDamageTypeMatch', () => {
  it('DISCORD: type resists but trait is vulnerable → trait wins (×1.5, weak)', () => {
    expect(combineDamageTypeMatch('resist', 'vulnerable')).toEqual({ multiplier: 1.5, match: 'weak' });
  });

  it('DISCORD: type weak but trait resists → trait wins (×0.5, resist)', () => {
    expect(combineDamageTypeMatch('weak', 'resist')).toEqual({ multiplier: 0.5, match: 'resist' });
  });

  it('CONCORDANT: both resist → stack (×0.25, resist)', () => {
    expect(combineDamageTypeMatch('resist', 'resist')).toEqual({ multiplier: 0.25, match: 'resist' });
  });

  it('CONCORDANT: type weak + trait vulnerable → stack (×2.25, weak)', () => {
    expect(combineDamageTypeMatch('weak', 'vulnerable')).toEqual({ multiplier: 2.25, match: 'weak' });
  });

  it('ONE-SIDED: only the type has an opinion', () => {
    expect(combineDamageTypeMatch('resist', 'normal')).toEqual({ multiplier: 0.5, match: 'resist' });
    expect(combineDamageTypeMatch('weak', 'normal')).toEqual({ multiplier: 1.5, match: 'weak' });
  });

  it('ONE-SIDED: only the trait has an opinion', () => {
    expect(combineDamageTypeMatch('normal', 'vulnerable')).toEqual({ multiplier: 1.5, match: 'weak' });
    expect(combineDamageTypeMatch('normal', 'resist')).toEqual({ multiplier: 0.5, match: 'resist' });
  });

  it('NEITHER: normal', () => {
    expect(combineDamageTypeMatch('normal', 'normal')).toEqual({ multiplier: 1, match: 'normal' });
  });
});

describe('OTA-1005 — real Aetheric Banshee resolves cleanly', () => {
  const banshee = findEnemyByName('Aetheric Banshee');

  it('exists with the contradictory flags (type resists aetheric, trait says vulnerable)', () => {
    expect(banshee).toBeTruthy();
    // Type-table view: Aetheric Creature RESISTS aetheric.
    expect(applyDamageTypeModifier(10, 'aetheric', banshee!.type).match).toBe('resist');
    // Authored trait view: VULNERABLE to aetheric.
    expect(traitDamageMultiplier(banshee!.traits, 'aetheric').match).toBe('vulnerable');
  });

  it('nets to VULNERABLE (×1.5), not the old muddled 0.75×', () => {
    const combined = combineDamageTypeMatch(
      applyDamageTypeModifier(10, 'aetheric', banshee!.type).match,
      traitDamageMultiplier(banshee!.traits, 'aetheric').match,
    );
    expect(combined.match).toBe('weak');
    expect(combined.multiplier).toBe(1.5);
  });

  it('still resists slashing (trait) — so aetheric, not slashing, is the answer', () => {
    const slash = combineDamageTypeMatch(
      applyDamageTypeModifier(10, 'slashing', banshee!.type).match,
      traitDamageMultiplier(banshee!.traits, 'slashing').match,
    );
    expect(slash.match).toBe('resist');
  });
});

// engine_Dev fix — isBareHandAttack must not treat a verb embedded in a
// hyphenated WEAPON NAME as an unarmed attack. The reported bug: "attack with the
// off-hand Tungsten-Punch Power Gauntlet" matched the "punch" inside "Tungsten-
// Punch" and resolved the strike as Bare hands (bareHand=true), discarding the
// 3d4 weapon. A real unarmed verb is at the start or after whitespace, never
// preceded by a hyphen.

import { isBareHandAttack } from '../app/engine/combatRules';

describe('isBareHandAttack — hyphenated weapon names do not trigger unarmed', () => {
  it('does NOT match the "punch" inside a Tungsten-Punch weapon name', () => {
    expect(isBareHandAttack('attack with the off-hand tungsten-punch power gauntlet')).toBe(false);
    expect(isBareHandAttack('attack with the tungsten-punch power gauntlet')).toBe(false);
  });

  it('still matches a genuine unarmed verb at the start or after a space', () => {
    expect(isBareHandAttack('punch the golem')).toBe(true);
    expect(isBareHandAttack('kick it')).toBe(true);
    expect(isBareHandAttack('attack with bare hands')).toBe(true);
    expect(isBareHandAttack('headbutt the door')).toBe(true);
  });

  it('does not match other hyphenated compounds that embed a verb', () => {
    // guards against future weapon/move names like "drop-kick blade" being a
    // real weapon — only a standalone "kick" should route unarmed.
    expect(isBareHandAttack('swing the drop-kick blade')).toBe(false);
  });
});

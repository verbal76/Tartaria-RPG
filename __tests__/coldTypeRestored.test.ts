// engine_Dev — cold/frost was dropped from BUILTIN_DT_DEFAULTS in the content-pack
// refactor, leaving cold weapons/coatings inert (no proc, no DOT, no log). This
// confirms cold is restored: getDamageTypeCombat resolves a config for both 'cold'
// and the 'frost' alias, with a sane on-hit shape, while a genuinely-unknown type
// still returns null.

import { getDamageTypeCombat, damageTypeApplyChance } from '../app/engine/contentPack';

describe('cold damage type restored', () => {
  it('cold resolves a combat config (was null / inert)', () => {
    const cfg = getDamageTypeCombat('cold');
    expect(cfg).not.toBeNull();
    expect(cfg!.mode).toBe('on_hit');
    expect(cfg!.baseChance).toBeGreaterThan(0);
  });

  it('the frost alias resolves to the cold config too', () => {
    const cfg = getDamageTypeCombat('frost');
    expect(cfg).not.toBeNull();
    expect(cfg!.mode).toBe('on_hit');
  });

  it('its apply-chance is gated and weighted by match (weak > normal > resist)', () => {
    const cfg = getDamageTypeCombat('cold')!;
    const weak = damageTypeApplyChance(cfg, 'weak');
    const normal = damageTypeApplyChance(cfg, 'normal');
    const resist = damageTypeApplyChance(cfg, 'resist');
    expect(weak).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(resist);
  });

  it('a genuinely unknown type still returns null (no false positive)', () => {
    expect(getDamageTypeCombat('not_a_real_type_xyz')).toBeNull();
  });
});

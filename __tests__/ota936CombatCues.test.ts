// OTA-936 — combat legibility cues: the pure decision rules for the once-per-encounter
// "your resist is working" praise and "that hit leaked — you have a hole" warning.
import { incomingHitCue, soakCueLine, leakCueLine } from '../app/engine/combatCues';

const base = {
  rawDmg: 10,
  dmg: 3,
  armorBlocked: false,
  armorFraction: 0,
  otherLayerFired: false,
  damageType: 'cold',
};

describe('OTA-936 incomingHitCue', () => {
  it('praises a matched armor resist doing real work (>=40% soak)', () => {
    expect(incomingHitCue({ ...base, armorBlocked: true, armorFraction: 0.4 })).toBe('soak');
    expect(incomingHitCue({ ...base, armorBlocked: true, armorFraction: 0.8, dmg: 3 })).toBe('soak');
  });

  it('a weak armor match earns no praise', () => {
    expect(incomingHitCue({ ...base, armorBlocked: true, armorFraction: 0.2 })).toBe(null);
  });

  it('warns exactly when an elemental hit hurt and NOTHING in the loadout touched it', () => {
    expect(incomingHitCue({ ...base, dmg: 6 })).toBe('leak');
    expect(incomingHitCue({ ...base, dmg: 6, damageType: 'electrical' })).toBe('leak');
    expect(incomingHitCue({ ...base, dmg: 6, damageType: 'corruption' })).toBe('leak');
  });

  it('never nags about physical hits — an unresisted physical hit is normal combat', () => {
    expect(incomingHitCue({ ...base, dmg: 9, damageType: 'physical' })).toBe(null);
    expect(incomingHitCue({ ...base, dmg: 9, damageType: 'slashing' })).toBe(null);
    expect(incomingHitCue({ ...base, dmg: 9, damageType: 'bludgeoning' })).toBe(null);
  });

  it('any other defensive layer firing suppresses the leak (title/race/shield/ward count)', () => {
    expect(incomingHitCue({ ...base, dmg: 6, otherLayerFired: true })).toBe(null);
  });

  it('a chip hit is not worth a warning', () => {
    expect(incomingHitCue({ ...base, dmg: 3 })).toBe(null);
  });

  it('lines name the damage type so the player knows WHAT to fix', () => {
    expect(soakCueLine('cold', 10, 3)).toContain('cold');
    expect(soakCueLine('cold', 10, 3)).toContain('3 of 10');
    expect(leakCueLine('electrical')).toContain('electrical');
    expect(leakCueLine('electrical')).toContain('coating');
  });
});

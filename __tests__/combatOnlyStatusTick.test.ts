import { tickEffects } from '../app/engine/statusEffects';
import type { StatusEffect, StatusEffectKind } from '../app/engine/types';

// OTA-358 → corrected OTA-359 — combat effects are PER-ENCOUNTER. Combat-only
// tactical buffs/stances tick while you're in the fight and are CLEARED the
// moment there are no enemies (so a dodge from one fight isn't active against a
// different enemy later). DOT / afflictions / timed buffs follow you out of a
// fight; stamina-gated never tick here (stamina sync owns them).

const fx = (kind: StatusEffectKind, rounds: number, extra: Partial<StatusEffect> = {}): StatusEffect =>
  ({ kind, remainingRounds: rounds, label: kind, ...extra } as StatusEffect);
const r = (effs: StatusEffect[], kind: StatusEffectKind) => effs.find((e) => e.kind === kind)?.remainingRounds;

describe('tickEffects — combat-only / stamina-gated ticking', () => {
  it('OUT of combat: combat-only buffs are CLEARED (per-encounter, not carried forward)', () => {
    const { effects, expired } = tickEffects([fx('stealthed', 2), fx('shielded', 3), fx('aiming', 2)], { inCombat: false });
    expect(r(effects, 'stealthed')).toBeUndefined();
    expect(r(effects, 'shielded')).toBeUndefined();
    expect(r(effects, 'aiming')).toBeUndefined();
    expect(expired.map((e) => e.kind).sort()).toEqual(['aiming', 'shielded', 'stealthed']);
  });

  it('IN combat: combat-only buffs tick down normally', () => {
    const { effects } = tickEffects([fx('stealthed', 2), fx('shielded', 3)], { inCombat: true });
    expect(r(effects, 'stealthed')).toBe(1);
    expect(r(effects, 'shielded')).toBe(2);
  });

  it('DOT (poison) applies damage AND afflictions tick + persist even out of combat', () => {
    const { effects, dotDamage } = tickEffects([fx('poisoned', 3, { perRoundDamage: 2 })], { inCombat: false });
    expect(dotDamage).toBe(2);
    expect(r(effects, 'poisoned')).toBe(2); // you keep bleeding/poisoned out of a fight
  });

  it('timed buffs (food_buff) persist + tick out of combat', () => {
    const { effects } = tickEffects([fx('food_buff', 5, { buffStat: 'strength', buffBonus: 3 } as never)], { inCombat: false });
    expect(r(effects, 'food_buff')).toBe(4);
  });

  it('stamina-gated (tired / exhausted) NEVER tick here', () => {
    expect(r(tickEffects([fx('tired', 99)], { inCombat: true }).effects, 'tired')).toBe(99);
    expect(r(tickEffects([fx('exhausted', 99)], { inCombat: false }).effects, 'exhausted')).toBe(99);
  });

  it('default (no opts) ticks everything — back-compat', () => {
    expect(r(tickEffects([fx('stealthed', 2)]).effects, 'stealthed')).toBe(1);
  });
});

import { tickEffects } from '../app/engine/statusEffects';
import type { StatusEffect, StatusEffectKind } from '../app/engine/types';

// OTA-358 — a "round" is one player action. Combat-only tactical buffs/stances
// hold (don't tick) outside combat so they don't evaporate during exploration;
// DOT / afflictions / timed buffs tick every action; stamina-gated states never
// tick here (stamina sync owns them).

const fx = (kind: StatusEffectKind, rounds: number, extra: Partial<StatusEffect> = {}): StatusEffect =>
  ({ kind, remainingRounds: rounds, label: kind, ...extra } as StatusEffect);
const r = (effs: StatusEffect[], kind: StatusEffectKind) => effs.find((e) => e.kind === kind)?.remainingRounds;

describe('tickEffects — combat-only / stamina-gated ticking', () => {
  it('OUT of combat: combat-only buffs HOLD (no decay)', () => {
    const { effects } = tickEffects([fx('stealthed', 2), fx('shielded', 3), fx('aiming', 2)], { inCombat: false });
    expect(r(effects, 'stealthed')).toBe(2);
    expect(r(effects, 'shielded')).toBe(3);
    expect(r(effects, 'aiming')).toBe(2);
  });

  it('IN combat: combat-only buffs DO tick', () => {
    const { effects } = tickEffects([fx('stealthed', 2), fx('shielded', 3)], { inCombat: true });
    expect(r(effects, 'stealthed')).toBe(1);
    expect(r(effects, 'shielded')).toBe(2);
  });

  it('DOT (poison) applies damage AND afflictions tick even out of combat', () => {
    const { effects, dotDamage } = tickEffects([fx('poisoned', 3, { perRoundDamage: 2 })], { inCombat: false });
    expect(dotDamage).toBe(2);
    expect(r(effects, 'poisoned')).toBe(2);
  });

  it('timed buffs (food_buff) tick out of combat', () => {
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

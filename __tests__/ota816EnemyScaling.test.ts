// OTA-816 — regular (non-boss) enemies now scale to player power + tile danger, so a
// strong character can't farm trivial trash and a deep zone bites harder than the
// frontier — but gentler than a Guardian, and a fresh arrival on a safe tile is left
// exactly as authored ("low level is still low level").

import {
  enemyScalePower,
  scaledEnemyForContext,
  scaleEncounterForContext,
} from '../app/engine/encounter';
import type { Enemy } from '../app/engine/types';

const bat = (): Enemy =>
  ({ name: 'Aetherbat', type: 'Aetheric Creature', abilityPoint: 'Dexterity 3', attack: 'Sonic Scream', damage: '1d6', hp: 15, rarity: 'Common', loot: [], traits: [] } as unknown as Enemy);
const legendary = (): Enemy =>
  ({ name: 'Mud Giant', type: 'brute', abilityPoint: 'Strength 10', attack: 'Smash', damage: '4d6', hp: 360, rarity: 'Legendary', loot: [], traits: [] } as unknown as Enemy);

// Power proxy: best offensive stat + hpMax/10.
const FRESH = enemyScalePower(8, 30);    // ≈ 11 → under the curve
const ENDGAME = enemyScalePower(28, 120); // ≈ 40 → maxed

const apNum = (e: Enemy) => parseInt(String(e.abilityPoint).match(/(\d+)/)?.[1] ?? '0', 10);

describe('OTA-816 — regular-enemy scaling', () => {
  it('a fresh player on a danger-0 tile leaves the enemy exactly as authored', () => {
    const out = scaledEnemyForContext(bat(), 0, FRESH);
    expect(out.hp).toBe(15);
    expect(out.abilityPoint).toBe('Dexterity 3');
  });

  it('an over-leveled player lifts trash off the floor (no more one-shot farming)', () => {
    const d0 = scaledEnemyForContext(bat(), 0, ENDGAME);
    expect(d0.hp).toBeGreaterThanOrEqual(30);   // 15 → ~34
    expect(apNum(d0)).toBeGreaterThan(3);         // attack/AC nudged up too
  });

  it('a deeper (higher-danger) tile scales the same enemy harder', () => {
    const d0 = scaledEnemyForContext(bat(), 0, ENDGAME);
    const d5 = scaledEnemyForContext(bat(), 5, ENDGAME);
    expect(d5.hp).toBeGreaterThan(d0.hp);         // ~64 vs ~34
    expect(apNum(d5)).toBeGreaterThan(apNum(d0));
  });

  it('stays GENTLER than a Guardian — a big Legendary is only nudged, never exploded', () => {
    const scaled = scaledEnemyForContext(legendary(), 5, ENDGAME);
    expect(scaled.hp).toBeGreaterThan(360);       // it does rise...
    expect(scaled.hp).toBeLessThan(430);          // ...but by a flat-capped amount, not ×1.7
  });

  it('a story boss now scales via the static-boss scaler (OTA-896 — was a flat pass-through)', () => {
    const boss = { ...bat(), boss: true } as Enemy;
    const out = scaledEnemyForContext(boss, 5, ENDGAME);
    expect(out.hp).toBeGreaterThan(15);           // over-leveled → grows (used to stay 15)
  });

  it('still never touches a Core Guardian (it owns its own curve)', () => {
    const guardian = { ...bat(), boss: true, traits: ['core_guardian'] } as Enemy;
    const out = scaledEnemyForContext(guardian, 5, ENDGAME);
    expect(out.hp).toBe(15);
    expect(out.abilityPoint).toBe('Dexterity 3');
  });

  it('scaleEncounterForContext scales a whole rolled pack', () => {
    const pack = scaleEncounterForContext([bat(), bat(), bat()], 3, ENDGAME);
    expect(pack).toHaveLength(3);
    for (const e of pack) expect(e.hp).toBeGreaterThan(15);
  });

  it('a mid-game player gets a partial bump, not the full end-game floor', () => {
    const mid = enemyScalePower(18, 70); // ≈ 25 → t ≈ 0.6
    const out = scaledEnemyForContext(bat(), 0, mid);
    expect(out.hp).toBeGreaterThan(15);
    expect(out.hp).toBeLessThan(scaledEnemyForContext(bat(), 0, ENDGAME).hp);
  });
});

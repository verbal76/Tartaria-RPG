// OTA-818/819 — per-spawn weakness that varies (no 1-kit-fits-all) but is THEMATIC
// (Pokémon-route: believable per creature type, never nonsense) with MEDIUM hardness
// (super-effective is a bonus, most damage still works, ~a third of spawns get a real
// ×0.25 wall). Weakness rides the existing trait resolver; bosses keep authored defenses.

import {
  randomizeEnemyDefense,
  thematicWeaknessPool,
  scaledEnemyForContext,
  scaleEncounterForContext,
  enemyScalePower,
} from '../app/engine/encounter';
import { enemyTypeDefenses } from '../app/engine/crafting';
import { traitDamageMultiplier, combineDamageTypeMatch } from '../app/engine/enemyTraits';
import type { Enemy } from '../app/engine/types';

const bat = (): Enemy =>
  ({ name: 'Aetherbat', type: 'Aetheric Creature', abilityPoint: 'Dexterity 3', attack: 'Sonic Scream', damage: '1d6', hp: 15, rarity: 'Common', loot: [], traits: [] } as unknown as Enemy);
const mud = (): Enemy =>
  ({ name: 'Mudling', type: 'Mud Creature', abilityPoint: 'Strength 3', attack: 'Slam', damage: '1d6', hp: 15, rarity: 'Common', loot: [], traits: [] } as unknown as Enemy);
const boss = (): Enemy =>
  ({ name: 'Sentinel', type: 'aether_construct', abilityPoint: 'Strength 6', attack: 'Sweep', damage: '2d6', hp: 80, rarity: 'Legendary', loot: [], traits: [], boss: true } as unknown as Enemy);

const ENDGAME = enemyScalePower(28, 120);
// Scripted rng: returns each value in order, then holds the last.
const seq = (vals: number[]) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]!; };
const weakOf = (e: Enemy) => (e.traits ?? []).find((t) => t.startsWith('vulnerable:'))?.split(':')[1];

// The final multiplier the combat resolver applies for a damage type.
function combatMult(enemy: Enemy, weaponType: string): number {
  const t = enemyTypeDefenses(enemy.type);
  const typeMatch = t.weak.includes(weaponType) ? 'weak' : t.resist.includes(weaponType) ? 'resist' : 'normal';
  const traitMatch = traitDamageMultiplier(enemy.traits, weaponType).match;
  return combineDamageTypeMatch(typeMatch, traitMatch).multiplier;
}

describe('OTA-819 — thematic weakness (believable + varied)', () => {
  it("rolls the weakness from the creature type's THEMATIC pool (never nonsense)", () => {
    const m = randomizeEnemyDefense(mud(), () => 0);
    expect(thematicWeaknessPool('Mud Creature')).toContain(weakOf(m));  // mud-appropriate
    // A mud creature is NOT weak to cold in its pool (that was the 818 nonsense case).
    expect(thematicWeaknessPool('Mud Creature')).not.toContain('cold');
  });

  it('stamps vulnerable + profiled and makes that type super-effective (×1.5)', () => {
    const out = randomizeEnemyDefense(bat(), () => 0);
    expect(out.traits).toContain('profiled');
    const w = weakOf(out)!;
    expect(combatMult(out, w)).toBeGreaterThan(1);                     // super-effective
  });

  it('MEDIUM hardness: most damage still works — mismatched is ≥ ×0.5, not zero', () => {
    const out = randomizeEnemyDefense(mud(), seq([0, 0, 0.9, 0]));     // 0.9 → no hard wall
    // Every player damage type still lands for at least half (never a hard lock).
    for (const dt of ['burn', 'slashing', 'piercing', 'electrical', 'cold']) {
      expect(combatMult(out, dt)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('~a third of spawns get a real ×0.25 WALL on a type their kind is armored against', () => {
    // rng: weak pick, soft-resist pick, wall-gate (0.1 < 0.35 → wall), wall pick.
    const walled = randomizeEnemyDefense(bat(), seq([0, 0, 0.1, 0]));
    // Aetheric Creature type-map resists aetheric; stacking a trait resist → ×0.25.
    expect(combatMult(walled, 'aetheric')).toBeCloseTo(0.25, 5);
  });

  it('neutralizes the fixed type-default weakness (the old one-answer is gone)', () => {
    // Aetheric Creature type default weak = slashing; force weak roll to bludgeoning.
    const out = randomizeEnemyDefense(bat(), () => 0);                 // pool[0] = 'bludgeoning'
    expect(weakOf(out)).toBe('bludgeoning');
    expect(combatMult(out, 'slashing')).toBeLessThanOrEqual(1);        // no longer a weakness
  });

  it('is idempotent, never touches a boss, and varies across rolls', () => {
    const once = randomizeEnemyDefense(bat(), () => 0);
    expect(randomizeEnemyDefense(once, () => 0.9).traits).toEqual(once.traits);
    expect(randomizeEnemyDefense(boss(), () => 0)).toEqual(boss());
    expect(weakOf(randomizeEnemyDefense(bat(), () => 0))).not.toBe(weakOf(randomizeEnemyDefense(bat(), () => 0.6)));
  });

  it('is folded into the scalers (solo + each pack member) and still fires on a fresh tile', () => {
    expect((scaledEnemyForContext(bat(), 2, ENDGAME).traits ?? []).some((t) => t.startsWith('vulnerable:'))).toBe(true);
    for (const e of scaleEncounterForContext([bat(), mud()], 3, ENDGAME)) {
      expect((e.traits ?? []).some((t) => t.startsWith('vulnerable:'))).toBe(true);
    }
    const fresh = scaledEnemyForContext(bat(), 0, enemyScalePower(8, 30));
    expect(fresh.hp).toBe(15);
    expect(fresh.traits).toContain('profiled');
  });
});

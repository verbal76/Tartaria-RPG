// OTA-818 — per-spawn RANDOMIZED weakness so one loadout can't fit all. Each non-boss
// spawn gets a random primary weakness (+ a resistance) stamped as vulnerable:/resist:
// traits; the type-map default weakness is neutralized (a resist trait wins the discord
// in combat) so the old kit stops working. Bosses keep their authored defenses.

import {
  randomizeEnemyDefense,
  scaledEnemyForContext,
  scaleEncounterForContext,
  enemyScalePower,
} from '../app/engine/encounter';
import { enemyTypeDefenses } from '../app/engine/crafting';
import { traitDamageMultiplier, combineDamageTypeMatch } from '../app/engine/enemyTraits';
import type { Enemy } from '../app/engine/types';

// "Aetheric Creature" type-map default: resist aetheric/electrical, WEAK to slashing.
const bat = (): Enemy =>
  ({ name: 'Aetherbat', type: 'Aetheric Creature', abilityPoint: 'Dexterity 3', attack: 'Sonic Scream', damage: '1d6', hp: 15, rarity: 'Common', loot: [], traits: [] } as unknown as Enemy);
const boss = (): Enemy =>
  ({ name: 'Sentinel', type: 'aether_construct', abilityPoint: 'Strength 6', attack: 'Sweep', damage: '2d6', hp: 80, rarity: 'Legendary', loot: [], traits: [], boss: true } as unknown as Enemy);

// The final weak/resist relationship the COMBAT resolver sees for a damage type,
// reconciling the type map with the enemy's traits (mirrors the in-combat combine).
function combatMatch(enemy: Enemy, weaponType: string): 'weak' | 'resist' | 'normal' {
  const t = enemyTypeDefenses(enemy.type);
  const typeMatch = t.weak.includes(weaponType) ? 'weak' : t.resist.includes(weaponType) ? 'resist' : 'normal';
  const traitMatch = traitDamageMultiplier(enemy.traits, weaponType).match;
  return combineDamageTypeMatch(typeMatch, traitMatch).match;
}

describe('OTA-818 — randomized weakness', () => {
  it('stamps a vulnerable trait + a profiled marker on a non-boss enemy', () => {
    const out = randomizeEnemyDefense(bat(), () => 0);           // rng 0 → first pool entry ('piercing')
    expect(out.traits).toContain('profiled');
    expect((out.traits ?? []).some((t) => t.startsWith('vulnerable:'))).toBe(true);
    expect(out.traits).toContain('vulnerable:piercing');
  });

  it('neutralizes the type-map default weakness so the old kit stops working', () => {
    // Force the rolled weakness to 'piercing' (rng 0), which is NOT the Aetherbat's
    // type default ('slashing'). Slashing must no longer read as a weakness.
    const out = randomizeEnemyDefense(bat(), () => 0);
    expect(combatMatch(out, 'slashing')).not.toBe('weak');       // default weakness cancelled
    expect(combatMatch(out, 'piercing')).toBe('weak');            // new randomized weakness
  });

  it('is idempotent — a second roll does not stack', () => {
    const once = randomizeEnemyDefense(bat(), () => 0);
    const twice = randomizeEnemyDefense(once, () => 0.9);
    expect(twice.traits).toEqual(once.traits);
  });

  it('never touches a boss / Guardian (authored defenses stand)', () => {
    const out = randomizeEnemyDefense(boss(), () => 0);
    expect(out.traits).not.toContain('profiled');
    expect(out).toEqual(boss());
  });

  it('different rolls yield different weaknesses (variety across spawns)', () => {
    const a = randomizeEnemyDefense(bat(), () => 0);              // → piercing
    const b = randomizeEnemyDefense(bat(), () => 0.5);            // → a different pool entry
    const weakOf = (e: Enemy) => (e.traits ?? []).find((t) => t.startsWith('vulnerable:'));
    expect(weakOf(a)).not.toBe(weakOf(b));
  });

  it('scaled spawns carry a randomized weakness (folded into the scaler)', () => {
    const solo = scaledEnemyForContext(bat(), 2, enemyScalePower(28, 120));
    expect((solo.traits ?? []).some((t) => t.startsWith('vulnerable:'))).toBe(true);
    const pack = scaleEncounterForContext([bat(), bat()], 3, enemyScalePower(28, 120));
    for (const e of pack) expect((e.traits ?? []).some((t) => t.startsWith('vulnerable:'))).toBe(true);
  });

  it('even a fresh player on a frontier tile gets randomized weaknesses (engagement at all levels)', () => {
    const fresh = scaledEnemyForContext(bat(), 0, enemyScalePower(8, 30)); // t=0, danger 0
    expect(fresh.hp).toBe(15);                                    // HP still authored (low is low)
    expect((fresh.traits ?? [])).toContain('profiled');           // but weakness varies
  });
});

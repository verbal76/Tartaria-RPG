import { parseWeaponEffect, effectConditionMatches } from '../app/engine/weaponEffects';
import type { Enemy } from '../app/engine/types';

function enemy(over: Partial<Enemy>): Enemy {
  return {
    name: 'Test',
    type: 'Animal',
    abilityPoint: '3',
    attack: '3',
    damage: '1d6',
    hp: 10,
    rarity: 'Common',
    loot: [],
    ...over,
  } as Enemy;
}

describe('parseWeaponEffect — recognizes catalog-effect patterns', () => {
  it('parses "+1d6 against Large creatures"', () => {
    const p = parseWeaponEffect('+1d6 damage against creatures of Large size');
    expect(p?.bonusDamageDice).toBe('1d6');
    expect(p?.bonusCondition).toBe('large');
  });

  it('parses "+1d6 against constructs"', () => {
    const p = parseWeaponEffect('Deals +1d6 against constructs');
    expect(p?.bonusCondition).toBe('construct');
  });

  it('parses "+1d6 to Large creatures" (alternative phrasing)', () => {
    const p = parseWeaponEffect('+1d6 to Large creatures');
    expect(p?.bonusCondition).toBe('large');
  });

  it('parses mechanical bonus', () => {
    const p = parseWeaponEffect('+1d6 damage against mechanical enemies or weapons');
    expect(p?.bonusCondition).toBe('mechanical');
  });

  it('parses bleed flag', () => {
    const p = parseWeaponEffect('Causes bleed (1d6 damage per turn for 2 turns)');
    expect(p?.onHitBleed).toBe(true);
  });

  it('returns null for plain flavor text', () => {
    expect(parseWeaponEffect('Heavy bone maul with a large crack in it')).toBeNull();
    expect(parseWeaponEffect('')).toBeNull();
    expect(parseWeaponEffect(null)).toBeNull();
  });
});

describe('effectConditionMatches — enemy classification', () => {
  it('large condition matches Giants / Titans / Dragons', () => {
    expect(effectConditionMatches('large', enemy({ name: 'Mud Titan', type: 'Mud Creature' }))).toBe(true);
    expect(effectConditionMatches('large', enemy({ name: 'Bog Dragon' }))).toBe(true);
    expect(effectConditionMatches('large', enemy({ name: 'Mud Wasp' }))).toBe(false);
  });

  it('construct matches Automations and Sentinels', () => {
    expect(effectConditionMatches('construct', enemy({ name: 'Scrap Drone', type: 'Automation' }))).toBe(true);
    expect(effectConditionMatches('construct', enemy({ name: 'Architectural Sentinel', type: 'Automation' }))).toBe(true);
    expect(effectConditionMatches('construct', enemy({ name: 'Mud Wasp', type: 'Animal' }))).toBe(false);
  });

  it('mechanical matches drone/cog/automation signatures', () => {
    expect(effectConditionMatches('mechanical', enemy({ name: 'Steam Spider', type: 'Automation' }))).toBe(true);
    expect(effectConditionMatches('mechanical', enemy({ name: 'Mud Boar', type: 'Animal' }))).toBe(false);
  });

  it('animal matches Animal type', () => {
    expect(effectConditionMatches('animal', enemy({ name: 'Mud Boar', type: 'Animal' }))).toBe(true);
    expect(effectConditionMatches('animal', enemy({ name: 'Scrap Drone', type: 'Automation' }))).toBe(false);
  });

  it('aetheric matches Aetherkin / Aetheric Mutation signatures', () => {
    expect(effectConditionMatches('aetheric', enemy({ name: 'Aetherkin', type: 'Etheric Undead' }))).toBe(true);
    expect(effectConditionMatches('aetheric', enemy({ name: 'Aetheric Hound', type: 'Aetheric Mutation' }))).toBe(true);
  });

  it('shielded reads enemy.traits for shield/warded markers', () => {
    expect(effectConditionMatches('shielded', enemy({ traits: ['armored', 'energy_shielded'] }))).toBe(true);
    expect(effectConditionMatches('shielded', enemy({ traits: ['quick'] }))).toBe(false);
  });
});

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
    expect(p?.bonuses?.[0]?.dice).toBe('1d6');
    expect(p?.bonuses?.[0]?.condition).toBe('large');
  });

  it('parses "+1d6 against constructs"', () => {
    const p = parseWeaponEffect('Deals +1d6 against constructs');
    expect(p?.bonuses?.[0]?.condition).toBe('construct');
  });

  it('parses "+1d6 to Large creatures" (alternative phrasing)', () => {
    const p = parseWeaponEffect('+1d6 to Large creatures');
    expect(p?.bonuses?.[0]?.condition).toBe('large');
  });

  it('parses mechanical bonus', () => {
    const p = parseWeaponEffect('+1d6 damage against mechanical enemies or weapons');
    expect(p?.bonuses?.[0]?.condition).toBe('mechanical');
  });

  it('parses "+1d6 against airborne enemies" → aerial', () => {
    const p = parseWeaponEffect('Long-range. +1d6 against airborne enemies.');
    expect(p?.bonuses?.[0]?.dice).toBe('1d6');
    expect(p?.bonuses?.[0]?.condition).toBe('aerial');
  });

  // arb-fix — a weapon can carry MULTIPLE "+NdN against X" clauses; each is
  // parsed and stacks (the longbow that hits Large creatures AND airborne).
  it('parses TWO bonus clauses on one weapon', () => {
    const p = parseWeaponEffect('+1d6 to creatures of Large size. +2d6 against airborne enemies.');
    expect(p?.bonuses).toHaveLength(2);
    expect(p?.bonuses?.[0]).toEqual({ dice: '1d6', condition: 'large' });
    expect(p?.bonuses?.[1]).toEqual({ dice: '2d6', condition: 'aerial' });
  });

  it('parses bleed flag', () => {
    const p = parseWeaponEffect('Causes bleed (1d6 damage per turn for 2 turns)');
    expect(p?.onHitBleed).toBe(true);
  });

  // Regression: the original regex required either an immediate "against"
  // or the literal "damage" word right after the dice. Aether-Shard
  // Spear's catalog effect inserts a damage-type noun in between
  // ("aetheric damage against …") and the regex was silently failing,
  // so the bonus die never rolled. Widened regex now tolerates an
  // optional middle word.
  it('parses "+1d4 aetheric damage against aetheric or magical targets"', () => {
    const p = parseWeaponEffect('+1d4 aetheric damage against aetheric or magical targets.');
    expect(p?.bonuses?.[0]?.dice).toBe('1d4');
    // Effect lists two conditions; either is a valid match.
    expect(['aetheric', 'magical']).toContain(p?.bonuses?.[0]?.condition);
  });

  it('parses "+2d6 burn against constructs"', () => {
    const p = parseWeaponEffect('+2d6 burn damage against constructs');
    expect(p?.bonuses?.[0]?.dice).toBe('2d6');
    expect(p?.bonuses?.[0]?.condition).toBe('construct');
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
    expect(effectConditionMatches('aetheric', enemy({ name: 'Aetherkin', type: 'Aetheric Undead' }))).toBe(true);
    expect(effectConditionMatches('aetheric', enemy({ name: 'Aetheric Hound', type: 'Aetheric Mutation' }))).toBe(true);
  });

  it('shielded reads enemy.traits for shield/warded markers', () => {
    expect(effectConditionMatches('shielded', enemy({ traits: ['armored', 'energy_shielded'] }))).toBe(true);
    expect(effectConditionMatches('shielded', enemy({ traits: ['quick'] }))).toBe(false);
  });

  it('aerial matches the aerial trait + drone/bat signatures, not ground foes', () => {
    expect(effectConditionMatches('aerial', enemy({ name: 'Aetheric Drone', type: 'Automation', traits: ['armored', 'aerial'] }))).toBe(true);
    expect(effectConditionMatches('aerial', enemy({ name: 'Aether Bat', type: 'Aetheric Creature' }))).toBe(true);
    expect(effectConditionMatches('aerial', enemy({ name: 'Mud Boar', type: 'Animal' }))).toBe(false);
  });
});

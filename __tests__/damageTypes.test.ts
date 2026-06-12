// arb119 — every enemy resolves to a concrete, player-visible damage type.

import { enemyDamageType, parseDamageTypeKeyword } from '../app/engine/damageTypes';
import type { Enemy } from '../app/engine/types';

const mk = (over: Partial<Enemy>): Enemy => ({
  name: 'Test', type: 'beast', abilityPoint: 'Strength 2', attack: 'Strike',
  damage: '2D6', hp: 10, rarity: 'Common', loot: [], ...over,
});

describe('parseDamageTypeKeyword — explicit type words', () => {
  it('reads an explicit type from the damage string', () => {
    expect(parseDamageTypeKeyword('1d6 piercing')).toBe('piercing');
    expect(parseDamageTypeKeyword('1d6 slashing + 1 Etheric')).toBe('slashing'); // first wins
    expect(parseDamageTypeKeyword('3D8 Aetheric')).toBe('aetheric');
  });
  it('folds psychic into aetheric', () => {
    expect(parseDamageTypeKeyword('2D6 Psychic')).toBe('aetheric');
  });
  it('returns null for bare dice (no type word)', () => {
    expect(parseDamageTypeKeyword('2D6')).toBeNull();
    expect(parseDamageTypeKeyword('3D10')).toBeNull();
  });
});

describe('enemyDamageType — always a concrete type', () => {
  it('prefers the explicit type in the damage string', () => {
    expect(enemyDamageType(mk({ damage: '1d6 piercing', attack: 'Slam' }))).toBe('piercing');
  });

  it('infers from the attack verb when the damage string is bare dice', () => {
    expect(enemyDamageType(mk({ attack: 'Claw', damage: '2D6' }))).toBe('slashing');
    expect(enemyDamageType(mk({ attack: 'Bite', damage: '2D6' }))).toBe('piercing');
    expect(enemyDamageType(mk({ attack: 'Slam', damage: '2D6' }))).toBe('bludgeoning');
    expect(enemyDamageType(mk({ attack: 'Venom Spit', damage: '2D6' }))).toBe('poison');
    expect(enemyDamageType(mk({ attack: 'Mind Lash', damage: '2D6' }))).toBe('aetheric');
  });

  it('falls back to the enemy NAME when the attack verb is generic', () => {
    // 'Strike' carries no type, but the species name does → read off the name.
    expect(enemyDamageType(mk({ attack: 'Strike', name: 'Flame Wisp', damage: '3D6' }))).toBe('burn');
  });

  it('reads pointy/toothed and blunt-mass SPECIES off the name (Iron Spider → piercing)', () => {
    // The case the playtester flagged: a spider has fangs + needle legs.
    expect(enemyDamageType(mk({ attack: 'Strike', name: 'Iron Spider', damage: '3D6' }))).toBe('piercing');
    expect(enemyDamageType(mk({ attack: 'Strike', name: 'Sand Scorpion', damage: '2D6' }))).toBe('piercing');
    expect(enemyDamageType(mk({ attack: 'Strike', name: 'Silt Serpent', damage: '2D10' }))).toBe('piercing');
    // Heavy constructs hit with mass.
    expect(enemyDamageType(mk({ attack: 'Strike', name: 'Stone Golem', damage: '2D8' }))).toBe('bludgeoning');
    expect(enemyDamageType(mk({ attack: 'Strike', name: 'Aetheric Ooze', damage: '1D10' }))).toBe('bludgeoning');
  });

  it('defaults to bludgeoning for a typeless, verbless, speciesless enemy', () => {
    expect(enemyDamageType(mk({ attack: 'Strike', name: 'Pale Husk', damage: '2D6' }))).toBe('bludgeoning');
  });

  it('every catalogued enemy resolves to a non-empty type', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const enemies: Enemy[] = [
      ...collectEnemies(require('../app/data/enemies/enemies.json')),
      ...collectEnemies(require('../app/data/world/wasteland_encounters.json')),
    ];
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(enemies.length).toBeGreaterThan(0);
    for (const e of enemies) {
      const t = enemyDamageType(e);
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });
});

// Walk an arbitrary JSON blob and collect objects that look like enemies
// (have name + damage + attack), so the test stays robust to the data shape.
function collectEnemies(node: unknown, out: Enemy[] = []): Enemy[] {
  if (Array.isArray(node)) {
    for (const n of node) collectEnemies(n, out);
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.name === 'string' && typeof o.damage === 'string' && typeof o.attack === 'string') {
      out.push(o as unknown as Enemy);
    }
    for (const v of Object.values(o)) collectEnemies(v, out);
  }
  return out;
}

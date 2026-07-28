// OTA-928 — the Power rating: one comparable score for player + enemy, driving the
// facing HUD badges. Verifies the formula pieces, ordering (stronger = higher), and
// the matchup verdict thresholds.
import { avgDamageNotation, playerPowerScore, enemyPowerScore, powerMatchup } from '../app/engine/powerRating';
import type { Enemy, PlayerCharacter } from '../app/engine/types';

const mkPlayer = (o: Partial<PlayerCharacter>): PlayerCharacter =>
  ({ stats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 10 },
     ac: 10, hpMax: 30, inventory: [], equipped: {}, ...o } as unknown as PlayerCharacter);

const mkEnemy = (o: Partial<Enemy>): Enemy =>
  ({ name: 'x', type: 't', abilityPoint: 'Strength 4', attack: 'a', damage: '1d6', hp: 20, rarity: 'Common', loot: [], ...o } as unknown as Enemy);

describe('OTA-928 — avgDamageNotation', () => {
  it('averages NdM(+K) notation', () => {
    expect(avgDamageNotation('1d6')).toBeCloseTo(3.5);
    expect(avgDamageNotation('2d6+5')).toBeCloseTo(12);
    expect(avgDamageNotation('1d8+3')).toBeCloseTo(7.5);
  });
  it('falls back gracefully on odd input', () => {
    expect(avgDamageNotation(undefined)).toBe(2);
    expect(avgDamageNotation('nonsense')).toBe(2);
  });
});

describe('OTA-928 — power scores rise with the character', () => {
  it('a stronger, better-defended, higher-HP build has a higher player Power', () => {
    const weak = mkPlayer({ stats: { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8, stealth: 8 } as PlayerCharacter['stats'], ac: 10, hpMax: 24 });
    const strong = mkPlayer({ stats: { strength: 24, dexterity: 12, constitution: 16, intelligence: 12, wisdom: 12, charisma: 10, stealth: 12 } as PlayerCharacter['stats'], ac: 22, hpMax: 110 });
    expect(playerPowerScore(strong)).toBeGreaterThan(playerPowerScore(weak));
  });
  it('a final-boss-scale enemy reads far above a weakling', () => {
    const weakling = enemyPowerScore(mkEnemy({ abilityPoint: 'Strength 3', damage: '1d4', hp: 12 }));
    const finalBoss = enemyPowerScore(mkEnemy({ abilityPoint: 'Intelligence 13', damage: '2d6+5', hp: 660, boss: true, traits: ['armored'] }));
    expect(weakling).toBeLessThan(30);
    expect(finalBoss).toBeGreaterThan(80);
    expect(finalBoss).toBeGreaterThan(weakling);
  });
});

describe('OTA-928 — powerMatchup verdict', () => {
  it('classifies favoured / even / danger by ratio', () => {
    expect(powerMatchup(100, 60)).toBe('favored');
    expect(powerMatchup(100, 100)).toBe('even');
    expect(powerMatchup(60, 100)).toBe('danger');
  });
});

// ⚠⚠⚠ OTA-1607 — THE CARD SAYS WHAT THE DICE ROLL.
//
// Owner: "the enemy portrait card said 2d6 physcic under DMG that's why I
// typed that." He asked an honest question ("phsycic damage from the
// enemy?") because the PORTRAIT taught him a damage type the ENGINE never
// deals: the bestiary authors flavor words ('2D6 Psychic') and every roll
// folds them through DAMAGE_TYPE_ALIASES (psychic→aetheric) before a point
// lands. The Mud Spirit hit him for "5 aetheric damage" while its card said
// psychic — two answers for one claw.
//
// enemyDamageCompact now keeps the dice and canonicalizes the word. DMG, the
// DEALS line (enemyDamageType — always canonical), and the combat log's
// damage clauses tell one story, and a whole-bestiary ratchet holds it.

import { enemyDamageCompact } from '../app/engine/combatRules';
import { enemyDamageType, parseDamageTypeKeyword, DAMAGE_TYPE_ALIASES } from '../app/engine/damageTypes';
import enemiesData from '../app/data/enemies/enemies.json';

type Row = { name: string; damage?: string; attack?: string; boss?: boolean; traits?: string[] };
const ROWS: Row[] = (Array.isArray(enemiesData)
  ? enemiesData
  : (Object.values(enemiesData as Record<string, unknown>).find(Array.isArray) as Row[])) as Row[];

describe('OTA-1607 — the card tells the type the dice actually roll', () => {
  it('⚠⚠⚠ HIS CARD: the Mud Spirit reads 2d6 aetheric — the type its claws actually deal', () => {
    const spirit = ROWS.find((r) => r.name === 'Mud Spirit')!;
    expect(spirit.damage).toMatch(/psychic/i); // the authored flavor stays in data
    expect(enemyDamageCompact(spirit)).toBe('2d6 aetheric'); // the card tells the truth
    expect(enemyDamageType(spirit as never)).toBe('aetheric'); // and agrees with the DEALS line
  });

  it('⚠⚠ alias words canonicalize; canonical words and bare dice pass through', () => {
    expect(enemyDamageCompact({ damage: '2D6 Psychic' })).toBe('2d6 aetheric');
    expect(enemyDamageCompact({ damage: '1d8 Frost' })).toBe('1d8 cold');
    expect(enemyDamageCompact({ damage: '2d8 Slashing' })).toBe('2d8 slashing');
    expect(enemyDamageCompact({ damage: '1d6' })).toBe('1d6');
    expect(enemyDamageCompact({ damage: '' })).toBe('1d6');
  });

  it('⚠⚠ the boss suffixes ride the corrected base', () => {
    expect(enemyDamageCompact({ damage: '2d6 Psychic', boss: true })).toMatch(/^2d6 aetheric\+1d6/);
  });

  it('⚠⚠⚠ THE RATCHET — no card in the whole bestiary renders an alias word, and every typed card agrees with its rolls', () => {
    const aliasWords = Object.keys(DAMAGE_TYPE_ALIASES);
    const offenders: string[] = [];
    for (const r of ROWS) {
      const card = enemyDamageCompact(r).toLowerCase();
      for (const a of aliasWords) {
        if (new RegExp(`\\b${a}\\b`).test(card)) offenders.push(`${r.name}: "${card}" renders alias '${a}'`);
      }
      // A card that names a type must name the SAME type the engine deals.
      const cardType = parseDamageTypeKeyword(card);
      if (cardType && cardType !== enemyDamageType(r as never)) {
        offenders.push(`${r.name}: card says ${cardType}, rolls deal ${enemyDamageType(r as never)}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(ROWS.length).toBeGreaterThan(100); // the sweep actually swept
  });
});

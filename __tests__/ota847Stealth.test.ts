// OTA-847 (STEALTH SYSTEM) — BACKSTAB damage-doubling guard.
//
// Striking from stealth (the `stealthed` buff, earned via the first-action
// SNEAK ATTACK opener or a mid-combat re-stealth) doubles the damage dice — but
// ONLY with a finesse/thrown weapon (stat 'dexterity'). A heavy weapon striking
// from stealth still gets the +5 to-hit from `stealthed` (rollMods), but no
// dice-doubling — a plain SNEAK STRIKE. These pins lock that weapon gate so the
// rogue payoff can't silently leak onto heavy builds (or evaporate off daggers).

import { buildCombatSteps } from '../app/engine/combatRules';
import type { PlayerCharacter, Enemy, StatusEffect } from '../app/engine/types';

function makePlayer(scalesWith: 'strength' | 'dexterity', stealthed: boolean): PlayerCharacter {
  const statusEffects: StatusEffect[] = stealthed
    ? [{ kind: 'stealthed', remainingRounds: 2, label: 'unseen — next strike +5' } as StatusEffect]
    : [];
  return {
    raceId: 'reclaimer',
    stats: { strength: 12, dexterity: 12, intelligence: 12, wisdom: 12, charisma: 12, stealth: 12 },
    ac: 12,
    equipped: { main: 'Test Blade' },
    statusEffects,
    inventory: [
      {
        name: 'Test Blade',
        kind: 'weapon',
        uniqueStats: {
          kind: 'weapon',
          damageDice: '2d6',
          damageType: 'slashing',
          scalesWith,
          rarity: 'Uncommon',
          durability: { current: 50, max: 50 },
        },
      },
    ],
  } as unknown as PlayerCharacter;
}

const enemy: Enemy = { name: 'mud wretch', hp: 40, ac: 10 } as unknown as Enemy;

function damageCount(p: PlayerCharacter) {
  return buildCombatSteps('attack the mud wretch', p, enemy).find((s) => s.id === 'damage')!.count;
}
function damageCtx(p: PlayerCharacter) {
  return buildCombatSteps('attack the mud wretch', p, enemy).find((s) => s.id === 'damage')!.context;
}

describe('OTA-847 — backstab (stealthed + finesse) doubles damage dice', () => {
  it('finesse weapon striking from stealth → doubled dice + BACKSTAB note', () => {
    const p = makePlayer('dexterity', true);
    expect(damageCount(p)).toBe(4); // 2d6 → 4d6
    expect(damageCtx(p)).toContain('BACKSTAB');
  });

  it('heavy weapon striking from stealth → NOT doubled (plain sneak strike)', () => {
    const p = makePlayer('strength', true);
    expect(damageCount(p)).toBe(2); // stays 2d6
    expect(damageCtx(p)).not.toContain('BACKSTAB');
  });

  it('finesse weapon WITHOUT stealth → NOT doubled', () => {
    const p = makePlayer('dexterity', false);
    expect(damageCount(p)).toBe(2);
    expect(damageCtx(p)).not.toContain('BACKSTAB');
  });
});

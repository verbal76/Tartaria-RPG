// OTA-211 — Aether Dust food additive buff. Verifies effectiveStats
// picks up the aetherBuff while active and drops it once the
// wall-clock expiry passes.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

import { effectiveStats } from '../app/engine/equipment';
import type { PlayerCharacter } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';

function mkPlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Tester',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: 50, hpMax: 50,
    stamina: 20, staminaMax: 20,
    ac: 10, tc: 0,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    ...placedAt('x'),
    activeQuests: [],
    ...overrides,
  } as PlayerCharacter;
}

describe('OTA-211 — aetherBuff applies via effectiveStats while active', () => {
  // Test the delta against an unbuffed baseline so racial / weather /
  // other always-on bonuses don't muddy the assertion.
  const baseline = (over: Partial<PlayerCharacter>) => effectiveStats(mkPlayer(over));

  it('+3 STR when aetherBuff stat=strength and expiresAtMs is in the future', () => {
    const before = baseline({}).strength;
    const after = baseline({
      aetherBuff: { stat: 'strength', bonus: 3, expiresAtMs: Date.now() + 60_000 },
    }).strength;
    expect(after - before).toBe(3);
  });

  it('does NOT apply when expiresAtMs is in the past', () => {
    const before = baseline({}).strength;
    const after = baseline({
      aetherBuff: { stat: 'strength', bonus: 3, expiresAtMs: Date.now() - 1 },
    }).strength;
    expect(after - before).toBe(0);
  });

  it('applies to any of the five stats', () => {
    for (const stat of ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'] as const) {
      const before = baseline({})[stat];
      const after = baseline({
        aetherBuff: { stat, bonus: 3, expiresAtMs: Date.now() + 60_000 },
      })[stat];
      expect(after - before).toBe(3);
    }
  });

  it('stacks with food_buff status effects (multiple sources sum)', () => {
    const before = baseline({}).dexterity;
    const after = effectiveStats(mkPlayer({
      aetherBuff: { stat: 'dexterity', bonus: 3, expiresAtMs: Date.now() + 60_000 },
      statusEffects: [
        { kind: 'food_buff', remainingRounds: 5, buffStat: 'dexterity', buffBonus: 1 },
      ],
    } as Partial<PlayerCharacter>)).dexterity;
    expect(after - before).toBe(4); // 3 aether + 1 food
  });

  it('does NOT affect non-targeted stats', () => {
    const before = baseline({});
    const after = baseline({
      aetherBuff: { stat: 'wisdom', bonus: 3, expiresAtMs: Date.now() + 60_000 },
    });
    expect(after.wisdom - before.wisdom).toBe(3);
    expect(after.strength).toBe(before.strength);
    expect(after.dexterity).toBe(before.dexterity);
    expect(after.intelligence).toBe(before.intelligence);
    expect(after.charisma).toBe(before.charisma);
  });
});

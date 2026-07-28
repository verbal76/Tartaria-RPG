// OTA-800 — pure-engine regressions for two of the "small bugs" fixes:
//   1. recordEnemyDefeat de-duplicates (defeatedEnemies is a distinct-name set,
//      not a running tally) so it can't grow unbounded → save bloat.
//   2. wild-water re-arm keyed on GAME-HOURS per source (waterSourceReady /
//      recordWaterUse), so bouncing water tiles can't reset a one-shot flag.

import {
  emptyMemory,
  recordEnemyDefeat,
  waterSourceReady,
  recordWaterUse,
  WATER_REARM_HOURS,
} from '../app/engine/worldMemory';

describe('OTA-800 — recordEnemyDefeat de-dupes (bounded distinct-name set)', () => {
  it('re-killing the same enemy does NOT grow the array', () => {
    let m = emptyMemory();
    m = recordEnemyDefeat(m, 'Mud Boar');
    m = recordEnemyDefeat(m, 'Mud Boar');
    m = recordEnemyDefeat(m, 'Mud Boar');
    expect(m.defeatedEnemies).toEqual(['Mud Boar']);
  });

  it('distinct enemies accumulate in first-kill order (defeated[0] is the first kill)', () => {
    let m = emptyMemory();
    m = recordEnemyDefeat(m, 'Silt Thief');
    m = recordEnemyDefeat(m, 'Aetheric Leech');
    m = recordEnemyDefeat(m, 'Silt Thief'); // dup — ignored
    expect(m.defeatedEnemies).toEqual(['Silt Thief', 'Aetheric Leech']);
    expect(m.defeatedEnemies[0]).toBe('Silt Thief');
  });

  it('SELF-HEALS a legacy save that already carries duplicates', () => {
    // Simulate a pre-OTA-800 save with a farmed duplicate stack.
    const legacy = { ...emptyMemory(), defeatedEnemies: ['Rat', 'Rat', 'Rat', 'Wolf'] };
    const healed = recordEnemyDefeat(legacy, 'Bat');
    expect(healed.defeatedEnemies).toEqual(['Rat', 'Wolf', 'Bat']);
  });

  it('a clean save stays referentially stable when nothing changes', () => {
    const clean = { ...emptyMemory(), defeatedEnemies: ['Rat', 'Wolf'] };
    expect(recordEnemyDefeat(clean, 'Rat')).toBe(clean); // no dup, no legacy → same ref
  });
});

describe('OTA-800 — wild-water re-arm on game-hours per source', () => {
  const KEY_A = 'loc|null|1|1|null';
  const KEY_B = 'loc|null|2|1|null'; // an adjacent outdoor tile

  it('a never-used source is ready', () => {
    expect(waterSourceReady(emptyMemory(), KEY_A, 'drink', 10)).toBe(true);
  });

  it('a just-used source is NOT ready again until the window elapses', () => {
    const m = recordWaterUse(emptyMemory(), KEY_A, 'drink', 10);
    expect(waterSourceReady(m, KEY_A, 'drink', 10)).toBe(false);
    expect(waterSourceReady(m, KEY_A, 'drink', 10 + WATER_REARM_HOURS - 0.01)).toBe(false);
    expect(waterSourceReady(m, KEY_A, 'drink', 10 + WATER_REARM_HOURS)).toBe(true);
  });

  it('drink and fill re-arm independently on the same source', () => {
    let m = recordWaterUse(emptyMemory(), KEY_A, 'drink', 10);
    expect(waterSourceReady(m, KEY_A, 'fill', 10)).toBe(true); // fill untouched
    m = recordWaterUse(m, KEY_A, 'fill', 10);
    expect(waterSourceReady(m, KEY_A, 'fill', 10)).toBe(false);
  });

  it('bouncing to an ADJACENT tile does not reset the first tile', () => {
    let m = recordWaterUse(emptyMemory(), KEY_A, 'drink', 10);
    // walk to B, drink there a few game-minutes later
    m = recordWaterUse(m, KEY_B, 'drink', 10.1);
    // walk back to A almost immediately — A is still on cooldown
    expect(waterSourceReady(m, KEY_A, 'drink', 10.2)).toBe(false);
  });

  it('prunes re-armed sources so the map stays tiny', () => {
    let m = recordWaterUse(emptyMemory(), KEY_A, 'drink', 1);
    // A long time later, use B — A has re-armed and should be forgotten.
    m = recordWaterUse(m, KEY_B, 'drink', 1 + WATER_REARM_HOURS + 5);
    expect(m.waterUsedAt && Object.keys(m.waterUsedAt)).toEqual([KEY_B]);
  });
});

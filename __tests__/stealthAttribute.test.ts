import { rollRaceStealth, createCharacter } from '../app/engine/character';
import { effectiveStats } from '../app/engine/equipment';
import { buildSkillSteps } from '../app/engine/combatRules';
import type { PlayerCharacter } from '../app/engine/types';

// OTA-348 — Stealth is now a first-class attribute. Starting value is a
// race-proportional roll (Giants 0, constructs low, Mud Dwellers / Reclaimers
// high); the Salvager's Trench Coat (and other stealth gear) feed it; and the
// stealth skill check (the APPROACH "use stealth" toggle) is governed by it.

describe('rollRaceStealth — per-race dice', () => {
  const samples = (raceId: string, n = 400) =>
    Array.from({ length: n }, () => rollRaceStealth(raceId));

  it('Giants have NO stealth — always 0', () => {
    expect(samples('tartarian_giant').every((v) => v === 0)).toBe(true);
  });

  it('races roll within their die range, proportional to flavor', () => {
    const range = (raceId: string) => {
      const s = samples(raceId);
      return [Math.min(...s), Math.max(...s)] as const;
    };
    // [observed-min, observed-max] should sit inside [1, sides] and actually
    // reach the ceiling over 400 rolls.
    expect(range('mud_golem')).toEqual([1, 4]);               // 1d4 — really low
    expect(range('architectural_sentinel')).toEqual([1, 6]);  // 1d6
    expect(range('unknowing_mass')).toEqual([1, 6]);          // 1d6
    expect(range('aetherborn')).toEqual([1, 8]);              // 1d8
    expect(range('mud_dweller')).toEqual([1, 10]);            // 1d10
    expect(range('reclaimer')).toEqual([1, 12]);              // 1d12 — best sneaks
  });

  it('an unknown race falls to the middle (1d6)', () => {
    expect(samples('???').every((v) => v >= 1 && v <= 6)).toBe(true);
  });
});

describe('createCharacter — every new character gets a race-rolled Stealth', () => {
  it('a Giant starts with Stealth 0; a Reclaimer in 1..12', () => {
    const giant = createCharacter({ name: 'Borr', raceId: 'tartarian_giant', factionId: 'mud_monarchs' } as never);
    expect(giant.stats.stealth).toBe(0);
    const rec = createCharacter({ name: 'Vex', raceId: 'reclaimer', factionId: 'mud_monarchs' } as never);
    expect(rec.stats.stealth).toBeGreaterThanOrEqual(1);
    expect(rec.stats.stealth).toBeLessThanOrEqual(12);
    // The other five stats still roll their uniform 1d10.
    expect(giant.stats.strength).toBeGreaterThanOrEqual(1);
  });
});

// ⚠ OTA-1708 RE-ANCHORED, and the CLAIM is unchanged: a cloak can feed the
// Stealth attribute, which is what OTA-348 built and what this guards. The
// example moved because the rebalance moved it — "Salvager's" is an identity
// noun on the intelligence line ("the ones who sort salvage"), so that coat now
// reads intelligence, while stealth as a channel grew from 23 paid entries to
// 44. A cloak that still says stealth by name is the better example anyway: it
// tests the wiring rather than one row's authoring.
describe('a stealth cloak feeds the Stealth attribute', () => {
  function playerWith(stealthBase: number, cloak?: string): PlayerCharacter {
    const p = createCharacter({ name: 'Tester', raceId: 'reclaimer', factionId: 'mud_monarchs' } as never);
    p.stats.stealth = stealthBase;
    p.equipped = { ...(p.equipped ?? {}), cloak: cloak ?? null } as never;
    return p;
  }

  it('equipping the cloak adds +1 effective Stealth (was dropped as flavor pre-348)', () => {
    const without = effectiveStats(playerWith(5)).stealth;
    const withCoat = effectiveStats(playerWith(5, 'Mud-Bound Cloak')).stealth;
    expect(withCoat - without).toBe(1);
  });
});

describe('the stealth skill check is governed by Stealth, not DEX', () => {
  it('the stealth roll step scales with the Stealth attribute', () => {
    const p = createCharacter({ name: 'Sneak', raceId: 'reclaimer', factionId: 'mud_monarchs' } as never);
    p.stats.stealth = 9;
    p.stats.dexterity = 2;
    p.equipped = {} as never;
    const steps = buildSkillSteps('stealth', p);
    const total = steps.reduce((sum, s) => sum + (s.bonus ?? 0), 0);
    // Bonus tracks effective Stealth (9), not the low DEX (2).
    expect(total).toBe(effectiveStats(p).stealth);
    expect(total).toBeGreaterThanOrEqual(9);
  });
});

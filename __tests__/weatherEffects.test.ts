import {
  weatherBlocksRepositioning,
  weatherRepositionCost,
  weatherAttackPenalty,
  weatherStatModifiers,
  describeWeatherStatModifiers,
  tickWeather,
} from '../app/engine/weatherEffects';
import type { WeatherEntry, PlayerCharacter } from '../app/engine/types';

function w(id: string, name = id): WeatherEntry {
  return {
    id,
    name,
    description: '',
    visibility: 0,
    travelPenalty: 0,
    corruptionChance: 0,
    tags: [],
  } as WeatherEntry;
}

// Iron Fog used to hard-block combat repositioning; the playtest report
// "it stops me completely, if there is no counter it just stops the
// game" forced a redesign — slow movement and stat nerfs instead of a
// flat lockout.

describe('weatherBlocksRepositioning — no weather hard-blocks anymore', () => {
  it('returns false for everything (legacy hook)', () => {
    expect(weatherBlocksRepositioning(w('iron_fog'))).toBe(false);
    expect(weatherBlocksRepositioning(w('silent_blizzard'))).toBe(false);
    expect(weatherBlocksRepositioning(null)).toBe(false);
  });
});

describe('weatherRepositionCost — Iron Fog slows but does not block', () => {
  it('costs 2 turns under Iron Fog / Silent Blizzard', () => {
    expect(weatherRepositionCost(w('iron_fog'))).toBe(2);
    expect(weatherRepositionCost(w('silent_blizzard'))).toBe(2);
  });
  it('costs 1 turn for calm or unknown weather', () => {
    expect(weatherRepositionCost(w('calm'))).toBe(1);
    expect(weatherRepositionCost(null)).toBe(1);
    expect(weatherRepositionCost(w('etheric_storm'))).toBe(1);
  });
});

describe('weatherAttackPenalty — visibility on the swing', () => {
  it('penalizes attacks under fog / blizzard', () => {
    expect(weatherAttackPenalty(w('iron_fog'))).toBe(2);
    expect(weatherAttackPenalty(w('silent_blizzard'))).toBe(2);
    expect(weatherAttackPenalty(w('whisper_fog'))).toBe(1);
  });
  it('returns 0 for calm or no weather', () => {
    expect(weatherAttackPenalty(w('calm'))).toBe(0);
    expect(weatherAttackPenalty(null)).toBe(0);
  });
});

describe('weatherStatModifiers — buffs and nerfs on the core stats', () => {
  it('Iron Fog nerfs DEX', () => {
    expect(weatherStatModifiers(w('iron_fog'))).toEqual({ dexterity: -1 });
  });
  it('Etheric Storm buffs INT but costs WIS', () => {
    expect(weatherStatModifiers(w('etheric_storm'))).toEqual({ intelligence: 1, wisdom: -1 });
  });
  it('Calm grants a small WIS bonus', () => {
    expect(weatherStatModifiers(w('calm'))).toEqual({ wisdom: 1 });
  });
  it('returns empty for null or unknown weather', () => {
    expect(weatherStatModifiers(null)).toEqual({});
    expect(weatherStatModifiers(w('unknown_storm'))).toEqual({});
  });
});

describe('describeWeatherStatModifiers — readable summary', () => {
  it('formats positive and negative modifiers with stat abbreviations', () => {
    expect(describeWeatherStatModifiers(w('iron_fog'))).toBe('-1 DEX');
    expect(describeWeatherStatModifiers(w('etheric_storm'))).toBe('+1 INT · -1 WIS');
  });
  it('returns empty string when no modifiers apply', () => {
    expect(describeWeatherStatModifiers(null)).toBe('');
    expect(describeWeatherStatModifiers(w('unknown_storm'))).toBe('');
  });
});

// engine_Dev — AUTHOR (custom-id) weather is driven from its own data fields, so a
// custom-setting game's weather is mechanically real without reusing the built-in ids.
describe('data-driven weather for custom (non-built-in) ids', () => {
  const cw = (over: Partial<WeatherEntry>): WeatherEntry => ({
    id: 'green_fog_bank', name: 'Green Fog Bank', description: '',
    visibility: 0, travelPenalty: 0, corruptionChance: 0, tags: [], ...over,
  });

  it('derives attack penalty from visibility (capped at 3)', () => {
    expect(weatherAttackPenalty(cw({ visibility: 0 }))).toBe(0);
    expect(weatherAttackPenalty(cw({ visibility: -2 }))).toBe(1);
    expect(weatherAttackPenalty(cw({ visibility: -10 }))).toBe(3); // capped
  });

  it('derives reposition cost from travelPenalty', () => {
    expect(weatherRepositionCost(cw({ travelPenalty: 2 }))).toBe(1);
    expect(weatherRepositionCost(cw({ travelPenalty: 3 }))).toBe(2);
  });

  it('derives a stat nerf from hostile tags (cold → DEX, fog → WIS)', () => {
    expect(weatherStatModifiers(cw({ tags: ['cold', 'storm'] }))).toEqual({ dexterity: -1 });
    expect(weatherStatModifiers(cw({ tags: ['fog', 'mundane'] }))).toEqual({ wisdom: -1 });
    expect(weatherStatModifiers(cw({ tags: ['clear'] }))).toEqual({});
  });

  it('a high-corruptionChance custom weather can tick corruption', () => {
    const player = { hp: 30, hpMax: 30 } as PlayerCharacter;
    let sawCorruption = false;
    for (let i = 0; i < 200; i++) {
      const t = tickWeather(cw({ corruptionChance: 5, tags: ['hazardous'] }), player);
      if (t.corruptionDelta > 0) { sawCorruption = true; break; }
    }
    expect(sawCorruption).toBe(true);
  });

  it('a benign custom weather (no data) never ticks', () => {
    const player = { hp: 30, hpMax: 30 } as PlayerCharacter;
    for (let i = 0; i < 100; i++) {
      expect(tickWeather(cw({}), player)).toEqual({ hpDelta: 0, staminaDelta: 0, corruptionDelta: 0, line: null });
    }
  });
});

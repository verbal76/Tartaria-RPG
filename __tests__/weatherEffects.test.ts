import {
  weatherBlocksRepositioning,
  weatherRepositionCost,
  weatherAttackPenalty,
  weatherStatModifiers,
  describeWeatherStatModifiers,
} from '../app/engine/weatherEffects';
import type { WeatherEntry } from '../app/engine/types';

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

// OTA-934 — a frost/cold coating on armour (or any cold resistance) cancels COLD-tagged
// weather effects. Non-cold weather is unaffected.
import { weatherStatModifiers, weatherAttackPenalty, weatherRepositionCost } from '../app/engine/weatherEffects';
import type { WeatherEntry } from '../app/engine/types';

const blizzard = { id: 'silent_blizzard', name: 'Silent Blizzard', description: '', visibility: -4, travelPenalty: 4, corruptionChance: 2, tags: ['cold', 'silence', 'psychic'] } as unknown as WeatherEntry;
const fog = { id: 'iron_fog', name: 'Iron Fog', description: '', visibility: -2, travelPenalty: 2, corruptionChance: 1, tags: ['fog', 'magnetic'] } as unknown as WeatherEntry;

describe('OTA-934 — cold resistance cancels COLD weather', () => {
  it('cancels the stat penalty', () => {
    expect(weatherStatModifiers(blizzard)).toEqual({ dexterity: -1, strength: -1 });
    expect(weatherStatModifiers(blizzard, true)).toEqual({});
  });
  it('cancels the attack penalty', () => {
    expect(weatherAttackPenalty(blizzard)).toBe(2);
    expect(weatherAttackPenalty(blizzard, true)).toBe(0);
  });
  it('cancels the movement slow', () => {
    expect(weatherRepositionCost(blizzard)).toBe(2);
    expect(weatherRepositionCost(blizzard, true)).toBe(1);
  });
  it('does NOT affect non-cold weather (Iron Fog)', () => {
    expect(weatherStatModifiers(fog, true)).toEqual({ dexterity: -1 });
    expect(weatherAttackPenalty(fog, true)).toBe(2);
  });
});

// Weather effects engine — turns the WeatherEntry data file's atmospheric
// descriptions into real mechanical pressure. Every time the player takes
// a meaningful action (travel, attack, skill check), the active weather
// gets a chance to inflict its signature effect.
//
// Lore-canonical effects per weather id:
//  - etheric_storm / aether_lightning   electrical sting (1d4 dmg)
//  - ash_storm / black_rain             stamina drain
//  - iron_fog                           movement banned (no advance/retreat)
//  - glass_hail                         physical chip damage (1 dmg)
//  - whisper_fog                        corruption tick (1)
//  - silent_blizzard                    stamina drain + small dmg
//  - calm                               no effect

import type { WeatherEntry, PlayerCharacter } from './types';

export type WeatherTick = {
  /** HP delta to apply (negative for damage). */
  hpDelta: number;
  /** Stamina delta to apply. */
  staminaDelta: number;
  /** Corruption delta (positive = more corruption). */
  corruptionDelta: number;
  /** Narration line if any effect fired this tick. */
  line: string | null;
};

const ZERO_TICK: WeatherTick = { hpDelta: 0, staminaDelta: 0, corruptionDelta: 0, line: null };

// Effects per weather id. Probability is the chance the effect fires on a
// given action — keep it conservative so weather is felt, not punishing.
const WEATHER_EFFECTS: Record<
  string,
  { prob: number; build: (player: PlayerCharacter) => WeatherTick }
> = {
  etheric_storm: {
    prob: 0.35,
    build: () => ({
      hpDelta: -(1 + Math.floor(Math.random() * 4)),
      staminaDelta: 0,
      corruptionDelta: 0,
      line: 'An Aetheric arc finds you — copper taste, blue afterimage, and a bite of damage.',
    }),
  },
  aether_lightning: {
    prob: 0.22,
    build: () => ({
      hpDelta: -(1 + Math.floor(Math.random() * 3)),
      staminaDelta: 0,
      corruptionDelta: 0,
      line: 'A silent bolt strikes near enough to singe your sleeve.',
    }),
  },
  ash_storm: {
    prob: 0.4,
    build: () => ({
      hpDelta: 0,
      staminaDelta: -1,
      corruptionDelta: 0,
      line: 'The ash burns your throat. The breath you spend on this action costs more than usual.',
    }),
  },
  black_rain: {
    prob: 0.25,
    build: () => ({
      hpDelta: 0,
      staminaDelta: 0,
      corruptionDelta: 1,
      line: 'Black rain runs down your collar. Something in you tightens that should not have.',
    }),
  },
  iron_fog: {
    prob: 0.18,
    build: () => ({
      hpDelta: 0,
      staminaDelta: -1,
      corruptionDelta: 0,
      line: 'Iron fog disorients you. Compasses spin; intent costs more.',
    }),
  },
  glass_hail: {
    prob: 0.5,
    build: () => ({
      hpDelta: -1,
      staminaDelta: 0,
      corruptionDelta: 0,
      line: 'A shard of mud-glass nicks you. Small wound, steady reminder.',
    }),
  },
  whisper_fog: {
    prob: 0.3,
    build: () => ({
      hpDelta: 0,
      staminaDelta: 0,
      corruptionDelta: 1,
      line: 'The fog whispers your name in old Tartarian. You forget, for a moment, why you came.',
    }),
  },
  silent_blizzard: {
    prob: 0.35,
    build: () => ({
      hpDelta: -1,
      staminaDelta: -1,
      corruptionDelta: 0,
      line: 'Silent snow pulls heat out of you. Cold sinks past the coat.',
    }),
  },
  calm: { prob: 0, build: () => ZERO_TICK },
};

// Roll the weather's effect on this action. Returns a zero tick if nothing
// triggered.
export function tickWeather(weather: WeatherEntry | null, player: PlayerCharacter): WeatherTick {
  if (!weather) return ZERO_TICK;
  const cfg = WEATHER_EFFECTS[weather.id];
  if (!cfg) return ZERO_TICK;
  if (Math.random() > cfg.prob) return ZERO_TICK;
  return cfg.build(player);
}

// Iron fog blocks the player's compass / sense of direction — combat
// repositioning (advance/retreat) becomes impossible until weather changes.
export function weatherBlocksRepositioning(weather: WeatherEntry | null): boolean {
  if (!weather) return false;
  return weather.id === 'iron_fog' || weather.id === 'silent_blizzard';
}

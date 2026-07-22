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

// OTA-946 — a weather's ELEMENT (read off its tags) maps to the armour-coating resist
// kind that counters it. Generalises the OTA-934 cold rule to every element: an
// electrical coating shrugs off an Aether-lightning storm exactly as a cold coating
// shrugs off a blizzard. Weather with no elemental counterpart (physical hail, ash,
// psychic fog) is unaffected — you can't coat armour against those.
const WEATHER_RESIST_ELEMENT: Record<string, string> = {
  cold: 'cold',
  lightning: 'electrical',
  flame: 'burn',
  burn: 'burn',
};

// Roll the weather's effect on this action. Returns a zero tick if nothing
// triggered. `resistKinds` is the player's armour resist list (lowercased); a match
// against this weather's element cancels its bite.
export function tickWeather(weather: WeatherEntry | null, player: PlayerCharacter, resistKinds: string[] = []): WeatherTick {
  if (!weather) return ZERO_TICK;
  // OTA-934/946 — a matching armour resist (coating) shrugs off this weather's element.
  if (resistKinds.length) {
    const resisted = new Set(resistKinds.map((k) => k.toLowerCase()));
    for (const tag of weather.tags ?? []) {
      const el = WEATHER_RESIST_ELEMENT[tag];
      if (el && resisted.has(el)) return ZERO_TICK;
    }
  }
  const cfg = WEATHER_EFFECTS[weather.id];
  if (!cfg) return ZERO_TICK;
  if (Math.random() > cfg.prob) return ZERO_TICK;
  return cfg.build(player);
}

// Iron fog used to block repositioning entirely — playtest showed this
// could hard-lock combat. The new model slows movement (2 turns to move
// one band) and adds a visibility penalty to attacks instead. Silent
// blizzard follows the same pattern.
export function weatherBlocksRepositioning(weather: WeatherEntry | null): boolean {
  // Kept for backwards-compatibility — nothing currently blocks fully.
  return false;
}

/**
 * Number of "advance" / "retreat" actions the player must spend to move
 * one combat band under the given weather. 1 = normal. 2 = slow (Iron Fog,
 * Silent Blizzard). The scene tracks partial progress so the player can
 * see they're making headway across multiple turns.
 */
export function weatherRepositionCost(weather: WeatherEntry | null, coldResist = false): number {
  if (!weather) return 1;
  if (coldResist && (weather.tags ?? []).includes('cold')) return 1;
  if (weather.id === 'iron_fog' || weather.id === 'silent_blizzard') return 2;
  return 1;
}

/**
 * Penalty subtracted from the player's attack roll under the given
 * weather. Iron fog blinds, ash storm chokes, etc. Stacks with the
 * existing blindSwing penalty when both apply.
 */
export function weatherAttackPenalty(weather: WeatherEntry | null, coldResist = false): number {
  if (!weather) return 0;
  if (coldResist && (weather.tags ?? []).includes('cold')) return 0;
  switch (weather.id) {
    case 'iron_fog': return 2;       // can barely see the target
    case 'whisper_fog': return 1;    // mild visibility loss
    case 'silent_blizzard': return 2;// snow blindness
    case 'ash_storm': return 1;      // burning eyes
    case 'glass_hail': return 1;     // ducking shards
    default: return 0;
  }
}

export interface StatModifier {
  strength?: number;
  dexterity?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
}

/**
 * Per-weather modifiers applied on top of the player's base stats while
 * the weather is active. Negative numbers nerf, positive numbers buff.
 * Calm and clear conditions give small positives; hostile weather nerfs
 * the stat the lore says it punishes (Iron Fog → DEX because compasses
 * spin and footing drags; Whisper Fog → WIS because the fog speaks your
 * name in old Tartarian; Etheric Storm → INT bump from Aether
 * resonance, but at the cost of WIS).
 *
 * Stacks with race / faction / equipment bonuses in effectiveStats().
 */
export function weatherStatModifiers(weather: WeatherEntry | null, coldResist = false): StatModifier {
  if (!weather) return {};
  if (coldResist && (weather.tags ?? []).includes('cold')) return {};
  switch (weather.id) {
    case 'iron_fog':         return { dexterity: -1 };
    case 'silent_blizzard':  return { dexterity: -1, strength: -1 };
    case 'ash_storm':        return { strength: -1 };
    case 'whisper_fog':      return { wisdom: -1 };
    case 'etheric_storm':    return { intelligence: 1, wisdom: -1 };
    case 'aether_lightning': return { intelligence: 1 };
    case 'glass_hail':       return { dexterity: -1 };
    case 'black_rain':       return { charisma: -1 };
    case 'calm':             return { wisdom: 1 };
    default: return {};
  }
}

/** Human-readable summary of the active weather modifiers for the UI. */
export function describeWeatherStatModifiers(weather: WeatherEntry | null): string {
  const mods = weatherStatModifiers(weather);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(mods) as [keyof StatModifier, number][]) {
    if (!v) continue;
    const label = k.slice(0, 3).toUpperCase();
    parts.push(`${v > 0 ? '+' : ''}${v} ${label}`);
  }
  return parts.join(' · ');
}

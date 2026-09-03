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

// OTA-923 — a weather's ELEMENT (read off its tags) maps to the armour-coating resist
// kind that counters it. Generalises the OTA-934 cold rule to every element: an
// electrical coating shrugs off an Aether-lightning storm exactly as a cold coating
// shrugs off a blizzard. Weather with no elemental counterpart (physical hail, ash,
// psychic fog) is unaffected — you can't coat armour against those.
const WEATHER_RESIST_ELEMENT: Record<string, string> = {
  cold: 'cold',
  lightning: 'electrical',
  flame: 'burn',
  burn: 'burn',
  // OTA-934 — black rain's bite is a corruption notch, and corruption has been a first-class
  // armour resist since OTA-874; its 'tainted' tag was simply never mapped, so a
  // corruption-coated piece silently did nothing against it. Plain 'rain' stays unmapped
  // (wetness is not an element), and psychic fog stays uncounterable BY DESIGN — some
  // weather you can only endure.
  tainted: 'corruption',
  // ⚠⚠⚠ OTA-1652 — THE BIGGEST GAP THE RESIST AUDIT FOUND. `aetheric` is the
  // most-resisted type in the game — EIGHTY-FIVE pieces of gear name it — and
  // TWO storms are tagged `aetheric` (Aetheric Storm, Aether Lightning), and the
  // tag was never mapped here. So a player in full aether-warded plate stood in
  // an Aetheric Storm and ate the whole thing: the tick, the reposition cost,
  // the attack penalty and the stat drain. The 'lightning' tag on those two
  // storms let an ELECTRICAL resist cancel them while an AETHERIC one could not,
  // which is precisely backwards for a storm named after the aether.
  aetheric: 'aetheric',
  // ⚠⚠ OTA-1652 — and `ash` answers to `radiation`, which gives that type its
  // only reason to exist on a defensive piece. Measured: three accessories
  // resist radiation and NOTHING dealt it — no enemy, no weather. Five weapons
  // deal it, so the type was live on offence and dead on defence. Ash Storm is
  // the fallout of a burned aetheric world; lead-lined kit is exactly what you
  // wear in it. One mapping, and three dead cards become the reason you survive
  // a storm — rather than retyping three items players may already own.
  ash: 'radiation',
};

/** OTA-934 — does the player's armour resist list counter this weather's element? ANY mapped
 *  tag covered cancels — the same rule tickWeather has applied since OTA-946, now shared
 *  by the penalty/stat helpers too, so preparation defeats the WHOLE weather, not just
 *  its damage tick ("I coated for the storm — why am I still slowed?"). */
export function weatherCounteredByResists(weather: WeatherEntry | null, resistKinds: string[]): boolean {
  if (!weather || resistKinds.length === 0) return false;
  const resisted = new Set(resistKinds.map((k) => k.toLowerCase()));
  for (const tag of weather.tags ?? []) {
    const el = WEATHER_RESIST_ELEMENT[tag];
    if (el && resisted.has(el)) return true;
  }
  return false;
}

// Roll the weather's effect on this action. Returns a zero tick if nothing
// triggered. `resistKinds` is the player's armour resist list (lowercased); a match
// against this weather's element cancels its bite.
export function tickWeather(weather: WeatherEntry | null, player: PlayerCharacter, resistKinds: string[] = []): WeatherTick {
  if (!weather) return ZERO_TICK;
  // OTA-934/946 — a matching armour resist (coating) shrugs off this weather's element.
  if (weatherCounteredByResists(weather, resistKinds)) return ZERO_TICK;
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
export function weatherRepositionCost(weather: WeatherEntry | null, resistKinds: string[] = []): number {
  if (!weather) return 1;
  // OTA-934 — was cold-only; now any matching element resist moves freely in its weather.
  if (weatherCounteredByResists(weather, resistKinds)) return 1;
  if (weather.id === 'iron_fog' || weather.id === 'silent_blizzard') return 2;
  return 1;
}

/**
 * Penalty subtracted from the player's attack roll under the given
 * weather. Iron fog blinds, ash storm chokes, etc. Stacks with the
 * existing blindSwing penalty when both apply.
 */
export function weatherAttackPenalty(weather: WeatherEntry | null, resistKinds: string[] = []): number {
  if (!weather) return 0;
  // OTA-934 — was cold-only; now any matching element resist sees clearly in its weather.
  if (weatherCounteredByResists(weather, resistKinds)) return 0;
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
function baseWeatherStatModifiers(weather: WeatherEntry): StatModifier {
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

export function weatherStatModifiers(weather: WeatherEntry | null, resistKinds: string[] = []): StatModifier {
  if (!weather) return {};
  const base = baseWeatherStatModifiers(weather);
  if (!weatherCounteredByResists(weather, resistKinds)) return base;
  // OTA-934 — a matching resist shrugs off the weather's PENALTIES only. Its buffs (the
  // Aether-resonance +INT under an electrical storm) are not harm to be soaked — an
  // insulated player keeps them. All-negative weathers (a blizzard vs a cold coat)
  // reduce to {} exactly as the old cold-only rule did.
  const kept: StatModifier = {};
  for (const [k, v] of Object.entries(base) as [keyof StatModifier, number][]) {
    if (v > 0) kept[k] = v;
  }
  return kept;
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

// ─────────────────────────────────────────────────────────────────────────────
// OTA-1574 (weapon-effects slice 3) — THE WEAPON'S OWN ANSWER TO THE SKY.
//
// ⚠⚠⚠ EVERYTHING ABOVE THIS LINE ALREADY WORKED. `weatherAttackPenalty` docks
// the roll and the owner's log shows it landing — `attack: visibility penalty −1
// (Ash Storm)`. `weatherRepositionCost` slows movement. Armour resists zero
// both. The ONE thing never wired was the weapon's own clause, so 21 weapons
// discussed the weather and none of them heard it.
//
// ⚠⚠⚠ THE IMMUNITIES WERE THE EXPENSIVE HALF. Five weapons promise to shrug it
// off, including the LEGENDARY Aetheric Sniper Bow ("ignores cover; unaffected
// by weather"), and every one of them ate the full penalty like a rusted
// shortbow. A Legendary's headline clause doing nothing in the exact condition
// it was written for.

import type { WeatherCondition, WeatherNote } from './weaponEffects';

/**
 * ⚠⚠ WHICH REAL WEATHER EACH CATALOG WORD MEANS. The catalog was written before
 * the nine weather states existed, so it talks about "wind" and "extreme cold"
 * while the world has `ash_storm` and `silent_blizzard`. Mapped by what the
 * condition DOES to a projectile rather than by name: an ash storm and glass
 * hail are both wind-driven, both fogs are fog.
 *
 * ⚠⚠ 'heat' MAPS TO NOTHING, AND THAT IS A REAL HOLE, NOT AN OVERSIGHT HERE.
 * There is no hot weather state in weather.json, so Plasma Long Rifle's "+1d6 in
 * extreme heat" cannot fire under any sky the game can generate. Left empty on
 * purpose and surfaced rather than papered over — inventing a mapping would make
 * the clause "work" by quietly redefining what the card says.
 */
export const WEATHER_FOR_CONDITION: Record<WeatherCondition, readonly string[]> = {
  rain: ['black_rain'],
  wind: ['ash_storm', 'glass_hail'],
  fog: ['iron_fog', 'whisper_fog'],
  cold: ['silent_blizzard'],
  heat: [],
  any: ['etheric_storm', 'aether_lightning', 'ash_storm', 'black_rain',
    'iron_fog', 'glass_hail', 'whisper_fog', 'silent_blizzard'],
};

/** Does this condition word cover the weather that is actually blowing? */
export function conditionMatchesWeather(
  cond: WeatherCondition,
  weatherId: string | null | undefined,
): boolean {
  if (!weatherId) return false;
  return WEATHER_FOR_CONDITION[cond]?.includes(weatherId) ?? false;
}

export interface WeaponWeatherAdjust {
  /** Added to the attack roll. Negative is a cost; a cancelled penalty is 0. */
  attackDelta: number;
  /** Extra damage dice the weather earns this weapon ("1d6"), if any. */
  bonusDice: string | null;
  /** Damage dice the weather costs it, if any. */
  penaltyDice: string | null;
  /** True when the weapon's own clause cancelled the ambient penalty. */
  shrugged: boolean;
  /** Short line for the combat log, or null when the sky is irrelevant. */
  note: string | null;
}

const NO_ADJUST: WeaponWeatherAdjust = {
  attackDelta: 0, bonusDice: null, penaltyDice: null, shrugged: false, note: null,
};

/**
 * ⚠⚠⚠ THE ONE RESOLVER. Takes the weapon's parsed clause and the sky, returns
 * what actually changes.
 *
 * ⚠⚠ IMMUNITY CANCELS THE AMBIENT PENALTY, IT DOES NOT INVERT IT. "Unaffected by
 * weather" means you roll as if the sky were clear — not that you roll better
 * than clear. `ambientPenalty` is passed in (already computed by
 * `weatherAttackPenalty`, resists and all) and the immunity refunds exactly that
 * much and no more, so a Legendary in fog equals a Legendary in sunshine.
 *
 * ⚠⚠ AND A WEAPON CANNOT BE BOTH. A clause that claims immunity to a condition
 * wins over a penalty in the same condition, because that is the reading a
 * player takes off the card — nothing in the catalog says both, and if something
 * ever does, the promise beats the fine print.
 */
export function weaponWeatherAdjust(
  note: WeatherNote | null | undefined,
  weatherId: string | null | undefined,
  ambientPenalty: number,
): WeaponWeatherAdjust {
  if (!note || !weatherId) return NO_ADJUST;

  const immune = (note.immuneTo ?? []).some((c) => conditionMatchesWeather(c, weatherId));
  if (immune) {
    return ambientPenalty > 0
      ? { ...NO_ADJUST, attackDelta: ambientPenalty, shrugged: true, note: 'shrugs off the weather' }
      : NO_ADJUST;
  }

  if (note.bonus && note.bonus.conditions.some((c) => conditionMatchesWeather(c, weatherId))) {
    return { ...NO_ADJUST, bonusDice: note.bonus.dice ?? null, note: 'the conditions suit it' };
  }

  if (note.penalty && note.penalty.conditions.some((c) => conditionMatchesWeather(c, weatherId))) {
    switch (note.penalty.kind) {
      // ⚠ A RANGE clause is not modelled as a band change on purpose. Bands are
      // resolved before the swing (reachBandsFor), and quietly shortening a
      // weapon's reach mid-fight would make a weapon the player aimed with
      // simply refuse — the OTA-1563 lesson, where removing a band read to the
      // player as the weapon breaking. It costs accuracy instead, which is the
      // same "harder to land at distance" in a form the player can see.
      case 'damage':
        return { ...NO_ADJUST, penaltyDice: '1d6', note: 'the weather blunts it' };
      case 'reload':
      case 'range':
      case 'accuracy':
      default:
        return { ...NO_ADJUST, attackDelta: -2, note: 'the weather fights it' };
    }
  }
  return NO_ADJUST;
}

/**
 * OTA-1574 — THE WEAPON ANSWERS THE SKY. Slice 3 of the weapon-effects program:
 * weather interactions.
 *
 * ⚠⚠⚠ TWENTY-ONE WEAPONS TALK ABOUT THE WEATHER AND NOT ONE OF THEM LISTENED TO
 * IT. This slice is different from the three before it, and the difference is
 * the whole finding: the ENGINE SIDE ALREADY WORKED. `weatherAttackPenalty`
 * docks the roll and the owner's own log shows it landing — `attack: visibility
 * penalty −1 (Ash Storm)`. `weatherRepositionCost` slows movement in fog.
 * Armour resists zero both. Nine weather states exist and tick. The single thing
 * never wired was the WEAPON's own clause, so all that machinery ran past every
 * card that had an opinion about it.
 *
 * ⚠⚠⚠ AND THE IMMUNITIES WERE THE EXPENSIVE HALF. Five weapons promise to shrug
 * the weather off — Laser Crossbow *"Accuracy unaffected by weather"*, Aetheric
 * Longbow *"Ignores wind conditions"*, Aetheric Throwing Disk *"unaffected by
 * wind"*, Mud Darts *"weather does not affect effectiveness"*, and the LEGENDARY
 * Aetheric Sniper Bow *"ignores cover; unaffected by weather"* — and every one of
 * them ate the full visibility penalty exactly like a rusted shortbow. A
 * Legendary's headline clause, doing nothing, in the one condition it names.
 *
 * ⚠⚠ SO BOTH HALVES SHIP TOGETHER. Twelve weapons say they get WORSE in rain,
 * wind, fog or cold. Wiring only the immunities would make five weapons strictly
 * better with nothing given up anywhere; the penalty is the price that makes the
 * immunity worth carrying.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseWeaponEffect } from '../app/engine/weaponEffects';
import {
  weaponWeatherAdjust, conditionMatchesWeather, WEATHER_FOR_CONDITION,
} from '../app/engine/weatherEffects';
import type { WeatherNote } from '../app/engine/weaponEffects';
import WEAPONS from '../app/data/items/weapons.json';
import WEATHER from '../app/data/weather/weather.json';

// ⚠ weather.json is a BARE ARRAY, not a { weather: [...] } wrapper like
// weapons.json and gear.json. Normalised once here so the shape difference
// cannot quietly turn an iteration into a no-op that passes.
const WEATHER_ROWS: Array<{ id: string }> = Array.isArray(WEATHER)
  ? (WEATHER as Array<{ id: string }>)
  : ((WEATHER as { weather: Array<{ id: string }> }).weather ?? []);

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const catalog = (WEAPONS as unknown as { weapons: Array<Record<string, string>> }).weapons;
const wxOf = (n: string): WeatherNote | null =>
  parseWeaponEffect(catalog.find((w) => w.name === n)?.effect)?.weather ?? null;

describe('OTA-1574 — the parser reads what the cards say about the sky', () => {
  it('⚠⚠⚠ THE FIVE IMMUNITIES, INCLUDING THE LEGENDARY WHOSE CLAUSE DID NOTHING', () => {
    expect(wxOf('Aetheric Sniper Bow')?.immuneTo).toContain('any');   // Legendary
    expect(wxOf('Laser Crossbow')?.immuneTo).toContain('any');
    expect(wxOf('Mud Darts')?.immuneTo).toContain('any');
    expect(wxOf('Aetheric Longbow')?.immuneTo).toContain('wind');
    expect(wxOf('Aetheric Throwing Disk')?.immuneTo).toContain('wind');
  });

  it('⚠⚠⚠ AN IMMUNITY IS NEVER READ AS A PENALTY — they are one word apart', () => {
    // "Ignores wind conditions" and "reduced range in wind" both name wind.
    // Reading the first as the second would inflict on five weapons the exact
    // opposite of their headline clause, and on a Legendary most of all.
    for (const n of ['Aetheric Longbow', 'Aetheric Throwing Disk', 'Laser Crossbow',
      'Mud Darts', 'Aetheric Sniper Bow']) {
      expect(wxOf(n)?.penalty).toBeUndefined();
    }
  });

  it('⚠⚠⚠ THE TWELVE THAT PAY, and what each one pays', () => {
    expect(wxOf('Bone Sling')?.penalty).toEqual({ conditions: ['wind'], kind: 'range' });
    expect(wxOf('Rusty Shortbow')?.penalty).toEqual({ conditions: ['any'], kind: 'range' });
    expect(wxOf('Plasma Thrower')?.penalty).toEqual({ conditions: ['rain'], kind: 'damage' });
    expect(wxOf('Mud Repeater Crossbow')?.penalty).toEqual({ conditions: ['rain'], kind: 'reload' });
    expect(wxOf('Aetheric Bolt Gun')?.penalty).toEqual({ conditions: ['fog'], kind: 'accuracy' });
    expect(wxOf('Compact Laser Pistol (Ranged)')?.penalty).toEqual({ conditions: ['cold'], kind: 'accuracy' });
  });

  it('⚠⚠ the catalog’s own condition words, not a weather system’s', () => {
    // "bad weather", "high wind", "dense fog", "extreme cold" — the same lesson
    // as every slice before this one: the verb list was always the ceiling.
    expect(wxOf('Rusty Shortbow')?.penalty?.conditions).toEqual(['any']);   // "bad weather"
    expect(wxOf('Bone Javelin')?.penalty?.conditions).toEqual(['wind']);    // "high wind"
    expect(wxOf('Aetheric Bolt Gun')?.penalty?.conditions).toEqual(['fog']); // "dense fog"
    expect(wxOf('Energy Thrower')?.penalty?.conditions).toEqual(['cold']);  // "extreme cold"
  });

  it('⚠⚠ a BONUS clause survives, and is not mistaken for a penalty', () => {
    // "+1d6 in extreme heat" carries no penalty verb at all and would otherwise
    // fall through to nothing.
    expect(wxOf('Plasma Long Rifle')?.bonus).toEqual({ conditions: ['heat'], dice: '1d6' });
  });

  it('⚠ a weapon with nothing to say about the sky parses to no note', () => {
    expect(wxOf('Rusted Blade')).toBeNull();
    // …and a bonus against a CREATURE type is not a weather clause.
    expect(wxOf('Aetheric Blade of Light')).toBeNull();
  });

  it('⚠ the sweep is real — the whole family is covered', () => {
    let n = 0;
    for (const w of catalog) if (parseWeaponEffect(w.effect)?.weather) n++;
    expect(n).toBeGreaterThanOrEqual(18);
  });
});

describe('OTA-1574 — what the sky actually costs, and what shrugging is worth', () => {
  const IMMUNE_ANY: WeatherNote = { immuneTo: ['any'] };
  const PEN_WIND: WeatherNote = { penalty: { conditions: ['wind'], kind: 'accuracy' } };

  it('⚠⚠⚠ THE LEGENDARY FINALLY SHRUGS — and by exactly the ambient penalty', () => {
    // Iron Fog docks 2. The Sniper Bow's clause refunds 2 and stops there.
    const r = weaponWeatherAdjust(IMMUNE_ANY, 'iron_fog', 2);
    expect(r.attackDelta).toBe(2);
    expect(r.shrugged).toBe(true);
  });

  it('⚠⚠⚠ IMMUNITY CANCELS THE PENALTY, IT DOES NOT INVERT IT', () => {
    // "Unaffected by weather" means you roll as if the sky were clear — never
    // BETTER than clear. A weapon that shrugs a −1 gets +1, not +2, and a
    // weapon that shrugs nothing gets nothing.
    expect(weaponWeatherAdjust(IMMUNE_ANY, 'ash_storm', 1).attackDelta).toBe(1);
    expect(weaponWeatherAdjust(IMMUNE_ANY, 'black_rain', 0).attackDelta).toBe(0);
    expect(weaponWeatherAdjust(IMMUNE_ANY, 'black_rain', 0).shrugged).toBe(false);
  });

  it('⚠⚠⚠ A NARROW IMMUNITY ONLY COVERS ITS OWN WEATHER', () => {
    // The Aetheric Longbow ignores WIND. It does not ignore fog, and claiming
    // otherwise would quietly hand it the Sniper Bow's Legendary clause.
    const wind: WeatherNote = { immuneTo: ['wind'] };
    expect(weaponWeatherAdjust(wind, 'ash_storm', 1).shrugged).toBe(true);
    expect(weaponWeatherAdjust(wind, 'iron_fog', 2).shrugged).toBe(false);
    expect(weaponWeatherAdjust(wind, 'iron_fog', 2).attackDelta).toBe(0);
  });

  it('⚠⚠ the penalty only bites in its own condition', () => {
    expect(weaponWeatherAdjust(PEN_WIND, 'ash_storm', 1).attackDelta).toBeLessThan(0);
    expect(weaponWeatherAdjust(PEN_WIND, 'black_rain', 0).attackDelta).toBe(0);
    expect(weaponWeatherAdjust(PEN_WIND, null, 0).attackDelta).toBe(0);
    expect(weaponWeatherAdjust(null, 'ash_storm', 1).attackDelta).toBe(0);
  });

  it('⚠⚠ a damage penalty costs damage, not accuracy — the card says which', () => {
    const dmg: WeatherNote = { penalty: { conditions: ['rain'], kind: 'damage' } };
    const r = weaponWeatherAdjust(dmg, 'black_rain', 0);
    expect(r.penaltyDice).toBe('1d6');
    expect(r.attackDelta).toBe(0);
  });

  it('⚠⚠ A RANGE CLAUSE COSTS ACCURACY, NOT A BAND — the OTA-1563 lesson', () => {
    // Quietly shortening a weapon's reach mid-fight makes a weapon the player
    // aimed with simply refuse, which reads as the weapon breaking. OTA-1563
    // settled this: never remove a band. It costs accuracy instead — the same
    // "harder to land at distance" in a form the player can see.
    const rng: WeatherNote = { penalty: { conditions: ['wind'], kind: 'range' } };
    const r = weaponWeatherAdjust(rng, 'ash_storm', 1);
    expect(r.attackDelta).toBeLessThan(0);
    expect(r.penaltyDice).toBeNull();
    expect(src('app/engine/weatherEffects.ts')).toContain('Bands are\n      // resolved before the swing');
  });

  it('⚠⚠ every condition maps to weather the world can actually generate', () => {
    const ids = new Set(WEATHER_ROWS.map((w) => w.id));
    for (const [cond, mapped] of Object.entries(WEATHER_FOR_CONDITION)) {
      for (const id of mapped) {
        expect(ids.has(id)).toBe(true);
      }
      // 'heat' is deliberately empty — see below.
      if (cond !== 'heat') expect(mapped.length).toBeGreaterThan(0);
    }
  });

  it('⚠⚠⚠ THERE IS NO HOT WEATHER IN THE GAME, and that is left visible', () => {
    // Plasma Long Rifle promises "+1d6 in extreme heat" and weather.json has no
    // hot state, so the clause cannot fire under any sky the world can roll.
    // Mapping it to something warm-ish would make it "work" by quietly
    // redefining what the card says — the exact move this program exists to
    // stop. Reported instead: it needs a weather state, or a rewritten card.
    expect(WEATHER_FOR_CONDITION.heat).toEqual([]);
    expect(conditionMatchesWeather('heat', 'ash_storm')).toBe(false);
    const rifle = wxOf('Plasma Long Rifle')!;
    for (const w of WEATHER_ROWS) {
      expect(weaponWeatherAdjust(rifle, w.id, 0).bonusDice).toBeNull();
    }
  });

  it('⚠ "any" covers every real system but not the calm', () => {
    expect(conditionMatchesWeather('any', 'calm')).toBe(false);
    expect(conditionMatchesWeather('any', 'iron_fog')).toBe(true);
    expect(weaponWeatherAdjust(IMMUNE_ANY, 'calm', 0).shrugged).toBe(false);
  });
});

describe('OTA-1574 — it is wired, not merely built', () => {
  const GS = src('app/state/gameStore.ts');

  it('⚠⚠⚠ THE ATTACK PATH SUBTRACTS THE WEAPON’S ANSWER FROM THE AMBIENT PENALTY', () => {
    expect(GS).toContain('const wxAdj = weaponWeatherAdjust(');
    expect(GS).toContain('const visPenalty = Math.max(0, ambientVis - wxAdj.attackDelta);');
    // The ambient value must be computed first and kept — the weapon adjusts it,
    // it does not replace it.
    expect(GS).toContain('const ambientVis = weatherAttackPenalty(');
    expect(GS.indexOf('const ambientVis =')).toBeLessThan(GS.indexOf('const wxAdj ='));
  });

  it('⚠⚠⚠ AND A SHRUG IS SAID OUT LOUD', () => {
    // A cancelled penalty is invisible by construction: the player sees a roll
    // with no minus on it and cannot tell whether the weapon earned that or the
    // weather never applied. An effect nobody can see fire is indistinguishable
    // from one that still does nothing.
    expect(GS).toContain('means nothing to the ${wxWeapon?.name');
    expect(GS).toContain('attack: weather shrugged (+${wxAdj.attackDelta})');
  });

  it('⚠⚠ the penalty can never go negative — a shrug is a floor, not a bonus', () => {
    expect(GS).toContain('Math.max(0, ambientVis - wxAdj.attackDelta)');
  });

  it('⚠ the weapon is resolved off the catalog, like every other reader here', () => {
    expect(GS).toContain('const wxWeapon = player.equipped?.main ? findWeaponByName(player.equipped.main) : null;');
  });
});

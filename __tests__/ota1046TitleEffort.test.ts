/**
 * OTA-1046 — titles were being handed out in the tutorial.
 *
 * Owner: "you shouldn't be able to earn titles in the tutorial. what titles are
 * so easy to get that you earn them in the tutorial? they should take effort."
 *
 * ANSWER TO THE QUESTION, from the award table:
 *
 *   etherbound_survivor   stormsSurvived >= 1
 *   aetheric_attuned      stormsSurvived >= 1 || maxCorruption >= 5
 *   stormcaller           stormsSurvivedWithCompanion >= 1
 *
 * ...and `stormsSurvived` incremented on ANY tick of Etheric weather, including
 * a purely decorative one. So a single line of black rain in the tutorial room
 * — scenery the player neither sought nor answered — satisfied two titles at
 * once, before the scripted climb was even finished. Both fired in the owner's
 * log at 05:17:02, one millisecond apart.
 *
 * Two independent things were wrong and both are fixed:
 *   1. The tutorial is a scripted sandbox and must not feed the legend at all.
 *   2. Threshold 1 on an ambient event is not an achievement.
 */
import {
  WIRED_TITLES,
  STORM_TICKS_FOR_SURVIVOR,
  STORM_TICKS_FOR_ATTUNED,
  STORM_TICKS_FOR_STORMCALLER,
  CORRUPTION_FOR_ATTUNED,
  withTitleProgress,
} from '../app/engine/titles';
import type { PlayerCharacter } from '../app/engine/types';

const rule = (id: string) => WIRED_TITLES.find((t) => t.id === id)!;
const progress = (over: Record<string, number>) =>
  Object.assign(withTitleProgress(undefined), over);
const anyPlayer = {} as PlayerCharacter;

describe('OTA-1046 — one ambient weather tick no longer buys a title', () => {
  it('a single storm tick earns NOTHING', () => {
    const p = progress({ stormsSurvived: 1, stormsSurvivedWithCompanion: 1, maxCorruption: 1 });
    expect(rule('etherbound_survivor').earned(anyPlayer, p)).toBe(false);
    expect(rule('aetheric_attuned').earned(anyPlayer, p)).toBe(false);
    expect(rule('stormcaller').earned(anyPlayer, p)).toBe(false);
  });

  it('the exact reported state — one tick, no companion — earns nothing', () => {
    // The tutorial room: black rain ticks once, player has no dog or golem yet.
    const p = progress({ stormsSurvived: 1 });
    const earnedIds = WIRED_TITLES.filter((t) => t.earned(anyPlayer, p)).map((t) => t.id);
    expect(earnedIds).not.toContain('etherbound_survivor');
    expect(earnedIds).not.toContain('aetheric_attuned');
  });
});

describe('OTA-1046 — the storm titles now take real exposure', () => {
  it('etherbound_survivor needs sustained time in the weather', () => {
    expect(STORM_TICKS_FOR_SURVIVOR).toBeGreaterThanOrEqual(10);
    expect(rule('etherbound_survivor').earned(anyPlayer, progress({ stormsSurvived: STORM_TICKS_FOR_SURVIVOR - 1 }))).toBe(false);
    expect(rule('etherbound_survivor').earned(anyPlayer, progress({ stormsSurvived: STORM_TICKS_FOR_SURVIVOR }))).toBe(true);
  });

  it('aetheric_attuned is the dearest of the three — it halves ALL Aetheric damage', () => {
    expect(STORM_TICKS_FOR_ATTUNED).toBeGreaterThan(STORM_TICKS_FOR_SURVIVOR);
    expect(rule('aetheric_attuned').earned(anyPlayer, progress({ stormsSurvived: STORM_TICKS_FOR_ATTUNED - 1 }))).toBe(false);
    expect(rule('aetheric_attuned').earned(anyPlayer, progress({ stormsSurvived: STORM_TICKS_FOR_ATTUNED }))).toBe(true);
  });

  it('the corruption branch of aetheric_attuned is no longer a back door', () => {
    // Was `maxCorruption >= 5` — a couple of ambient ticks. If the || branch is
    // cheap, raising the count branch achieves nothing.
    expect(CORRUPTION_FOR_ATTUNED).toBeGreaterThanOrEqual(10);
    expect(rule('aetheric_attuned').earned(anyPlayer, progress({ maxCorruption: 5 }))).toBe(false);
    expect(rule('aetheric_attuned').earned(anyPlayer, progress({ maxCorruption: CORRUPTION_FOR_ATTUNED }))).toBe(true);
  });

  it('stormcaller needs a companion beside you through many storms', () => {
    expect(STORM_TICKS_FOR_STORMCALLER).toBeGreaterThanOrEqual(5);
    expect(rule('stormcaller').earned(anyPlayer, progress({ stormsSurvivedWithCompanion: STORM_TICKS_FOR_STORMCALLER - 1 }))).toBe(false);
    expect(rule('stormcaller').earned(anyPlayer, progress({ stormsSurvivedWithCompanion: STORM_TICKS_FOR_STORMCALLER }))).toBe(true);
  });
});

describe('OTA-1046 — no title is earnable from a blank slate', () => {
  it('a fresh character with zero progress has earned nothing', () => {
    // A title that fires on an all-zero progress record is one the player got
    // for existing. Race/faction-gated titles are excluded from this check
    // because they legitimately read the character sheet, not the counters —
    // see the note below.
    const p = withTitleProgress(undefined);
    const sheetGated = new Set(['scion_of_the_giants', 'aetherborn_awakened', 'golem_whisperer']);
    for (const t of WIRED_TITLES) {
      if (sheetGated.has(t.id)) continue;
      expect({ id: t.id, earned: t.earned(anyPlayer, p) }).toEqual({ id: t.id, earned: false });
    }
  });
});

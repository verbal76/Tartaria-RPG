/**
 * OTA-1070 — the last three free titles.
 *
 * OTA-1069 fixed the storm family and flagged three more as still cheap. Owner:
 * "fix the other three."
 *
 * Each was checked against its OWN canon requirement in arbiter-titles.json,
 * and in all three the code was not testing what the canon asks for:
 *
 *   scion_of_the_giants  canon "PROVE direct descent from the Tartarian Giants"
 *     code: raceId === 'tartarian_giant' && a giant-respecting faction — the
 *     descent half only, and BOTH values are chosen at character creation. The
 *     title landed before the player had taken a single action.
 *
 *   golem_whisperer      canon "Successfully CONTROL an Aether Golem"
 *     code: `!!player.golem`. A golem standing next to you is not control.
 *
 *   architects_eye       canon "Repair or restore a piece of ancient Tartarian
 *                        architecture"
 *     code: one repair.
 */
import {
  WIRED_TITLES,
  STANDING_FOR_SCION,
  GOLEM_STRIKES_FOR_WHISPERER,
  REPAIRS_FOR_ARCHITECTS_EYE,
  withTitleProgress,
} from '../app/engine/titles';
import type { PlayerCharacter } from '../app/engine/types';

const rule = (id: string) => WIRED_TITLES.find((t) => t.id === id)!;
const progress = (over: Record<string, number>) =>
  Object.assign(withTitleProgress(undefined), over);
const blank = withTitleProgress(undefined);

/** A Giant sworn to a Giant-respecting faction — the descent half, no deeds. */
const giant = (standing?: number): PlayerCharacter => ({
  raceId: 'tartarian_giant',
  factionId: 'servants_of_giants',
  factionStanding: standing === undefined ? [] : [{ factionId: 'servants_of_giants', standing }],
} as unknown as PlayerCharacter);

describe('OTA-1070 — scion_of_the_giants must be PROVEN, not just born', () => {
  it('descent alone no longer earns it', () => {
    // The exact character-creation state: right race, right faction, nothing done.
    expect(rule('scion_of_the_giants').earned(giant(), blank)).toBe(false);
  });

  it('low standing is not proof', () => {
    expect(rule('scion_of_the_giants').earned(giant(STANDING_FOR_SCION - 1), blank)).toBe(false);
  });

  it('real regard from the Giant-kin earns it', () => {
    expect(rule('scion_of_the_giants').earned(giant(STANDING_FOR_SCION), blank)).toBe(true);
  });

  it('descent is still required — standing alone is not descent', () => {
    const notAGiant = {
      raceId: 'mud_dweller',
      factionId: 'servants_of_giants',
      factionStanding: [{ factionId: 'servants_of_giants', standing: 99 }],
    } as unknown as PlayerCharacter;
    expect(rule('scion_of_the_giants').earned(notAGiant, blank)).toBe(false);
  });

  it('standing with an unrelated faction does not count', () => {
    const elsewhere = {
      raceId: 'tartarian_giant',
      factionId: 'servants_of_giants',
      factionStanding: [{ factionId: 'eternal_dynasty', standing: 99 }],
    } as unknown as PlayerCharacter;
    expect(rule('scion_of_the_giants').earned(elsewhere, blank)).toBe(false);
  });
});

describe('OTA-1070 — golem_whisperer requires the golem to have fought', () => {
  const anyPlayer = { golem: { name: 'Vessel' } } as unknown as PlayerCharacter;

  it('merely having a golem earns nothing', () => {
    expect(rule('golem_whisperer').earned(anyPlayer, blank)).toBe(false);
  });

  it('a handful of strikes is not control', () => {
    expect(rule('golem_whisperer').earned(anyPlayer, progress({ golemStrikesLanded: GOLEM_STRIKES_FOR_WHISPERER - 1 }))).toBe(false);
  });

  it('a golem that has fought for you earns it', () => {
    expect(rule('golem_whisperer').earned(anyPlayer, progress({ golemStrikesLanded: GOLEM_STRIKES_FOR_WHISPERER }))).toBe(true);
  });

  it('the title survives the golem — it records what you did', () => {
    // Deliberately NOT gated on a live golem: a record of past control should
    // not blink out the moment a construct falls.
    const golemless = {} as unknown as PlayerCharacter;
    expect(rule('golem_whisperer').earned(golemless, progress({ golemStrikesLanded: GOLEM_STRIKES_FOR_WHISPERER }))).toBe(true);
  });
});

describe('OTA-1070 — architects_eye takes a body of work', () => {
  const anyPlayer = {} as unknown as PlayerCharacter;

  it('one repair is not an eye for architecture', () => {
    expect(REPAIRS_FOR_ARCHITECTS_EYE).toBeGreaterThan(1);
    expect(rule('architects_eye').earned(anyPlayer, progress({ repairsCompleted: 1 }))).toBe(false);
  });

  it('sustained restoration earns it', () => {
    expect(rule('architects_eye').earned(anyPlayer, progress({ repairsCompleted: REPAIRS_FOR_ARCHITECTS_EYE }))).toBe(true);
  });
});

describe('OTA-1070 — nothing is earnable at character creation any more', () => {
  it('a fresh Giant with zero deeds has earned NOTHING at all', () => {
    // OTA-1069 proved this for the counter-driven titles but had to exclude the
    // three sheet-gated ones. With those fixed the exclusion list is empty, so
    // this now covers the WHOLE table — the strongest form of the owner's rule.
    for (const t of WIRED_TITLES) {
      expect({ id: t.id, earned: t.earned(giant(), blank) }).toEqual({ id: t.id, earned: false });
    }
  });
});

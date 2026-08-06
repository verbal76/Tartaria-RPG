// OTA-1062 — THE LINE THE FILTER WAS EATING. The owner's instrumented device log
// (build 4.28.72) finally named the culprit after four builds of guessing:
//
//   arbiter: ambient ∅ 30603ms
//   arbiter: ambient-empty reason=action-opener
//   raw="You, my companion, have traveled far and wide, but the distance
//        between you and the ancient city you once called home ha…"
//
// The model was producing exactly the reflective companion line the feature
// exists for. OTA-1054's whitelist required `you\s+have` and the appositive put a
// comma there, so it fell through to "must be scene narration" and died.
// The rule now fails OPEN: it names the bad opener instead of guessing every
// good one.
import { isSecondPersonActionOpener } from '../app/engine/foreignText';

/** Verbatim from the owner's log — the exact string that was dropped. */
const THE_LINE =
  'You, my companion, have traveled far and wide, but the distance between you '
  + 'and the ancient city you once called home has never been longer.';

describe('OTA-1062 — the reported line survives', () => {
  it('the exact sentence from the device log is no longer blocked', () => {
    expect(isSecondPersonActionOpener(THE_LINE)).toBe(false);
  });

  it('an appositive between the pronoun and the verb no longer kills a reflection', () => {
    // The whole bug in one shape: a comma where the old regex wanted a space.
    for (const line of [
      'You, my companion, have traveled far and wide.',
      'You, who walked beside me, are steadier now.',
      'You, of all people, know what the mud takes.',
      'You, friend, carry it better than you did.',
    ]) {
      expect({ line, blocked: isSecondPersonActionOpener(line) }).toEqual({ line, blocked: false });
    }
  });

  it('FAILS OPEN — a reflective phrasing nobody listed is allowed through', () => {
    // This is the property that was missing. None of these were in the old
    // whitelist; every one of them would have been silently destroyed.
    for (const line of [
      'You hesitate less than you did, and it reads as confidence now.',
      'You laugh differently since the Cradle.',
      'You keep the dog closer than you admit.',
      'You count your coin like a man paying ransom.',
      'You sleep with the blade where your hand falls.',
    ]) {
      expect({ line, blocked: isSecondPersonActionOpener(line) }).toEqual({ line, blocked: false });
    }
  });
});

describe('OTA-1062 — scene narration still dies, appositive or not', () => {
  it('present-tense physical openers are still blocked', () => {
    for (const line of [
      'You step back, surveying the alleyway and its stone pillars.',
      'You reach for the sarcophagus lid.',
      'You climb the vaulted stair.',
      'You draw your blade and advance.',
    ]) {
      expect({ line, blocked: isSecondPersonActionOpener(line) }).toEqual({ line, blocked: true });
    }
  });

  it('an appositive or adverb cannot smuggle a scene opener past the rule', () => {
    for (const line of [
      'You, my companion, step back into the hall.',
      'You slowly turn toward the vaulted ceiling.',
      'You, friend, reach for the lid.',
    ]) {
      expect({ line, blocked: isSecondPersonActionOpener(line) }).toEqual({ line, blocked: true });
    }
  });

  it('non-"You" openers are still none of this rule\'s business', () => {
    expect(isSecondPersonActionOpener('Your hands are steadier now.')).toBe(false);
    expect(isSecondPersonActionOpener('The Arbiter watches the dust hang.')).toBe(false);
    expect(isSecondPersonActionOpener('')).toBe(false);
  });
});

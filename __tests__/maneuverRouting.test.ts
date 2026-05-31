import { classifyManeuver } from '../app/engine/combatRules';

// Per-maneuver routing per HANDOFF #10. Disarm / Trip / Sweep / Hook
// route to DEX-driven sub-types; Grapple / Shove / Pin route to STR.

describe('classifyManeuver', () => {
  it.each([
    ['disarm the cultist', 'maneuver_disarm'],
    ['knock the weapon out of his hand', 'maneuver_disarm'],
    ['strip his weapon', 'maneuver_disarm'],
    ['trip the wasp', 'maneuver_trip'],
    ['sweep his legs', 'maneuver_trip'],
    ['leg sweep', 'maneuver_trip'],
    ['knock down the figure', 'maneuver_trip'],
    ['grapple the cultist', 'maneuver_grapple'],
    ['wrestle them to the ground', 'maneuver_grapple'],
    ['tackle the wraith', 'maneuver_grapple'],
    ['bear hug the spider', 'maneuver_grapple'],
    ['shove him aside', 'maneuver_shove'],
    ['push him into the wall', 'maneuver_shove'],
    ['knock back the ambusher', 'maneuver_shove'],
    ['ram the door', 'maneuver_shove'],
    ['pin the snake', 'maneuver_pin'],
    ['hold down the spider', 'maneuver_pin'],
    ['restrain the figure', 'maneuver_pin'],
    ['hook his weapon', 'maneuver_hook'],
    ['snag the chain', 'maneuver_hook'],
    ['catch the spear', 'maneuver_hook'],
  ])('classifies "%s" → %s', (text, expected) => {
    expect(classifyManeuver(text)).toBe(expected);
  });

  it('defaults to grapple for unmatched maneuver text', () => {
    expect(classifyManeuver('do a fancy thing')).toBe('maneuver_grapple');
    expect(classifyManeuver('maneuver against him')).toBe('maneuver_grapple');
  });
});

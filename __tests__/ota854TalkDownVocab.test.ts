// OTA-854 [talk a patrol down] — pins the widened persuade/intimidate vocabulary so
// natural phrasings land: "shout at them to go away" reads as intimidate, "reason with
// them" as persuade, and a bare opener still shows the two-button chooser.

import { detectParleyChoice } from '../app/engine/parley';

describe('OTA-854 — intimidation reads (a person)', () => {
  const intimidations = [
    'intimidate them', 'threaten the patrol', 'scare them off', 'shout at them to go away',
    'yell at them to back off', 'tell them to stand down', 'get out of here',
    'clear off', 'buzz off', 'growl at them', 'browbeat them', 'leave or die',
    'drive them off', 'roar at them', 'menace the soldiers',
  ];
  for (const s of intimidations) {
    it(`"${s}" → intimidate`, () => {
      expect(detectParleyChoice(s, 'person')).toBe('intimidate');
    });
  }
});

describe('OTA-854 — persuasion reads (a person)', () => {
  const persuasions = [
    'persuade them', 'reason with them', 'defuse the standoff', 'talk them down',
    'make peace', 'convince them to leave', 'appeal to them', 'placate them',
  ];
  for (const s of persuasions) {
    it(`"${s}" → persuade`, () => {
      expect(detectParleyChoice(s, 'person')).toBe('persuade');
    });
  }
});

describe('OTA-854 — animal kind routes gentle verbs to calm', () => {
  it('"calm it" and "soothe it" → calm', () => {
    expect(detectParleyChoice('calm it', 'animal')).toBe('calm');
    expect(detectParleyChoice('soothe the beast', 'animal')).toBe('calm');
  });
  it('intimidation still reads as intimidate for an animal', () => {
    expect(detectParleyChoice('scare it off', 'animal')).toBe('intimidate');
  });
});

describe('OTA-854 — a bare opener still defers to the two-button chooser', () => {
  it('"talk to them" / "approach" → null', () => {
    expect(detectParleyChoice('talk to them', 'person')).toBeNull();
    expect(detectParleyChoice('greet them', 'person')).toBeNull();
  });
});

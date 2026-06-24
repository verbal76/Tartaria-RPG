// arb43 — locks the Arbiter's structured world-knowledge answers: lists are
// grounded in real data, a wrong count in the question is corrected, current
// course/location resolve, and unrelated questions fall through (null) to the
// lore lookup / Qwen persona.

import { answerWorldKnowledge, _knowledgeCounts } from '../app/engine/arbiterKnowledge';

describe('arbiterKnowledge — Arbiter world-knowledge', () => {
  it('counts match the shipped data (9 factions, 7 races, 9 capitals)', () => {
    expect(_knowledgeCounts.factions).toBe(9);
    expect(_knowledgeCounts.races).toBe(7);
    // 9 capitals = the 9 guardian Lost Capitals (LOST_CAPITAL_LOCATIONS).
    expect(_knowledgeCounts.capitals).toBe(9);
  });

  it('lists every faction', () => {
    const a = answerWorldKnowledge('list the factions', {});
    expect(a).toBeTruthy();
    expect(a).toMatch(/Mud Monarchs/);
    expect(a).toMatch(/Reclaimers Guild/);
    expect(a).toMatch(/Tartarian Revivalists/);
  });

  it('corrects a wrong faction count in the Arbiter voice', () => {
    const a = answerWorldKnowledge('name all eleven factions', {}) ?? '';
    expect(a).toMatch(/There are not eleven/i);
    expect(a).toMatch(/There are nine/i);
  });

  it('lists all nine capitals — including the three questline additions — without correcting "nine"', () => {
    const a = answerWorldKnowledge('name the nine capitals', {}) ?? '';
    expect(a).not.toMatch(/There are not/i);
    expect(a).toMatch(/Asgardar/);
    expect(a).toMatch(/Samarran/);
    expect(a).toMatch(/Nimari/);
    expect(a).toMatch(/Voronov/);
  });

  it('corrects a wrong capital count now that there are nine', () => {
    const a = answerWorldKnowledge('name the five capitals', {}) ?? '';
    expect(a).toMatch(/There are not five/i);
    expect(a).toMatch(/There are nine/i);
  });

  it('answers "list the cities" without the magic word "capital"', () => {
    const a = answerWorldKnowledge('list all the cities', {});
    expect(a).toBeTruthy();
    expect(a).toMatch(/Asgardar/);
  });

  it('lists races / bloodlines', () => {
    const a = answerWorldKnowledge('how many races are there', {});
    expect(a).toBeTruthy();
    expect(a).toMatch(/Aetherborn/);
  });

  it('answers the current destination from travelTarget', () => {
    const a = answerWorldKnowledge('what city am i headed to', {
      travelTarget: { locationId: 'asgardar', distanceRemaining: 3 },
    }) ?? '';
    expect(a).toMatch(/bound for Asgardar/);
  });

  it('says bound nowhere when no course is set', () => {
    const a = answerWorldKnowledge('where am i headed', { travelTarget: null }) ?? '';
    expect(a).toMatch(/bound nowhere/i);
  });

  it('answers "where am I" with the current location', () => {
    const a = answerWorldKnowledge('where am i', { currentLocationId: 'drakova' }) ?? '';
    expect(a).toMatch(/Drakova/);
  });

  it('answers "How many sites can I visit?" with the visitable-site count (was the garbled-echo bug)', () => {
    const a = answerWorldKnowledge('How many sites can I visit?', {}) ?? '';
    expect(a).toMatch(/places worth your boots/i);
    expect(a).toContain(String(_knowledgeCounts.sites));
  });

  it('reports discovery progress when the count is known, and survives the polluted "ask the arbiter about" form', () => {
    const a = answerWorldKnowledge('ask the arbiter about how many sites can i visit', {
      discoveredSiteCount: 3,
    }) ?? '';
    expect(a).toMatch(/set foot in three/i);
  });

  it('corrects a wrong asserted site count', () => {
    const a = answerWorldKnowledge('are there really 50 places to visit', {}) ?? '';
    expect(a).toMatch(/Not 50\./);
    expect(a).toContain(String(_knowledgeCounts.sites));
  });

  it('returns null for non-knowledge questions (defers to lore / persona)', () => {
    expect(answerWorldKnowledge('what is aetherstone', {})).toBeNull();
    expect(answerWorldKnowledge('why are you following me', {})).toBeNull();
    expect(answerWorldKnowledge('what is the forgotten order', {})).toBeNull();
  });
});

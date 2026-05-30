import { findQuestFactionHint } from '../app/engine/factionHint';

// HANDOFF item 1 — accept/turn-in refusal messages should name the
// faction and a sample vendor archetype instead of the generic
// "find a faction agent." This helper resolves the named contract
// across hunts / mysteries / storylines / faction quests and returns
// the faction info the message uses.

describe('findQuestFactionHint — fuzzy contract lookup', () => {
  it('returns null on empty input', () => {
    expect(findQuestFactionHint('')).toBeNull();
    expect(findQuestFactionHint('   ')).toBeNull();
  });

  it('returns null when no catalog entry matches the input', () => {
    expect(findQuestFactionHint('the great cheese caper of asgardar')).toBeNull();
  });

  it('matches a real hunt and surfaces its faction + vendor sample', () => {
    // HUNTS includes "The Mud Titan of the Endless Stair" → True Tartarians.
    const hint = findQuestFactionHint('mud titan');
    expect(hint).not.toBeNull();
    expect(hint?.kind).toBe('hunt');
    expect(hint?.factionId).toBe('true_tartarians');
    expect(hint?.factionLabel.length).toBeGreaterThan(0);
    expect(hint?.contractTitle.toLowerCase()).toContain('mud titan');
  });

  it('returns null for a hunt with no factionId (unaffiliated)', () => {
    // The Bog Dragon hunt is factionId=null; the hint should skip past
    // it rather than returning a misleading "unaffiliated" label.
    const hint = findQuestFactionHint('bog dragon');
    expect(hint).toBeNull();
  });

  it('matches a real storyline by title fragment', () => {
    // STORYLINES include "The Reclaimer Relic Run"
    const hint = findQuestFactionHint('reclaimer relic run');
    expect(hint).not.toBeNull();
    expect(hint?.kind).toBe('storyline');
  });

  it('vendorNames are bounded to 3 max, ordered deterministically', () => {
    const hint = findQuestFactionHint('mud titan');
    if (!hint) return;
    expect(hint.vendorNames.length).toBeLessThanOrEqual(3);
    // calling twice should return the same list (no randomness)
    const hint2 = findQuestFactionHint('mud titan');
    expect(hint2?.vendorNames).toEqual(hint.vendorNames);
  });

  it('packs a contract title for caller narration', () => {
    const hint = findQuestFactionHint('mud titan');
    expect(hint?.contractTitle.length).toBeGreaterThan(0);
  });
});

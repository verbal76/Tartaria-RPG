// OTA-678 — off-canon entity guard for LLM narration. Verifies the guard drops
// sentences that name invented multi-word places/factions while leaving legit prose
// (and known entities) untouched.

import {
  normalizeEntity, extractProperNouns, sentenceNamesOffCanonEntity,
  stripOffCanonSentences, buildEntityAllowList,
} from '../app/engine/entityGuard';

const ALLOWED = buildEntityAllowList([
  'Asgardar', 'The Parley Ground', 'Mud Flood Nexus', 'Red Tower of Nimari',
  'Mud Monarchs', 'Forgotten Order', 'Reclaimers Guild', 'Stone Builders',
  'Aetherstone Flood', 'The Buried Cities', 'Verbal', 'the Arbiter',
]);

describe('entityGuard normalize + extract', () => {
  it('normalizes phrasing variants to the same key', () => {
    expect(normalizeEntity("the Iron Concord's")).toBe('iron concord');
    expect(normalizeEntity('Mud Flood Nexus')).toBe('mud flood nexus');
  });
  it('extracts only MULTI-word proper nouns (single caps / sentence starts ignored)', () => {
    expect(extractProperNouns('You walk south into open silt.')).toEqual([]);
    expect(extractProperNouns('You reach the Iron Concord at dusk.')).toEqual(['Iron Concord']);
    expect(extractProperNouns('The Sunken Choir of Vael waits.')).toEqual(['The Sunken Choir of Vael']);
    // a lone coined single word is NOT flagged (accepted limitation)
    expect(extractProperNouns('You reach Drakmoor.')).toEqual([]);
  });
});

describe('entityGuard off-canon detection', () => {
  it('passes sentences that name KNOWN entities', () => {
    expect(sentenceNamesOffCanonEntity('The banners of the Mud Monarchs snap in the wind.', ALLOWED)).toBe(false);
    expect(sentenceNamesOffCanonEntity('You stand in the Parley Ground.', ALLOWED)).toBe(false);
    expect(sentenceNamesOffCanonEntity('Recover it at the Red Tower of Nimari.', ALLOWED)).toBe(false);
  });
  it('flags sentences that name an INVENTED place/faction', () => {
    expect(sentenceNamesOffCanonEntity('The Sunken Choir of Vael calls to you.', ALLOWED)).toBe(true);
    expect(sentenceNamesOffCanonEntity('Far off, the Crimson Bastion still burns.', ALLOWED)).toBe(true);
  });
  it('does NOT flag ordinary prose with no multi-word proper noun', () => {
    expect(sentenceNamesOffCanonEntity('The mud sucks at your boots and the wind bites.', ALLOWED)).toBe(false);
    expect(sentenceNamesOffCanonEntity('You feel the weight of the buried country.', ALLOWED)).toBe(false);
  });
  it('does NOT flag a known lore concept (Aetherstone Flood)', () => {
    expect(sentenceNamesOffCanonEntity('The Aetherstone Flood left its mark here.', ALLOWED)).toBe(false);
  });
});

describe('entityGuard.stripOffCanonSentences', () => {
  it('keeps clean sentences, drops the one naming an invented entity', () => {
    const text = 'The wind carries silt across the flats. The Sunken Choir of Vael sings beyond the ridge. You steady yourself.';
    const out = stripOffCanonSentences(text, ALLOWED);
    expect(out).toContain('The wind carries silt');
    expect(out).toContain('You steady yourself');
    expect(out).not.toContain('Sunken Choir');
  });
  it('returns empty when every sentence is off-canon (caller then uses the template)', () => {
    const text = 'The Crimson Bastion looms. The Choir of Vael answers.';
    expect(stripOffCanonSentences(text, ALLOWED)).toBe('');
  });
  it('leaves fully-clean narration untouched', () => {
    const text = 'You look across the mud. Nothing moves but the wind.';
    expect(stripOffCanonSentences(text, ALLOWED)).toBe(text);
  });
});

// OTA — shared a/an + "The the" dedup grammar. Fixes reported strings
// "a Aetheric Raven", "a aether residue", and "The the old altar".

import { anOrA, withArticle, withArticleCap, stripLeadingArticle, theCap, theLower } from '../app/engine/grammar';

describe('a/an indefinite article', () => {
  it('vowel-initial names take "an" (the reported bugs)', () => {
    expect(withArticle('Aetheric Raven')).toBe('an Aetheric Raven');
    expect(withArticle('aether residue')).toBe('an aether residue');
    expect(withArticle('aetheric guardian')).toBe('an aetheric guardian');
    expect(withArticle('Aether Golem')).toBe('an Aether Golem');
  });
  it('consonant-initial names take "a"', () => {
    expect(withArticle('Mud Harpy')).toBe('a Mud Harpy');
    expect(withArticle('Throwing Knife')).toBe('a Throwing Knife');
  });
  it('vowel-initial RARITY takes "an" (the "a Uncommon Construct" report)', () => {
    // Call sites read `${anOrA(rarity)} ${rarity} …` — the recipe-unlock line,
    // the Construct spawn line, and the Crucible-forge line.
    expect(anOrA('Uncommon')).toBe('an');
    expect(anOrA('Rare')).toBe('a');
    expect(anOrA('Legendary')).toBe('a');
    expect(anOrA('Epic')).toBe('an');
    expect(withArticle('Aetheric Crystal Blade')).toBe('an Aetheric Crystal Blade');
  });
  it('sentence-start capitalizes the article', () => {
    expect(withArticleCap('Aetheric Raven')).toBe('An Aetheric Raven');
    expect(withArticleCap('Mud Harpy')).toBe('A Mud Harpy');
  });
  it('handles silent-h (an) and hard-onset vowel letters (a)', () => {
    expect(anOrA('hour')).toBe('an');
    expect(anOrA('honest broker')).toBe('an');
    expect(anOrA('unicorn')).toBe('a');
    expect(anOrA('one-way valve')).toBe('a');
    expect(anOrA('use')).toBe('a');
  });
  it('tolerates empty/undefined without printing "undefined"', () => {
    expect(withArticle('')).toBe('a ');
    expect(withArticle(undefined)).toBe('a ');
  });
});

describe('"The the" article dedup', () => {
  it('does not double when the noun already carries "the"', () => {
    expect(theCap('the old altar')).toBe('The old altar');
    expect(theLower('the old altar')).toBe('the old altar');
  });
  it('adds the article when the noun has none (idempotent for clean nouns)', () => {
    expect(theCap('old altar')).toBe('The old altar');
    expect(theCap('altar')).toBe('The altar');
    expect(theLower('iron chest')).toBe('the iron chest');
  });
  it('strips a/an leads too, but not a bare vowel word', () => {
    expect(stripLeadingArticle('a frame')).toBe('frame');
    expect(stripLeadingArticle('an anvil')).toBe('anvil');
    expect(stripLeadingArticle('anvil')).toBe('anvil'); // no trailing space → not an article
    expect(stripLeadingArticle('altar')).toBe('altar');
  });
});

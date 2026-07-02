import { findRecipeByResult } from '../app/engine/crafting';

describe('findRecipeByResult — fuzzy / typo tolerance', () => {
  it('exact match resolves', () => {
    expect(findRecipeByResult('Aetheric Vest')?.result).toBe('Aetheric Vest');
  });

  it('case-insensitive substring still works', () => {
    expect(findRecipeByResult('vest')?.result).toBe('Aetheric Vest');
  });

  it("matches 'aethetic vest' (missing r in aetheric)", () => {
    // The exact case from the playtest screenshot.
    expect(findRecipeByResult('aethetic vest')?.result).toBe('Aetheric Vest');
  });

  it("matches 'aethric torch' (missing e in aetheric)", () => {
    expect(findRecipeByResult('aethric torch')?.result).toBe('Aetheric Torch');
  });

  it("matches 'storm road' (one-letter typo at the end)", () => {
    expect(findRecipeByResult('storm road')?.result).toBe('Storm Rod');
  });

  it('rejects unrelated words', () => {
    expect(findRecipeByResult('banana bread')).toBeNull();
  });

  it('resolves hyphen-stripped input (parser folds "-" to a space)', () => {
    // Regression: "craft Aether-Shard Spear" reaches the engine as
    // "aether shard spear" (the input normalizer strips hyphens). Before the
    // punctuation fold this returned null for EVERY hyphenated recipe, spinning
    // the craft into an infinite cognitive re-dispatch loop that killed the
    // player with weather damage and never showed a "Crafted" line.
    expect(findRecipeByResult('aether shard spear')?.result).toBe('Aether-Shard Spear');
    expect(findRecipeByResult('aether purge tonic')?.result).toBe('Aether-Purge Tonic');
    // And it does not mis-resolve to a shorter aether recipe.
    expect(findRecipeByResult('aether shard spear')?.result).not.toBe('Aether Dust');
  });
});

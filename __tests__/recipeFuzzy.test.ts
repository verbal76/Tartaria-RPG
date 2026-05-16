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
});

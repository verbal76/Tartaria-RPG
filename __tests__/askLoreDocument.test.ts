// engine_Dev — "ask the narrator" answers from the uploaded Lore document. When a
// 'lore' override is loaded, the concept bank is built from the author's passages
// (category 'lore_doc') instead of the built-in Tartaria corpus, and the cosine
// lookup matches a passage by its keywords.

import { loadLoreConceptBank, formatArbiterAnswer, _resetConceptBankCache } from '../app/engine/loreConceptBank';
import { findClosestLoreConcept, _resetLoreVectorCache } from '../app/engine/askArbiter';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

// Deterministic bag-of-words embedder so cosine is testable without MiniLM.
const VOCAB = ['eldridge', 'fog', 'green', 'haze', 'pier', 'yard', 'rumor', 'coffee', 'meadow', 'sunshine'];
function embedText(s: string): Float32Array {
  const words = s.toLowerCase().split(/\W+/);
  const v = new Float32Array(VOCAB.length);
  VOCAB.forEach((w, i) => { v[i] = words.includes(w) ? 1 : 0; });
  return v;
}
const embedder = { isReady: () => true, embed: async (s: string) => embedText(s) };

describe('engine_Dev — ask the narrator from the lore document', () => {
  afterEach(() => { clearAllOverrides(); _resetConceptBankCache(); _resetLoreVectorCache(); });

  it('builds the ask corpus from uploaded passages (replaces built-in)', () => {
    setTableOverride('lore', [{ tags: ['eldridge', 'fog'], text: 'The Eldridge vanished in green haze.' }]);
    _resetConceptBankCache();
    const bank = loadLoreConceptBank();
    expect(bank.length).toBe(1);
    expect(bank[0]!.category).toBe('lore_doc');
    expect(bank.some((c) => c.category === 'event')).toBe(false); // no Tartaria corpus
    expect(formatArbiterAnswer(bank[0]!)).toContain('recalls:');
  });

  it('matches the right passage for a question', async () => {
    setTableOverride('lore', [
      { tags: ['eldridge', 'fog'], text: 'The Eldridge vanished in green haze.' },
      { tags: ['pier', 'yard'], text: 'The yard runs on rumor and coffee.' },
    ]);
    _resetConceptBankCache(); _resetLoreVectorCache();
    const res = await findClosestLoreConcept('eldridge fog', embedder);
    expect(res).not.toBeNull();
    expect(res!.concept.definition).toContain('green haze');
  });

  it('a re-upload rebuilds the bank (no stale cache)', () => {
    setTableOverride('lore', [{ tags: ['fog'], text: 'First version.' }]);
    _resetConceptBankCache();
    expect(loadLoreConceptBank()[0]!.definition).toBe('First version.');
    setTableOverride('lore', [{ tags: ['fog'], text: 'Second version.' }]);
    expect(loadLoreConceptBank()[0]!.definition).toBe('Second version.');
  });
});

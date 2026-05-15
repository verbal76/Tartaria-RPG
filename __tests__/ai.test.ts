import { EmbeddingCache } from '../app/ai/embedding/EmbeddingCache';
import { VectorSimilarityEngine } from '../app/ai/embedding/VectorSimilarityEngine';
import { WordPieceTokenizer } from '../app/ai/embedding/Tokenizer';
import { EmotionInferenceEngine } from '../app/ai/cognition/EmotionInferenceEngine';

function vec(...nums: number[]): Float32Array {
  return Float32Array.from(nums);
}

describe('EmbeddingCache', () => {
  it('stores and retrieves vectors', () => {
    const c = new EmbeddingCache(3);
    const v = vec(1, 0, 0);
    c.set('hello', v);
    expect(c.get('hello')).toBe(v);
  });

  it('evicts least-recently-used when over capacity', () => {
    const c = new EmbeddingCache(2);
    c.set('a', vec(1));
    c.set('b', vec(2));
    c.get('a');
    c.set('c', vec(3));
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBeDefined();
    expect(c.get('c')).toBeDefined();
  });
});

describe('VectorSimilarityEngine', () => {
  it('cosine of identical vectors is 1', () => {
    expect(VectorSimilarityEngine.cosineSimilarity(vec(1, 2, 3), vec(1, 2, 3))).toBeCloseTo(1, 5);
  });

  it('cosine of orthogonal vectors is 0', () => {
    expect(VectorSimilarityEngine.cosineSimilarity(vec(1, 0), vec(0, 1))).toBeCloseTo(0, 5);
  });

  it('cosine of zero vector is 0', () => {
    expect(VectorSimilarityEngine.cosineSimilarity(vec(0, 0), vec(1, 1))).toBe(0);
  });

  it('returns matches above threshold, sorted descending', () => {
    const input = vec(1, 0, 0);
    const anchors = { close: vec(1, 0.1, 0), far: vec(0, 1, 0), partial: vec(0.9, 0.4, 0) };
    const matches = VectorSimilarityEngine.getClosestMatches(input, anchors, 0.5);
    expect(matches.map((m) => m.concept)).toEqual(['close', 'partial']);
    expect(matches.length).toBe(2);
    expect(matches[0]!.score).toBeGreaterThan(matches[1]!.score);
  });
});

describe('WordPieceTokenizer', () => {
  const vocabText = [
    '[PAD]',
    '[unused0]',
    'word1',
    'word2',
    'word3',
    '[UNK]',
    '[CLS]',
    '[SEP]',
    'fear',
    '##ful',
    'attack',
    'search',
    'the',
    'stone',
  ].join('\n');

  it('wraps tokens with CLS / SEP', () => {
    const t = new WordPieceTokenizer();
    t.loadVocab(vocabText);
    const ids = t.tokenize('attack');
    expect(ids[0]).toBe(6);
    expect(ids[ids.length - 1]).toBe(7);
  });

  it('uses real CLS id when it is index 0 (?? not ||)', () => {
    const t = new WordPieceTokenizer();
    t.loadVocab(['[CLS]', '[SEP]', '[UNK]', 'hello'].join('\n'));
    const ids = t.tokenize('hello');
    expect(ids[0]).toBe(0);
    expect(ids[ids.length - 1]).toBe(1);
  });

  it('splits subwords with ## prefix', () => {
    const t = new WordPieceTokenizer();
    t.loadVocab(vocabText);
    const ids = t.tokenize('fearful');
    expect(ids).toContain(8);
    expect(ids).toContain(9);
  });

  it('emits UNK once per unknown word and continues', () => {
    const t = new WordPieceTokenizer();
    t.loadVocab(vocabText);
    const ids = t.tokenize('attack zzzunknownzzz the stone');
    const unkCount = ids.filter((id) => id === 5).length;
    expect(unkCount).toBe(1);
    expect(ids).toContain(10);
    expect(ids).toContain(12);
    expect(ids).toContain(13);
  });

  it('truncates to max length keeping SEP at the end', () => {
    const t = new WordPieceTokenizer();
    t.loadVocab(vocabText);
    const ids = t.tokenize('attack '.repeat(200), 16);
    expect(ids.length).toBeLessThanOrEqual(16);
    expect(ids[ids.length - 1]).toBe(7);
  });

  it('throws if vocab not loaded', () => {
    const t = new WordPieceTokenizer();
    expect(() => t.tokenize('hello')).toThrow();
  });
});

describe('EmotionInferenceEngine', () => {
  it('returns concepts that meet the threshold', () => {
    const e = new EmotionInferenceEngine(0.7);
    e.setAnchors({ FEAR: vec(1, 0, 0), JOY: vec(0, 1, 0) });
    expect(e.infer(vec(0.99, 0.01, 0))).toEqual(['FEAR']);
  });

  it('returns nothing under threshold', () => {
    const e = new EmotionInferenceEngine(0.99);
    e.setAnchors({ FEAR: vec(1, 0, 0) });
    expect(e.infer(vec(0.5, 0.5, 0))).toEqual([]);
  });
});

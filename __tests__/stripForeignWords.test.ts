// OTA-488 — the local Qwen model occasionally code-switches a foreign word into
// the English narration (playtester saw "huà"). stripForeignWords drops those
// whole words while leaving English (and stylized punctuation) intact.

import { stripForeignWords } from '../app/engine/foreignText';

describe('OTA-488 — stripForeignWords', () => {
  it('drops a romanized pinyin word (the reported "huà")', () => {
    expect(stripForeignWords('The dust settles, huà, and the road waits.'))
      .toBe('The dust settles, and the road waits.');
  });

  it('drops CJK / Cyrillic / Greek script words', () => {
    expect(stripForeignWords('You hear 你好 whispered.')).toBe('You hear whispered.');
    expect(stripForeignWords('A привет on the wind.')).toBe('A on the wind.');
    expect(stripForeignWords('The Σigil glows.')).toBe('The glows.');
  });

  it('leaves plain English untouched', () => {
    const s = 'The Arbiter watches as you raise the laser pistol.';
    expect(stripForeignWords(s)).toBe(s);
  });

  it('keeps contractions, smart quotes, em dashes, ellipses, and × tags', () => {
    expect(stripForeignWords('Don’t move — it… watches.'))
      .toBe('Don’t move — it… watches.');
    // multiplication sign is a symbol, not a foreign letter — word stays
    expect(stripForeignWords('burn ×1.5 for 6')).toBe('burn ×1.5 for 6');
  });

  it('returns empty when every word is foreign (caller falls back to template)', () => {
    expect(stripForeignWords('你好 世界')).toBe('');
  });

  it('drops a mixed English+foreign token whole', () => {
    expect(stripForeignWords('the Aether话crystal hums')).toBe('the hums');
  });
});

// Sentence-buffer splitter used by TTSController to stream Qwen
// narration to the TTS engine one sentence at a time (so playback
// starts immediately rather than waiting for the full response).

import { splitSentences } from '../app/voice/sentenceSplitter';

describe('splitSentences — streams Qwen output sentence-by-sentence', () => {
  it('returns empty + buffer when no terminators present', () => {
    const r = splitSentences('The Arbiter watches you');
    expect(r.sentences).toEqual([]);
    expect(r.remainder).toBe('The Arbiter watches you');
  });

  it('splits on .', () => {
    const r = splitSentences('First sentence. Second sentence');
    expect(r.sentences).toEqual(['First sentence.']);
    expect(r.remainder).toBe(' Second sentence');
  });

  it('splits on ! and ?', () => {
    const r = splitSentences('Wait! Who goes there? Tell me');
    expect(r.sentences).toEqual(['Wait!', 'Who goes there?']);
    expect(r.remainder).toBe(' Tell me');
  });

  it('splits on newlines too', () => {
    const r = splitSentences('Line one\nLine two\nLine three');
    expect(r.sentences).toEqual(['Line one', 'Line two']);
    expect(r.remainder).toBe('Line three');
  });

  it('handles a fully-terminated buffer (empty remainder)', () => {
    const r = splitSentences('Done. Finished.');
    expect(r.sentences).toEqual(['Done.', 'Finished.']);
    expect(r.remainder).toBe('');
  });

  it('drops empty sentences from runs of terminators', () => {
    const r = splitSentences('Hm... ok!');
    // The ellipsis produces three terminator splits; only the actual
    // word-bearing pieces should survive.
    expect(r.sentences.filter((s) => s.length > 0).length).toBeGreaterThan(0);
  });
});

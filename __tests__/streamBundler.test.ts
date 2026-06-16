// OTA-622 — the streaming sentence-bundler must NOT re-speak a sentence when the
// cumulative partialArbiterText stops growing (steady ticks). The old controller
// re-split the full partial every tick, so a shipped sentence got re-bundled on
// each steady tick and Kokoro read it N times ("same thing five times").

import { advanceStream, emptyStreamState } from '../app/voice/streamBundler';

function runStream(snapshots: (string | null)[]): string[] {
  let st = emptyStreamState();
  const spoken: string[] = [];
  for (const p of snapshots) {
    const adv = advanceStream(st, p);
    st = adv.state;
    spoken.push(...adv.utterances);
  }
  return spoken;
}

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe('streamBundler.advanceStream', () => {
  it('a steady (unchanged) partial does NOT re-speak a shipped sentence', () => {
    const spoken = runStream([
      'You step',
      'You step cautiously down the winding staircase.',
      'You step cautiously down the winding staircase.', // steady tick
      'You step cautiously down the winding staircase.', // steady tick
      'You step cautiously down the winding staircase.', // steady tick
      null, // stream end
    ]);
    expect(occurrences(spoken.join(' | '), 'winding staircase')).toBe(1);
  });

  it('ships every sentence exactly once across growing + steady ticks', () => {
    const spoken = runStream([
      'Alpha one.',
      'Alpha one. Bravo two.',
      'Alpha one. Bravo two.', // steady
      'Alpha one. Bravo two. Charlie three. Delta four.',
      'Alpha one. Bravo two. Charlie three. Delta four.', // steady
      'Alpha one. Bravo two. Charlie three. Delta four.', // steady
      null,
    ]);
    const joined = spoken.join(' | ');
    for (const s of ['Alpha one', 'Bravo two', 'Charlie three', 'Delta four']) {
      expect(occurrences(joined, s)).toBe(1);
    }
  });

  it('ships the first sentence immediately (fast audio start)', () => {
    let st = emptyStreamState();
    const a = advanceStream(st, 'First sentence here. Second');
    expect(a.utterances).toContain('First sentence here.');
  });

  it('flushes the terminator-less remainder when the stream ends', () => {
    let st = emptyStreamState();
    st = advanceStream(st, 'Done.').state;          // ships "Done."
    st = advanceStream(st, 'Done. No terminator').state; // buffers remainder
    const end = advanceStream(st, null);            // flush
    expect(end.utterances.join(' ')).toContain('No terminator');
  });

  it('a cancelled generation (partial shrinks) drops the buffer, no replay', () => {
    let st = emptyStreamState();
    st = advanceStream(st, 'Half a sentence that never').state;
    const reset = advanceStream(st, ''); // store cleared partial
    expect(reset.utterances).toEqual([]);
    expect(reset.state.consumedLen).toBe(0);
  });
});

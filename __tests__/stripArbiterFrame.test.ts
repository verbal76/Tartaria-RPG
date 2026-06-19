import { stripArbiterFrame, detectArbiterSpeaker } from '../app/voice/arbiterFrame';

describe('stripArbiterFrame', () => {
  it('extracts a single double-quoted span', () => {
    expect(stripArbiterFrame('The Arbiter inclines their head. "X."')).toBe('X.');
  });

  it('extracts multiple double-quoted spans, joined with a space', () => {
    expect(stripArbiterFrame('"X," the Arbiter says, "Y."')).toBe('X, Y.');
  });

  it('handles curly-quote characters', () => {
    expect(stripArbiterFrame('The Arbiter notes, “X.”')).toBe('X.');
  });

  it('strips leading "The Arbiter ..." clause when no quotes present', () => {
    expect(stripArbiterFrame('The Arbiter shrugs. There is nothing more to say.')).toBe(
      'There is nothing more to say.',
    );
  });

  it('handles lowercase "the Arbiter ..." too', () => {
    expect(stripArbiterFrame('the Arbiter notes, you have not eaten today.')).toBe(
      'you have not eaten today.',
    );
  });

  it('returns the input untouched when no quotes AND no narrator clause', () => {
    expect(stripArbiterFrame('Plain narration without framing.')).toBe(
      'Plain narration without framing.',
    );
  });

  it('returns empty input as-is (defensive)', () => {
    expect(stripArbiterFrame('')).toBe('');
  });

  it('handles vendor framing the same way (any third-party speaker)', () => {
    expect(stripArbiterFrame('Irma Ironhand leans in. "Got a contract for someone like you."')).toBe(
      'Got a contract for someone like you.',
    );
  });

  it('strips frame even with multiple comma-separated narrator clauses before the quote', () => {
    // Common Arbiter pattern: "X," the Arbiter says, weighing the word, "Y."
    expect(stripArbiterFrame('"X," the Arbiter says, weighing the word, "Y."')).toBe('X, Y.');
  });

  it('preserves apostrophes inside the speech', () => {
    expect(stripArbiterFrame('The Arbiter notes, "Tartaria\'s old roads bite back."')).toBe(
      "Tartaria's old roads bite back.",
    );
  });
});

describe('detectArbiterSpeaker', () => {
  it('returns the narrator name for narrator framing (legacy "Arbiter" still recognized)', () => {
    expect(detectArbiterSpeaker('The Arbiter inclines their head. "X."')).toBe('the Narrator');
    expect(detectArbiterSpeaker('"X," the Arbiter notes.')).toBe('the Narrator');
  });

  it('detects a vendor speaker from leading-name framing', () => {
    expect(detectArbiterSpeaker('Irma Ironhand leans in. "Got a contract for someone like you."'))
      .toBe('Irma Ironhand');
    expect(detectArbiterSpeaker('Halem taps a notice on the post. "Bounty up."'))
      .toBe('Halem');
    expect(detectArbiterSpeaker('Naha hands you the poster. "Drifter put this up."'))
      .toBe('Naha');
  });

  it('detects a vendor speaker from trailing attribution', () => {
    expect(detectArbiterSpeaker('"Get back to me when you are ready," Tarek says.'))
      .toBe('Tarek');
  });

  it('falls back to the narrator name when no framing is detectable', () => {
    expect(detectArbiterSpeaker('Some plain narration text.')).toBe('the Narrator');
    expect(detectArbiterSpeaker('')).toBe('the Narrator');
  });

  it('handles multi-word NPC names up to 3 tokens', () => {
    expect(detectArbiterSpeaker('Cassia Nightwind leans in. "Trade?"'))
      .toBe('Cassia Nightwind');
  });
});

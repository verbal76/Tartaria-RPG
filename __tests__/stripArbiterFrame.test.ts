import { stripArbiterFrame, detectArbiterSpeaker } from '../app/voice/arbiterFrame';

describe('stripArbiterFrame', () => {
  it('extracts a single double-quoted span', () => {
    expect(stripArbiterFrame('The Arbiter inclines their head. "X."')).toBe('X.');
  });

  it('extracts multiple double-quoted spans, joined with a space', () => {
    // ⚠ RE-AUTHORED BY OTA-1138. This test used to expect 'X, Y.' — the exact
    // output the owner heard as a run-on ("…mean to leave, Good"). The comma
    // after X was the ATTRIBUTION comma; once the attribution is stripped, the
    // sentence it closed is over, so the comma is promoted to a full stop and
    // the TTS gets a terminator to pause on.
    expect(stripArbiterFrame('"X," the Arbiter says, "Y."')).toBe('X. Y.');
  });

  it('⚠ OTA-1138 — a genuine mid-sentence handoff KEEPS its comma', () => {
    // "You attack," he said, "as if you mean to leave." — the second span
    // continues the first sentence (lowercase start), so promoting the comma
    // would break the sentence in half.
    expect(stripArbiterFrame('"You attack," he said, "as if you mean to leave."'))
      .toBe('You attack, as if you mean to leave.');
  });

  it('⚠ OTA-1138 — the owner\'s exact line from the device log', () => {
    expect(stripArbiterFrame('"You attack as if you mean to leave," the Arbiter murmurs. "Good."'))
      .toBe('You attack as if you mean to leave. Good.');
    expect(stripArbiterFrame('"Footwork over fury," the Arbiter says quietly. "The drone is patient."'))
      .toBe('Footwork over fury. The drone is patient.');
  });

  it('⚠ OTA-1138 — a single trailing-comma quote gets its stop too', () => {
    // No second span at all: the sentence still ended where the attribution
    // began, so it still deserves the terminator.
    expect(stripArbiterFrame('"Hold the line," the Arbiter says.')).toBe('Hold the line.');
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
    // (RETARGETED BY OTA-1138 — the attribution comma promotes to a stop.)
    expect(stripArbiterFrame('"X," the Arbiter says, weighing the word, "Y."')).toBe('X. Y.');
  });

  it('preserves apostrophes inside the speech', () => {
    expect(stripArbiterFrame('The Arbiter notes, "Tartaria\'s old roads bite back."')).toBe(
      "Tartaria's old roads bite back.",
    );
  });
});

describe('detectArbiterSpeaker', () => {
  it('returns "the Arbiter" for arbiter framing', () => {
    expect(detectArbiterSpeaker('The Arbiter inclines their head. "X."')).toBe('the Arbiter');
    expect(detectArbiterSpeaker('"X," the Arbiter notes.')).toBe('the Arbiter');
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

  it('falls back to "the Arbiter" when no framing is detectable', () => {
    expect(detectArbiterSpeaker('Some plain narration text.')).toBe('the Arbiter');
    expect(detectArbiterSpeaker('')).toBe('the Arbiter');
  });

  it('handles multi-word NPC names up to 3 tokens', () => {
    expect(detectArbiterSpeaker('Cassia Nightwind leans in. "Trade?"'))
      .toBe('Cassia Nightwind');
  });
});

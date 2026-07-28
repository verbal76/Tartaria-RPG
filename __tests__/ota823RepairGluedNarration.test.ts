// arb-fix (OTA-823) — Qwen 0.5B sometimes emits a token boundary with no space, gluing
// two words at a lowercase→Uppercase seam. The playtest caught the Arbiter narrating
// "theYou stood in the shadowy chamber…" (a stray leading article welded to the opener).
// repairGluedNarration un-glues those and drops an article stranded before a pronoun.

import { repairGluedNarration } from '../app/engine/foreignText';

describe('OTA-823 — repairGluedNarration', () => {
  it('fixes the reported "theYou" → "You"', () => {
    expect(repairGluedNarration('theYou stood in the shadowy chamber of the abandoned engine room.'))
      .toBe('You stood in the shadowy chamber of the abandoned engine room.');
  });

  it('un-glues a mid-sentence seam without dropping anything', () => {
    expect(repairGluedNarration('The dust settles and chamberYou go still.'))
      .toBe('The dust settles and chamber You go still.');
  });

  it('drops an article stranded before any subject pronoun (no "the You"/"a I")', () => {
    expect(repairGluedNarration('the You turn away.')).toBe('You turn away.');
    expect(repairGluedNarration('aI walk on.')).toBe('I walk on.');
  });

  it('keeps an article before a real NOUN (only pronouns are un-articled)', () => {
    expect(repairGluedNarration('aStone rolls past.')).toBe('a Stone rolls past.');
  });

  it('leaves clean narration untouched', () => {
    const clean = 'The Arbiter meets your eyes. "Welcome back."';
    expect(repairGluedNarration(clean)).toBe(clean);
    expect(repairGluedNarration('You walk east; the compass holds.')).toBe('You walk east; the compass holds.');
  });

  it('is safe on empty input', () => {
    expect(repairGluedNarration('')).toBe('');
  });
});

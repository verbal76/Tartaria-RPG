// engine_Dev — Phase 1 of the TEMPLATE-FLAG (pink) feature: unfilled scaffold
// placeholders the player should never see un-tinted. Locks the detection so it flags
// the blatant blanks WITHOUT false-positiving on ordinary prose.

import {
  isTemplatePlaceholder,
  splitOnPlaceholders,
  hasInlinePlaceholder,
  TEMPLATE_FLAG_COLOR,
} from '../app/engine/templatePlaceholders';

describe('engine_Dev — template placeholder detection (pink-flag Phase 1)', () => {
  it('flags whole-field REPLACE markers and identity defaults', () => {
    expect(isTemplatePlaceholder('REPLACE-with-a-faction-id')).toBe(true);
    expect(isTemplatePlaceholder('REPLACE: the story behind a relic')).toBe(true);
    expect(isTemplatePlaceholder('My Game')).toBe(true);
    expect(isTemplatePlaceholder('My World')).toBe(true);
    expect(isTemplatePlaceholder('A world of your making.')).toBe(true);
  });

  it('flags generic sample-row names pulled from the templates', () => {
    // These come straight from GENERIC_TABLE_ROWS, so the set tracks the templates.
    expect(isTemplatePlaceholder('Worn Sword')).toBe(true);
    expect(isTemplatePlaceholder('Common Residue')).toBe(true);
    expect(isTemplatePlaceholder('  Worn Sword  ')).toBe(true); // trimmed
  });

  it('does NOT flag real authored names or empty input', () => {
    expect(isTemplatePlaceholder('Aetheric Torch')).toBe(false);
    expect(isTemplatePlaceholder('Louisville Slugger')).toBe(false);
    expect(isTemplatePlaceholder('')).toBe(false);
    expect(isTemplatePlaceholder(null)).toBe(false);
    expect(isTemplatePlaceholder(undefined)).toBe(false);
  });

  it('does NOT false-positive on lowercase prose "replace"', () => {
    // The marker is CASE-SENSITIVE all-caps; ordinary prose must stay un-flagged.
    expect(hasInlinePlaceholder('You replace the sword in its sheath.')).toBe(false);
    const spans = splitOnPlaceholders('You replace the sword.');
    expect(spans.every((s) => !s.flag)).toBe(true);
  });

  it('splits a line, flagging only the REPLACE marker substring', () => {
    const spans = splitOnPlaceholders('Posted by REPLACE-with-a-faction-id near the gate.');
    expect(spans.filter((s) => s.flag).map((s) => s.text)).toEqual(['REPLACE-with-a-faction-id']);
    // reassembling the spans reproduces the original text exactly
    expect(spans.map((s) => s.text).join('')).toBe('Posted by REPLACE-with-a-faction-id near the gate.');
  });

  it('returns a single un-flagged span when there is nothing to mark', () => {
    expect(splitOnPlaceholders('Just plain narration.')).toEqual([{ text: 'Just plain narration.', flag: false }]);
  });

  it('exposes a stable pink color', () => {
    expect(TEMPLATE_FLAG_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

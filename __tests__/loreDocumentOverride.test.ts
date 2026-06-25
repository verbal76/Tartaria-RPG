// engine_Dev — the Lore document box: an uploaded 'lore' table of keyworded
// passages REPLACES the built-in Tartaria canon in the narration prompt; the
// narrator surfaces the passage whose tags match the scene, or nothing.

import { buildCanonFactsParagraph } from '../app/engine/canonFacts';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

const Q = (keywords: string[]) => ({ sceneKeywords: keywords, hasVendor: false });

describe('engine_Dev — lore document override', () => {
  afterEach(() => clearAllOverrides());

  it('a matching scene surfaces the author passage', () => {
    setTableOverride('lore', [
      { tags: ['uss eldridge', 'fog'], text: 'The Eldridge vanished in a wall of green haze.' },
      { tags: ['navy yard', 'pier'], text: 'The yard runs on rumor and rationed coffee.' },
    ]);
    expect(buildCanonFactsParagraph(Q(['the eldridge dock', 'fog']))).toContain('green haze');
    expect(buildCanonFactsParagraph(Q(['pier 4', 'navy yard']))).toContain('rationed coffee');
  });

  it('a non-matching scene injects nothing (no irrelevant lore, no Tartaria leak)', () => {
    setTableOverride('lore', [{ tags: ['uss eldridge'], text: 'The Eldridge vanished.' }]);
    expect(buildCanonFactsParagraph(Q(['a quiet meadow', 'sunshine']))).toBeNull();
  });

  it('an "always" passage is the baseline when nothing scene-specific matches', () => {
    setTableOverride('lore', [
      { tags: ['always'], text: 'The world is a drowned wasteland under a green sky.' },
      { tags: ['pier'], text: 'The yard runs on rumor.' },
    ]);
    // No scene match → the "always" baseline.
    expect(buildCanonFactsParagraph(Q(['a quiet meadow']))).toContain('drowned wasteland');
    // Scene-specific still wins over the baseline.
    expect(buildCanonFactsParagraph(Q(['pier 4']))).toContain('rumor');
  });

  it('long passages are truncated for the token budget', () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    setTableOverride('lore', [{ tags: ['fog'], text: long }]);
    const out = buildCanonFactsParagraph(Q(['fog']))!;
    expect(out.endsWith('…')).toBe(true);
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(61);
  });
});

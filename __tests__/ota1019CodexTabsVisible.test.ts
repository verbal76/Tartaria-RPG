// OTA-1019 — the codex tabs are always on screen (owner screenshot: FALLEN and
// LORE were hidden past the right edge of a cue-less horizontal scroll).
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'LoreCodexBody.tsx'), 'utf8');

describe('OTA-1019 — the codex tab row wraps; nothing hides off-screen', () => {
  it('the tab row is a wrapping View, not a horizontal ScrollView', () => {
    expect(SRC).toContain("flexWrap: 'wrap'");
    expect(SRC).not.toMatch(/<ScrollView\s+horizontal/);
    expect(SRC).not.toContain('showsHorizontalScrollIndicator');
  });
  it('all 7 sections are still in the row — FALLEN included', () => {
    expect(SRC).toContain("(['races', 'factions', 'places', 'timeline', 'bestiary', 'lore', 'fallen'] as Section[])");
  });
});

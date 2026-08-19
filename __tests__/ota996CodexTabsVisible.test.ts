// OTA-996 — the codex tabs are always on screen (owner screenshot: FALLEN and
// LORE were hidden past the right edge of a cue-less horizontal scroll).
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'LoreCodexBody.tsx'), 'utf8');

describe('OTA-996 — the codex tab row wraps; nothing hides off-screen', () => {
  it('the tab row is a wrapping View, not a horizontal ScrollView', () => {
    expect(SRC).toContain("flexWrap: 'wrap'");
    expect(SRC).not.toMatch(/<ScrollView\s+horizontal/);
    expect(SRC).not.toContain('showsHorizontalScrollIndicator');
  });
  it('all 7 sections are still in the row — FALLEN included', () => {
    // ⚠ OTA-1365 — this lock guards a COUNT, not an ORDER. The row was
    // reordered by gameplay use (BEASTS and FALLEN to the front, owner's call),
    // so pinning the old literal would have frozen a sequence that was never
    // designed — it was just the order the tabs were built in. What must not
    // regress is that all seven are declared and rendered, since the bug behind
    // OTA-996 was FALLEN and LORE hidden past the right edge.
    const decl = SRC.slice(SRC.indexOf('const TAB_ORDER'), SRC.indexOf('];', SRC.indexOf('const TAB_ORDER')));
    for (const section of ['races', 'factions', 'places', 'timeline', 'bestiary', 'lore', 'fallen']) {
      expect(decl).toContain(`'${section}'`);
    }
    expect(decl.split(',')).toHaveLength(7);
    // And the row renders exactly that list — no second hard-coded sequence.
    expect(SRC).toContain('{TAB_ORDER.map((s) => (');
    // (ota1365LoreTabs proves the rendered order by mounting the screen.)
  });
});

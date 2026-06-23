// engine_Dev — the TEMPLATE export gives a developer the first couple of built-in
// rows per table (a schema starter), never the whole game, and the output is valid
// JSON that round-trips back through the same upload validation.

import { getTableTemplate, getLoreTemplate, TEMPLATE_SAMPLE_ROWS } from '../app/engine/contentTemplates';
import { CONTENT_TABLES, LORE_BLOCKS } from '../app/engine/contentPack';

// engine_Dev — templates may carry a `//` / `/* */` instruction header (e.g. the
// recipes example). Strip comments the way the loaders do before JSON.parse.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('engine_Dev — content templates', () => {
  it('every table template is valid JSON and a non-empty array', () => {
    for (const t of CONTENT_TABLES) {
      const json = getTableTemplate(t.id);
      const parsed = JSON.parse(stripComments(json));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      // 'lore' + 'powers' ship their FULL set, and 'recipes' ships a full example
      // of every recipe type; every other table is a small sample.
      if (t.id !== 'lore' && t.id !== 'powers' && t.id !== 'recipes') {
        expect(parsed.length).toBeLessThanOrEqual(TEMPLATE_SAMPLE_ROWS);
      }
    }
  });

  it('the lore-document template is the full multi-section scaffold', () => {
    const parsed = JSON.parse(stripComments(getTableTemplate('lore'))) as Array<Record<string, unknown>>;
    expect(parsed.length).toBeGreaterThan(TEMPLATE_SAMPLE_ROWS);
    expect(parsed[0]).toHaveProperty('section');
    expect(parsed.some((p) => Array.isArray(p.tags) && (p.tags as string[]).includes('always'))).toBe(true);
  });

  it('the weapons template carries a real built-in row (shows the schema)', () => {
    const parsed = JSON.parse(stripComments(getTableTemplate('weapons'))) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('name');
    expect(parsed[0]).toHaveProperty('damageDice');
  });

  it('does NOT dump the whole table — sample is far smaller than the source', () => {
    // weapons.json has dozens of rows; the template is just the sample size.
    expect(JSON.parse(stripComments(getTableTemplate('weapons'))).length).toBe(TEMPLATE_SAMPLE_ROWS);
  });

  it('world lore template is the current narrator + tone, editable', () => {
    const w = JSON.parse(getLoreTemplate('world')) as Record<string, unknown>;
    expect(typeof w.narrator).toBe('string');
    expect(typeof w.tone).toBe('string');
  });

  it('faction / race lore templates are id→story OBJECTS; flavor is the pool object', () => {
    for (const b of LORE_BLOCKS.filter((l) => l.id === 'faction' || l.id === 'race')) {
      // engine_Dev — faction/race lore is now an object { id: storyParagraph } (the
      // lore loader rejects table-shaped arrays), not an array.
      const parsed = JSON.parse(stripComments(getLoreTemplate(b.id))) as Record<string, unknown>;
      expect(Array.isArray(parsed)).toBe(false);
      expect(Object.keys(parsed).length).toBeGreaterThan(0);
      expect(Object.keys(parsed).length).toBeLessThanOrEqual(TEMPLATE_SAMPLE_ROWS);
    }
    // The narration-flavor template is an OBJECT of pools, not an array.
    const flavor = JSON.parse(stripComments(getLoreTemplate('flavor'))) as Record<string, unknown>;
    expect(Array.isArray(flavor)).toBe(false);
    expect(flavor).toHaveProperty('genericRemarks');
  });
});

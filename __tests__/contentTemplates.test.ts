// engine_Dev — the TEMPLATE export gives a developer the first couple of built-in
// rows per table (a schema starter), never the whole game, and the output is valid
// JSON that round-trips back through the same upload validation.

import { getTableTemplate, getLoreTemplate, TEMPLATE_SAMPLE_ROWS } from '../app/engine/contentTemplates';
import { CONTENT_TABLES, LORE_BLOCKS } from '../app/engine/contentPack';

describe('engine_Dev — content templates', () => {
  it('every table template is valid JSON and a non-empty array', () => {
    for (const t of CONTENT_TABLES) {
      const json = getTableTemplate(t.id);
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      // 'lore' + 'powers' ship their FULL set; every other table is a small sample.
      if (t.id !== 'lore' && t.id !== 'powers') expect(parsed.length).toBeLessThanOrEqual(TEMPLATE_SAMPLE_ROWS);
    }
  });

  it('the lore-document template is the full multi-section scaffold', () => {
    const parsed = JSON.parse(getTableTemplate('lore')) as Array<Record<string, unknown>>;
    expect(parsed.length).toBeGreaterThan(TEMPLATE_SAMPLE_ROWS);
    expect(parsed[0]).toHaveProperty('section');
    expect(parsed.some((p) => Array.isArray(p.tags) && (p.tags as string[]).includes('always'))).toBe(true);
  });

  it('the weapons template carries a real built-in row (shows the schema)', () => {
    const parsed = JSON.parse(getTableTemplate('weapons')) as Array<Record<string, unknown>>;
    expect(parsed[0]).toHaveProperty('name');
    expect(parsed[0]).toHaveProperty('damageDice');
  });

  it('does NOT dump the whole table — sample is far smaller than the source', () => {
    // weapons.json has dozens of rows; the template is just the sample size.
    expect(JSON.parse(getTableTemplate('weapons')).length).toBe(TEMPLATE_SAMPLE_ROWS);
  });

  it('world lore template is the current narrator + tone, editable', () => {
    const w = JSON.parse(getLoreTemplate('world')) as Record<string, unknown>;
    expect(typeof w.narrator).toBe('string');
    expect(typeof w.tone).toBe('string');
  });

  it('faction / race lore templates are small arrays; flavor is the pool object', () => {
    for (const b of LORE_BLOCKS.filter((l) => l.id === 'faction' || l.id === 'race')) {
      const parsed = JSON.parse(getLoreTemplate(b.id));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeLessThanOrEqual(TEMPLATE_SAMPLE_ROWS);
    }
    // The narration-flavor template is an OBJECT of pools, not an array.
    const flavor = JSON.parse(getLoreTemplate('flavor')) as Record<string, unknown>;
    expect(Array.isArray(flavor)).toBe(false);
    expect(flavor).toHaveProperty('genericRemarks');
  });
});

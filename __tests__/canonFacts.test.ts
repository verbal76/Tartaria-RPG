// canon facts — driven ENTIRELY by the active lore document. The built-in Tartaria canon
// (canon-events / canon-food-drink) was deleted (engine_Dev-831); buildCanonFactsParagraph
// now returns a matching passage from the loaded lore doc, or null when there is none.

import { buildCanonFactsParagraph, findArbiterTitle, ARBITER_TITLES } from '../app/engine/canonFacts';
import { setTableOverride } from '../app/engine/contentPack';

const LORE = [
  { tags: ['always'], text: 'A grey, patient world picks through what the old age left behind.' },
  { tags: ['market', 'vendor', 'trade'], text: 'The market never closes; everything here has a price, including the way out.' },
  { tags: ['berlin', 'ruin'], text: 'The drowned districts still hum at night, no one left to switch them off.' },
];

describe('engine_Dev — canon facts come from the lore document only', () => {
  afterEach(() => setTableOverride('lore', []));

  it('surfaces the passage whose tags best match the scene', () => {
    setTableOverride('lore', LORE);
    const para = buildCanonFactsParagraph({ sceneKeywords: ['market', 'square'], hasVendor: true });
    expect(para).toMatch(/market never closes/);
  });

  it('falls back to the `always` passage when nothing else matches', () => {
    setTableOverride('lore', LORE);
    const para = buildCanonFactsParagraph({ sceneKeywords: ['xyzzy', 'unmatched'], hasVendor: false });
    expect(para).toMatch(/grey, patient world/);
  });

  it('no longer references the deleted Tartaria canon', () => {
    setTableOverride('lore', LORE);
    const para = buildCanonFactsParagraph({ sceneKeywords: ['berlin'], hasVendor: true });
    expect(para).not.toBeNull();
    expect(para!).not.toMatch(/tartar|aether|reclaimer|mud dweller/i);
  });
});

// arbiter-titles is still the live title feature (genericized separately). Smoke-check it
// still loads + resolves, so the deletion of the other canon files didn't disturb it.
describe('engine_Dev — arbiter titles still load + resolve', () => {
  it('the title bank is non-empty and findArbiterTitle matches by name/tag', () => {
    expect(ARBITER_TITLES.length).toBeGreaterThan(0);
    const byName = findArbiterTitle(ARBITER_TITLES[0]!.title);
    expect(byName?.id).toBe(ARBITER_TITLES[0]!.id);
    expect(findArbiterTitle('xyzzy_no_match')).toBeNull();
  });
});

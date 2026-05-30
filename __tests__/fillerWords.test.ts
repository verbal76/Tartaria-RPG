// Descriptor-stripping in the parser. Verifies common adjectives and
// adverbs don't throw off item / noun resolution, while game-meaningful
// descriptors (old / heavy / dark etc.) stay live in parsed.target for
// the action handlers downstream.

import { parseInput } from '../app/engine/parser';
import type { InventoryItem } from '../app/engine/types';

function mkItem(name: string): InventoryItem {
  return {
    id: `item_${name.toLowerCase().replace(/\s+/g, '_')}`,
    name,
    kind: 'misc',
    quantity: 1,
    tags: [],
  };
}

describe('parser descriptor stripping', () => {
  it('strips adjectives so "use the smart torch" resolves to Aetheric Torch', () => {
    const inv = [mkItem('Aetheric Torch')];
    const r = parseInput('use the smart torch', { inventory: inv });
    expect(r.intent).toBe('use_relic');
    expect(r.resolvedItemId).toBe('item_aetheric_torch');
  });

  it('strips adverbs so "carefully open the lockbox" still parses as open', () => {
    const r = parseInput('carefully open the lockbox');
    expect(r.intent).toBe('open');
    // 'lockbox' should still be in the target after carefully stripped
    expect((r.target ?? '').toLowerCase()).toContain('lockbox');
  });

  it('strips multiple descriptors: "really quickly search the messy crate"', () => {
    const r = parseInput('really quickly search the messy crate');
    expect(r.intent).toBe('investigate');
    expect((r.target ?? '').toLowerCase()).toContain('crate');
  });

  it('does NOT strip game-meaningful adjectives like "old", "dark", "heavy"', () => {
    // These are excluded from FILLER_DESCRIPTORS on purpose so the action
    // handlers can still see them. The parser passes the raw target
    // through; we verify the words still appear in target.
    const r1 = parseInput('search the dark crawlspace');
    expect((r1.target ?? '').toLowerCase()).toContain('dark');

    const r2 = parseInput('open the old chest');
    expect((r2.target ?? '').toLowerCase()).toContain('old');

    const r3 = parseInput('lift the heavy crate');
    expect((r3.target ?? '').toLowerCase()).toContain('heavy');
  });

  it('still parses correctly when input has NO descriptors', () => {
    const r = parseInput('search the rubble');
    expect(r.intent).toBe('investigate');
    expect((r.target ?? '').toLowerCase()).toContain('rubble');
  });
});

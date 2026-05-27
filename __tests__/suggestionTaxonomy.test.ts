// Suggestion engine taxonomy regression.
// Verifies classifyNoun() correctly buckets a target by inspecting the
// scene context (inventory / enemies / hooks / ambient / location /
// vendor) and that the no-verb fallback uses those classifications to
// stop offering nonsense verbs ("use torch on goblin", "inspect
// tartarian outskirts", etc.).

import { classifyNoun, parseInput, type ParseContext } from '../app/engine/parser';
import type { InventoryItem } from '../app/engine/types';

const torch: InventoryItem = {
  id: 'inv_torch_1',
  name: 'Aetheric Torch',
  kind: 'misc',
  rarity: 'Common',
  quantity: 1,
  tags: ['light'],
};

const baseCtx: ParseContext = {
  inventory: [torch],
  currentLocationName: 'Tartarian Outskirts',
  enemyNames: ['Mud Goblin'],
  hookNouns: ['lantern'],
  ambientNouns: ['rubble'],
  vendorName: 'Halem the Trader',
  // Mirror what gameStore wires: recentNouns is the union of all
  // resolvable scene nouns (enemies + aliases + ambient + hook nouns
  // + vendor name). Without this, the noun resolver can't find the
  // target the test is asking about.
  recentNouns: ['Mud Goblin', 'rubble', 'lantern', 'Halem the Trader'],
};

describe('classifyNoun — bucketing', () => {
  it('item beats every other classification', () => {
    expect(classifyNoun('Aetheric Torch', baseCtx)).toBe('item');
    expect(classifyNoun('torch', baseCtx)).toBe('item');
  });
  it('enemy matches by alias / substring', () => {
    expect(classifyNoun('Mud Goblin', baseCtx)).toBe('enemy');
    expect(classifyNoun('goblin', baseCtx)).toBe('enemy');
  });
  it('vendor matches', () => {
    expect(classifyNoun('Halem', baseCtx)).toBe('vendor');
  });
  it('hook nouns are recognized', () => {
    expect(classifyNoun('lantern', baseCtx)).toBe('hook');
  });
  it('location is recognised by substring', () => {
    expect(classifyNoun('Tartarian Outskirts', baseCtx)).toBe('location');
    expect(classifyNoun('outskirts', baseCtx)).toBe('location');
  });
  it('ambient nouns fall through last', () => {
    expect(classifyNoun('rubble', baseCtx)).toBe('ambient');
  });
  it('unknown targets return null', () => {
    expect(classifyNoun('xyzzy', baseCtx)).toBeNull();
    expect(classifyNoun('', baseCtx)).toBeNull();
  });
});

describe('no-verb fallback honours the taxonomy', () => {
  it('does NOT offer "use torch on <enemy>" suggestion', () => {
    const result = parseInput('the goblin', baseCtx);
    expect(result.intent).toBe('unknown');
    const useTorch = (result.suggestions ?? []).find((s) =>
      /use torch on/i.test(s),
    );
    expect(useTorch).toBeUndefined();
  });

  it('offers attack for an enemy noun', () => {
    const result = parseInput('the mud goblin', baseCtx);
    expect((result.suggestions ?? []).some((s) => /attack/i.test(s))).toBe(true);
  });

  it('offers "use torch on <ambient>" when torch is in inventory', () => {
    const result = parseInput('the rubble', baseCtx);
    expect((result.suggestions ?? []).some((s) => /use torch on/i.test(s))).toBe(true);
  });

  it('does NOT offer "use torch on <ambient>" when no torch in inventory', () => {
    const ctxNoTorch: ParseContext = { ...baseCtx, inventory: [] };
    const result = parseInput('the rubble', ctxNoTorch);
    expect((result.suggestions ?? []).some((s) => /use torch on/i.test(s))).toBe(false);
  });

  it('does NOT offer inspect for a location noun', () => {
    const result = parseInput('tartarian outskirts', baseCtx);
    expect((result.suggestions ?? []).some((s) => /inspect tartarian/i.test(s))).toBe(false);
  });

  it('offers "talk to <vendor>" when target is the vendor', () => {
    const result = parseInput('halem', baseCtx);
    expect((result.suggestions ?? []).some((s) => /talk to halem/i.test(s))).toBe(true);
  });
});

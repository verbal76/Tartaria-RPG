import { parseInput } from '../app/engine/parser';
import type { InventoryItem } from '../app/engine/types';

const rations: InventoryItem = {
  id: 'trail-rations',
  name: 'Trail Rations',
  kind: 'consumable',
  quantity: 3,
  tags: ['food'],
};
const torch: InventoryItem = {
  id: 'aetheric-torch',
  name: 'Aetheric Torch',
  kind: 'misc',
  quantity: 1,
  tags: ['light', 'relic'],
};

describe('parseInput — basic intents', () => {
  it('detects attack intent', () => {
    expect(parseInput('attack the mud golem').intent).toBe('attack');
  });
  it('detects stealth intent', () => {
    expect(parseInput('sneak through the tunnel').intent).toBe('stealth');
  });
  it('detects diplomacy intent', () => {
    expect(parseInput('persuade the Rust Monk to step aside').intent).toBe('diplomacy');
  });
  it('detects escape intent', () => {
    expect(parseInput('flee from the sentinel').intent).toBe('escape');
  });
  it('detects investigate intent', () => {
    expect(parseInput('examine the obelisk').intent).toBe('investigate');
  });
});

describe('parseInput — typo correction', () => {
  it('recovers "serch" as search/investigate', () => {
    expect(parseInput('serch the ruins').intent).toBe('investigate');
  });
  it('recovers "invetory"', () => {
    expect(parseInput('invetory').intent).toBe('inventory');
  });
  it('handles partial inventory item word "rationa"', () => {
    const r = parseInput('eat my rationa', { inventory: [rations] });
    expect(r.intent).toBe('rest');
    expect(r.resolvedItemId).toBe('trail-rations');
  });
});

describe('parseInput — inventory awareness', () => {
  it('resolves "use torch" to the only torch in pack', () => {
    const r = parseInput('use torch', { inventory: [torch, rations] });
    expect(r.intent).toBe('use_relic');
    expect(r.resolvedItemId).toBe('aetheric-torch');
  });
});

describe('parseInput — contextual noun memory', () => {
  it('resolves "the humming" to Humming Stone from recent scene nouns', () => {
    const r = parseInput('inspect the humming', { recentNouns: ['Humming Stone', 'Tartarian Outskirts'] });
    expect(r.intent).toBe('investigate');
    expect(r.resolvedNoun).toBe('Humming Stone');
  });
});

describe('parseInput — never hard fails', () => {
  it('returns unknown + suggestions for nonsense, never throws', () => {
    const r = parseInput('asdfghjkl', { inventory: [torch], enemyPresent: true });
    expect(r.intent).toBe('unknown');
    expect(r.suggestions.length).toBeGreaterThan(0);
  });
  it('returns confidence > 0.5 for clean verbs', () => {
    expect(parseInput('search the ruins').confidence).toBeGreaterThan(0.5);
  });
});

describe('parseInput — combat context override', () => {
  it('routes "use my torch to attack the moth" to attack when enemy is present', () => {
    const r = parseInput('use my torch to attack the moth', { inventory: [torch], enemyPresent: true });
    expect(r.intent).toBe('attack');
  });
  it('keeps use_relic intent when no enemy is present', () => {
    const r = parseInput('use my torch', { inventory: [torch], enemyPresent: false });
    expect(r.intent).toBe('use_relic');
  });
});

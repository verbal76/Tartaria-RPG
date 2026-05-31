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

describe('parseInput — drops trailing question words from targets', () => {
  // Playtest: "examine compass where" produced
  // "You examine compass where. The Aetherstone hums..." — the bare
  // question word was echoed because question-frame tokens aren't in
  // STOPWORDS (they're ask-intent verbs). Once another verb has won the
  // slot they should fall off the target tail.
  it('strips a trailing "where" from an investigate target', () => {
    const r = parseInput('examine compass where');
    expect(r.intent).toBe('investigate');
    expect(r.target).toBe('compass');
  });

  it('strips "how" / "why" / "what" from the target tail', () => {
    expect(parseInput('look at the door how').target).toBe('door');
    expect(parseInput('search the rubble why').target).toBe('rubble');
    expect(parseInput('inspect the shard what').target).toBe('shard');
  });
});

describe('parseInput — combat-aware fallback suggestions', () => {
  // Playtest log: when the parser couldn't resolve a verb mid-fight, it only
  // suggested 'attack / hide / parley'. Players had no idea that 'advance',
  // 'retreat', 'dodge' were legal verbs. The fallback now exposes them so
  // the Try: bar teaches the full combat verb set. 'block' was folded into
  // 'dodge' on 2026-05-21 — the suggestion list switched accordingly.
  it('offers movement + defense verbs in fallback when enemy is present', () => {
    const r = parseInput('asdfghjkl', { enemyPresent: true });
    expect(r.intent).toBe('unknown');
    for (const v of ['attack', 'dodge', 'advance', 'retreat', 'hide', 'parley']) {
      expect(r.suggestions).toContain(v);
    }
  });

  it('does not push combat verbs when no enemy is present', () => {
    const r = parseInput('asdfghjkl', { enemyPresent: false });
    expect(r.suggestions).not.toContain('dodge');
    expect(r.suggestions).not.toContain('advance');
    expect(r.suggestions).not.toContain('retreat');
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

describe('parseInput — equip intent', () => {
  it('routes "equip the rusted blade" to equip', () => {
    expect(parseInput('equip the rusted blade').intent).toBe('equip');
  });
  it('routes "wear the patched leather" to equip', () => {
    expect(parseInput('wear the patched leather').intent).toBe('equip');
  });
  it('routes "unequip" to equip (handler distinguishes)', () => {
    expect(parseInput('unequip').intent).toBe('equip');
  });
});

describe('parseInput — ask intent for game concept questions', () => {
  it('routes "what is corruption" to ask', () => {
    expect(parseInput('what is corruption').intent).toBe('ask');
  });
  it('routes "explain burn damage" to ask', () => {
    expect(parseInput('explain burn damage').intent).toBe('ask');
  });
  it('routes "tell me about the aether" to ask', () => {
    expect(parseInput('tell me about the aether').intent).toBe('ask');
  });
});

describe('parseInput — fuzzy match strictness for short words', () => {
  it('does not fuzzy-match "dead" to "read" (investigate) — question, not action', () => {
    // "am i dead?" was routing to investigate intent because dead and read
    // are distance 1 and the old allowance was 1 edit at length 4.
    const r = parseInput('am i dead', {});
    expect(r.intent).not.toBe('investigate');
  });
  it('still recovers slightly-misspelled longer verbs', () => {
    expect(parseInput('serch the ruins').intent).toBe('investigate');
  });
});

describe('parseInput — normalize collapses repeated articles', () => {
  it('"search the the hum" parses the same as "search the hum"', () => {
    const a = parseInput('search the the hum');
    const b = parseInput('search the hum');
    expect(a.intent).toBe(b.intent);
    expect(a.target).toBe(b.target);
  });
  it('"a a torch" collapses to "a torch" before matching', () => {
    const a = parseInput('use a a torch');
    const b = parseInput('use a torch');
    expect(a.intent).toBe(b.intent);
  });
  it('triple repetition also collapses', () => {
    const a = parseInput('search the the the rubble');
    const b = parseInput('search the rubble');
    expect(a.target).toBe(b.target);
  });
  it('clean inputs pass through unchanged', () => {
    // Idempotency: running parser on already-clean input doesn't break it.
    const r = parseInput('search the rubble');
    expect(r.intent).toBe('investigate');
  });
});

describe('parseInput — current Location name does not become a suggestion target', () => {
  it('does not propose "use torch on <location>" when the matched noun IS the location', () => {
    // Simulate the playtest log: player input matches the current Location
    // name as the only candidate noun.
    const result = parseInput('asdfkjasdf', {
      recentNouns: [],
      currentLocationName: 'Tartarian Outskirts',
    });
    // With no matchable noun and no enemy, suggestions should be the generic
    // fallback — definitely not anything mentioning the location.
    for (const s of result.suggestions ?? []) {
      expect(s).not.toMatch(/tartarian outskirts/i);
    }
  });
  it('does propose normal "inspect X" / "use torch on X" for non-location nouns', () => {
    // Input has to share a token with the candidate noun so the parser's
    // fuzzy noun matcher resolves it. The taxonomy now requires the
    // noun to land in a real bucket (item / enemy / hook / ambient /
    // vendor) before suggestion generation runs — recentNouns alone
    // isn't enough. Aetherbat is offered as a hook noun here.
    const result = parseInput('aetherbat', {
      recentNouns: ['Aetherbat'],
      hookNouns: ['Aetherbat'],
      currentLocationName: 'Tartarian Outskirts',
      inventory: [
        {
          id: 't',
          name: 'Aetheric Torch',
          kind: 'misc',
          rarity: 'Common',
          quantity: 1,
          tags: ['light'],
        },
      ],
    });
    const allSuggestions = (result.suggestions ?? []).join(' ');
    expect(allSuggestions).toMatch(/aetherbat/i);
  });
});

describe('parser — QA regressions', () => {
  it('"leave" no longer routes to attack via cleave', () => {
    const r = parseInput('leave the market', {
      recentNouns: [],
      hookNouns: [],
      currentLocationName: 'Reclaimers Outpost',
      inventory: [],
    });
    // Prior bug: maxLen=6 (cleave) allowed 1 edit, levenshtein
    // between "leave" and "cleave" was 1, so the verb matcher picked
    // attack. With the new prepended-letter guard the match is
    // rejected; "leave" routes to travel/exit handling instead.
    expect(r.intent).not.toBe('attack');
  });

  it('multi-word synonym "snap shot" routes to quick_fire', () => {
    const r = parseInput('snap shot at the sentinel', {
      recentNouns: ['Sentinel'],
      hookNouns: [],
      currentLocationName: 'Aetherstone Spire',
      inventory: [],
    });
    expect(r.intent).toBe('quick_fire');
  });

  it('multi-word synonym "fight back" routes to fight_back', () => {
    const r = parseInput('fight back', {
      recentNouns: [],
      hookNouns: [],
      currentLocationName: 'Borderlands',
      inventory: [],
    });
    expect(r.intent).toBe('fight_back');
  });

  it('multi-word synonym "double tap" routes to multi_fire', () => {
    const r = parseInput('double tap the bandit', {
      recentNouns: ['Bandit'],
      hookNouns: [],
      currentLocationName: 'Silt Wastes',
      inventory: [],
    });
    expect(r.intent).toBe('multi_fire');
  });

  it('multi-word synonym "hand in" routes to turn_in', () => {
    const r = parseInput('hand in the contract', {
      recentNouns: [],
      hookNouns: [],
      currentLocationName: 'Reclaimers Outpost',
      inventory: [],
    });
    expect(r.intent).toBe('turn_in');
  });
});

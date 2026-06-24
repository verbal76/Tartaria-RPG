// OTA-233 — Ask the Arbiter contract.
//
// Validates the lore concept bank shape, the query-extraction prefix
// stripping, and the MiniLM-style cosine lookup against a mocked
// embedder. Production uses the real MiniLM via CognitiveOrchestrator;
// the mock here pins a deterministic similarity score per (query,
// concept) pair so we can assert the routing logic without a model.

import {
  loadLoreConceptBank,
  formatArbiterAnswer,
  _resetConceptBankCache,
} from '../app/engine/loreConceptBank';
import {
  findClosestLoreConcept,
  extractLoreQuery,
  ARBITER_SILENT_LINE,
  _resetLoreVectorCache,
} from '../app/engine/askArbiter';
import { setTableOverride } from '../app/engine/contentPack';

// engine_Dev-831 — the concept bank is now built ENTIRELY from the active lore document
// (no built-in Tartaria canon). Seed a lore doc so the bank is non-empty in tests.
const LORE_DOC = [
  { tags: ['always', 'world'], text: 'A grey, patient world picks through what the old age left behind.' },
  { tags: ['market', 'vendor', 'trade'], text: 'The market never closes; everything here has a price, including the way out.' },
  { tags: ['berlin', 'drowned', 'ruin'], text: 'The drowned districts of old Berlin still hum at night, with no one left to switch them off.' },
  { tags: ['wardens', 'order'], text: 'The Wardens hold the roads so the rest can sleep. It is thankless work.' },
];

beforeEach(() => {
  _resetLoreVectorCache();
  _resetConceptBankCache();
  setTableOverride('lore', LORE_DOC);
});
afterEach(() => setTableOverride('lore', []));

describe('engine_Dev — loreConceptBank builds from the lore document', () => {
  it('builds one lore_doc concept per passage (no built-in Tartaria canon)', () => {
    const bank = loadLoreConceptBank();
    expect(bank.length).toBe(LORE_DOC.length);
    expect(bank.every((c) => c.category === 'lore_doc')).toBe(true);
    expect(JSON.stringify(bank)).not.toMatch(/tartar|aether|reclaimer|mud dweller/i);
  });

  it('every concept has non-empty id / label / definition / searchText', () => {
    const bank = loadLoreConceptBank();
    for (const c of bank) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.definition.length).toBeGreaterThan(5);
      expect(c.searchText.length).toBeGreaterThan(10);
    }
  });

  it('concept ids are unique', () => {
    const bank = loadLoreConceptBank();
    const ids = new Set(bank.map((c) => c.id));
    expect(ids.size).toBe(bank.length);
  });

  it('cache hit on second call returns the same array reference', () => {
    _resetConceptBankCache();
    const a = loadLoreConceptBank();
    const b = loadLoreConceptBank();
    expect(a).toBe(b);
  });
});

describe('OTA-233 — extractLoreQuery strips conversational prefixes', () => {
  it.each([
    ['ask the arbiter about the great mud flood', 'the great mud flood'],
    ['ask the arbiter about mud monarchs', 'mud monarchs'],
    ['ask about aetherstone', 'aetherstone'],
    ['ask aetherstone', 'aetherstone'],
    ['what is the conflux war?', 'the conflux war'],
    ['who is king abzul', 'king abzul'],
    ['tell me about the reclaimers', 'the reclaimers'],
    ['explain the etheric rot', 'the etheric rot'],
    ['arbiter, what is the heart of tartaria?', 'the heart of tartaria'],
  ])('"%s" -> "%s"', (input, expected) => {
    expect(extractLoreQuery(input)).toBe(expected);
  });

  it('leaves a query without prefix untouched', () => {
    expect(extractLoreQuery('aetherstone')).toBe('aetherstone');
  });
});

describe('OTA-233 — findClosestLoreConcept routes through the embedder', () => {
  // The mock embedder returns a vector keyed off a phrase fingerprint.
  // We design the fingerprint so the query "great mud flood" matches
  // the Fall of Tartaria event concept's searchText vector closely
  // and everything else weakly. This pins the routing without
  // depending on a real MiniLM.
  function mkEmbedder(scoreMap: Record<string, number>) {
    const seed = (text: string): Float32Array => {
      // Map each known query/concept text to a hand-crafted 4-d vector.
      // Vectors point along an axis per "topic"; cosine of matched
      // pairs is ~1, mismatched ~0.
      const lower = text.toLowerCase();
      for (const [key, axis] of Object.entries(scoreMap)) {
        if (lower.includes(key)) {
          const v = new Float32Array(4);
          v[axis] = 1;
          return v;
        }
      }
      const v = new Float32Array(4);
      v[3] = 1; // off-axis junk
      return v;
    };
    return {
      isReady: () => true,
      embed: async (text: string) => seed(text),
    };
  }

  it('returns null when embedder is not ready', async () => {
    const stub = { isReady: () => false, embed: async () => new Float32Array(0) };
    const result = await findClosestLoreConcept('mud flood', stub);
    expect(result).toBeNull();
  });

  it('returns null on empty query', async () => {
    const stub = { isReady: () => true, embed: async () => new Float32Array([1, 0, 0, 0]) };
    const result = await findClosestLoreConcept('   ', stub);
    expect(result).toBeNull();
  });

  it('finds the right concept when query and a single concept share the topic axis', async () => {
    // Query "berlin" hits axis 0; the 1998 Berlin Betrayal event's
    // searchText contains "Berlin Betrayal" which also hits axis 0.
    const embedder = mkEmbedder({
      'berlin': 0,
      'tartary': 1,
      'mud monarchs': 2,
    });
    const result = await findClosestLoreConcept('berlin', embedder);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0.4);
    // Should resolve to the Berlin Betrayal event.
    expect(result!.concept.label.toLowerCase()).toContain('berlin');
  });

  it('returns null when no concept exceeds threshold', async () => {
    // All concepts get off-axis junk vectors.
    const embedder = {
      isReady: () => true,
      embed: async (_text: string) => {
        const v = new Float32Array(4);
        v[3] = 1;
        return v;
      },
    };
    // Query also hits axis 3 — but every concept hits axis 3 too,
    // so cosine = 1 for the FIRST concept (off-axis junk vs off-axis
    // junk). That's fine — the threshold is the actual contract.
    // Use a different axis for the query so it can't match anything.
    const oddEmbedder = {
      isReady: () => true,
      embed: async (text: string) => {
        const v = new Float32Array(4);
        // Query gets axis 0, all concepts get axis 3.
        v[text.toLowerCase() === 'foo bar baz' ? 0 : 3] = 1;
        return v;
      },
    };
    const result = await findClosestLoreConcept('foo bar baz', oddEmbedder);
    expect(result).toBeNull();
  });

  it('caches concept vectors so subsequent queries skip re-embedding', async () => {
    let embedCalls = 0;
    const embedder = {
      isReady: () => true,
      embed: async (text: string) => {
        embedCalls++;
        const v = new Float32Array(4);
        v[text.toLowerCase().includes('berlin') ? 0 : 1] = 1;
        return v;
      },
    };
    const bankSize = loadLoreConceptBank().length;
    // First query → 1 query embed + N concept embeds.
    await findClosestLoreConcept('berlin', embedder);
    const firstQueryCalls = embedCalls;
    expect(firstQueryCalls).toBeGreaterThanOrEqual(bankSize);
    // Second query → only the query embed (concepts cached).
    embedCalls = 0;
    await findClosestLoreConcept('berlin', embedder);
    expect(embedCalls).toBe(1);
  });
});

describe('engine_Dev — formatArbiterAnswer frames a lore-doc concept', () => {
  it('surfaces the passage text as a narrator recollection', () => {
    const bank = loadLoreConceptBank();
    const concept = bank[0]!;
    expect(concept.category).toBe('lore_doc');
    const line = formatArbiterAnswer(concept);
    expect(line).toMatch(/recalls/);
    expect(line).toContain(concept.definition);
  });
});

describe('OTA-233 — ARBITER_SILENT_LINE is a tight, identifiable string', () => {
  it('reads as narrator prose and mentions "lore"', () => {
    // engine_Dev — the narrator name is generic now ("Narrator" by default), so assert the
    // shape (silent + lore), not a hard-coded "Arbiter".
    expect(ARBITER_SILENT_LINE).toMatch(/silent/i);
    expect(ARBITER_SILENT_LINE).toMatch(/lore/);
  });
});

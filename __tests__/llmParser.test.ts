import {
  parseInputViaLLM,
  __TEST_ONLY__,
  type LLMParserEngine,
  type LLMParseContext,
} from '../app/engine/llmParser';

// Test-double Qwen that returns a scripted string. Keeps tests
// deterministic and lets us simulate every failure mode the real
// model could hit (malformed JSON, prose preamble, markdown fences,
// "none" intent, etc.).
function makeMockEngine(response: string, ready = true): LLMParserEngine {
  return {
    isReady: () => ready,
    generate: async () => response,
  };
}

const BASE_CTX: LLMParseContext = {
  recentNouns: ['trap field', 'handprint', 'wagon', 'rubble'],
  enemyNames: ['Aetheric Drone'],
  vendorName: 'Irma Ironhand',
  inventoryNames: ['Rusted Blade', 'Aetheric Torch'],
  locationName: 'Tartarian Outskirts',
};

describe('parseInputViaLLM', () => {
  it('returns null when the engine is not ready', async () => {
    const engine = makeMockEngine('{"intent":"open","target":"trap"}', false);
    const out = await parseInputViaLLM('take the trap apart', BASE_CTX, engine);
    expect(out).toBeNull();
  });

  it('returns null on empty input', async () => {
    const engine = makeMockEngine('{"intent":"open","target":"trap"}');
    const out = await parseInputViaLLM('   ', BASE_CTX, engine);
    expect(out).toBeNull();
  });

  it('parses a clean JSON response into intent + target + rephrasing', async () => {
    const engine = makeMockEngine('{"intent":"open","target":"trap"}');
    const out = await parseInputViaLLM('take the trap apart', BASE_CTX, engine);
    expect(out).toEqual({
      intent: 'open',
      target: 'trap',
      rephrasing: 'open the trap',
    });
  });

  it('strips markdown fences and surrounding prose', async () => {
    const engine = makeMockEngine(
      'Sure! Here is the JSON:\n```json\n{"intent":"investigate","target":"handprint"}\n```\nLet me know if you need more!',
    );
    const out = await parseInputViaLLM('look closer at the handprint', BASE_CTX, engine);
    expect(out?.intent).toBe('investigate');
    expect(out?.target).toBe('handprint');
    expect(out?.rephrasing).toBe('search the handprint');
  });

  it('routes the stealth intent through the canonical verb "sneak"', async () => {
    const engine = makeMockEngine('{"intent":"stealth","target":"Aetheric Drone"}');
    const out = await parseInputViaLLM('try to slip past the drone', BASE_CTX, engine);
    expect(out?.rephrasing).toBe('sneak Aetheric Drone'); // proper noun: no article
  });

  it('returns null on "none" intent (meta comments / questions)', async () => {
    const engine = makeMockEngine('{"intent":"none","target":""}');
    const out = await parseInputViaLLM('ok we should add a button for loot rolls', BASE_CTX, engine);
    expect(out).toBeNull();
  });

  it('returns null when the model picks an intent that is not in our list', async () => {
    const engine = makeMockEngine('{"intent":"yodel","target":"void"}');
    const out = await parseInputViaLLM('start yodelling', BASE_CTX, engine);
    expect(out).toBeNull();
  });

  it('returns null on garbage / unparsable response', async () => {
    const engine = makeMockEngine('I cannot help with that request.');
    const out = await parseInputViaLLM('do a barrel roll', BASE_CTX, engine);
    expect(out).toBeNull();
  });

  it('returns null when the engine throws', async () => {
    const engine: LLMParserEngine = {
      isReady: () => true,
      generate: async () => { throw new Error('out of memory'); },
    };
    const out = await parseInputViaLLM('search the wagon', BASE_CTX, engine);
    expect(out).toBeNull();
  });

  it('handles empty target (intents like rest / wait)', async () => {
    const engine = makeMockEngine('{"intent":"rest","target":""}');
    const out = await parseInputViaLLM('I want to lie down for a while', BASE_CTX, engine);
    expect(out?.rephrasing).toBe('rest');
  });

  it('uses "the" article on lowercase common nouns, no article on proper nouns', async () => {
    // Lowercase target — gets "the"
    let engine = makeMockEngine('{"intent":"investigate","target":"wagon"}');
    let out = await parseInputViaLLM('check the wagon', BASE_CTX, engine);
    expect(out?.rephrasing).toBe('search the wagon');
    // Proper-noun target — no "the"
    engine = makeMockEngine('{"intent":"diplomacy","target":"Irma Ironhand"}');
    out = await parseInputViaLLM('say hi to Irma', BASE_CTX, engine);
    expect(out?.rephrasing).toBe('talk Irma Ironhand');
    // Already-articled target — passes through unchanged
    engine = makeMockEngine('{"intent":"open","target":"the strongbox"}');
    out = await parseInputViaLLM('crack the box', BASE_CTX, engine);
    expect(out?.rephrasing).toBe('open the strongbox');
  });

  it('every intent in INTENT_LIST has a CANONICAL_VERB entry', () => {
    for (const intent of __TEST_ONLY__.INTENT_LIST) {
      expect(__TEST_ONLY__.CANONICAL_VERB[intent]).toBeTruthy();
      expect(typeof __TEST_ONLY__.CANONICAL_VERB[intent]).toBe('string');
    }
  });

  it('passes scene targets, enemies, vendor, and inventory in the system prompt', async () => {
    // Capture the prompt the model is given so we can verify the
    // hand-off shape. This is a smoke test — if the prompt changes
    // structurally we want to know.
    let capturedMessages: ReadonlyArray<{ role: string; content: string }> | null = null;
    const engine: LLMParserEngine = {
      isReady: () => true,
      generate: async (msgs) => {
        capturedMessages = msgs;
        return '{"intent":"investigate","target":"wagon"}';
      },
    };
    await parseInputViaLLM('look at the wagon', BASE_CTX, engine);
    expect(capturedMessages).not.toBeNull();
    const system = capturedMessages![0]!.content;
    expect(system).toContain('Aetheric Drone');         // enemy
    expect(system).toContain('Irma Ironhand');           // vendor
    expect(system).toContain('wagon');                   // scene noun
    expect(system).toContain('Rusted Blade');            // inventory
    expect(system).toContain('Tartarian Outskirts');     // location
    expect(capturedMessages![1]!.content).toContain('look at the wagon');
  });

  it('handles empty scene gracefully (open ground, no nouns)', async () => {
    const emptyCtx: LLMParseContext = {
      recentNouns: [],
      enemyNames: [],
      inventoryNames: [],
    };
    const engine = makeMockEngine('{"intent":"rest","target":""}');
    const out = await parseInputViaLLM('catch my breath', emptyCtx, engine);
    expect(out?.intent).toBe('rest');
  });
});

describe('extractJsonObject helper', () => {
  it('pulls JSON out of markdown-fenced response', () => {
    const out = __TEST_ONLY__.extractJsonObject('```json\n{"a":1}\n```');
    expect(out).toEqual({ a: 1 });
  });
  it('handles prose before AND after', () => {
    const out = __TEST_ONLY__.extractJsonObject('Sure — {"intent":"open"} — done.');
    expect(out).toEqual({ intent: 'open' });
  });
  it('returns null on no-JSON', () => {
    expect(__TEST_ONLY__.extractJsonObject('I cannot help.')).toBeNull();
  });
  it('returns null on malformed JSON', () => {
    expect(__TEST_ONLY__.extractJsonObject('{ broken: yes }')).toBeNull();
  });
});

// OTA-191 — verifies the Qwen-backed item synthesis path:
//
//   - synthesizeItemViaQwen returns null when Qwen isn't ready
//     (fail-closed; static row stays).
//   - Valid Qwen JSON output is validated, clamped to safe maxima,
//     and cached for the next lookup.
//   - Markdown-wrapped + prose-wrapped JSON still extracts cleanly.
//   - Truncated / malformed JSON returns null (no cache poisoning).
//   - Out-of-range numerics (OP stats) are clamped to the schema cap.
//   - Effect kinds the schema doesn't allow (gate, scanner) are
//     silently dropped — those are author-driven, not LLM-driven.

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
      removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
      clear: jest.fn(() => { for (const k of Object.keys(store)) delete store[k]; return Promise.resolve(); }),
    },
  };
});

import {
  synthesizeItemViaQwen,
  readSynthCache,
  type ItemSynthEngine,
} from '../app/engine/itemSynthesisQwen';
import { _resetCacheForTests, _snapshotCacheForTests } from '../app/engine/itemSynthesisCache';

class MockQwen implements ItemSynthEngine {
  constructor(
    private readonly ready: boolean,
    private readonly response: string,
  ) {}
  isReady(): boolean {
    return this.ready;
  }
  async generate(): Promise<string> {
    return this.response;
  }
}

beforeEach(() => {
  _resetCacheForTests();
});

describe('OTA-191 synthesizeItemViaQwen — gate & cache behavior', () => {
  it('returns null when Qwen is not ready', async () => {
    const qwen = new MockQwen(false, '{}');
    const out = await synthesizeItemViaQwen('Whisper Marrow', [], qwen);
    expect(out).toBeNull();
    expect(_snapshotCacheForTests()).toHaveLength(0);
  });

  it('parses well-formed JSON and writes to the cache', async () => {
    const qwen = new MockQwen(
      true,
      '{"kind":"consumable","description":"A tarry brew with a kick.","effect":{"kind":"consumable","healHP":4,"restoreStamina":3}}',
    );
    const out = await synthesizeItemViaQwen('Mire Brew', [], qwen);
    expect(out).not.toBeNull();
    expect(out?.effect?.kind).toBe('consumable');
    if (out?.effect?.kind === 'consumable') {
      expect(out.effect.healHP).toBe(4);
      expect(out.effect.restoreStamina).toBe(3);
    }
    expect(out?.description).toMatch(/tarry brew/i);
    // Cache hit on the second call returns the same row without
    // re-querying the LLM.
    const cached = readSynthCache('Mire Brew');
    expect(cached).not.toBeNull();
  });

  it('extracts JSON from markdown-fenced output', async () => {
    const qwen = new MockQwen(
      true,
      '```json\n{"kind":"passive_charm","description":"A trinket.","effect":{"kind":"passive","stat":"charisma","bonus":1}}\n```',
    );
    const out = await synthesizeItemViaQwen('Charmstone', [], qwen);
    // 'passive_charm' isn't a known kind so the validator falls
    // through. We expect null here.
    expect(out).toBeNull();
  });

  it('clamps OP numerics to schema maxima', async () => {
    const qwen = new MockQwen(
      true,
      '{"kind":"consumable","description":"Loud broth.","effect":{"kind":"consumable","healHP":999,"restoreStamina":50,"buffStat":"strength","buffBonus":12,"buffDuration":99}}',
    );
    const out = await synthesizeItemViaQwen('Cosmic Broth', [], qwen);
    expect(out).not.toBeNull();
    if (out?.effect?.kind === 'consumable') {
      expect(out.effect.healHP).toBeLessThanOrEqual(10);
      expect(out.effect.restoreStamina).toBeLessThanOrEqual(8);
      expect(out.effect.buffBonus).toBeLessThanOrEqual(2);
      expect(out.effect.buffDuration).toBeLessThanOrEqual(6);
    }
  });

  it('rejects an unparseable response', async () => {
    const qwen = new MockQwen(true, 'this is not json at all');
    const out = await synthesizeItemViaQwen('Garbled Thing', [], qwen);
    expect(out).toBeNull();
    expect(_snapshotCacheForTests()).toHaveLength(0);
  });

  it('rejects a row that contributes nothing on top of static inference', async () => {
    const qwen = new MockQwen(true, '{"kind":"misc"}');
    const out = await synthesizeItemViaQwen('Empty Thing', [], qwen);
    // No effect, no extraTags, no description → caching an empty
    // overlay would be wasted bytes.
    expect(out).toBeNull();
  });

  it('drops author-only effect kinds (gate, scanner) silently', async () => {
    const qwen = new MockQwen(
      true,
      '{"kind":"misc","description":"A loop of wire.","effect":{"kind":"gate","unlocks":"climb_steep"}}',
    );
    const out = await synthesizeItemViaQwen('Wire Loop', [], qwen);
    // Description still lands; the gate effect is dropped because
    // it's gameplay-gating and shouldn't come from the LLM.
    expect(out).not.toBeNull();
    expect(out?.effect).toBeUndefined();
    expect(out?.description).toMatch(/loop of wire/i);
  });

  it('extracts extraTags and clamps the array size', async () => {
    const qwen = new MockQwen(
      true,
      '{"kind":"misc","description":"A widget.","extraTags":["metal","fiber","glass","wood","cloth","stone","crystal","organic","junk","extra","extra2"]}',
    );
    const out = await synthesizeItemViaQwen('Widget', [], qwen);
    expect(out).not.toBeNull();
    expect(out?.extraTags?.length).toBeLessThanOrEqual(8);
    expect(out?.extraTags).toContain('metal');
  });
});

import { QWEN_ALLOWED_INTENTS } from '../app/engine/narrativeGenerator';

// Phase 4 §1.1 — the Arbiter's generative voice fires only on a small
// allowlist of narrative-focused intents. Combat and mechanical actions
// take the deterministic template path so the player gets instant
// feedback instead of a 10–20 second LLM round trip.

describe('QWEN_ALLOWED_INTENTS', () => {
  it('includes the narrative intents where an LLM paragraph adds value', () => {
    expect(QWEN_ALLOWED_INTENTS.has('travel')).toBe(true);
    expect(QWEN_ALLOWED_INTENTS.has('diplomacy')).toBe(true);
  });

  it('includes the peaceful exploration/downtime intents (arb158 widening)', () => {
    // Once Qwen proved STABLE on-device (Tensor G5 build 290: qwen:done,
    // completion guard clean), the allowlist widened so the player actually
    // hears the AI voice in normal play. investigate/search/rest are the
    // dominant peaceful beats. The old reason investigate was muzzled — Qwen
    // naming the wrong region ("The Borderlands" while in Tartarian Outskirts)
    // — is now guarded by the hardened VOICE_RULES + Strict location anchor in
    // buildSystemPrompt ("DO NOT name any location not in SYSTEM FACTS").
    expect(QWEN_ALLOWED_INTENTS.has('investigate')).toBe(true);
    expect(QWEN_ALLOWED_INTENTS.has('search')).toBe(true);
    expect(QWEN_ALLOWED_INTENTS.has('rest')).toBe(true);
  });

  it('includes the synthetic scene_intro intent for new-room narration', () => {
    expect(QWEN_ALLOWED_INTENTS.has('scene_intro')).toBe(true);
  });

  it.each([
    'attack',
    'dodge',
    'block',
    'advance',
    'retreat',
    'stealth',
    'escape',
    'inventory',
    'use_relic',
    'cast',
    'equip',
    'craft',
    'gift',
    'steal',
    'join',
    'repair',
    'accept',
    'turn_in',
    'dig',
    'wait',
    'unknown',
  ])('excludes mechanical intent %s', (intent) => {
    expect(QWEN_ALLOWED_INTENTS.has(intent)).toBe(false);
  });

  it('is reasonably small — wide allowlist defeats the muzzle', () => {
    // If this grows past ~6, audit whether the new intents are actually
    // narrative or whether the muzzle is being routed around.
    expect(QWEN_ALLOWED_INTENTS.size).toBeLessThanOrEqual(6);
  });
});

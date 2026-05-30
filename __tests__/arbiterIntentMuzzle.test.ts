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

  it('excludes investigate — Qwen hallucinated location names on look/search', () => {
    // Playtest log: typing "look" produced a four-sentence paragraph about
    // "The Borderlands, a twisted shadowy landscape..." while the player
    // was in Tartarian Outskirts. Investigate now takes the deterministic
    // template path so the model can't drift the scene name.
    expect(QWEN_ALLOWED_INTENTS.has('investigate')).toBe(false);
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
    'rest',
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

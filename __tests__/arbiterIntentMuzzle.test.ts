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

  it('no longer routes the per-action peaceful beats through reactive Qwen (arb163)', () => {
    // arb158 widened the allowlist to investigate/search/rest so the player
    // would hear the AI voice in normal play — but on the slow v8_2 kernel a
    // reactive line takes ~6-8s and the NEXT action cancels it before it
    // finishes, so it almost never completed AND felt late. arb163 reverts the
    // widening: these beats are carried by instant canned templates, and the AI
    // voice now comes from UNPROMPTED ambient lines (maybeGenerateAmbientArbiter)
    // that aren't tied to an action, so latency stops mattering.
    expect(QWEN_ALLOWED_INTENTS.has('investigate')).toBe(false);
    expect(QWEN_ALLOWED_INTENTS.has('search')).toBe(false);
    expect(QWEN_ALLOWED_INTENTS.has('rest')).toBe(false);
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

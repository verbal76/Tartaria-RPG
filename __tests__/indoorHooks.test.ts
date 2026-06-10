// OTA-418 — interior hook pool. 15 indoor leads, partitioned from the outdoor
// sightings so neither lands in the wrong context (candle-in-a-house →
// giant-on-a-ridgeline). Each must plant cleanly and resolve to a done stage.

import {
  INDOOR_HOOK_KINDS,
  pickRandomIndoorHookKind,
  pickRandomHookKind,
  plantHookByKind,
  getHookOutcome,
  type HookKind,
} from '../app/engine/hooks';

describe('OTA-418 — indoor hooks', () => {
  it('defines exactly 15 interior hook kinds', () => {
    expect(INDOOR_HOOK_KINDS.size).toBe(15);
  });

  it('the indoor picker only ever returns interior kinds', () => {
    for (let i = 0; i < 500; i++) {
      expect(INDOOR_HOOK_KINDS.has(pickRandomIndoorHookKind())).toBe(true);
    }
  });

  it('the outdoor picker never returns an interior kind', () => {
    for (let i = 0; i < 500; i++) {
      expect(INDOOR_HOOK_KINDS.has(pickRandomHookKind())).toBe(false);
    }
  });

  it('every interior kind plants with a line + nouns and resolves to a done stage', () => {
    for (const kind of INDOOR_HOOK_KINDS as Set<HookKind>) {
      const hook = plantHookByKind(kind);
      expect(hook.kind).toBe(kind);
      expect(hook.plantedLine.length).toBeGreaterThan(10);
      expect(hook.nouns.length).toBeGreaterThan(0);
      // The chain has a stage 0 and a final stage flagged done.
      expect(getHookOutcome(kind, 0)).not.toBeNull();
      let stage = 0;
      while (getHookOutcome(kind, stage + 1) !== null) stage++;
      expect(getHookOutcome(kind, stage)?.done).toBe(true);
    }
  });
});

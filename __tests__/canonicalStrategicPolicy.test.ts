// Strategic repair — Phase 12. Focused regression for
// test-utils/canonical/strategicPolicy.ts: proves the two new
// between-encounter gates (HP-aware recovery, retreat-on-a-bad-trip) fire
// only when warranted, are bounded (no infinite rest loop), and that
// everything else still delegates, UNCHANGED, to policy.ts's own decide().

import {
  shouldRecoverBeforeContinuing,
  shouldRetreatToSafety,
  decideBetweenEncounters,
  EMPTY_STRATEGIC_MEMORY,
  type StrategicMemory,
} from '../test-utils/canonical/strategicPolicy';
import { decide, EMPTY_MEMORY } from '../test-utils/canonical/policy';
import type { PlayerView } from '../test-utils/canonical/playerView';

function view(hp: number, hpMax = 34): PlayerView {
  return { hp, hpMax, hpDelta: null, dead: false } as unknown as PlayerView;
}

describe('Strategic repair — HP-aware travel recovery (shouldRecoverBeforeContinuing)', () => {
  it('a healthy traveler does not rest', () => {
    const r = shouldRecoverBeforeContinuing(view(32), EMPTY_STRATEGIC_MEMORY);
    expect(r.rest).toBe(false);
  });

  it('a badly injured traveler considers recovery', () => {
    const r = shouldRecoverBeforeContinuing(view(10), EMPTY_STRATEGIC_MEMORY);
    expect(r.rest).toBe(true);
  });

  it('recovery stops at the readiness threshold, not only at full HP (bounded, not "always heal to 100%")', () => {
    const almostFull = shouldRecoverBeforeContinuing(view(30), EMPTY_STRATEGIC_MEMORY); // 30/34 ≈ 0.88 ≥ 0.85
    expect(almostFull.rest).toBe(false);
    const stillLow = shouldRecoverBeforeContinuing(view(20), EMPTY_STRATEGIC_MEMORY); // 20/34 ≈ 0.59 < 0.85 but ≥ 0.5
    expect(stillLow.rest).toBe(false); // below readiness but not below the recover-worth trigger
  });

  it('refuses after MAX_CONSECUTIVE_RESTS — no infinite rest loop', () => {
    const memory: StrategicMemory = { ...EMPTY_STRATEGIC_MEMORY, consecutiveRestsThisStop: 3 };
    const r = shouldRecoverBeforeContinuing(view(10), memory);
    expect(r.rest).toBe(false);
  });

  it('rest ambush risk is not hidden — a just-ambushed rest is not reflexively repeated', () => {
    const memory: StrategicMemory = { ...EMPTY_STRATEGIC_MEMORY, lastRestWasAmbushed: true };
    const r = shouldRecoverBeforeContinuing(view(10), memory);
    expect(r.rest).toBe(false);
  });
});

describe('Strategic repair — retreat to safety (shouldRetreatToSafety)', () => {
  it('one minor scrape does not trigger a strategic retreat', () => {
    const memory: StrategicMemory = { ...EMPTY_STRATEGIC_MEMORY, severeDangerEventsThisTrip: 1 };
    const r = shouldRetreatToSafety(view(28), memory);
    expect(r.retreat).toBe(false);
  });

  it('a repeated pattern of severe danger triggers retreat', () => {
    const memory: StrategicMemory = { ...EMPTY_STRATEGIC_MEMORY, severeDangerEventsThisTrip: 2 };
    const r = shouldRetreatToSafety(view(28), memory);
    expect(r.retreat).toBe(true);
  });

  it('wilderness rest visibly failing to restore this Tartarian also triggers retreat', () => {
    const memory: StrategicMemory = { ...EMPTY_STRATEGIC_MEMORY, consecutiveRestsThisStop: 3 };
    const r = shouldRetreatToSafety(view(10), memory);
    expect(r.retreat).toBe(true);
  });
});

describe('Strategic repair — decideBetweenEncounters wrapper', () => {
  it('retreat takes priority over recovery when both conditions are met', () => {
    const memory: StrategicMemory = { ...EMPTY_STRATEGIC_MEMORY, severeDangerEventsThisTrip: 2 };
    const options = [
      { id: 'rest', category: 'guardian-prep' as const, label: 'rest' },
      { id: 'retreat-to-hub', category: 'survive-retreat' as const, label: 'retreat to hub' },
    ];
    const d = decideBetweenEncounters(view(10), options, EMPTY_MEMORY, memory);
    expect(d.optionId).toBe('retreat-to-hub');
  });

  it('delegates unchanged to policy.ts decide() when neither new gate fires — identical decision for identical inputs', () => {
    const options = [{ id: 'continue', category: 'journey' as const, label: '→ DESTINATION' }];
    const wrapped = decideBetweenEncounters(view(32), options, EMPTY_MEMORY, EMPTY_STRATEGIC_MEMORY);
    const direct = decide(view(32), options, EMPTY_MEMORY);
    expect(wrapped).toEqual(direct);
  });

  it('offers rest (not present as a bare id) gracefully falls through to decide() when no "rest" option exists', () => {
    const options = [{ id: 'continue', category: 'journey' as const, label: '→ DESTINATION' }];
    const d = decideBetweenEncounters(view(5), options, EMPTY_MEMORY, EMPTY_STRATEGIC_MEMORY);
    expect(d.optionId).toBe('continue');
  });
});

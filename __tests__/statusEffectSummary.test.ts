import { formatEffectSummary } from '../app/engine/statusEffects';
import type { StatusEffect } from '../app/engine/types';

describe('formatEffectSummary — compact HUD line', () => {
  it('hides the sentinel round count for stamina-gated tired / exhausted', () => {
    // tickPlayerStaminaStatuses stamps these with remainingRounds: 99 as a
    // "never expires on a timer" sentinel — they clear when stamina recovers,
    // so the count is meaningless and must not leak to the HUD.
    const tired: StatusEffect = { kind: 'tired', remainingRounds: 99, label: 'tired' };
    const exhausted: StatusEffect = { kind: 'exhausted', remainingRounds: 99, label: 'exhausted' };
    expect(formatEffectSummary([tired])).toBe('tired');
    expect(formatEffectSummary([exhausted])).toBe('exhausted');
  });

  it('keeps the round count for genuinely timed effects', () => {
    const bleed: StatusEffect = { kind: 'bleed', remainingRounds: 3, label: 'bleeding' };
    expect(formatEffectSummary([bleed])).toBe('bleeding (3r)');
  });

  it('mixes both kinds in one summary', () => {
    const effects: StatusEffect[] = [
      { kind: 'tired', remainingRounds: 99, label: 'tired' },
      { kind: 'bleed', remainingRounds: 2, label: 'bleeding' },
    ];
    expect(formatEffectSummary(effects)).toBe('tired, bleeding (2r)');
  });
});

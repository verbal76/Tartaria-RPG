// engine_Dev — staminaMax is now an author-grantable perk: a piece of GEAR or an
// active custom TITLE can carry a statBonus { stat: 'staminaMax', amount } that
// raises the player's max-stamina cap (and the displayed max), mirroring how 'hp'
// works. Covers the gear sum, the title sum, and the combined display value.

import {
  displayStaminaMax,
  gearStaminaMaxBonus,
  bonusStaminaMaxFor,
} from '../app/engine/equipment';
import { setCustomTitlesOverride, setTableOverride, clearAllOverrides } from '../app/engine/contentPack';
import type { PlayerCharacter } from '../app/engine/types';

const basePlayer = (over: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ staminaMax: 12, equipped: {}, earnedTitles: [], ...over } as unknown as PlayerCharacter);

describe('engine_Dev — staminaMax as a gear + title perk', () => {
  afterEach(() => clearAllOverrides());

  it('with no bonuses, displayStaminaMax equals the stored base', () => {
    expect(bonusStaminaMaxFor(basePlayer())).toBe(0);
    expect(displayStaminaMax(basePlayer())).toBe(12);
  });

  it('an active custom TITLE perk { stat: staminaMax } raises the cap', () => {
    setCustomTitlesOverride([
      { id: 'ox', name: 'The Ox', track: 'enemiesDefeated', threshold: 1, perk: { stat: 'staminaMax', amount: 5 } },
    ] as never);
    const earned = basePlayer({ earnedTitles: ['ox'] } as Partial<PlayerCharacter>);
    expect(bonusStaminaMaxFor(earned)).toBe(5);
    expect(displayStaminaMax(earned)).toBe(17);
    // Not yet earned → no bonus.
    expect(bonusStaminaMaxFor(basePlayer())).toBe(0);
  });

  it('a GEAR statBonus { stat: staminaMax } raises the cap while equipped', () => {
    setTableOverride('armor', [
      { name: 'Endurance Vest', slot: 'chest', kind: 'armor', acBonus: 1, statBonuses: [{ stat: 'staminaMax', amount: 4 }] },
    ] as never);
    expect(gearStaminaMaxBonus('Endurance Vest')).toBe(4);
    const wearing = basePlayer({ equipped: { chest: 'Endurance Vest' } } as Partial<PlayerCharacter>);
    expect(displayStaminaMax(wearing)).toBe(16);
  });

  it('gear + title stack', () => {
    setTableOverride('armor', [
      { name: 'Endurance Vest', slot: 'chest', kind: 'armor', acBonus: 1, statBonuses: [{ stat: 'staminaMax', amount: 4 }] },
    ] as never);
    setCustomTitlesOverride([
      { id: 'ox', name: 'The Ox', track: 'enemiesDefeated', threshold: 1, perk: { stat: 'staminaMax', amount: 5 } },
    ] as never);
    const p = basePlayer({ equipped: { chest: 'Endurance Vest' }, earnedTitles: ['ox'] } as Partial<PlayerCharacter>);
    expect(displayStaminaMax(p)).toBe(12 + 4 + 5);
  });
});

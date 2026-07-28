// OTA-764/765 — coatings are tri-modal (coat weapon / coat armor / drink), but a
// coating is DRINKABLE only when its element has a player-side counter. Corruption
// cleanses corruption, poison/burn/electrical purge their status; acid has no player
// ailment so it is coat-only (not drinkable). Pre-764 the drink route swallowed a
// tonic for a blank no-op — the bug the player hit dosing Corruption Tonic.

import {
  coatingDrinkRemedy,
  isCoatingDrinkable,
  coatingElementFromTags,
  coatingItemDrinkable,
} from '../app/engine/coatingRemedy';
import type { PlayerCharacter, StatusEffect } from '../app/engine/types';

const player = (over: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ hp: 50, hpMax: 100, corruption: 23, statusEffects: [], ...over } as PlayerCharacter);

const status = (kind: string): StatusEffect =>
  ({ kind, remainingRounds: 3, label: kind } as unknown as StatusEffect);

describe('OTA-765 — which coatings are drinkable', () => {
  it('corruption / poison / burn / electrical are drinkable; acid is NOT', () => {
    expect(isCoatingDrinkable('corruption')).toBe(true);
    expect(isCoatingDrinkable('poison')).toBe(true);
    expect(isCoatingDrinkable('burn')).toBe(true);
    expect(isCoatingDrinkable('electrical')).toBe(true);
    expect(isCoatingDrinkable('acid')).toBe(false);
    expect(isCoatingDrinkable('hamster')).toBe(false); // any element with no counter
  });

  it('reads the coating element off item tags', () => {
    expect(coatingElementFromTags(['potion', 'weapon_coating', 'acid', 'crafted'])).toBe('acid');
    expect(coatingElementFromTags(['potion', 'weapon_coating', 'corruption'])).toBe('corruption');
    expect(coatingElementFromTags(['food', 'foraged'])).toBeNull();
  });

  it('coatingItemDrinkable: acid coating hides the drink; corruption coating keeps it; non-coating unaffected', () => {
    expect(coatingItemDrinkable({ tags: ['weapon_coating', 'acid'] })).toBe(false);
    expect(coatingItemDrinkable({ tags: ['weapon_coating', 'corruption'] })).toBe(true);
    expect(coatingItemDrinkable({ tags: ['healing', 'crafted'] })).toBe(true); // not a coating
  });

  it('drinking an acid coating is a no-op remedy (caller refuses; nothing spent)', () => {
    const r = coatingDrinkRemedy(player({ hp: 50, corruption: 23 }), 'acid', 'Rare');
    expect(r.messages).toEqual([]);
    expect(r.player.hp).toBe(50);         // no salve
    expect(r.player.corruption).toBe(23); // unchanged
  });
});

describe('OTA-764 — drinkable coating remedies', () => {
  it('a corruption coating reduces corruption (Rare -6) and clamps at 0', () => {
    expect(coatingDrinkRemedy(player({ corruption: 23 }), 'corruption', 'Rare').corruptionAfter).toBe(17);
    expect(coatingDrinkRemedy(player({ corruption: 2 }), 'corruption', 'Rare').corruptionAfter).toBe(0);
  });

  it('scales with rarity (Common -4, Legendary -8)', () => {
    expect(coatingDrinkRemedy(player({ corruption: 30 }), 'corruption', 'Common').corruptionAfter).toBe(26);
    expect(coatingDrinkRemedy(player({ corruption: 30 }), 'corruption', 'Legendary').corruptionAfter).toBe(22);
  });

  it('a poison coating purges only the poisoned status', () => {
    const r = coatingDrinkRemedy(player({ statusEffects: [status('poisoned'), status('bleed')] }), 'poison', 'Uncommon');
    expect(r.player.statusEffects?.some((s) => s.kind === 'poisoned')).toBe(false);
    expect(r.player.statusEffects?.some((s) => s.kind === 'bleed')).toBe(true);
  });

  it('burn soothes burn_scar; electrical clears stun/paralyzed', () => {
    expect(coatingDrinkRemedy(player({ statusEffects: [status('burn_scar')] }), 'burn', 'Common')
      .player.statusEffects?.some((s) => s.kind === 'burn_scar')).toBe(false);
    expect(coatingDrinkRemedy(player({ statusEffects: [status('stun'), status('paralyzed')] }), 'electrical', 'Common')
      .player.statusEffects?.length).toBe(0);
  });

  it('a drinkable coating also gives a small salve heal (capped)', () => {
    expect(coatingDrinkRemedy(player({ hp: 50, hpMax: 100 }), 'corruption', 'Rare').player.hp).toBe(53);
    expect(coatingDrinkRemedy(player({ hp: 100, hpMax: 100 }), 'corruption', 'Rare').player.hp).toBe(100);
  });
});

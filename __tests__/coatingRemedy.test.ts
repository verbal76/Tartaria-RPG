// OTA-745 — drinking a weapon coating acts as a "physical counter, like a medicine":
// each coating counters its own element (corruption cleanse, poison/burn/electrical
// status purge) plus a small salve heal. Pre-fix the drink route swallowed the tonic
// for a blank no-op — the bug the player hit dosing Corruption Tonic on their own 23
// corruption.

import { coatingDrinkRemedy } from '../app/engine/coatingRemedy';
import type { PlayerCharacter, StatusEffect } from '../app/engine/types';

const player = (over: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ hp: 50, hpMax: 100, corruption: 23, statusEffects: [], ...over } as PlayerCharacter);

const status = (kind: string): StatusEffect =>
  ({ kind, remainingRounds: 3, label: kind } as unknown as StatusEffect);

describe('OTA-745 — coating drink remedy', () => {
  it('a corruption coating reduces corruption (Rare → -6) and does not go negative', () => {
    const r = coatingDrinkRemedy(player({ corruption: 23 }), 'corruption', 'Rare');
    expect(r.corruptionAfter).toBe(23 - 6);
    expect(r.messages).toContain('-6 corruption');
    const low = coatingDrinkRemedy(player({ corruption: 2 }), 'corruption', 'Rare');
    expect(low.corruptionAfter).toBe(0); // clamped
  });

  it('scales with rarity (Common -4, Legendary -8)', () => {
    expect(coatingDrinkRemedy(player({ corruption: 30 }), 'corruption', 'Common').corruptionAfter).toBe(26);
    expect(coatingDrinkRemedy(player({ corruption: 30 }), 'corruption', 'Legendary').corruptionAfter).toBe(22);
  });

  it('a poison coating purges the poisoned status', () => {
    const r = coatingDrinkRemedy(player({ statusEffects: [status('poisoned'), status('bleed')] }), 'poison', 'Uncommon');
    expect(r.player.statusEffects?.some((s) => s.kind === 'poisoned')).toBe(false);
    expect(r.player.statusEffects?.some((s) => s.kind === 'bleed')).toBe(true); // untouched
    expect(r.messages).toContain('poison purged');
  });

  it('a burn coating soothes burn_scar; electrical clears stun/paralyzed', () => {
    expect(coatingDrinkRemedy(player({ statusEffects: [status('burn_scar')] }), 'burn', 'Common')
      .player.statusEffects?.some((s) => s.kind === 'burn_scar')).toBe(false);
    const e = coatingDrinkRemedy(player({ statusEffects: [status('stun'), status('paralyzed')] }), 'electrical', 'Common');
    expect(e.player.statusEffects?.length).toBe(0);
  });

  it('every coating gives a small salve heal (capped at max HP)', () => {
    const r = coatingDrinkRemedy(player({ hp: 50, hpMax: 100 }), 'acid', 'Rare');
    expect(r.player.hp).toBe(50 + Math.ceil(6 / 2)); // +3
    const full = coatingDrinkRemedy(player({ hp: 100, hpMax: 100 }), 'acid', 'Rare');
    expect(full.player.hp).toBe(100); // no overheal
  });
});

// OTA-1171 (SA-4) — the catalog's apex enemies (28 Legendary-rarity foes, 8
// boss-flagged story bosses) spawned at a FIXED 240-700 HP no matter the player.
// Player damage is weapon-driven and stat-independent (combatRules gates the
// attack stat to to-hit, never the damage roll), so a fixed apex is a flat
// 30-55 round slog for a weak arrival and a trivial chip for an over-geared one.
// scaleStaticBoss re-centers HP on the player BOTH ways while raising THREAT
// (AC/attack) UP ONLY. The two context scalers now route bosses through it.

import {
  scaleStaticBoss,
  scaledEnemyForContext,
  enemyScalePower,
  STATIC_SCALED_TRAIT,
} from '../app/engine/encounter';
import type { Enemy } from '../app/engine/types';

const storyBoss = (): Enemy =>
  ({ name: 'Iron Worm', type: 'boss', abilityPoint: 'Strength 12', attack: 'Coiling Crush', damage: '4d6', hp: 700, rarity: 'Legendary', boss: true, loot: [], traits: [] } as unknown as Enemy);
const legendary = (): Enemy =>
  ({ name: 'Storm Walker', type: 'brute', abilityPoint: 'Strength 10', attack: 'Slam', damage: '3d6', hp: 240, rarity: 'Legendary', loot: [], traits: [] } as unknown as Enemy);
const common = (): Enemy =>
  ({ name: 'Gutter Rat', type: 'vermin', abilityPoint: 'Dexterity 2', attack: 'Bite', damage: '1d4', hp: 12, rarity: 'Common', loot: [], traits: [] } as unknown as Enemy);

const apNum = (e: Enemy) => parseInt(String(e.abilityPoint).match(/(\d+)/)?.[1] ?? '0', 10);

const FRESH = enemyScalePower(9, 30);     // ≈ 12 → under the curve
const ENDGAME = enemyScalePower(30, 130); // ≈ 43 → maxed

describe('OTA-1171 — static apex scaling', () => {
  it('shrinks a story boss for a weak player (the sponge fix), floored at 0.8x', () => {
    const out = scaleStaticBoss(FRESH, storyBoss());
    expect(out.hp).toBeLessThan(700);
    expect(out.hp).toBeGreaterThanOrEqual(Math.round(700 * 0.8));
  });

  it('does NOT raise a boss threat when scaling DOWN (tedium fix, not a spike)', () => {
    const out = scaleStaticBoss(FRESH, storyBoss());
    expect(apNum(out)).toBe(12);
    expect(out.damage).toBe('4d6');
  });

  it('grows a story boss AND threat for an over-leveled player, capped at 1.4x', () => {
    const out = scaleStaticBoss(ENDGAME, storyBoss());
    expect(out.hp).toBeGreaterThan(700);
    expect(out.hp).toBeLessThanOrEqual(Math.round(700 * 1.4));
    expect(apNum(out)).toBeGreaterThan(12);
  });

  it('scales a Legendary two-sided on a wider band (0.6-1.6)', () => {
    const weak = scaleStaticBoss(FRESH, legendary());
    const strong = scaleStaticBoss(ENDGAME, legendary());
    expect(weak.hp).toBeGreaterThanOrEqual(Math.round(240 * 0.6));
    expect(weak.hp).toBeLessThan(240);
    expect(strong.hp).toBeLessThanOrEqual(Math.round(240 * 1.6));
    expect(strong.hp).toBeGreaterThan(240);
  });

  it('leaves non-apex enemies alone', () => {
    const out = scaleStaticBoss(ENDGAME, common());
    expect(out.hp).toBe(12);
    expect(out.traits ?? []).not.toContain(STATIC_SCALED_TRAIT);
  });

  it('is idempotent — a second pass never double-scales', () => {
    const once = scaleStaticBoss(ENDGAME, storyBoss());
    const twice = scaleStaticBoss(ENDGAME, once);
    expect(twice).toBe(once);
  });

  it('never re-scales a hunt target', () => {
    const h = { ...storyBoss(), name: 'Iron Worm (hunted)' } as Enemy;
    expect(scaleStaticBoss(ENDGAME, h).hp).toBe(700);
  });

  it('the context scaler routes story bosses through it instead of skipping them', () => {
    const weak = scaledEnemyForContext(storyBoss(), 0, FRESH);
    const strong = scaledEnemyForContext(storyBoss(), 0, ENDGAME);
    expect(weak.hp).toBeLessThan(700);
    expect(strong.hp).toBeGreaterThan(700);
  });
});

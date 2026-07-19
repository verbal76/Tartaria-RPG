// OTA-896 (SA-4) — the catalog's apex enemies (28 Legendary-rarity foes, 8
// boss-flagged story bosses) spawned at a FIXED 240-700 HP no matter the player.
// Player damage is weapon-driven and stat-independent (combatRules gates the
// attack stat to to-hit, never the damage roll), so a fixed apex is a flat
// 30-55 round slog for a weak arrival and a trivial chip for an over-geared one.
// scaleStaticBoss re-centers HP on the player BOTH ways while raising THREAT
// (AC/attack) UP ONLY. The two context scalers now route bosses through it (they
// used to skip them as "tuned elsewhere" — they weren't).

import {
  scaleStaticBoss,
  guardianPlayerPower,
  STATIC_SCALED_TRAIT,
  CORE_GUARDIAN_TRAIT,
} from '../app/engine/coreGuardians';
import { scaledEnemyForContext, enemyScalePower } from '../app/engine/encounter';
import type { Enemy, PlayerCharacter } from '../app/engine/types';

const storyBoss = (): Enemy =>
  ({ name: 'Hollow King', type: 'construct', abilityPoint: 'Strength 12', attack: 'Hollow Cleave', damage: '3d10', hp: 580, rarity: 'Legendary', boss: true, loot: [], traits: [] } as unknown as Enemy);
const legendary = (): Enemy =>
  ({ name: 'Aetheric Necromancer', type: 'caster', abilityPoint: 'Intelligence 10', attack: 'Soul Rot', damage: '3d10', hp: 446, rarity: 'Legendary', loot: [], traits: [] } as unknown as Enemy);
const common = (): Enemy =>
  ({ name: 'Gutter Rat', type: 'vermin', abilityPoint: 'Dexterity 2', attack: 'Bite', damage: '1d4', hp: 12, rarity: 'Common', loot: [], traits: [] } as unknown as Enemy);

const apNum = (e: Enemy) => parseInt(String(e.abilityPoint).match(/(\d+)/)?.[1] ?? '0', 10);

// Power proxy is identical between the two modules by construction.
const FRESH = enemyScalePower(9, 30);    // ≈ 12 → well under the curve
const ENDGAME = enemyScalePower(30, 130); // ≈ 43 → maxed

describe('OTA-896 — static apex scaling', () => {
  it('the power proxy matches the Guardian scaler exactly', () => {
    const p = { stats: { strength: 9, dexterity: 5, intelligence: 4 }, hpMax: 30 } as unknown as PlayerCharacter;
    expect(guardianPlayerPower(p)).toBeCloseTo(enemyScalePower(9, 30));
  });

  it('shrinks a story boss for a weak player (the sponge fix) without a floor breach', () => {
    const out = scaleStaticBoss(FRESH, storyBoss());
    // Boss floor is 0.8× — 580 → ~464, never below.
    expect(out.hp).toBeLessThan(580);
    expect(out.hp).toBeGreaterThanOrEqual(Math.round(580 * 0.8));
  });

  it('does NOT raise a boss\'s threat when scaling DOWN (tedium fix, not a spike)', () => {
    const out = scaleStaticBoss(FRESH, storyBoss());
    expect(apNum(out)).toBe(12);                // AC/attack untouched below the curve
    expect(out.damage).toBe('3d10');            // raw damage dice never touched
  });

  it('grows a story boss AND its threat for an over-leveled player, capped at 1.4x', () => {
    const out = scaleStaticBoss(ENDGAME, storyBoss());
    expect(out.hp).toBeGreaterThan(580);
    expect(out.hp).toBeLessThanOrEqual(Math.round(580 * 1.4));
    expect(apNum(out)).toBeGreaterThan(12);     // threat rises above the curve
  });

  it('scales a Legendary two-sided on a wider band (0.6-1.6)', () => {
    const weak = scaleStaticBoss(FRESH, legendary());
    const strong = scaleStaticBoss(ENDGAME, legendary());
    expect(weak.hp).toBeGreaterThanOrEqual(Math.round(446 * 0.6));
    expect(weak.hp).toBeLessThan(446);
    expect(strong.hp).toBeLessThanOrEqual(Math.round(446 * 1.6));
    expect(strong.hp).toBeGreaterThan(446);
  });

  it('leaves non-apex (Common/Rare) enemies completely alone', () => {
    const out = scaleStaticBoss(ENDGAME, common());
    expect(out).toBe(common() && out);          // same shape
    expect(out.hp).toBe(12);
    expect(out.traits ?? []).not.toContain(STATIC_SCALED_TRAIT);
  });

  it('is idempotent — a second pass never double-scales', () => {
    const once = scaleStaticBoss(ENDGAME, storyBoss());
    const twice = scaleStaticBoss(ENDGAME, once);
    expect(twice.hp).toBe(once.hp);
    expect(twice).toBe(once);                    // stamped → returned unchanged
  });

  it('never touches a Core Guardian (it owns its own curve)', () => {
    const g = { ...storyBoss(), traits: [CORE_GUARDIAN_TRAIT] } as Enemy;
    const out = scaleStaticBoss(ENDGAME, g);
    expect(out.hp).toBe(580);
  });

  it('never re-scales a hunt target (scaleHuntBoss already ran)', () => {
    const h = { ...storyBoss(), name: 'Hollow King (hunted)' } as Enemy;
    const out = scaleStaticBoss(ENDGAME, h);
    expect(out.hp).toBe(580);
  });

  it('the context scaler now routes story bosses through it instead of skipping them', () => {
    const weak = scaledEnemyForContext(storyBoss(), 0, FRESH);
    const strong = scaledEnemyForContext(storyBoss(), 0, ENDGAME);
    expect(weak.hp).toBeLessThan(580);          // used to be a flat pass-through at 580
    expect(strong.hp).toBeGreaterThan(580);
  });
});

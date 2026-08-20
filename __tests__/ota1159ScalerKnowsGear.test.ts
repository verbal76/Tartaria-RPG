// OTA-1159 — THE DIFFICULTY SCALER KNOWS WHAT YOU ARE WEARING AND SWINGING.
//
// Owner, deciding the third of the four design calls OTA-1156 held: his AC went
// 20 → 26 and the difficulty did not move. It could not — `enemyScalePower` was
// `bestCombatStat + hpMax / 10` and AC was not an input at all, nor was weapon
// damage. `powerRating.playerPowerScore`, the number shown on the player's own
// sheet, is `bestStat + damage + AC + hp/10`. Two answers to "how strong is this
// character", and the one the player SAW counted their armour while the one that
// SET THE DIFFICULTY did not.
//
// ⚠ The two things this suite is really guarding:
//   1. a fresh arrival is EXACTLY unchanged — the header's "low level is still low
//      level" promise is load-bearing and the new terms must not touch it;
//   2. nothing saturates `overLevelT`. RAW AC is the same magnitude as the entire
//      old formula, so an unscaled term would pin every armoured character at max
//      difficulty. That is the failure mode this design exists to avoid, and it is
//      invisible in play until a tester reports "everything is suddenly brutal".

// ⚠ OTA-1400 — SLICE 9 sent contracts and the mission board into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — what a pin on THE STORE has meant since slice 4.
import { storeSource } from '../test-utils/storeSource';
import {
  enemyScalePower, gearPowerTerm,
  AC_POWER_BASELINE, DMG_POWER_BASELINE, GEAR_POWER_DIVISOR, GEAR_POWER_BLEND,
} from '../app/engine/encounter';

import * as fs from 'fs';
import * as path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/** The scaler's own over-level term, mirrored — it is module-private by design. */
const overLevelT = (power: number): number =>
  Math.max(0, Math.min(1, (power - 14) / 18));

describe('OTA-1159 — gear reaches the difficulty curve', () => {
  it('AC now moves the number, which is the whole complaint', () => {
    const before = enemyScalePower(16, 60, { ac: 20, avgWeaponDamage: 7 });
    const after = enemyScalePower(16, 60, { ac: 26, avgWeaponDamage: 7 });
    expect(after).toBeGreaterThan(before);
    // and it used to move it by exactly nothing
    expect(enemyScalePower(16, 60)).toBe(enemyScalePower(16, 60));
    expect(after - enemyScalePower(16, 60)).toBeGreaterThan(0);
  });

  it('weapon damage moves it too — the other half of the farming loophole', () => {
    const club = enemyScalePower(12, 40, { ac: 14, avgWeaponDamage: 3.5 });
    const legendary = enemyScalePower(12, 40, { ac: 14, avgWeaponDamage: 15 });
    expect(legendary).toBeGreaterThan(club);
  });
});

describe('OTA-1159 — a fresh arrival is untouched, by construction', () => {
  it('gear at or below the baselines contributes exactly zero', () => {
    expect(gearPowerTerm(AC_POWER_BASELINE, DMG_POWER_BASELINE)).toBe(0);
    // the lowest racial base AC (mud golem, 8) and the unarmed proxy (2)
    expect(gearPowerTerm(8, 2)).toBe(0);
    // ⚠ clamped, not negative — gear must never make the world EASIER than authored
    expect(gearPowerTerm(0, 0)).toBe(0);
  });

  it('a fresh arrival scores identically before and after', () => {
    // 24 HP, best stat 10, racial AC 10, unarmed.
    expect(enemyScalePower(10, 24, { ac: 10, avgWeaponDamage: 2 }))
      .toBe(enemyScalePower(10, 24));
    expect(overLevelT(enemyScalePower(10, 24, { ac: 10, avgWeaponDamage: 2 }))).toBe(0);
  });

  it('omitting gear reproduces the old formula exactly', () => {
    // The optional argument is what keeps the blast radius to opted-in callers.
    for (const [stat, hp] of [[10, 24], [14, 45], [18, 90]] as const) {
      expect(enemyScalePower(stat, hp)).toBe(stat + hp / 10);
    }
  });
});

describe('OTA-1159 — nothing saturates the curve', () => {
  it('even a fully fused end-game build stays under the ceiling', () => {
    // ⚠ THE FAILURE MODE. Adding RAW AC (10-26) to a formula whose whole range is
    // 14-32 pins overLevelT at 1 for anybody in armour. If this ever hits 1.0 the
    // scaling has stopped responding to the player and is just always-max.
    const fused = enemyScalePower(18, 90, { ac: 26, avgWeaponDamage: 15 });
    expect(overLevelT(fused)).toBeLessThan(1);
    expect(overLevelT(fused)).toBeGreaterThan(0.8);
  });

  it('the gear terms stay inside the band the HP term occupies', () => {
    // hpMax/10 runs ~2.4 (fresh) to ~9 (end-game). Each gear term is built to sit
    // in 0-4 so neither survivability axis drowns the other.
    const acOnly = gearPowerTerm(26, DMG_POWER_BASELINE) / GEAR_POWER_BLEND;
    const dmgOnly = gearPowerTerm(AC_POWER_BASELINE, 19) / GEAR_POWER_BLEND;
    expect(acOnly).toBeLessThanOrEqual(4);
    expect(dmgOnly).toBeLessThanOrEqual(4);
    expect(GEAR_POWER_DIVISOR).toBe(4);
  });

  it('the blend ships at half, and it is the single dial', () => {
    // ⚠ Deliberately not 1.0 — the curve moves once, visibly, and gets read off a
    // device log before we commit to full weight. If a later session wants full
    // weight that is this constant and nothing else.
    expect(GEAR_POWER_BLEND).toBe(0.5);
    const half = gearPowerTerm(26, 15);
    // full weight is exactly double, so the dial is linear and predictable
    expect(half * 2).toBeCloseTo(
      (26 - AC_POWER_BASELINE) / GEAR_POWER_DIVISOR + (15 - DMG_POWER_BASELINE) / GEAR_POWER_DIVISOR,
      10,
    );
  });
});

describe('OTA-1159 — one place builds a scale power', () => {
  const STORE = storeSource();

  it('every spawner routes through scalePowerOf', () => {
    // SEVEN call sites each hand-rolled the formula, which is exactly how the AC
    // term stayed missing: there was nowhere to add it once.
    expect(STORE).toContain('function scalePowerOf(player: PlayerCharacter): number {');
    // ⚠ The real claim: the store calls `enemyScalePower` in exactly ONE place, and
    // that place is `scalePowerOf`. Counting the old inline SHAPE was the wrong proxy
    // — the defensive rewrite lifted `Math.max(...)` onto its own `const base` line,
    // so the shape vanished and a count-of-1 assertion failed on a refactor that
    // changed nothing about the property being guarded. Assert the property.
    // ⚠ Comments stripped first — `scalePowerOf`'s own docblock QUOTES the old call
    // shape to explain what it replaced, and a raw file match counts that as a second
    // caller. Prose about code is not code.
    const codeOnly = STORE
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    const calls = codeOnly.match(/[^.\w]enemyScalePower\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(STORE).toContain('return enemyScalePower(base, player.hpMax, gear);');
    // ⚠ WAS 8 (seven spawners + the helper's own declaration). OTA-1167 routed an EIGHTH
    // spawner through it — `scaleHuntBoss`, which had been scaling on `hpMax` alone and
    // was the one this OTA missed. A RISING count here is this test's claim getting
    // STRONGER: "every spawner routes through scalePowerOf" is more true than it was.
    // If it ever DROPS, a spawner has gone back to rolling its own measure.
    const uses = STORE.match(/scalePowerOf\(/g) ?? [];
    expect(uses.length).toBe(9);
  });

  it('AC comes from standingAc, not a third re-derivation', () => {
    // ⚠ OTA-1133 exists because two surfaces disagreed about what the player's AC
    // was. Spelling it a third time inside the difficulty curve would rebuild that
    // bug somewhere nobody would look for it.
    expect(STORE).toContain('ac: standingAc(player)');
    expect(STORE).toContain('avgWeaponDamage: avgDamageNotation(weapon?.damageDice)');
  });

  it('⚠ reading gear can never throw a spawn away', () => {
    // `getEquippedWeapon` does `for (const it of player.inventory)` with NO guard, so
    // a player object without an inventory raises "player.inventory is not iterable".
    // Several spawn paths call scalePowerOf from inside a try/catch that swallows —
    // so an uncaught throw here does not surface as an error, it surfaces as an
    // encounter that silently never happens. A difficulty PROXY that can delete a
    // fight is a worse bug than the one this OTA fixes. Verified by probe 2026-08-07.
    expect(STORE).toContain('  } catch {\n    // degrade to the authored curve; never let gear inspection kill a spawn\n  }');
    // ⚠ and the fallback must be the BASELINES — which make gearPowerTerm exactly 0,
    // i.e. the pre-OTA-1159 number. If we cannot see the gear we scale as though there
    // is none, rather than inventing difficulty from a guess.
    // ⚠ OTA-1171 RETARGETED THIS, IT DID NOT WEAKEN IT. The line gained `tierBlend` when
    // the difficulty tier learned to weight the gear terms. The CLAIM is unchanged — the
    // two baselines are still the fallback — and it is now asserted more tightly than
    // before: the fallback must read exactly 0 AT EVERY TIER WEIGHT, which is the
    // property the original assertion was really protecting.
    expect(STORE).toContain('let gear = { ac: AC_POWER_BASELINE, avgWeaponDamage: DMG_POWER_BASELINE, tierBlend };');
    expect(gearPowerTerm(AC_POWER_BASELINE, DMG_POWER_BASELINE)).toBe(0);
    for (const blend of [0, 0.5, 1, 1.5, 2]) {
      expect(gearPowerTerm(AC_POWER_BASELINE, DMG_POWER_BASELINE, blend)).toBe(0);
    }
  });

  it('the damage proxy is the same one the Power gauge uses', () => {
    // So the difficulty curve and the number on the sheet price a weapon alike.
    expect(STORE).toContain("from '../engine/powerRating'");
    expect(read('app', 'engine', 'powerRating.ts')).toContain('export function avgDamageNotation');
  });
});

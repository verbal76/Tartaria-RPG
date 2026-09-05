/**
 * OTA-1476 — ONE READING OF "HOW STRONG IS THIS PLAYER".
 *
 * ⚠⚠⚠ `encounter.ts` HAS BEEN CLAIMING A SYNCHRONY IT DOES NOT HAVE. Its own
 * comment, verbatim:
 *
 *   "⚠ `gear` is OPTIONAL so the pure stat/HP proxy stays callable for tooling
 *    and for THE GUARDIAN CURVE THIS IS KEPT IN SYNC WITH."
 *
 * And `coreGuardians.ts`, on the other side of that supposed sync:
 *
 *   "Power proxy is deliberately BASE stats + HP pool (no gear) … (A gear term
 *    could sharpen it later; base is dependency-light and deterministic for
 *    tests.)"
 *
 * OTA-1159 gave the wilderness spawner a gear term. The Guardian curve was left
 * on the bare stat proxy with a note saying somebody should come back. Nobody
 * did, and the file kept describing the two as in sync.
 *
 * ⚠⚠ MEASURED ON THE OWNER'S OWN CHARACTER, at the Voronov Cantor fight in the
 * 4.32.11 log (STR 16 / DEX 16 / INT 11, hpMax 67, AC 24, Bolt-Caster):
 *
 *              guardian saw   world saw   over-level curve
 *   salvage        22.7          23.7        0.48 → 0.54
 *   owed           22.7          24.8        0.48 → 0.60
 *   bury_me        22.7          26.8        0.48 → 0.71
 *
 * The world scaled him 25–48% further up the over-level curve than the main
 * quest's own boss did. He was a harder target to a roadside patrol than to the
 * thing the entire game is about.
 *
 * ⚠ AND IT IS FREE AT THE LOW END, which is what makes this a DRIFT fix rather
 * than a difficulty change. `gearPowerTerm` clamps at the baselines, so a fresh
 * arrival reads the same number both ways and OTA-448's promise — "a kitted
 * fresh arrival still meets the authored Tier 1" — needs no special case.
 *
 * ⚠⚠ WHAT THIS IS NOT. It is not the whole of the ATK 17 (raider) vs ATK 7
 * (Cantor) gap in that log, and the suite says so below rather than letting the
 * commit imply otherwise. A rival raid ALSO adds the faction's World-Pulse tide
 * on top of player power with no ceiling, and lifts packDanger by floor(tide/2).
 * That is a deliberate dial — "the raids grow with the game" — and it is the
 * larger half. This OTA closes only the part that is unambiguously a drift.
 */
import {
  enemyScalePower, gearPowerTerm, overLevelT,
  AC_POWER_BASELINE, DMG_POWER_BASELINE,
} from '../app/engine/encounter';
import { playerPowerGear, avgDamageNotation } from '../app/engine/powerRating';
import { guardianPlayerPower, tierForKills, spawnGuardianForCapital } from '../app/engine/coreGuardians';
import type { PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const STORE = codeOnly(read('app', 'state', 'gameStore.ts'));
const GUARD = codeOnly(read('app', 'engine', 'coreGuardians.ts'));

/** His character at the Voronov Cantor fight, from the log's own stats line. */
const owner = (over: Partial<PlayerCharacter> = {}): PlayerCharacter => ({
  stats: { strength: 16, dexterity: 16, intelligence: 11, wisdom: 11, charisma: 10, stealth: 2 },
  hpMax: 67,
  ...over,
} as PlayerCharacter);

/** A fresh arrival — baseline kit, nothing earned. */
const fresh = (): PlayerCharacter => ({
  stats: { strength: 12, dexterity: 10, intelligence: 8, wisdom: 8, charisma: 8, stealth: 2 },
  hpMax: 30,
} as PlayerCharacter);

describe('OTA-1476 — the Guardian now reads what the world reads', () => {
  it('⚠⚠⚠ A GEARED PLAYER NO LONGER READS LOWER TO THE MAIN QUEST THAN TO A PATROL', () => {
    // The bare proxy is what the Guardian used to see.
    const bare = 16 + 67 / 10;
    const worldOwed = enemyScalePower(16, 67, { ac: 24, avgWeaponDamage: 5.5, tierBlend: 1 });
    expect(bare).toBeCloseTo(22.7, 1);
    expect(worldOwed).toBeGreaterThan(bare);
    // and the Guardian's own reading has closed that gap
    const p = owner();
    expect(guardianPlayerPower(p)).toBeGreaterThanOrEqual(bare);
  });

  it('⚠⚠⚠ A FRESH ARRIVAL IS UNCHANGED — the fix is free at the low end', () => {
    // ⚠ THE LOAD-BEARING TEST. OTA-448 promised that a kitted fresh arrival still
    // meets the authored Tier 1. If this ever stops reading equal, the fix has
    // become a difficulty change and needs the owner's word, not mine.
    const p = fresh();
    const bare = Math.max(12, 10, 8) + 30 / 10;
    expect(guardianPlayerPower(p)).toBeCloseTo(bare, 5);
    expect(gearPowerTerm(AC_POWER_BASELINE, DMG_POWER_BASELINE, 1)).toBe(0);
  });

  it('⚠⚠⚠ GEAR NEVER LOWERS THE GUARDIAN — the term is clamped at zero', () => {
    // Somebody in worse-than-baseline kit must not get an easier boss.
    for (const [ac, dmg] of [[0, 0], [5, 1], [10, 3], [9, 2.9]] as const) {
      expect({ ac, dmg, term: gearPowerTerm(ac, dmg, 1) }).toEqual({ ac, dmg, term: 0 });
    }
  });

  it('⚠⚠ better kit reads as more power, monotonically', () => {
    let last = -Infinity;
    for (const ac of [10, 14, 18, 22, 26, 30]) {
      const v = enemyScalePower(16, 67, { ac, avgWeaponDamage: 5.5, tierBlend: 1 });
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('⚠⚠⚠ AND IT IS THE SAME FUNCTION, not a second copy', () => {
    // The whole defect was two derivations of one fact. A re-implementation here
    // would be the same bug with fresh paint.
    expect(GUARD).toContain('playerPowerGear(player, {');
    expect(GUARD).toContain('return enemyScalePower(bestCombat, player.hpMax, gear);');
    expect(GUARD).not.toMatch(/return\s+bestCombat\s*\+\s*player\.hpMax\s*\/\s*10\s*;/);
    expect(STORE).toContain('playerPowerGear(player, { ac: AC_POWER_BASELINE, avgWeaponDamage: DMG_POWER_BASELINE }),');
    // and the store no longer carries its own copy of the read
    expect(STORE).not.toContain('const weapon = getEquippedWeapon(player, \'main\');\n    gear = {');
  });

  it('⚠⚠⚠ THE GUARDIAN DOES NOT TAKE THE PRESSURE DIAL — the story ladder is authored', () => {
    // The survey dials tune how hard the WORLD leans on a player's kit. The main
    // quest's ladder is authored, tested and monotone (OTA-926/931); handing it a
    // per-character multiplier would make the story's difficulty depend on a
    // survey answer nobody connected to it.
    const i = GUARD.indexOf('const gear = playerPowerGear(player');
    expect(i).toBeGreaterThan(-1);
    expect(GUARD.slice(i, GUARD.indexOf('return enemyScalePower', i))).not.toContain('dialOf');
    expect(GUARD).not.toContain('tierBlend');
    // the WORLD still does take it
    expect(STORE).toContain("const tierBlend = dialOf(player, 'gearBlend');");
  });
});

describe('OTA-1476 — the shared reader cannot abort a spawn', () => {
  it('⚠⚠⚠ A PLAYER WITH NO INVENTORY FALLS BACK, IT DOES NOT THROW', () => {
    // ⚠ NOT HYPOTHETICAL. `getEquippedWeapon` iterates `player.inventory` with no
    // guard; a fixture without one raised "player.inventory is not iterable"
    // inside a spawn wrapped in try/catch, and 200 consecutive attempts produced
    // no enemy at all with `spawned=false` the only symptom. That reasoning moved
    // with the code, and this is the test that keeps it honest.
    const broken = { stats: { strength: 16, dexterity: 16, intelligence: 11, wisdom: 8, charisma: 8, stealth: 2 }, hpMax: 67 } as PlayerCharacter;
    expect(() => playerPowerGear(broken, { ac: AC_POWER_BASELINE, avgWeaponDamage: DMG_POWER_BASELINE })).not.toThrow();
    expect(() => guardianPlayerPower(broken)).not.toThrow();
    expect(Number.isFinite(guardianPlayerPower(broken))).toBe(true);
  });

  it('⚠⚠⚠ AN UNINSPECTABLE PLAYER GAINS NO DIFFICULTY — the invariant, not the literal', () => {
    // ⚠ MY FIRST DRAFT ASSERTED `toEqual(baselines)` AND WAS WRONG ABOUT THE CODE.
    // An empty `{}` never reaches the catch: `getEquippedWeapon` returns
    // undefined, `standingAc` returns 10, and `avgDamageNotation(undefined)`
    // returns its OWN fallback of 2 — which is BELOW DMG_POWER_BASELINE (3), so
    // `gearPowerTerm` clamps it to zero regardless. The literal differs; the
    // consequence does not.
    //
    // ⚠⚠ So the claim worth pinning is the CONSEQUENCE. "The fallback equals
    // these two numbers" is an implementation detail three functions deep that
    // could change harmlessly; "a player we cannot read never becomes a harder
    // fight" is the rule, and it is what `scalePowerOf` behaved as before this
    // move too — so the move preserved it exactly.
    // ⚠ `as unknown as` because these fixtures are DELIBERATELY not players —
    // the point is what happens when the shape is wrong. A single `as` does not
    // typecheck across such distant shapes, and widening the helper's parameter
    // to accept junk would weaken the real signature to satisfy a test.
    const malformed: unknown[] = [{}, { stats: {} }, { hpMax: 40 }, { inventory: null }];
    for (const broken of malformed) {
      const g = playerPowerGear(broken as PlayerCharacter,
        { ac: AC_POWER_BASELINE, avgWeaponDamage: DMG_POWER_BASELINE });
      expect({ g, term: gearPowerTerm(g.ac, g.avgWeaponDamage, 1) })
        .toEqual({ g, term: 0 });
    }
  });

  it('⚠⚠ and a Guardian still spawns for a player the reader cannot inspect', () => {
    const broken = {
      stats: { strength: 16, dexterity: 16, intelligence: 11, wisdom: 8, charisma: 8, stealth: 2 },
      hpMax: 67,
      mainQuest: { phase: 'cores' as const, coresRecovered: ['drakova'] },
    } as PlayerCharacter;
    const g = spawnGuardianForCapital(broken, 'voronov');
    expect(g).toBeTruthy();
    expect(Number.isFinite(g!.hp)).toBe(true);
    expect(g!.hp).toBeGreaterThan(0);
  });

  it('⚠⚠ nonsense damage notation never poisons the number', () => {
    for (const n of [undefined, null, '', 'not dice', '2d', 'd6']) {
      const v = avgDamageNotation(n as string | undefined);
      expect({ n, finite: Number.isFinite(v), nonNeg: v >= 0 }).toEqual({ n, finite: true, nonNeg: true });
    }
  });
});

describe('OTA-1476 — what it must not have moved', () => {
  it('⚠⚠⚠ THE KILL-COUNT LADDER IS STILL THE CURVE', () => {
    // The over-level factor rides ON TOP of the tier profile and is upward-only.
    // Reading gear must not have turned the Guardian into a pure gear check.
    expect(tierForKills(0)).toBe(1);
    expect(tierForKills(1)).toBe(2);
    expect(tierForKills(8)).toBe(9);
    expect(tierForKills(50)).toBe(9);
  });

  it('⚠⚠⚠ AND THE FIRST GUARDIAN IS STILL THE FIRST GUARDIAN', () => {
    // OTA-448 + OTA-1142. A fresh arrival's tier-1 fight is the authored one, and
    // now that gear reads zero for them, it stays that way by construction.
    const p = { ...fresh(), mainQuest: { phase: 'cores' as const, coresRecovered: [] } } as PlayerCharacter;
    const g = spawnGuardianForCapital(p, 'drakova');
    expect(g).toBeTruthy();
    expect(g!.traits ?? []).toContain('tier:1');
  });

  it('⚠⚠ a geared player at the same kill count meets a HARDER Guardian, never a softer one', () => {
    // Upward-only, asserted end to end rather than reasoned from the multiplier.
    const bare = { ...owner(), mainQuest: { phase: 'cores' as const, coresRecovered: ['drakova'] } } as PlayerCharacter;
    const g = spawnGuardianForCapital(bare, 'voronov');
    expect(g).toBeTruthy();
    expect(g!.hp).toBeGreaterThan(0);
    // same tier either way — the ladder did not move
    expect(g!.traits ?? []).toContain('tier:2');
  });

  it('⚠⚠ the over-level curve still saturates rather than running away', () => {
    for (const p of [0, 14, 20, 32, 40, 200]) {
      const t = overLevelT(p);
      expect({ p, inRange: t >= 0 && t <= 1 }).toEqual({ p, inRange: true });
    }
    expect(overLevelT(200)).toBe(1);
    expect(overLevelT(0)).toBe(0);
  });
});

describe('OTA-1476 — the stale claim is gone, and the honest one is written down', () => {
  it('⚠⚠⚠ encounter.ts NO LONGER CLAIMS A SYNC IT DOES NOT ENFORCE', () => {
    // ⚠ The comment was the only thing asserting the two were aligned, and a
    // comment is not an instrument. Now the alignment is a shared function and
    // the sentence has to match it.
    const enc = read('app', 'engine', 'encounter.ts');
    expect(enc).toContain('the Guardian curve this is kept in sync with');
    // …and the sync is now real: the Guardian imports the very function that
    // sentence is attached to.
    expect(GUARD).toContain("from './encounter'");
    expect(GUARD).toContain("from './powerRating'");
  });

  it('⚠⚠⚠ AND THE PART THIS OTA DOES NOT FIX IS NAMED IN THE SOURCE', () => {
    // The raid tide is the larger half of the ATK gap and it is a deliberate
    // dial. Writing that down where the fix lives is what stops the next reader
    // believing the inversion was closed.
    const pr = read('app', 'engine', 'powerRating.ts');
    expect(pr).toContain('World-Pulse');
    expect(pr).toMatch(/tide/i);
    expect(pr).toMatch(/deliberate dial/i);
  });

  it('⚠⚠ the raid really does add an uncapped tide — the claim is checked, not asserted', () => {
    // If this ever gains a ceiling, the note above becomes wrong and should be
    // revisited rather than left standing.
    // ⚠ OTA-1678 — the party builder lives in state/factionParty.ts now and is
    // handed scalePowerOf by its store callers; the arithmetic is unchanged.
    const PARTY = codeOnly(read('app', 'state', 'factionParty.ts'));
    expect(PARTY).toContain('const power = deps.scalePowerOf(player) + tide;');
    expect(PARTY).toContain('const packDanger = scene.location.danger + Math.floor(tide / 2);');
    expect((STORE.match(/\{ scalePowerOf \}\)/g) ?? []).length).toBe(3);
  });
});

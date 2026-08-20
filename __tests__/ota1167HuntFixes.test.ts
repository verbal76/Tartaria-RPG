// OTA-1167 — THE HUNT SEES YOUR GEAR, AND WON'T ROUTE A CONTRACT THAT ISN'T RUNNING.
//
// Owner, on a confusing session: "I just tried to run a monster hunt and for some reason
// it routed me to asgadar and I ended up fighting a freaking core guardian and I didn't
// understand why I never got a monster… then I looked and the mission was never activated
// so I never actually went to that hunt… then I hit activate, then auto route, and I went
// that one space and fought the world's tiniest monster at 15 HP. for the hunts scaling
// the monsters, it's like when you take the level one side quest once you've already beat
// the game and just breathe on the enemy and they die."
//
// ⚠ A CORRECTION TO THE REPORT, ON THE RECORD: the 15 HP creature was almost certainly
// NOT a hunt boss. The weakest of the 18 hunt targets is the Silt Serpent at 30 base HP;
// most sit between 100 and 360 (Iron Titan). What he fought was an ordinary wild
// encounter on the way to the objective. The scaling defect below is real, but it is a
// DIFFERENT defect than the anecdote suggested, and the fix is sized to the real one.

jest.setTimeout(20000);

// ⚠ OTA-1400 — SLICE 9 sent contracts and the mission board into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — what a pin on THE STORE has meant since slice 4.
import { storeSource } from '../test-utils/storeSource';
import {
  scaleHuntBoss, HUNT_HP_CEILING, HUNT_DAMAGE_STEP_T, findHuntById,
} from '../app/engine/hunts';
import { overLevelT, enemyScalePower } from '../app/engine/encounter';
import type { PlayerCharacter } from '../app/engine/types';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const CONTRACTS = read('app', 'screens', 'ContractsScreen.tsx');
const STORE = storeSource();

// ⚠ hunts.json is WRAPPED (`{_description, hunts}`) while enemies.json is a bare array.
// The first draft assumed both were arrays and the suite failed to load at all.
const HUNTS = (JSON.parse(read('app', 'data', 'quests', 'hunts.json')) as { hunts: Array<{ id: string; targetEnemyName: string }> }).hunts;
const ENEMIES = JSON.parse(read('app', 'data', 'enemies', 'enemies.json')) as Array<{ name: string; hp: number }>;

const DEF = findHuntById(HUNTS[0]!.id)!;
const BASE_HP = ENEMIES.find((e) => e.name === DEF.targetEnemyName)!.hp;

const mkPlayer = (hpMax: number): PlayerCharacter => ({
  hpMax, hp: hpMax,
  stats: { strength: 12, dexterity: 12, intelligence: 12 },
} as unknown as PlayerCharacter);

describe('OTA-1167 — the report, corrected against the data', () => {
  it('⚠ NO HUNT TARGET IS ANYWHERE NEAR 15 HP', () => {
    // So a 15 HP kill was a wild encounter, not the contract's quarry. Pinned so the
    // anecdote cannot be re-used later as evidence that bosses spawn tiny.
    const targets = HUNTS.map((h) => ENEMIES.find((e) => e.name === h.targetEnemyName)?.hp ?? 0);
    expect(targets.length).toBeGreaterThan(0);
    expect(Math.min(...targets)).toBeGreaterThanOrEqual(30);
  });
});

describe('OTA-1167 — the boss finally reads the whole character', () => {
  it('⚠ THE OLD CURVE DID NOTHING AT ALL BELOW 30 MAX HP', () => {
    // hpFactor = min(1.6, max(1.0, hpMax/30)) — at the owner's 29 that is exactly 1.0.
    // Reproduced here through the legacy path (no `power` argument).
    const legacy = scaleHuntBoss(mkPlayer(29), DEF)!;
    expect(legacy.hp).toBe(BASE_HP);
  });

  it('⚠ AND IT WAS BLIND TO GEAR — two characters, same HP, same boss', () => {
    const a = scaleHuntBoss(mkPlayer(29), DEF)!;
    const b = scaleHuntBoss(mkPlayer(29), DEF)!;
    expect(a.hp).toBe(b.hp);
    // With the real measure, the SAME max HP but better gear yields a bigger boss.
    const weak = scaleHuntBoss(mkPlayer(29), DEF, enemyScalePower(12, 29, { ac: 10, avgWeaponDamage: 3 }))!;
    const kitted = scaleHuntBoss(mkPlayer(29), DEF, enemyScalePower(12, 29, { ac: 26, avgWeaponDamage: 14 }))!;
    expect(kitted.hp).toBeGreaterThan(weak.hp);
  });

  it('scales along the SHARED over-level curve, not a private one', () => {
    const power = enemyScalePower(16, 60, { ac: 20, avgWeaponDamage: 10 });
    const t = overLevelT(power);
    const boss = scaleHuntBoss(mkPlayer(60), DEF, power)!;
    expect(boss.hp).toBe(Math.round(BASE_HP * (1 + t * (HUNT_HP_CEILING - 1))));
  });

  it('⚠ A FRESH ARRIVAL IS NOT MADE HARDER — the floor is exactly base', () => {
    // overLevelT clamps at 0, so gear can never make the world easier OR the authored
    // fight harder than it was for someone starting out.
    const fresh = scaleHuntBoss(mkPlayer(24), DEF, 0)!;
    expect(fresh.hp).toBe(BASE_HP);
  });

  it('and the ceiling holds at full over-level', () => {
    const maxed = scaleHuntBoss(mkPlayer(80), DEF, 999)!;
    expect(maxed.hp).toBe(Math.round(BASE_HP * HUNT_HP_CEILING));
    expect(HUNT_HP_CEILING).toBeGreaterThan(1.6); // the old effective cap
  });

  it('the damage step is over-level, not a raw HP threshold', () => {
    // ⚠ `hpMax > 50` meant a heavily-armoured 40 HP character never met it no matter what
    // they were swinging. Now it reads the same power term as everything else.
    const under = scaleHuntBoss(mkPlayer(40), DEF, 14)!;   // t = 0
    const over = scaleHuntBoss(mkPlayer(40), DEF, 999)!;   // t = 1
    expect(overLevelT(14)).toBeLessThan(HUNT_DAMAGE_STEP_T);
    expect(String(over.damage)).not.toBe(String(under.damage));
  });

  it('omitting power keeps the legacy curve, so no caller is silently changed', () => {
    expect(scaleHuntBoss(mkPlayer(80), DEF)!.hp).toBe(Math.round(BASE_HP * 1.6));
  });

  it('a hunt whose target is missing from the catalogue returns null, not a crash', () => {
    expect(scaleHuntBoss(mkPlayer(30), { ...DEF, targetEnemyName: 'No Such Beast' }, 20)).toBeNull();
  });

  it('the store passes the guarded power measure', () => {
    // ⚠ OTA-1400 — SLICE 9. The call reads `deps.X(...)` now, because a slice
    // reaches a store helper by INJECTION. That is not a looser pin: the deps
    // object is typed `typeof Store.X`, so the compiler guarantees it is the
    // same function — the prefix is the proof of the wiring, not a hole in it.
    expect(STORE).toContain('scaleHuntBoss(player, hunt, deps.scalePowerOf(player))');
  });
});

describe('OTA-1167 — two lines that were lying about the clock', () => {
  // ⚠ BOTH CAUGHT IN A DEVICE LOG (2026-08-08), and together they are why a contract
  // lapsed: the player budgeted a ~26h window using a rest he had been told cost 4h.
  it('⚠ THE REST REFUSAL SAID ≈4h AND REST TAKES 8', () => {
    // The parser-routed rest uses a FIXED `hours = 8`. There is no 4-hour rest anywhere.
    expect(STORE).toContain("Type 'rest' to recover (8h)");
    expect(STORE).not.toContain('recover (≈4h)');
    // Pin it against the code that decides, so the text cannot drift off again.
    expect(STORE).toContain('const hours = 8;');
  });

  it('⚠ THE COURSE BANNER CALLED EVERY TILE "A DAY"', () => {
    // A 1-tile hop announced "1 day of travel"; 23 tiles announced "23 days". A tile is
    // 0.25h on the clock and ~2.5h all-in (OTA-1162) — this was the last surface still
    // quoting the pre-1185 fiction, and a player cannot budget a window from it.
    expect(STORE).not.toMatch(/Estimated \$\{tiles\} day/);
    expect(STORE).toContain('travelHoursFor(tiles)');
  });
});

describe('OTA-1167 — a paused contract will not route you', () => {
  it('⚠ ROUTE USED TO IGNORE `tracked` ENTIRELY', () => {
    // The card said "⏸ PAUSED" two rows up while the button beneath it offered to walk
    // you there. Same defect family as OTA-1164: a control acting without the state that
    // gives it meaning.
    expect(CONTRACTS).toContain('const contractRoute = (toggleKey: string, tracked = true)');
    expect(CONTRACTS).toMatch(/if \(!tracked\) \{/);
  });

  it('every call site passes the contract’s own tracked state', () => {
    const bare = (CONTRACTS.match(/contractRoute\(key\)/g) ?? []).length;
    const wired = (CONTRACTS.match(/contractRoute\(key, tracked\)/g) ?? []).length;
    expect(bare).toBe(0);
    expect(wired).toBe(4);
  });

  it('the refusal explains itself and points at the fix', () => {
    // Not a disabled control in silence — it names the state and what to do about it.
    expect(CONTRACTS).toMatch(/Paused — activate it below before setting a course/);
  });
});

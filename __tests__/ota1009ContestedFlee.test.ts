// OTA-1009 — THE UNLOSABLE FLEE. Escape was d20 + DEX vs a flat DC 9: at DEX 8+
// the roll literally could not fail. In combat the flee is now CONTESTED — the
// fastest live pursuer's d20 + speed sets the bar (speed = bestiary AP +
// movement traits). No pursuer (traps, hook stages) keeps the flat DC, and the
// first-steps flee grace is untouched.
import * as fs from 'fs';
import * as path from 'path';
import { buildSkillSteps, escapePursuit, fleeGraceApplies } from '../app/engine/combatRules';
import type { Enemy } from '../app/engine/types';

const basePlayer = (dex: number) => ({
  name: 'Runner', raceId: 'reclaimer', hp: 20, hpMax: 20,
  stats: { strength: 5, dexterity: dex, intelligence: 5, wisdom: 5, charisma: 5, stealth: 5 },
  inventory: [], equipped: {},
}) as any;

const enemy = (over: Partial<Enemy>): Enemy => ({
  name: 'Test Foe', type: 'beast', abilityPoint: 'Strength 4', attack: '1d6',
  damage: '1d6', hp: 20, rarity: 'Common', loot: [], ...over,
} as Enemy);

describe('OTA-1009 — the flee is contested by the fastest pursuer', () => {
  it('with no pursuer the flat DC 9 stands (traps / hook-stage escapes unchanged)', () => {
    const step = buildSkillSteps('escape', basePlayer(11))[0]!;
    expect(step.target).toBe(9);
    expect(step.targetLabel).toContain('DC 9');
  });

  it('a pursuer sets the bar at its rolled d20 + speed, and the label names the chase', () => {
    const step = buildSkillSteps('escape', basePlayer(11), {
      pursuit: { bonus: 6, label: 'Mud Hound', d20: 14 },
    })[0]!;
    expect(step.target).toBe(20);
    expect(step.targetLabel).toContain('Pursuit 20 — Mud Hound');
    expect(step.context).toContain('contested chase');
  });

  it('a flee the player can LOSE exists again — the category bug is dead', () => {
    // Old world: DEX 11 → minimum total 12 vs DC 9, failure impossible.
    // New world: a fast pursuer rolling high sets a bar above the player's max.
    const step = buildSkillSteps('escape', basePlayer(11), {
      pursuit: { bonus: 14, label: 'Winged Stalker', d20: 20 },
    })[0]!;
    expect(step.target).toBe(34);
    expect(20 + (step.bonus ?? 0)).toBeLessThan(step.target ?? 0); // even a nat 20 loses this one
  });

  it('escapePursuit reads bestiary data: AP + movement traits, fastest wins, clamped', () => {
    const rat = enemy({ name: 'Mud Rat', abilityPoint: 'Dexterity 3' });
    const stalker = enemy({ name: 'Winged Stalker', abilityPoint: 'Dexterity 6', traits: ['aerial', 'quick'] });
    const titan = enemy({ name: 'Mud Titan', abilityPoint: 'Strength 9', traits: ['slow'] });
    // Stalker: 6 + aerial 3 + quick 2 = 11 — outranks the titan's 9 - 3 = 6.
    expect(escapePursuit([rat, stalker, titan])).toEqual({ bonus: 11, label: 'Winged Stalker' });
    // Slow titan alone: 9 - 3 = 6.
    expect(escapePursuit([titan])).toEqual({ bonus: 6, label: 'Mud Titan' });
    // Clamp: even a stacked speedster tops out at 14.
    const impossible = enemy({ name: 'Blur', abilityPoint: 'Dexterity 12', traits: ['quick', 'agile', 'aerial'] });
    expect(escapePursuit([impossible])!.bonus).toBe(14);
    expect(escapePursuit([])).toBeNull();
  });

  it('the first-steps flee grace still protects brand-new characters', () => {
    expect(fleeGraceApplies('escape', false, 2)).toBe(true);   // new character, failed roll → saved
    expect(fleeGraceApplies('escape', false, 10)).toBe(false); // past the grace window → roll stands
  });
});

describe('OTA-1009 — category lock: the store wires live pursuers into the escape roll', () => {
  const STORE = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const RULES = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'combatRules.ts'), 'utf8');

  it('the skill dispatch passes escapePursuit over live enemies (hp-filtered)', () => {
    // ⚠ OTA-1678 — the dispatch now reads the bar through ONE function
    // (state/fleeOdds.fleePursuitFor → engine/fleeEscalation.escalatedPursuit),
    // shared with the FLEE chip's odds. The hp filter moved with it; a
    // scripted lineup still resolves to exactly this file's `escapePursuit`.
    expect(STORE).toMatch(/pursuit: parsed\.intent === 'escape' \? fleePursuitFor\(currentScene\) : null,/);
    const ODDS = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'fleeOdds.ts'), 'utf8');
    expect(ODDS).toMatch(/return escalatedPursuit\(/);
    const ESC = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'fleeEscalation.ts'), 'utf8');
    expect(ESC).toMatch(/const hp = hps\?\.\[i\] \?\? e\.hp;\s*\n\s*if \(hp > 0\) out\.push/);
    expect(ESC).toMatch(/if \(!isUnscriptedLineup\(enemies, hps\)\) return escapePursuit\(live\.map\(\(\{ e \}\) => e\)\);/);
  });

  it('the escape step builder is pursuit-aware — the bar is no longer always the flat table DC', () => {
    expect(RULES).toMatch(/const target = pursuit \? pursuitD20 \+ pursuit\.bonus : dc;/);
    expect(RULES).toMatch(/Pursuit \$\{target\} — \$\{pursuit\.label\}/);
  });
});

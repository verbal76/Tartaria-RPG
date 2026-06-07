// Race/gear balance audit. After OTA-337 wired a pile of new race + title
// bonuses, this checks no race (on identical gear) becomes a massive outlier in
// EITHER offense (effective DPS) or survivability (effective HP), or in the
// combined power index. It's analytic + deterministic (samples the real
// buildCombatSteps so the Aetherborn +1d6 surge is captured), not a flaky sim.
import { getRaces } from '../app/engine/character';
import { buildCombatSteps } from '../app/engine/combatRules';
import { raceDamageMultiplier } from '../app/engine/raceMechanics';
import type { PlayerCharacter, Enemy } from '../app/engine/types';

// Same Aetheric weapon for everyone — so the ONLY offense differences come from
// racial stat bonuses (to-hit) + the Aetherborn aetheric +1d6 (per-hit damage).
const AETHERIC_WEAPON = 'Aetheric Greatsword';
const BASE_STAT = 10;
const BASE_HP = 40;
const ENEMY_AC = 13; // abilityPoint 8 → 5+8
const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'aetheric', 'burn', 'electrical', 'cold', 'poison'];

function mkPlayer(raceId: string, hpBonus: number): PlayerCharacter {
  return {
    raceId,
    stats: { strength: BASE_STAT, dexterity: BASE_STAT, intelligence: BASE_STAT, wisdom: BASE_STAT, charisma: BASE_STAT },
    hp: BASE_HP + hpBonus,
    hpMax: BASE_HP + hpBonus,
    ac: 10,
    equipped: { main: AETHERIC_WEAPON },
    inventory: [],
    earnedTitles: [],
    statusEffects: [],
  } as unknown as PlayerCharacter;
}

const enemy = { name: 'dummy', hp: 30, abilityPoint: 8 } as unknown as Enemy;

function hitChance(attackBonus: number): number {
  // d20 + bonus vs AC, nat-1 always miss / nat-20 always hit → clamp [0.05, 0.95].
  const need = ENEMY_AC - attackBonus; // roll must be >= this
  const p = (21 - need) / 20;
  return Math.max(0.05, Math.min(0.95, p));
}

describe('race/gear balance audit — no massively OP combo', () => {
  const races = getRaces();

  type Row = { id: string; effDps: number; eHp: number; power: number; hitPct: number; dmg: number; resist: number };
  const rows: Row[] = [];

  for (const race of races) {
    const hpBonus = (race as { startingHPBonus?: number }).startingHPBonus ?? 0;
    const player = mkPlayer(race.id, hpBonus);

    // Sample buildCombatSteps to average damage (captures the random +1d6).
    let dmgSum = 0; let atkBonus = 0; const N = 4000;
    for (let i = 0; i < N; i++) {
      const steps = buildCombatSteps('attack the dummy', player, enemy);
      const atk = steps.find((s) => s.id === 'attack')!;
      const dmg = steps.find((s) => s.id === 'damage')!;
      atkBonus = atk.bonus; // constant across samples
      dmgSum += dmg.count * (dmg.sides + 1) / 2 + dmg.bonus;
    }
    const avgDmg = dmgSum / N;
    const hp = hitChance(atkBonus);
    const effDps = hp * avgDmg;

    // Survivability: average damage-taken multiplier across types → eHP.
    const resistMult = DAMAGE_TYPES.reduce((s, t) => s + raceDamageMultiplier(race.id, t), 0) / DAMAGE_TYPES.length;
    const eHp = (BASE_HP + hpBonus) / resistMult;

    rows.push({ id: race.id, effDps, eHp, power: effDps * eHp, hitPct: hp, dmg: avgDmg, resist: resistMult });
  }

  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
  const medPower = median(rows.map((r) => r.power));
  const medDps = median(rows.map((r) => r.effDps));
  const medEhp = median(rows.map((r) => r.eHp));

  // Human-readable table for the record (surfaces on failure).
  const table = ['', '  race                  hit%   dmg/hit  effDPS   eHP    power  (×median)'];
  for (const r of [...rows].sort((a, b) => b.power - a.power)) {
    table.push(
      `  ${r.id.padEnd(22)} ${(r.hitPct * 100).toFixed(0).padStart(3)}%  ${r.dmg.toFixed(1).padStart(6)}  ${r.effDps.toFixed(1).padStart(6)}  ${r.eHp.toFixed(0).padStart(5)}  ${r.power.toFixed(0).padStart(6)}  ${(r.power / medPower).toFixed(2)}×`,
    );
  }
  const report = table.join('\n');

  it('reports the per-race power table', () => {
    expect(rows.length).toBe(7);
    // Always emit the table so the numbers are on the record.
    // eslint-disable-next-line no-console
    console.info(report);
  });

  it('no race is a massive POWER outlier (combined DPS×eHP within 0.55–1.8× median)', () => {
    for (const r of rows) {
      const ratio = r.power / medPower;
      expect({ race: r.id, ratio: +ratio.toFixed(2), report }).toMatchObject({ race: r.id });
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(1.85);
    }
  });

  it('no race dominates OFFENSE (effDPS within 0.6–1.7× median)', () => {
    for (const r of rows) {
      const ratio = r.effDps / medDps;
      expect(`${r.id} effDPS ratio ${ratio.toFixed(2)} — ${report}`).toBeTruthy();
      expect(ratio).toBeGreaterThan(0.55);
      expect(ratio).toBeLessThan(1.7);
    }
  });

  it('no race dominates SURVIVABILITY (eHP within 0.6–1.9× median)', () => {
    for (const r of rows) {
      const ratio = r.eHp / medEhp;
      expect(ratio).toBeGreaterThan(0.55);
      expect(ratio).toBeLessThan(1.9);
    }
  });
});

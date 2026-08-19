// OTA-1194 — THE THREE COMBAT-FEEL LEVERS GET RUNGS ON THE LADDER.
//
// Owner, after the OTA-1190→1193 balance pass landed: *"if I'm tuning this to be normal
// difficulty level just above the bottom, can you use this as a baseline and tune the
// other levels accordingly."* Then, when I deferred it asking for a device log first:
// *"so you didn't add the 3 new levers to the other levels?"* — asked twice, so it is his
// call and it is built.
//
// ⚠ WHAT WAS ACTUALLY WRONG. `owed` is the identity row, so the balance pass carried to
// all four tiers automatically — that part needed nothing. The defect is the other
// direction: dodge cooldown, per-tile regen and the gear-aware scaler were all GLOBAL
// constants, so the gentlest tier took the identical nerf an over-geared run did, and the
// player least able to absorb it absorbed all of it. A difficulty ladder whose rungs
// cannot express the levers that decide whether you feel invincible is not a ladder.

jest.setTimeout(30000);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import {
  PRESSURE_PROFILES, PRESSURE_ORDER, DEFAULT_PRESSURE, DIFFICULTY_SYSTEMS,
  profileOf, dialOf, scaledRegen,
  type PressureProfile,
} from '../app/engine/pressure';
import {
  DODGE_COOLDOWN_ROUNDS, dodgeCooldownRounds, dodgeFill,
} from '../app/engine/dodgeCooldown';
import {
  gearPowerTerm, enemyScalePower, GEAR_POWER_BLEND,
  AC_POWER_BASELINE, DMG_POWER_BASELINE, overLevelT,
} from '../app/engine/encounter';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const INPUT = read('app', 'components', 'InputBox.tsx');

const NEW_DIALS = ['dodgeLock', 'mend', 'gearBlend'] as const;

describe('OTA-1194 — the identity row still changes nothing', () => {
  it('⚠⚠ `owed` IS A MATHEMATICAL NO-OP ON ALL THREE NEW DIALS', () => {
    // This is the single most load-bearing assertion in the file. It is what protects
    // the baseline the owner is playing RIGHT NOW from the three columns written around
    // it — the same guarantee ota1136DifficultySystems makes for the older dials.
    const owed = PRESSURE_PROFILES.owed;
    expect(owed.dodgeLock).toBe(1);
    expect(owed.mend).toBe(1);
    expect(owed.gearBlend).toBe(1);
  });

  it('and `owed` is still the default, so no existing save moves', () => {
    expect(DEFAULT_PRESSURE).toBe('owed');
    const fresh = profileOf(null);
    for (const d of NEW_DIALS) expect(fresh[d]).toBe(1);
  });

  it('⚠ THE NO-OP IS PROVEN THROUGH THE CONSUMERS, not just asserted on the row', () => {
    // A dial that reads 1.0 but is consumed by something that rounds or floors is not a
    // no-op. Each of the three is pushed through the function that actually uses it.
    expect(dodgeCooldownRounds(PRESSURE_PROFILES.owed.dodgeLock)).toBe(DODGE_COOLDOWN_ROUNDS);
    for (const base of [0, 1, 2, 3, 5]) {
      expect(scaledRegen(base, PRESSURE_PROFILES.owed.mend)).toBe(base);
    }
    expect(gearPowerTerm(26, 9, PRESSURE_PROFILES.owed.gearBlend)).toBeCloseTo(gearPowerTerm(26, 9));
  });
});

describe('OTA-1194 — the ladder is monotonic and lands on whole rounds', () => {
  const rungs = PRESSURE_ORDER.map((id) => PRESSURE_PROFILES[id]);

  it('⚠ DODGE LOCK: 0 / 3 / 4 / 5 ROUNDS, and every one is an integer', () => {
    // Written in the profile as fractions of the base (4/3, 5/3) so the whole-number
    // intent survives someone re-tuning DODGE_COOLDOWN_ROUNDS.
    expect(rungs.map((r) => dodgeCooldownRounds(r.dodgeLock))).toEqual([0, 3, 4, 5]);
  });

  it('⚠ SALVAGE HAS NO COOLDOWN AT ALL — deliberately the pre-OTA-1193 game', () => {
    // The gentlest tier's promise is "the mud lets you work". Taking the safety net away
    // from the player who explicitly asked for one is the wrong direction on that rung.
    expect(PRESSURE_PROFILES.salvage.dodgeLock).toBe(0);
    expect(dodgeCooldownRounds(PRESSURE_PROFILES.salvage.dodgeLock)).toBe(0);
  });

  it('⚠ AND A 0-ROUND LOCK PAINTS FULL BLUE RATHER THAN NaN', () => {
    // max 0 is a division by zero away from a bar that renders as nothing at all.
    expect(dodgeFill(0, 0)).toBe(1);
    expect(dodgeFill(3, 0)).toBe(1);
    expect(Number.isNaN(dodgeFill(1, 0))).toBe(false);
  });

  it('the lock never grows past 5 — a stance you never get to use is not a harder game', () => {
    // Ordinary raiders die in 2-4 rounds. Past ~5 the cooldown stops rationing dodge and
    // starts deleting it, which is the "longer, not harder" trap pressure.ts names.
    expect(Math.max(...rungs.map((r) => dodgeCooldownRounds(r.dodgeLock)))).toBeLessThanOrEqual(5);
  });

  it('⚠ MEND FALLS AS THE LADDER RISES, and salvage genuinely mends MORE', () => {
    expect(rungs.map((r) => r.mend)).toEqual([1.5, 1, 0.75, 0.5]);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i]!.mend).toBeLessThan(rungs[i - 1]!.mend);
    }
  });

  it('⚠ AT THE REGEN CAP THE HALVING IS REAL — 2 HP a tile becomes 1 at bury_me', () => {
    // HP_REGEN_CAP is 2 and the owner's run wears the full 2. This is where the measured
    // problem lived ("he GAINED HP during fights"), so this is where the bite must land.
    expect(scaledRegen(2, PRESSURE_PROFILES.bury_me.mend)).toBe(1);
    expect(scaledRegen(2, PRESSURE_PROFILES.salvage.mend)).toBe(3);
  });

  it('⚠ AND A MARGINAL +1 PIECE IS NOT SILENTLY ZEROED', () => {
    // 1 × 0.5 = 0.5, and the consumer ROUNDS (ties up) rather than flooring. Flooring
    // would turn a worn item into a dead stat, which reads as a bug, not as difficulty.
    for (const r of rungs) expect(scaledRegen(1, r.mend)).toBeGreaterThanOrEqual(1);
  });

  it('⚠ GEAR BLEND RISES TO EXACTLY THE FULL DESIGNED WEIGHT AT THE TOP', () => {
    // OTA-1182 wrote 1.0 as the full weight and shipped 0.5 pending device evidence.
    // bury_me is where that evidence costs least, so that is where full weight lives.
    expect(rungs.map((r) => r.gearBlend)).toEqual([0.5, 1, 1.5, 2]);
    expect(GEAR_POWER_BLEND * PRESSURE_PROFILES.bury_me.gearBlend).toBeCloseTo(1);
    expect(GEAR_POWER_BLEND * PRESSURE_PROFILES.owed.gearBlend).toBeCloseTo(0.5);
  });
});

describe('OTA-1194 — no tier can make the world easier than authored', () => {
  it('⚠⚠ A FRESH ARRIVAL READS EXACTLY 0 AT EVERY RUNG', () => {
    // The OTA-1182 guarantee, re-proven against the new multiplier. Both gear terms are
    // clamped at 0 above a fresh-arrival baseline, so scaling them cannot go negative.
    for (const id of PRESSURE_ORDER) {
      const b = PRESSURE_PROFILES[id].gearBlend;
      expect(gearPowerTerm(AC_POWER_BASELINE, DMG_POWER_BASELINE, b)).toBe(0);
      expect(gearPowerTerm(AC_POWER_BASELINE - 6, DMG_POWER_BASELINE - 2, b)).toBe(0);
    }
  });

  it('a junk or negative blend degrades to the baseline rather than inverting it', () => {
    const real = gearPowerTerm(26, 9, 1);
    expect(gearPowerTerm(26, 9, NaN)).toBeCloseTo(real);
    expect(gearPowerTerm(26, 9, Infinity)).toBeCloseTo(real);
    expect(gearPowerTerm(26, 9, -5)).toBe(0);
  });

  it('⚠ AN ABSENT DODGE DIAL MEANS THE BASELINE, NEVER A FREE DODGE', () => {
    // An undefined slipping through as 0 would hand every unmigrated save the salvage
    // rules — a balance change nobody chose, invisible until someone reads a log.
    expect(dodgeCooldownRounds(undefined)).toBe(DODGE_COOLDOWN_ROUNDS);
    expect(dodgeCooldownRounds(NaN)).toBe(DODGE_COOLDOWN_ROUNDS);
    expect(scaledRegen(2, undefined as unknown as number)).toBe(2);
  });

  it('the ladder moves a real character without saturating overLevelT', () => {
    // The owner's run: AC 26, a weapon averaging ~9. Measured end to end so a future
    // retune cannot quietly pin every armoured character at max difficulty.
    const t = (blend: number): number =>
      overLevelT(enemyScalePower(19, 32, { ac: 26, avgWeaponDamage: 9, tierBlend: blend }));
    const [sal, owe, let_, bury] = PRESSURE_ORDER.map((id) => t(PRESSURE_PROFILES[id].gearBlend));
    expect(sal!).toBeLessThan(owe!);
    expect(owe!).toBeLessThan(let_!);
    expect(let_!).toBeLessThan(bury!);
    expect(bury!).toBeLessThan(1); // nothing saturates
  });
});

describe('OTA-1194 — custom runs can switch each lever independently', () => {
  it('all three appear in the picker registry, so the modal renders them for free', () => {
    const ids = DIFFICULTY_SYSTEMS.map((d) => d.id);
    for (const d of NEW_DIALS) expect(ids).toContain(d);
  });

  it('every registry row has a label and a plain-language blurb', () => {
    for (const d of NEW_DIALS) {
      const row = DIFFICULTY_SYSTEMS.find((r) => r.id === d)!;
      expect(row.label.length).toBeGreaterThan(3);
      expect(row.blurb.length).toBeGreaterThan(20);
      // A control panel, not a mood board — the blurb has to say what changes.
      expect(row.blurb).toMatch(/^How /);
    }
  });

  it('⚠ AN UNCHECKED SYSTEM FALLS BACK TO `owed`, NOT TO THE INTENSITY', () => {
    // The whole point of CUSTOM: "bury me with them, but leave my dodge alone".
    const p = { pressure: 'custom' as const, pressureCustom: { intensity: 'bury_me', systems: ['mend'] } };
    const prof = profileOf(p);
    expect(prof.mend).toBe(PRESSURE_PROFILES.bury_me.mend);
    expect(prof.dodgeLock).toBe(1);   // untouched → identity
    expect(prof.gearBlend).toBe(1);   // untouched → identity
  });

  it('and a checked system takes the intensity it borrowed', () => {
    const p = { pressure: 'custom' as const, pressureCustom: { intensity: 'salvage', systems: ['dodgeLock', 'gearBlend'] } };
    const prof = profileOf(p);
    expect(dodgeCooldownRounds(prof.dodgeLock)).toBe(0);
    expect(prof.gearBlend).toBe(0.5);
    expect(prof.mend).toBe(1);
  });
});

describe('OTA-1194 — the consumers read the dial, not the constant', () => {
  it('⚠ THE GEAR WEIGHT IS READ AT THE ONE CHOKE POINT', () => {
    // Seven spawners route through scalePowerOf. Reading the dial at each of them is
    // exactly how the AC term went missing for as long as it did (OTA-1182).
    const i = STORE.indexOf('const tierBlend = dialOf(player, \'gearBlend\');');
    expect(i).toBeGreaterThan(-1);
    // ⚠ and it is inside scalePowerOf, not somewhere that merely mentions it.
    const fn = STORE.indexOf('function scalePowerOf');
    expect(fn).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(fn);
    expect(i - fn).toBeLessThan(3000);
  });

  it('⚠ dialOf, NOT profileOf — or a CUSTOM run reads a system it left unchecked', () => {
    for (const d of NEW_DIALS) {
      expect(STORE + INPUT).toContain(`'${d}'`);
      expect(STORE + INPUT).not.toContain(`profileOf(player).${d}`);
      expect(STORE + INPUT).not.toContain(`profileOf(live).${d}`);
    }
  });

  it('the per-tile regen is scaled, and the STAMINA half deliberately is not', () => {
    const i = STORE.indexOf('const tierRegenHp = scaledRegen(regen.hp');
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i - 900, i + 500);
    expect(block).toContain("dialOf(live, 'mend')");
    // ⚠ stamGain must still be the raw aggregate — metering it too would be a second
    // punishment billed as one, and OTA-1192 left it per-action on purpose.
    expect(block).toContain('const stamGain = Math.min(regen.stamina');
    expect(block).not.toContain('scaledRegen(regen.stamina');
  });

  it('⚠ THE DODGE STANCE ARMS THE TIER COUNT, NOT THE BARE CONSTANT', () => {
    expect(STORE).toContain(".dodgeCooldownRounds(dialOf(s.player, 'dodgeLock'))");
    // The old spelling would silently re-pin every tier to 3.
    expect(STORE).not.toContain(').DODGE_COOLDOWN_ROUNDS,');
  });

  it('and the bar divides by the same number the store armed', () => {
    expect(INPUT).toContain("dodgeCooldownRounds(dialOf(s.player, 'dodgeLock'))");
    expect(INPUT).toContain('dodgeFill(dodgeCooldown, dodgeMax)');
  });
});

describe('OTA-1194 — the amendment is on the record', () => {
  it('⚠⚠ `gearBlend` CROSSES pressure.ts\'s OWN PROHIBITION, AND SAYS SO', () => {
    // The file header reads "NO dial here scales enemy HP or damage". gearBlend does, at
    // one remove. Crossing it is authorised (the owner asked twice) but it must be
    // WRITTEN DOWN the way OTA-1136 recorded its reversal, not quietly worked around —
    // a prohibition that is silently violated stops protecting anything.
    const P = read('app', 'engine', 'pressure.ts');
    const i = P.indexOf('KNOWINGLY CROSSES THIS FILE');
    expect(i).toBeGreaterThan(-1);
    const block = P.slice(i, i + 1600);
    expect(block).toMatch(/OTA-1136/);          // names the precedent it follows
    expect(block).toMatch(/DAMAGE SPONGE/i);    // names what the rule was protecting
    expect(block).toMatch(/identity row/i);     // names what still protects the tuning
  });

  it('every new dial is documented as a lever KIND, like the ones before it', () => {
    for (const d of NEW_DIALS) {
      expect(DIFFICULTY_SYSTEMS.find((r) => r.id === d)!.kind).toBe('multiplier');
    }
  });

  it('⚠ THE PROFILE TYPE AND ALL FOUR ROWS STAY IN LOCKSTEP', () => {
    // A row missing a dial is a TypeScript error today, but a row missing a dial that
    // someone later makes optional is a silent identity-row breach. Pinned by value.
    for (const id of PRESSURE_ORDER) {
      const row: PressureProfile = PRESSURE_PROFILES[id];
      for (const d of NEW_DIALS) {
        expect(typeof row[d]).toBe('number');
        expect(Number.isFinite(row[d])).toBe(true);
        expect(row[d]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('dialOf resolves the new dials for a plain preset character too', () => {
    const p = { pressure: 'let_it_come' as const };
    expect(dialOf(p, 'mend')).toBe(0.75);
    expect(dialOf(p, 'gearBlend')).toBe(1.5);
    expect(dodgeCooldownRounds(dialOf(p, 'dodgeLock'))).toBe(4);
  });
});

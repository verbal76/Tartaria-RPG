// OTA-835 — race trait/ability wiring sweep, "make the flavor true" batch. The
// races-audit found four traits whose text promised more than the engine did.
// This locks the four re-implementations plus the new race VULNERABILITY path:
//   (1) Mud Golem is now genuinely VULNERABLE to aetheric (raceDamageMultiplier
//       can exceed 1). raceResistLabel reads the weakness, not just resistances.
//   (2) Curious Mind (Unknowing Masses) is a persistent +2 INT / +2 WIS that
//       AWAKENS on first exposure — off until the flag, on after, folded through
//       effectiveStats.
//   (3) Elemental Control gained its defensive half: a new 'elemental_ward'
//       ability that raises a 1d6-soak stone_ward.
//   (4) Beginner's Luck banks a real reroll token (luckyRerollReady) instead of
//       a flat WIS buff.

jest.setTimeout(20000);
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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { raceDamageMultiplier, raceResistLabel } from '../app/engine/raceMechanics';
import { effectiveStats } from '../app/engine/equipment';
import { RACE_ABILITIES, availableRaceAbilities } from '../app/engine/raceAbilities';
import { useGameStore } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';

// ── (1) Mud Golem aetheric VULNERABILITY ────────────────────────────────
describe('OTA-835 (1) — a race can be VULNERABLE, not just resistant', () => {
  it('Mud Golem takes +50% from aetheric (mult > 1) and ×0.75 from everything else', () => {
    expect(raceDamageMultiplier('mud_golem', 'aetheric')).toBeCloseTo(1.5);
    expect(raceDamageMultiplier('mud_golem', 'cold')).toBeCloseTo(0.75);
  });
  it('raceResistLabel reads a weakness (>1) as extra damage, a resist (<1) as absorb', () => {
    expect(raceResistLabel('mud_golem', 1.5)).toMatch(/\+50% dmg/);
    expect(raceResistLabel('mud_dweller', 0.5)).toMatch(/absorbs 50%/);
    expect(raceResistLabel('mud_golem', 1)).toBe('');
  });
});

// ── (2) Curious Mind exposure-gated persistent stats ────────────────────
describe('OTA-835 (2) — Curious Mind is a persistent +2 INT/+2 WIS that awakens on exposure', () => {
  const mkMass = (awakened: boolean): PlayerCharacter => ({
    name: 'M', raceId: 'unknowing_mass',
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 0 },
    hp: 20, hpMax: 20, stamina: 10, inventory: [], corruption: 0,
    curiousMindAwakened: awakened,
  } as unknown as PlayerCharacter);

  it('grants nothing before first exposure', () => {
    const s = effectiveStats(mkMass(false));
    expect(s.intelligence).toBe(10);
    expect(s.wisdom).toBe(10);
  });
  it('grants +2 INT and +2 WIS once awakened (other stats untouched)', () => {
    const s = effectiveStats(mkMass(true));
    expect(s.intelligence).toBe(12);
    expect(s.wisdom).toBe(12);
    expect(s.strength).toBe(10);
    expect(s.charisma).toBe(10);
  });
  it('does nothing for a non–Unknowing-Mass race even if the flag is set', () => {
    const p = { ...mkMass(true), raceId: 'tartarian_giant' } as PlayerCharacter;
    const s = effectiveStats(p);
    expect(s.intelligence).toBe(10);
    expect(s.wisdom).toBe(10);
  });
});

// ── (3) Elemental Control defensive half + registry ─────────────────────
describe('OTA-835 (3) — Elemental Control gained its 1d6 defensive ward', () => {
  it('the registry now carries both a Strike and a Ward for the Mud Golem', () => {
    const golemAbilities = RACE_ABILITIES.filter((a) => a.raceId === 'mud_golem').map((a) => a.id);
    expect(golemAbilities).toContain('elemental_control');
    expect(golemAbilities).toContain('elemental_ward');
  });
  it('the ward is combat-gated (only offered with a live enemy)', () => {
    const golem = {
      raceId: 'mud_golem', hoursElapsed: 0, abilityCooldowns: {},
    } as unknown as PlayerCharacter;
    const outOfCombat = availableRaceAbilities(golem, false).map((a) => a.id);
    const inCombat = availableRaceAbilities(golem, true).map((a) => a.id);
    expect(outOfCombat).not.toContain('elemental_ward');
    expect(inCombat).toContain('elemental_ward');
  });

  it('activating the ward raises a stone_ward that soaks 1..6 damage', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Golem', raceId: 'mud_golem', factionId: 'mud_monarchs' });
    useGameStore.getState().skipTutorial?.();
    const p0 = useGameStore.getState().player!;
    const scene = useGameStore.getState().currentScene!;
    const enemy = { name: 'Drone', damage: '1d4', abilityPoint: 'Strength 1', hp: 50, type: 'Automation', loot: [], rarity: 'Common', traits: [] };
    useGameStore.setState({
      player: { ...p0, abilityCooldowns: {}, hoursElapsed: 0 },
      currentScene: {
        ...scene, enemies: [enemy as never], enemyHps: [50], activeEnemyIdx: 0,
        range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      },
    });
    useGameStore.getState().useRaceAbility('elemental_ward');
    const ward = (useGameStore.getState().player!.statusEffects ?? []).find((e) => e.kind === 'stone_ward');
    expect(ward).toBeDefined();
    expect(ward!.absorb).toBeGreaterThanOrEqual(1);
    expect(ward!.absorb).toBeLessThanOrEqual(6);
  });
});

// ── (4) Beginner's Luck banks a real reroll token ───────────────────────
describe("OTA-835 (4) — Beginner's Luck banks a reroll token, not a WIS buff", () => {
  it('activating it sets luckyRerollReady (and adds no food_buff)', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Newbie', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    const p0 = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p0, abilityCooldowns: {}, hoursElapsed: 0, luckyRerollReady: false } });
    useGameStore.getState().useRaceAbility('beginners_luck');
    const p = useGameStore.getState().player!;
    expect(p.luckyRerollReady).toBe(true);
    expect((p.statusEffects ?? []).some((e) => e.kind === 'food_buff' && e.label === "Beginner's Luck")).toBe(false);
  });
});

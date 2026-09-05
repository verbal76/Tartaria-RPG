jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1015 — ONE KILL, ONE PRICE + STEALTH KEEPS ITS PROMISES. From the owner's
// log: three patrol kills each docked Eternal Dynasty TWICE (−18 → −21 in two
// lines), and two failed sneaks cost nothing while the one successful sneak cost
// HP and a `surprised` stamp. Measured before the fix: aetherkin-trait patrol
// with a factionId = −6 for one kill (control, same patrol without the trait
// = −3); failed sneak hp 200 → 200 with no enemy swings, successful sneak
// hp 200 → 193 even when it WON the init race.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Ledger', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

function standingOf(id: string): number {
  return (useGameStore.getState().player!.factionStanding.find((r) => r.factionId === id)?.standing) ?? 0;
}

function patrol(traits: string[]): any {
  return {
    name: 'Eternal Dynasty Patrol 1',
    hp: 0, hpMax: 28, ac: 12, attack: 6, damage: '1d6', loot: [], rarity: 'Common',
    traits, factionId: 'eternal_dynasty', aliases: ['patrol'],
  };
}

describe('OTA-1015 — one kill costs a faction once', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('a faction-tagged AETHERKIN kill docks its own faction exactly once', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: { ...scene, enemies: [patrol(['aetherkin', 'slow'])], enemyHps: [0], activeEnemyIdx: 0, vendor: null },
    });
    const before = standingOf('eternal_dynasty');
    store.getState().resolveEnemyDefeat();
    // Was −6 (kill penalty AND reverence penalty both landing on the victim).
    expect(standingOf('eternal_dynasty') - before).toBe(-3);
  });

  it('the OTHER revering factions still pay the reverence penalty', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: { ...scene, enemies: [patrol(['aetherkin', 'slow'])], enemyHps: [0], activeEnemyIdx: 0, vendor: null },
    });
    const beforeTT = standingOf('true_tartarians');
    const beforeSG = standingOf('servants_of_giants');
    store.getState().resolveEnemyDefeat();
    // The exclusion is surgical: only the faction the kill already docked is skipped.
    expect(standingOf('true_tartarians') - beforeTT).toBe(-3);
    expect(standingOf('servants_of_giants') - beforeSG).toBe(-3);
  });

  it('CONTROL — a plain faction patrol is unchanged at −3', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: { ...scene, enemies: [patrol(['slow'])], enemyHps: [0], activeEnemyIdx: 0, vendor: null },
    });
    const before = standingOf('eternal_dynasty');
    store.getState().resolveEnemyDefeat();
    expect(standingOf('eternal_dynasty') - before).toBe(-3);
  });
});

describe('OTA-1015 — a failed sneak costs what the game says it costs', () => {
  it('the enemy group swings on a FAILED sneak, exactly as the warning promises', async () => {
    const store = await boot();
    const foe: any = {
      name: 'Probe Foe', hp: 30, hpMax: 30, ac: 12, attack: 60, damage: '2d6',
      traits: [], loot: [], rarity: 'Common',
    };
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [foe], enemyHps: [30], activeEnemyIdx: 0, range: 'close',
        vendor: null, stealthOpenerUsed: true, enemyAmbushUsed: [false],
      },
      player: { ...store.getState().player!, hp: 200, hpMax: 200, stamina: 999, staminaMax: 999, statusEffects: [], dog: undefined } as any,
    });
    const combatBefore = store.getState().gameLog.filter((e) => e.channel === 'combat').length;
    store.getState().concludeRolls([{
      id: 'skill_check', label: 'STEALTH', sides: 20, count: 1,
      bonus: 1, bonusLabel: 'STE 1', target: 12, targetLabel: 'DC 12 — Hard',
      values: [4], total: 5, success: false,
    }] as any, 'sneak');
    // Was: NOTHING happened — a blown sneak was the only free action in combat,
    // which made rolling BADLY the better play. Assert the group ACTED (a swing
    // may be soaked by a companion, so the invariant is the volley, not the HP).
    const combatAfter = store.getState().gameLog.filter((e) => e.channel === 'combat').length;
    expect(combatAfter).toBeGreaterThan(combatBefore);
  });
});

describe('OTA-1015 — SOURCE LOCKS (category: one event, one price; promises are charged)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('the reverence pass can exclude factions the same kill already docked', () => {
    expect(src).toMatch(/excludeFactionIds\?: ReadonlySet<string>/);
    expect(src).toMatch(/if \(excludeFactionIds\?\.has\(row\.factionId\)\) return row;/);
    expect(src).toMatch(/applyAetherkinReverenceDelta\(get, set, AETHERKIN_KILL_REP, killDockedFactions\)/);
    // Old shape gone: the kill path no longer calls it without the exclusion set.
    expect(src).not.toMatch(/applyAetherkinReverenceDelta\(get, set, AETHERKIN_KILL_REP\)/);
  });

  it('faction parties are never reskinned from special creature templates', () => {
    // ⚠ OTA-1678 — injectFactionParty moved verbatim to state/factionParty.ts
    // (the OTA-1400 line ratchet); the claim is the same, read where it lives.
    const party = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'factionParty.ts'), 'utf8');
    expect(party).toMatch(/const specialTemplate = \(e: Enemy\): boolean =>/);
    expect(party).toMatch(/rollEncounter\(scene\.location\)\.filter\(\(e\) => !e\.boss && !specialTemplate\(e\)\)/);
    expect(party).not.toMatch(/rollEncounter\(scene\.location\)\.filter\(\(e\) => !e\.boss\);/);
    expect(src).not.toMatch(/rollEncounter\(scene\.location\)\.filter\(\(e\) => !e\.boss\);/);
  });

  it('the stealth title rides the deciding contest, not just the gate', () => {
    // OTA-1086 — the handler no longer rolls its own player d20 at all, so
    // there is no second roll for the title bonus to miss: the gate roll
    // (skill.total — STE + title folded in by buildSkillSteps) IS the sneak,
    // and the engaged reset contests that same total. The OTA-1015 claim
    // (title rides the deciding contest) holds by construction now.
    expect(src).toMatch(/const pInit = \(skill\.total \?\? 0\) \+ 2 \+ timeBonus;/);
    expect(src).toMatch(/stealth: opener carried by the skill roll/);
    expect(src).not.toMatch(/const steBonus = ste;/);
  });

  it('the expiry line reads as a sentence', () => {
    expect(src).toMatch(/label: 'exposed opening'/);
    expect(src).not.toMatch(/label: 'caught mid-vanish'/);
  });
});

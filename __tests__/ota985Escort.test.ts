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

// OTA-985 — escort missions, ported from engine_Dev's shared-pool model. An
// escort contract spawns a party (one pooled health bar) that takes EXTRA
// collateral damage whenever an enemy connects on the player; pool at 0 fails
// the contract on the spot; rest heals ~10%; delivering the party alive
// completes it. Parked (deactivated) contracts stand their party down.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import { FACTION_QUESTS, findFactionQuestById } from '../app/engine/factionQuests';
import { escortSpecForQuest, spawnEscortPool, livingEscortPools, isEscortQuest } from '../app/engine/escort';

describe('OTA-985 — escort engine: spec, pool, HUD filter', () => {
  it('authored Tartaria escort contracts exist and resolve their spec', () => {
    const escorts = FACTION_QUESTS.filter((q) => isEscortQuest(q));
    expect(escorts.length).toBeGreaterThanOrEqual(4);
    const survey = findFactionQuestById('fq_stone_builders_survey_escort')!;
    const spec = escortSpecForQuest(survey)!;
    expect(spec.label).toBe('Surveyors');
    expect(spec.count).toBe(3);
  });

  it('a non-escort quest resolves null; an _escort id suffix opts in', () => {
    expect(escortSpecForQuest(findFactionQuestById('fq_tartarian_revivalists_rapport'))).toBeNull();
    const spec = escortSpecForQuest({ id: 'x_escort', factionId: 'f', title: 't', description: 'd', objective: 'o', requirement: { rep: 0 }, reward: { tc: 1, rep: 1 } } as any);
    expect(spec).toBeTruthy();
    expect(spec!.count).toBeGreaterThanOrEqual(2);
    expect(spec!.count).toBeLessThanOrEqual(3);
  });

  it('the pool sums per-member HP and the HUD filter hides parked/dead parties', () => {
    const pool = spawnEscortPool(3, 100, 'Surveyors');
    expect(pool.hp).toBe(pool.hpMax);
    expect(pool.hpMax).toBeGreaterThanOrEqual(3 * 8);
    expect(pool.hpMax).toBeLessThanOrEqual(3 * 45);
    const rows = livingEscortPools([
      { escort: pool, tracked: true },
      { escort: { label: 'Parked', hp: 10, hpMax: 10 }, tracked: false },
      { escort: { label: 'Dead', hp: 0, hpMax: 10 }, tracked: true },
      { tracked: true },
    ]);
    expect(rows.length).toBe(1);
    expect(rows[0]!.label).toBe('Surveyors');
  });
});

async function bootEscortFight(escortHp: number) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Warden', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
  const foe = JSON.parse(JSON.stringify(proto));
  foe.hp = 9999;
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      enemies: [foe], enemyHps: [9999], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      enemyArmorShred: [0], enemyCorruptionStacks: [0],
    },
  });
  store.setState((s) => ({
    player: {
      ...s.player!,
      hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
      activeFactionQuestIds: ['fq_stone_builders_survey_escort'],
      activeFactionQuests: [{
        id: 'fq_stone_builders_survey_escort', stage: 0, postedByFaction: 'stone_builders',
        acceptedAt: 1, tracked: true,
        escort: { label: 'Surveyors', hp: escortHp, hpMax: 60, count: 3 },
      }],
    },
  }));
  return store;
}

async function attackRound(store: typeof useGameStore) {
  await store.getState().submitPlayerAction('attack');
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
  }
  await new Promise((r) => setTimeout(r, 10));
}

describe('OTA-985 — collateral bleeds the party when the player is hit', () => {
  it('an enemy hit on the player also catches the Surveyors (extra, never absorbed)', async () => {
    const store = await bootEscortFight(60);
    for (let i = 0; i < 12; i++) {
      await attackRound(store);
      const q = store.getState().player!.activeFactionQuests?.[0];
      if ((q?.escort?.hp ?? 60) < 60) break;
    }
    const q = store.getState().player!.activeFactionQuests?.[0];
    expect(q?.escort?.hp ?? 60).toBeLessThan(60);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/catches your Surveyors/);
  });

  it('the pool hitting 0 FAILS the contract on the spot (record dropped, loss narrated)', async () => {
    const store = await bootEscortFight(1);
    for (let i = 0; i < 15; i++) {
      await attackRound(store);
      if ((store.getState().player!.activeFactionQuests ?? []).length === 0) break;
    }
    expect((store.getState().player!.activeFactionQuests ?? []).length).toBe(0);
    expect(store.getState().player!.activeFactionQuestIds ?? []).not.toContain('fq_stone_builders_survey_escort');
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/cut down\. The escort/);
  });
});

describe('OTA-985 — rest patches the party up, modestly', () => {
  it('a rest heals the active escort ~10% of pool max', async () => {
    const store = await bootEscortFight(30);
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], activeEnemyIdx: 0 },
      // Wounded and winded, so the rest isn't refused as pointless.
      player: { ...s.player!, hp: 300, stamina: 10 },
    }));
    await store.getState().submitPlayerAction('rest');
    let guard = 0;
    while (store.getState().pendingRolls) {
      if (guard++ > 50) break;
      const pr = store.getState().pendingRolls!;
      const step = pr.steps[pr.currentStep]!;
      store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 10));
    }
    await new Promise((r) => setTimeout(r, 10));
    const q = store.getState().player!.activeFactionQuests?.[0];
    expect(q?.escort?.hp).toBe(36); // 30 + round(60 * 0.10)
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Surveyors rest too/);
  });
});

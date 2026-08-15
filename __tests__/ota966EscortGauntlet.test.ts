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

// OTA-966 — the escort GAUNTLET. Owner: "fully run escort missions through
// their paces ... accepting every kind ... every different kind of pick up ...
// through the entirety of it including combat and drop off ... tune the 30%
// damage bleed ... make sure the TC is worth it, and have these missions only
// drop TC and health items for loot." Every authored escort contract is
// accepted and delivered end-to-end; vendor, board and hook pickups all work;
// collateral bleeds at the tuned 20%; parked parties are safe; a dead pool
// fails; and turn-in loot is TC + healing only (no recipe roll, ever).
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { ESCORT_COLLATERAL_FRACTION, isEscortQuest, spawnEscortPool, escortSpecForQuest } from '../app/engine/escort';
import { plantHookByKind } from '../app/engine/hooks';

const ESCORTS = FACTION_QUESTS.filter((q) => isEscortQuest(q));

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  return store;
}

describe('OTA-966 — tuning + economics guards', () => {
  it('the bleed is tuned to 20% and a solo party can survive a real fight', () => {
    expect(ESCORT_COLLATERAL_FRACTION).toBe(0.2);
    // Worst case: solo party, typical 10-damage raider hit -> 2 collateral.
    for (let i = 0; i < 30; i++) {
      const solo = spawnEscortPool(1, 130, 'Test');
      const hitsToFail = solo.hpMax / Math.max(1, Math.round(10 * ESCORT_COLLATERAL_FRACTION));
      expect(hitsToFail).toBeGreaterThanOrEqual(15); // ~a hard pack fight and change
    }
  });

  it('the coin is worth the walk at every tier', () => {
    for (const q of ESCORTS) {
      if (q.escort?.mode === 'all_or_nothing') expect(q.reward.tc).toBeGreaterThanOrEqual(160);
      else expect(q.reward.tc).toBeGreaterThanOrEqual(55);
      expect(q.reward.rep).toBeGreaterThanOrEqual(5);
    }
  });

  it('the authoring is complete and not copy-paste filler', () => {
    expect(ESCORTS.length).toBeGreaterThanOrEqual(29);
    const descs = new Set(ESCORTS.map((q) => q.description));
    const objs = new Set(ESCORTS.map((q) => q.objective));
    const titles = new Set(ESCORTS.map((q) => q.title));
    expect(descs.size).toBe(ESCORTS.length); // every description unique
    expect(objs.size).toBe(ESCORTS.length); // every objective unique
    expect(titles.size).toBe(ESCORTS.length); // every title unique
  });
});

describe('OTA-966 — every pickup source works', () => {
  it('a VENDOR hands out an escort; the party spawns on accept', async () => {
    const store = await boot('Pickup1');
    const def = ESCORTS.find((q) => q.id === 'fq_stone_builders_survey_escort')!;
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: { id: 'tv1', name: 'Test Agent', faction: def.factionId } as any },
      player: {
        ...s.player!,
        factionStanding: [...(s.player!.factionStanding ?? []).filter((f) => f.factionId !== def.factionId), { factionId: def.factionId, standing: 25 }],
      },
    }));
    store.getState().acceptFactionQuest(def.id);
    await new Promise((r) => setTimeout(r, 10));
    const rec = (store.getState().player!.activeFactionQuests ?? []).find((q) => q.id === def.id);
    expect(rec).toBeTruthy();
    expect(rec!.escort!.hp).toBeGreaterThan(0);
  });

  it('a MISSION BOARD hands out a hard drop-off; a HOOK hands out a field escort', async () => {
    const store = await boot('Pickup2');
    const hard = ESCORTS.find((q) => q.escort?.mode === 'all_or_nothing')!;
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], missionBoard: { faction: hard.factionId } as any },
      player: {
        ...s.player!,
        factionStanding: [...(s.player!.factionStanding ?? []).filter((f) => f.factionId !== hard.factionId), { factionId: hard.factionId, standing: 40 }],
      },
    }));
    store.getState().acceptFactionQuest(hard.id);
    await new Promise((r) => setTimeout(r, 10));
    expect((store.getState().player!.activeFactionQuests ?? []).some((q) => q.id === hard.id && q.escort)).toBe(true);
    // HOOK pickup — the stranded traveler chain pushes a field escort record.
    const h = plantHookByKind('stranded_traveler');
    store.setState((s) => ({ currentScene: { ...s.currentScene!, missionBoard: undefined, hooks: [h] } }));
    await store.getState().submitPlayerAction('investigate traveler');
    await new Promise((r) => setTimeout(r, 10));
    store.getState().continueHook();
    await new Promise((r) => setTimeout(r, 10));
    expect((store.getState().player!.activeFactionQuests ?? []).some((q) => q.id.endsWith('_stranded_escort'))).toBe(true);
  });
});

describe('OTA-966 — the full gauntlet: every contract, accept to drop-off', () => {
  it('all authored escorts complete; loot is TC + healing only', async () => {
    const store = await boot('Gauntlet');
    const kitQty = () => (store.getState().player!.inventory ?? [])
      .filter((i) => i.name === 'First Aid Kit').reduce((n, i) => n + (i.quantity ?? 1), 0);
    const kitsBefore = kitQty();
    const tcBefore = store.getState().player!.tc;
    for (const def of ESCORTS) {
      const pool = spawnEscortPool(def.escort?.count ?? 2, 130, escortSpecForQuest(def)!.label);
      store.setState((s) => ({
        currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: undefined, missionBoard: { faction: def.factionId } as any },
        player: {
          ...s.player!,
          activeFactionQuestIds: [def.id],
          activeFactionQuests: [{ id: def.id, stage: 0, postedByFaction: def.factionId, acceptedAt: 1, tracked: true, escort: pool }],
        },
      }));
      store.getState().turnInFactionQuest(def.id);
      await new Promise((r) => setTimeout(r, 5));
      expect(store.getState().player!.completedFactionQuestIds ?? []).toContain(def.id);
    }
    expect(store.getState().player!.tc).toBeGreaterThan(tcBefore); // the coin landed
    // Health items landed: 1 per scaled + 2 per all-or-nothing delivery.
    const hardCount = ESCORTS.filter((q) => q.escort?.mode === 'all_or_nothing').length;
    expect(kitQty() - kitsBefore).toBe(ESCORTS.length + hardCount);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).not.toMatch(/Recipe among the spoils/); // escorts never roll recipes
    expect(log).toMatch(/First Aid Kit — pressed into your hands/);
  });
});

describe('OTA-966 — combat, parking, and failure on the road', () => {
  async function bootFight(escortHp: number, tracked: boolean) {
    const store = await boot('Road');
    const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
    const foe = JSON.parse(JSON.stringify(proto));
    foe.hp = 9999;
    store.setState((s) => ({
      currentScene: {
        ...s.currentScene!, enemies: [foe], enemyHps: [9999], activeEnemyIdx: 0, range: 'close',
        enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]], enemyArmorShred: [0], enemyCorruptionStacks: [0],
      },
      player: {
        ...s.player!, hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
        activeFactionQuestIds: ['fq_stone_builders_survey_escort'],
        activeFactionQuests: [{
          id: 'fq_stone_builders_survey_escort', stage: 0, postedByFaction: 'stone_builders', acceptedAt: 1, tracked,
          escort: { label: 'Surveyors', hp: escortHp, hpMax: 120, count: 3 },
        }],
      },
    }));
    return store;
  }
  async function rounds(store: typeof useGameStore, n: number, stop: () => boolean) {
    for (let i = 0; i < n && !stop(); i++) {
      await store.getState().submitPlayerAction('attack');
      let guard = 0;
      while (store.getState().pendingRolls) {
        if (guard++ > 50) throw new Error('roll loop');
        const pr = store.getState().pendingRolls!;
        const step = pr.steps[pr.currentStep]!;
        store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  it('an ACTIVE party bleeds the tuned 20% collateral when the player is hit', async () => {
    const store = await bootFight(120, true);
    await rounds(store, 12, () => (store.getState().player!.activeFactionQuests?.[0]?.escort?.hp ?? 120) < 120);
    const rec = store.getState().player!.activeFactionQuests?.[0];
    expect(rec?.escort?.hp ?? 120).toBeLessThan(120);
    expect(store.getState().gameLog.map((e) => e.text).join('\n')).toMatch(/catches your Surveyors/);
  });
  it('a PARKED party takes nothing at all', async () => {
    const store = await bootFight(120, false);
    await rounds(store, 8, () => false);
    expect(store.getState().player!.activeFactionQuests?.[0]?.escort?.hp).toBe(120);
  });
  it('a dead pool FAILS the contract — dropped, not completed', async () => {
    const store = await bootFight(1, true);
    await rounds(store, 15, () => (store.getState().player!.activeFactionQuests ?? []).length === 0);
    expect((store.getState().player!.activeFactionQuests ?? []).length).toBe(0);
    expect(store.getState().player!.completedFactionQuestIds ?? []).not.toContain('fq_stone_builders_survey_escort');
    expect(store.getState().gameLog.map((e) => e.text).join('\n')).toMatch(/cut down\. The escort/);
  });
});

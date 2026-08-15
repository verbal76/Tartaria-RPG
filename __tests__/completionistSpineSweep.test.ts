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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠ THE COMPLETIONIST — SPINE SWEEP. Owner: *"run a completionist run on the
// game... I want to test every single outcome of every single interaction."*
//
// This file is the FULL CROSS of the game's authored identity dimensions,
// played live: EVERY faction × EVERY motive × EVERY ending — 9 × 5 × 4 = 180
// complete games, each one real character creation → revelation → nine Core
// Guardian kills through the real dice → descent → the Nexus (cinematic +
// Reckoning) → the ending chosen and recorded. The ota1226 spine walker is the
// per-push guarantee (9 runs, rotated); THIS is the occasional deep proof that
// no cell of the matrix hides a wedge.
//
// ⚠ "Sweep" in the filename keeps it OUT of test:ci:fast (same exclusion as
// the stress sims) — it is an ON-DEMAND gate, run before store pushes or after
// story-engine surgery:   npx jest completionist --forceExit
// Wall time ~5 minutes. Harness traps: ota1219 header + ota1226's two.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { LOST_CAPITAL_LOCATIONS, canStayAtTheNexus, ensureMainQuest } from '../app/engine/mainQuest';
import { isCoreGuardian } from '../app/engine/coreGuardians';
import { STORY_MOTIVE_IDS } from '../app/engine/story';
import type { MainQuestEnding } from '../app/engine/types';

jest.setTimeout(1800000);

const store = useGameStore;

async function settle(pred: () => boolean, deadlineMs = 6000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function drainRolls() {
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 60) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
  }
}

const mq = () => ensureMainQuest(store.getState().player!.mainQuest);

function seedKin() {
  const p = store.getState().player!;
  useGameStore.setState({
    player: {
      ...p,
      corruption: 0, menace: 0,
      factionStanding: getFactions().map((f) => ({ factionId: f.id, standing: 60 })),
      storyChoices: {},
      pressure: 'bury_me',
      titleProgress: { ...(p.titleProgress ?? {}), loreRead: 30, relicsPreserved: 12, relicsTraded: 0 },
    } as typeof p,
  });
  useGameStore.setState({
    worldMemory: {
      ...store.getState().worldMemory,
      npcRelations: {
        a: { wrongs: 0, amendsCleared: 3, gifts: [{ item: 'x' }, { item: 'y' }, { item: 'z' }] },
        b: { wrongs: 0, amendsCleared: 2, gifts: [{ item: 'x' }, { item: 'y' }, { item: 'z' }] },
      } as never,
    },
  });
}

/** One complete game. Returns nothing; throws (via expect) where it breaks. */
async function playTheSpine(factionId: string, motiveId: string, ending: MainQuestEnding, runTag: string) {
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: `C${runTag}`, raceId: getRaces()[runTag.length % getRaces().length]!.id,
    factionId, motiveId,
  });
  store.getState().skipTutorial?.();
  await settle(() => !!store.getState().currentScene);
  let last = -1;
  await settle(() => {
    const n = store.getState().gameLog.length;
    const stable = n === last;
    last = n;
    return stable;
  }, 10000);

  const p0 = store.getState().player!;
  useGameStore.setState({
    player: {
      ...p0,
      hp: 800, hpMax: 800, stamina: 200, staminaMax: 200,
      stats: { ...p0.stats, strength: 20, dexterity: 20 },
      activeHunts: [], activeMysteries: [], activeStorylines: [], activeQuests: [],
    },
  });
  expect(mq().phase).toBe('hook');

  for (const capital of LOST_CAPITAL_LOCATIONS) {
    store.getState().travelTo(capital);
    await settle(() => store.getState().player!.currentLocationId === capital);
    if (capital === LOST_CAPITAL_LOCATIONS[0]) {
      await settle(() => mq().phase === 'revelation');
    }
    useGameStore.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [], enemyHps: [], hooks: [], range: null, enemiesAtBase: false,
      },
    });
    const res = store.getState().summonCoreGuardian();
    expect({ runTag, capital, summon: res.ok }).toEqual({ runTag, capital, summon: true });
    await settle(() => (store.getState().currentScene?.enemies ?? []).some((e) => isCoreGuardian(e)));
    const guardian = store.getState().currentScene!.enemies.find((e) => isCoreGuardian(e))!;
    useGameStore.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [guardian], enemyHps: [1], activeEnemyIdx: 0, range: 'close',
        enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        enemyArmorShred: [0], enemyCorruptionStacks: [0], enemiesAtBase: false,
      },
    });
    for (let round = 0; round < 8 && !mq().coresRecovered.includes(capital); round++) {
      await store.getState().submitPlayerAction('attack');
      drainRolls();
      await new Promise((r) => setTimeout(r, 100));
      drainRolls();
    }
    await settle(() => mq().coresRecovered.includes(capital));
    expect({ runTag, capital, core: mq().coresRecovered.includes(capital) })
      .toEqual({ runTag, capital, core: true });
  }
  expect(mq().phase).toBe('descent');

  if (ending === 'stay') seedKin();
  store.getState().travelTo('mud_flood_nexus');
  await settle(() => mq().phase === 'choice');
  if (ending === 'stay') {
    expect(canStayAtTheNexus(store.getState().player, store.getState().worldMemory)).toBe(true);
  }
  store.getState().chooseEndingMainQuest(ending);
  await settle(() => mq().phase === 'ended');
  expect({ runTag, ending: mq().ending }).toEqual({ runTag, ending });
}

const ENDINGS: MainQuestEnding[] = ['seal', 'unleash', 'preserve', 'stay'];

describe('COMPLETIONIST — the full identity cross: 9 factions × 5 motives × 4 endings, 180 complete games', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  const factions = getFactions();
  for (const faction of factions) {
    for (const motive of STORY_MOTIVE_IDS) {
      for (const ending of ENDINGS) {
        it(`${faction.id} × ${motive} × ${ending}`, async () => {
          await playTheSpine(faction.id, motive, ending, `${faction.id.slice(0, 4)}_${motive.slice(0, 3)}_${ending.slice(0, 2)}`);
        });
      }
    }
  }
});

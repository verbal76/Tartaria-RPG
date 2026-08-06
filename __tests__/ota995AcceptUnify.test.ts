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

// OTA-995 — review item #118: ONE accept behavior for every contract kind.
// Hunts, mysteries, and storylines used to auto-ACTIVATE on accept while
// faction quests auto-parked ("paused — you're already on another contract"),
// so a board-browsing session left the player hand-deactivating a pile of
// contracts. Root cause: only acceptFactionQuest had single-active logic, and
// it scanned only its own kind. Now anyTrackedContract() is the one shared
// cross-kind predicate, and every accept/grant site parks the newcomer when
// anything — any kind — is already live.
import { useGameStore, anyTrackedContract, _resetAcceptBurst } from '../app/state/gameStore';
import { HUNTS } from '../app/engine/hunts';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { getRaces, getFactions } from '../app/engine/character';

const FACTION = 'forgotten_order';

async function boot(name: string) {
  // OTA-1071 — the accept-burst tracker is module-level; without this the
  // first accept of a later test inherits the previous test's burst.
  _resetAcceptBurst();
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  // High standing with the posting faction + a faction agent in scene, so all
  // three catalog accepts resolve.
  store.setState((s) => ({
    player: {
      ...s.player!,
      factionStanding: [
        ...s.player!.factionStanding.filter((r) => r.factionId !== FACTION),
        { factionId: FACTION, standing: 60 },
      ],
    },
    currentScene: {
      ...store.getState().currentScene!,
      enemies: [],
      vendor: { id: 'poster_agent', name: 'Poster Agent', title: 'agent', faction: FACTION, offers: [], demeanor: 'honest' } as never,
    },
  }));
  return store;
}

describe('OTA-995 — one accept behavior for every contract kind', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('first contract goes LIVE; every later accept — any kind — parks with the paused line', async () => {
    const store = await boot('Signer');
    const hunt = HUNTS.find((h) => h.factionId === FACTION)!;
    const mystery = MYSTERIES.find((m) => m.factionId === FACTION)!;
    const story = STORYLINES.find((st) => st.factionId === FACTION)!;

    expect(anyTrackedContract(store.getState().player)).toBe(false);

    // 1) hunt with an empty slate → LIVE
    store.getState().acceptHunt(hunt.title);
    const h = (store.getState().player!.activeHunts ?? []).find((r) => r.id === hunt.id);
    expect(h).toBeDefined();
    expect(h!.tracked).not.toBe(false);
    expect(anyTrackedContract(store.getState().player)).toBe(true);

    // 2) mystery while the hunt is live → PARKED, and it says so
    store.getState().acceptMystery(mystery.title);
    const m = (store.getState().player!.activeMysteries ?? []).find((r) => r.id === mystery.id);
    expect(m).toBeDefined();
    expect(m!.tracked).toBe(false);

    // 3) storyline while the hunt is live → PARKED
    store.getState().acceptStoryline(story.title);
    const st = (store.getState().player!.activeStorylines ?? []).find((r) => r.id === story.id);
    expect(st).toBeDefined();
    expect(st!.tracked).toBe(false);

    // OTA-1071 — the parked notice used to be a dedicated two-sentence line
    // per accept. Mid-burst it is now a "(parked)" marker on the one accept
    // line the contract gets; the state it reports is unchanged, which is what
    // this case is actually about (see the tracked=false assertions above).
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toContain(`Mystery accepted — ${mystery.title} (parked)`);
    expect(log).toContain(`Storyline accepted — ${story.title} (parked)`);

    // 4) cross-kind the other way: a faction quest accepted now parks too
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { availableFactionQuests } = require('../app/engine/factionQuests');
    const fq = availableFactionQuests(FACTION, 60, [], [])[0]!;
    store.getState().acceptFactionQuest(fq.id);
    const fqr = (store.getState().player!.activeFactionQuests ?? []).find((r) => r.id === fq.id);
    expect(fqr).toBeDefined();
    expect(fqr!.tracked).toBe(false);
  });

  it('with nothing live, a mystery accepted first is LIVE (no false parking)', async () => {
    const store = await boot('Solo');
    const mystery = MYSTERIES.find((m) => m.factionId === FACTION)!;
    store.getState().acceptMystery(mystery.title);
    const m = (store.getState().player!.activeMysteries ?? []).find((r) => r.id === mystery.id);
    expect(m).toBeDefined();
    expect(m!.tracked).not.toBe(false);
  });
});

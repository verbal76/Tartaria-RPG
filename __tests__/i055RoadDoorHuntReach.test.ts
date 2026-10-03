// I-055 — the road door (acceptHunt with no vendor in scene) obeys the SAME reach rule the board
// and the vendor accept do (OTA-1450). Before: a typed `accept <hunt>` away from a stall took
// ANY faction-neutral hunt regardless of recommendedHp, so a fresh ~30 HP character was walked
// into 45-75 HP fights it could not survive (the 84-run campaign's dominant accept path).

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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));



import { useGameStore } from '../app/state/gameStore';
import { HUNTS, huntWithinReach } from '../app/engine/hunts';

const neutral = HUNTS.filter((h) => h.factionId === null);
const hard = neutral.find((h) => (h.recommendedHp ?? 0) > 60)!;
const easy = [...neutral].sort((a, b) => (a.recommendedHp ?? 0) - (b.recommendedHp ?? 0))[0]!;

async function boot(name: string, hpMax: number) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'mud_golem', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  store.setState((st) => {
    const { vendor: _vendor, ...sceneNoVendor } = st.currentScene! as typeof st.currentScene & { vendor?: unknown };
    return {
      player: { ...st.player!, hpMax, hp: hpMax, activeHunts: [], completedHuntIds: [] },
      currentScene: sceneNoVendor as typeof st.currentScene,
    };
  });
  return store;
}
const logsSince = (store: typeof useGameStore, mark: number) => store.getState().gameLog.slice(mark).map((e) => e.text).join('\n');

describe('I-055 — the road door obeys the reach rule', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('fixtures are what they claim: one hunt is out of reach at 30 HP, one is in reach', () => {
    expect(huntWithinReach(hard, 30)).toBe(false);
    expect(huntWithinReach(easy, 30)).toBe(true);
  });

  it('REFUSES an out-of-reach neutral hunt with no vendor present, says why, and leaves the slate empty', async () => {
    const store = await boot('Fresh', 30);
    const mark = store.getState().gameLog.length;
    store.getState().acceptHunt(hard.title);
    expect(store.getState().player!.activeHunts ?? []).toHaveLength(0);
    expect(logsSince(store, mark)).toMatch(/come back at \d+ HP \(you have 30\)/);
  });

  it('ACCEPTS an in-reach neutral hunt with no vendor present, with a correct record', async () => {
    const store = await boot('Fresh2', 30);
    store.getState().acceptHunt(easy.title);
    const active = store.getState().player!.activeHunts ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(easy.id);
    expect(active[0]!.postedByFaction).toBeNull();
    expect(active[0]!.tracked).toBe(true);
  });

  it('ACCEPTS the same hard hunt once the player is big enough (the gate is a size check, not a ban)', async () => {
    const store = await boot('Grown', (hard.recommendedHp ?? 0) + 5);
    store.getState().acceptHunt(hard.title);
    expect((store.getState().player!.activeHunts ?? []).map((h) => h.id)).toContain(hard.id);
  });

  it('does not double-accept a hunt already on the slate', async () => {
    const store = await boot('Twice', 30);
    store.getState().acceptHunt(easy.title);
    store.getState().acceptHunt(easy.title);
    expect((store.getState().player!.activeHunts ?? []).filter((h) => h.id === easy.id)).toHaveLength(1);
  });
});

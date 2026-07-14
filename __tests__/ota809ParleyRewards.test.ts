// OTA-1094 — Parley Phase 2: procedural payloads + dialogue beats + reward wiring.
//   - pure: seeded goods/lead generators, cagey beat, wanderer carries a payload
//   - store: intimidate → carried goods land in the pack; persuade → a location lead
//     is planted on the player (paid out later when they reach fresh ground)

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
import { makeWanderer, makeWandererGoods, makeWandererLead, wandererCagey } from '../app/engine/wanderers';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1094 — procedural payloads (pure)', () => {
  it('goods are deterministic in the seed and greedy sorts carry more', () => {
    expect(makeWandererGoods(42, 'reasonable')).toEqual(makeWandererGoods(42, 'reasonable'));
    const greedy = makeWandererGoods(42, 'greedy');
    const plain = makeWandererGoods(42, 'reasonable');
    expect(greedy.tc).toBeGreaterThanOrEqual(plain.tc);
    expect(greedy.items.length).toBeGreaterThan(0);
    expect(greedy.items[0]!.name).toBeTruthy();
  });
  it('a lead is deterministic and points somewhere with a payout', () => {
    const a = makeWandererLead(99);
    expect(a).toEqual(makeWandererLead(99));
    expect(a.hint).toMatch(/off to the/);
    expect(a.rewardTc).toBeGreaterThan(0);
  });
  it('the cagey beat differs by temperament', () => {
    const greedy = { ...makeWanderer(1), temperament: 'greedy' as const };
    const reasonable = { ...makeWanderer(1), temperament: 'reasonable' as const };
    expect(wandererCagey(greedy)).not.toBe(wandererCagey(reasonable));
  });
  it('makeWanderer now bundles a payload', () => {
    const w = makeWanderer(7);
    expect(w.goods.items.length).toBeGreaterThan(0);
    expect(w.lead.rewardTc).toBeGreaterThan(0);
  });
});

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Broker', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}
function armPerson(store: ReturnType<typeof useGameStore>, temperament: 'reasonable' | 'greedy', cha: number) {
  const w = { ...makeWanderer(5), temperament, faction: 'reclaimers_guild' };
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: null, wanderer: w } as any,
    player: { ...s.player!, hp: 30, stamina: 20, corruption: 0, menace: 0, pendingLead: null, stats: { ...s.player!.stats, charisma: cha, wisdom: 8 } },
  }));
  return w;
}

describe('OTA-1094 — reward wiring (store)', () => {
  it('intimidate lands the extorted GOODS in the pack (items + TC)', async () => {
    const store = await boot();
    const w = armPerson(store, 'greedy', 30);
    const tcBefore = store.getState().player!.tc;
    const invCountBefore = store.getState().player!.inventory.reduce((n, i) => n + i.quantity, 0);
    store.getState().submitPlayerAction('intimidate them');
    expect(store.getState().player!.tc).toBe(tcBefore + w.goods.tc);
    const invCountAfter = store.getState().player!.inventory.reduce((n, i) => n + i.quantity, 0);
    expect(invCountAfter).toBeGreaterThan(invCountBefore); // got the item(s)
    const got = store.getState().player!.inventory.find((i) => i.name === w.goods.items[0]!.name);
    expect(got).toBeTruthy();
  });

  it('persuade plants a location LEAD on the player', async () => {
    const store = await boot();
    const w = armPerson(store, 'reasonable', 30);
    store.getState().submitPlayerAction('persuade them');
    const lead = store.getState().player!.pendingLead;
    expect(lead).toBeTruthy();
    expect(lead!.hint).toBe(w.lead.hint);
    expect(lead!.rewardTc).toBe(w.lead.rewardTc);
  });
});

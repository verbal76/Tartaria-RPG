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

// OTA-950 — Phase A of the real-heights model (the skeleton). Scene nouns can be
// PLACED on a climbable structure at a tier (nounPlacements: noun → structure +
// tier). Reachability: at your structure + your tier = reachable; wrong tier,
// wrong structure, or viewed from the ground = a specific, always-audible
// refusal. No placements exist in shipped content until the Phase-B seeder, so
// every existing scene behaves exactly as before.
import { useGameStore } from '../app/state/gameStore';
import { reachableWhileElevated, placementFor } from '../app/engine/climbHeight';
import { getRaces, getFactions } from '../app/engine/character';

const PLACEMENTS = { 'wax-sealed satchel': { structure: 'guard tower', tier: 2 } };
const NOUNS = ['shore', 'guard tower', 'stone pillar', 'wax-sealed satchel'];

async function bootScene(elevatedOn: { noun: string; tier: number; totalTiers: number } | null) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Percher', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      enemies: [],
      ambientNouns: [...NOUNS],
      nounPlacements: { ...PLACEMENTS },
      elevatedOn,
      elevatedOverlayMeta: undefined,
    },
  });
  return store;
}

describe('OTA-950 — placement lookup honors short forms', () => {
  it('finds "wax-sealed satchel" from "satchel", never from unrelated nouns', () => {
    expect(placementFor('satchel', PLACEMENTS)).toEqual({ structure: 'guard tower', tier: 2 });
    expect(placementFor('wax-sealed satchel', PLACEMENTS)).toEqual({ structure: 'guard tower', tier: 2 });
    expect(placementFor('shore', PLACEMENTS)).toBeNull();
    expect(placementFor('satchel', null)).toBeNull();
  });
});

describe('OTA-950 — reachability matrix', () => {
  it('ground: placed nouns are excluded, everything else passes', () => {
    expect(reachableWhileElevated(NOUNS, null, false, PLACEMENTS, 0))
      .toEqual(['shore', 'guard tower', 'stone pillar']);
  });
  it('your structure at your tier: structure + the placed noun are reachable', () => {
    expect(reachableWhileElevated(NOUNS, 'guard tower', false, PLACEMENTS, 2))
      .toEqual(['guard tower', 'wax-sealed satchel']);
  });
  it('your structure at the WRONG tier: the placed noun drops out', () => {
    expect(reachableWhileElevated(NOUNS, 'guard tower', false, PLACEMENTS, 1))
      .toEqual(['guard tower']);
  });
  it('same height on a DIFFERENT structure: never reachable', () => {
    expect(reachableWhileElevated(NOUNS, 'stone pillar', false, PLACEMENTS, 2))
      .toEqual(['stone pillar']);
  });
  it('overlay active: overlay nouns pass through untouched', () => {
    expect(reachableWhileElevated(NOUNS, 'guard tower', true, PLACEMENTS, 1)).toEqual(NOUNS);
  });
  it('no placements at all: behavior is exactly the pre-heights rule', () => {
    expect(reachableWhileElevated(NOUNS, null, false)).toEqual(NOUNS);
    expect(reachableWhileElevated(NOUNS, 'stone pillar', false)).toEqual(['stone pillar']);
  });
});

describe('OTA-950 — engine gates route placed nouns by where they hang', () => {
  it('from the ground, the satchel is visible-but-refused, and answers every retry', async () => {
    const store = await bootScene(null);
    store.getState().submitPlayerAction('investigate the satchel');
    await new Promise((r) => setTimeout(r, 5));
    store.getState().submitPlayerAction('investigate the satchel');
    await new Promise((r) => setTimeout(r, 5));
    const refusals = store.getState().gameLog.filter((e) => e.text.includes('up on the guard tower'));
    expect(refusals.length).toBe(2);
  });

  it('on the tower at tier 1 (satchel at 2): "keep climbing"', async () => {
    const store = await bootScene({ noun: 'guard tower', tier: 1, totalTiers: 4 });
    store.getState().submitPlayerAction('investigate the satchel');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('Keep climbing'))).toBe(true);
  });

  it('on the tower at tier 3 (satchel at 2): "below your grip"', async () => {
    const store = await bootScene({ noun: 'guard tower', tier: 3, totalTiers: 4 });
    store.getState().submitPlayerAction('investigate the satchel');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('below your grip'))).toBe(true);
  });

  it('on the tower at tier 2 (satchel at 2): NOT elevation-refused', async () => {
    const store = await bootScene({ noun: 'guard tower', tier: 2, totalTiers: 4 });
    store.getState().submitPlayerAction('investigate the satchel');
    await new Promise((r) => setTimeout(r, 5));
    const log = store.getState().gameLog;
    expect(log.some((e) => /Keep climbing|below your grip|up on the guard tower|Its own climb|down there/.test(e.text))).toBe(false);
  });

  it('on the pillar at the satchel\'s height: refused — it hangs on a different structure', async () => {
    const store = await bootScene({ noun: 'stone pillar', tier: 2, totalTiers: 2 });
    store.getState().submitPlayerAction('investigate the satchel');
    await new Promise((r) => setTimeout(r, 5));
    const refusal = store.getState().gameLog.find((e) => e.text.includes('Its own climb'));
    expect(refusal).toBeTruthy();
    expect(refusal!.text).toContain('guard tower');
  });

  it('ground nouns from the ground still investigate normally (no phantom refusals)', async () => {
    const store = await bootScene(null);
    store.getState().submitPlayerAction('investigate the shore');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => /up on the|Keep climbing|below your grip|Its own climb/.test(e.text))).toBe(false);
  });
});

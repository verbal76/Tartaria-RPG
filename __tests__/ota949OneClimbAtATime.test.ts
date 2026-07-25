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

// OTA-949 — one climb at a time. Owner: with two climbs in a scene, being up on
// one must not let you touch (or start) the other at the same height. Before
// this, "climb the tower" from the top of the pillar just STARTED climbing the
// tower — a mid-air teleport that overwrote the pillar's elevated state. Now:
// while elevated, a different climb target is refused (always audibly), the
// engine's investigate gate keeps refusing the other structure, and the shared
// reachability helper keeps it out of UI affordances.
import { useGameStore } from '../app/state/gameStore';
import { reachableWhileElevated } from '../app/engine/climbHeight';
import { getRaces, getFactions } from '../app/engine/character';

async function bootElevated() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Climber', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  // Let any queued post-boot scene rebuild land BEFORE we pin the two-climb
  // scene, so it can't clobber the elevated state mid-test (cold-boot race).
  await new Promise((r) => setTimeout(r, 25));
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      enemies: [],
      ambientNouns: ['stone pillar', 'guard tower', 'shore'],
      elevatedOn: { noun: 'stone pillar', tier: 1, totalTiers: 2 },
      elevatedOverlayMeta: undefined,
    },
  });
  return store;
}

describe('OTA-949 — one climb at a time', () => {
  it('from the pillar, "climb the guard tower" is refused and elevated state is untouched', async () => {
    const store = await bootElevated();
    store.getState().submitPlayerAction('climb the guard tower');
    await new Promise((r) => setTimeout(r, 5));
    const refusal = store.getState().gameLog.find((e) => e.text.includes('its own climb'));
    expect(refusal).toBeTruthy();
    expect(refusal!.text).toContain('stone pillar');
    const elev = store.getState().currentScene!.elevatedOn!;
    expect(elev.noun).toBe('stone pillar');
    expect(elev.tier).toBe(1);
  });

  it('the cross-climb refusal answers EVERY retry (no dedup silence)', async () => {
    const store = await bootElevated();
    store.getState().submitPlayerAction('climb the guard tower');
    await new Promise((r) => setTimeout(r, 5));
    store.getState().submitPlayerAction('climb the guard tower');
    await new Promise((r) => setTimeout(r, 5));
    const refusals = store.getState().gameLog.filter((e) => e.text.includes('its own climb'));
    expect(refusals.length).toBe(2);
  });

  it('climbing the SAME structure is not blocked by the gate', async () => {
    const store = await bootElevated();
    store.getState().submitPlayerAction('climb the stone pillar');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('its own climb'))).toBe(false);
  });

  it('bare "climb" while elevated continues the current climb, not a phantom surface', async () => {
    const store = await bootElevated();
    store.getState().submitPlayerAction('climb');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('its own climb'))).toBe(false);
    expect(store.getState().gameLog.some((e) => e.text.includes('the surface in front of you'))).toBe(false);
  });

  it('investigating the other climb from up top stays refused (same height, different structure)', async () => {
    const store = await bootElevated();
    store.getState().submitPlayerAction('investigate the guard tower');
    await new Promise((r) => setTimeout(r, 5));
    const replies = store.getState().gameLog.filter(
      (e) => e.channel === 'arbiter' && /Climb down|down there|points down/.test(e.text),
    );
    expect(replies.length).toBe(1);
  });

  it('reachability helper: the other climb at the same height is NOT reachable', () => {
    expect(reachableWhileElevated(['guard tower', 'stone pillar', 'shore'], 'stone pillar', false))
      .toEqual(['stone pillar']);
  });
});

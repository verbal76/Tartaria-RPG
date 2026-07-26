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

// OTA-1003 — #122: weather locality. Root cause: pickWeather weighed only
// NOVELTY — no location linkage, no persistence — so every scene rebuild could
// re-roll the sky and an Aetheric spire hailed as readily as a mud flat.
// Now: locale keyword bias at the single chooser, a persisted per-location sky
// (~6 game-hours), no weather bite indoors, and a longer chip gap.
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

const realEncounter = jest.requireActual('../app/engine/encounter') as typeof import('../app/engine/encounter');

describe('OTA-1003 — weather reads the ground it falls on', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('weatherById resolves table entries', () => {
    expect(realEncounter.weatherById('glass_hail')?.name).toBe('Glass Hail');
    expect(realEncounter.weatherById('nope_such_sky')).toBeNull();
  });

  it('Aetheric country draws its own lightning; mud country its black rain', () => {
    const mem = { tagCounts: {} } as any;
    const N = 600;
    let aetherPlain = 0, aetherBiased = 0, mudBiased = 0;
    for (let i = 0; i < N; i++) {
      const p = realEncounter.pickWeather(mem);
      if (p.id === 'aether_lightning' || p.id === 'etheric_storm') aetherPlain++;
      const a = realEncounter.pickWeather(mem, { id: 'grand_spire_of_etheria', name: 'The Grand Spire' });
      if (a.id === 'aether_lightning' || a.id === 'etheric_storm') aetherBiased++;
      const m = realEncounter.pickWeather(mem, { id: 'sunken_market', name: 'The Mud Flats' });
      if (m.id === 'black_rain' || m.id === 'whisper_fog') mudBiased++;
    }
    // Unbiased baseline for 2 of 9 equal-weight entries is ~22% of N; a 3x
    // bias lifts the pair to ~46%. Assert with wide margins so rng noise
    // can't flake the gate.
    expect(aetherBiased).toBeGreaterThan(aetherPlain * 1.4);
    expect(aetherBiased).toBeGreaterThan(N * 0.33);
    expect(mudBiased).toBeGreaterThan(N * 0.33);
  });

  it('the sky persists per location visit (~6h) instead of re-rolling per scene', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Skywatcher', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const st = store.getState();
    const locId = st.player!.currentLocationId;
    // The boot scene stored its roll.
    expect(st.worldMemory.sceneWeather?.locationId).toBe(locId);
    // Pin a stored sky and rebuild the scene: it must REUSE, not re-roll
    // (the test-harness pickWeather mock would return calm on any re-roll).
    store.setState((s) => ({
      worldMemory: {
        ...s.worldMemory,
        sceneWeather: { id: 'glass_hail', locationId: locId, rolledAtHours: s.player!.hoursElapsed ?? 0 },
      },
    }));
    (store.getState() as any)._beginSceneCore({});
    await new Promise((r) => setTimeout(r, 25));
    expect(store.getState().currentScene?.weather?.id).toBe('glass_hail');
    // A STALE sky (>6 game-hours old) re-rolls — back to the harness calm.
    store.setState((s) => ({
      player: { ...s.player!, hoursElapsed: (s.player!.hoursElapsed ?? 0) + 10 },
    }));
    (store.getState() as any)._beginSceneCore({});
    await new Promise((r) => setTimeout(r, 25));
    expect(store.getState().currentScene?.weather?.id).toBe('calm');
    expect(store.getState().worldMemory.sceneWeather?.id).toBe('calm');
  });

  it('category lock: roof suppression + gap 5 + biased call sites are wired in source', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(src).toContain('const WEATHER_TICK_GAP = 5;');
    expect(src).toContain('const OPEN_AIR_HUB_ROOMS: ReadonlySet<string>');
    expect(src).toContain('!!hubRoomNow && !OPEN_AIR_HUB_ROOMS.has(hubRoomNow)');
    expect(src).toContain('weatherCooldown > 0 || underRoof');
    // the open-air rooms must stay exposed — a gate is not a roof
    expect(src).toMatch(/'outpost_gate',\s*\n\s*'outpost_central',/);
    expect(src).toContain('pickWeather(worldMemory, location)');
    expect(src).toContain('pickWeather(liveWorldMem, null)');
    expect(src).not.toMatch(/pickWeather\(worldMemory\);/);
  });
});

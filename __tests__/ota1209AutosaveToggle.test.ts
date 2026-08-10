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

// OTA-1209 — THE AUTOSAVE TOGGLE. The autosave itself is OTA-368 (a 90s timer,
// already tighter than the 2-10 minute industry span) layered over per-action
// persist and the background flush. The owner's lost 2-hour session predates
// that stack; what was missing was CONTROL and VISIBILITY — a Settings toggle
// beside SAVE, default ON.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  autosaveTick, getAutosaveDisabled, setAutosaveDisabled, AUTOSAVE_INTERVAL_MS,
} from '../app/ui/autosave';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(120000);

describe('OTA-1209 — the tick decision table', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  afterEach(() => { void setAutosaveDisabled(false); });

  it('ships ON, at the OTA-368 cadence — 90s, not loosened toward "standard"', () => {
    expect(getAutosaveDisabled()).toBe(false);
    expect(AUTOSAVE_INTERVAL_MS).toBe(90_000);
  });

  it('a live character on the clock: the beat persists', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Sleeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    const s = store.getState();
    expect(await autosaveTick({ persist: s.persist, player: s.player, activeSlotId: s.activeSlotId })).toBe('saved');
  });

  it('toggled OFF: skipped — and no character means skipped regardless', async () => {
    await setAutosaveDisabled(true);
    const s = useGameStore.getState();
    expect(await autosaveTick({ persist: s.persist, player: s.player, activeSlotId: s.activeSlotId })).toBe('skipped');
    await setAutosaveDisabled(false);
    expect(await autosaveTick({ persist: async () => true, player: null, activeSlotId: null })).toBe('skipped');
  });
});

describe('OTA-1209 — the belt is actually on the waist', () => {
  // ⚠ Source pins, silent-no-op class: a toggle module nobody wires is a
  // setting that lies, and a timer that stopped calling the gate re-ships
  // the un-toggleable belt.
  it('App.tsx runs the timer through autosaveTick at the named interval', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('autosaveTick({ persist: s.persist');
    expect(app).toContain('AUTOSAVE_INTERVAL_MS');
    expect(app).toContain('loadAutosaveDisabled()');
  });
  it('Settings renders the toggle', () => {
    const about = readFileSync(join(__dirname, '..', 'app', 'screens', 'AboutScreen.tsx'), 'utf8');
    expect(about).toContain('Autosave (every 90s)');
    expect(about).toContain('setAutosaveDisabled(!autosaveDisabled)');
  });
});

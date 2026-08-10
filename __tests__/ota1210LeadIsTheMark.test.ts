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

// OTA-1210 — THE LEAD ITSELF IS THE STRONGEST MARK, AND IT WAS INVISIBLE.
// Owner, first live session with the Arbiter's eye (device log, 2026-08-10):
// "we sure the light is doing the new work? it just worked like we had it
// before. it didn't have any nouns in investigate." He was right to squint:
// the eye marked only DISPLAYED ambient nouns, and a story lead (the
// submerged steeple his torch charged and cashed for a Rare) is usually not
// an ambient chip — so in exactly the rooms that hold a lead, the marks had
// nothing to attach to. Now every unresolved lead uncovered by a displayed
// chip is returned by the eye, and the chip row renders eye-only nouns as
// their own ✦ chips.
import { readFileSync } from 'fs';
import { join } from 'path';
import { arbiterEyeNouns } from '../app/engine/arbiterEye';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { Hook } from '../app/engine/hooks';

jest.setTimeout(120000);

const hook = (nouns: string[], resolved = false): Hook => ({
  id: 'h1', kind: 'submerged_steeple' as Hook['kind'], nouns, plantedLine: '', stage: 0, resolved,
});

describe('OTA-1210 — a lead no chip covers still gets its mark', () => {
  it('the device-log shape: a steeple lead over plain ambient nouns → the lead is the mark', () => {
    expect(arbiterEyeNouns({
      displayedNouns: ['silt bank', 'shore'],
      hooks: [hook(['steeple', 'cathedral'])],
    })).toEqual(['steeple']);
  });

  it('a lead a displayed chip already covers does NOT duplicate', () => {
    expect(arbiterEyeNouns({
      displayedNouns: ['column of smoke', 'silt bank'],
      hooks: [hook(['smoke'])],
    })).toEqual(['column of smoke']);
  });

  it('a resolved lead marks nothing', () => {
    expect(arbiterEyeNouns({
      displayedNouns: ['silt bank'],
      hooks: [hook(['steeple'], true)],
    })).toEqual([]);
  });
});

describe('OTA-1210 — LIVE: charging a lead leaves a mark the chips can show', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('applyTorchToHook on a non-ambient lead stamps the lead noun into the eye', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Diver', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    const t0 = Date.now();
    while (!store.getState().currentScene && Date.now() - t0 < 4000) {
      await new Promise((r) => setTimeout(r, 15));
    }
    const scene = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene, enemies: [],
        hooks: [{ id: 'lead_steeple', kind: 'submerged_steeple' as Hook['kind'], nouns: ['steeple'], plantedLine: '', stage: 0, resolved: false }],
        ambientNouns: ['silt bank'], displayedAmbientNouns: ['silt bank'],
      },
    });
    store.getState().applyTorchToHook('lead_steeple');
    const t1 = Date.now();
    while ((store.getState().currentScene?.arbiterEye ?? []).length === 0 && Date.now() - t1 < 4000) {
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(store.getState().currentScene?.hooks[0]?.torchCharged).toBe(true);
    expect(store.getState().currentScene?.arbiterEye).toContain('steeple');
  });
});

describe('OTA-1210 — the chips and the count both know about eye-only nouns', () => {
  // ⚠ Source pins, silent-no-op class: an eye noun with no chip renderer is the
  // exact invisibility the owner reported; a chip without the count is the
  // OTA-1124 lying-badge class.
  it('ExplorationScreen renders eye-only chips AND counts them', () => {
    const screen = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    expect(screen).toContain('marked: true');
    expect(screen).toContain('eyeOnlyCount');
    expect(screen).toContain('sceneCount + groundCount + eyeOnlyCount');
  });
});

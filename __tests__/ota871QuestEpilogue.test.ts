// OTA-871 — quest completability fixes surfaced by the multi-agent audit:
//  (bug 1) mysteries/storylines authored with a trailing pure-narration (checkKind: null)
//          EPILOGUE stage hung one stage short of turn-in, because the real-play advance
//          path can't step past a null stage. advanceMystery/advanceStoryline now auto-
//          consume trailing null stages (show their narration, then advance).
//  (bug 2) a hunt stage had an invalid checkKind ("investigation" ≠ "investigate"). This
//          also adds a data-integrity guard so any future invalid checkKind fails the suite.

jest.setTimeout(20000);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { useGameStore } from '../app/state/gameStore';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { HUNTS } from '../app/engine/hunts';

const VALID = new Set([null, 'investigate', 'stealth', 'diplomacy', 'escape', 'cast', 'attack_provoke', 'boss']);

describe('OTA-871 (data guard) — every quest stage has a valid checkKind', () => {
  it('no hunt / mystery / storyline stage uses an invalid checkKind', () => {
    const bad: string[] = [];
    for (const [label, arr] of [['hunt', HUNTS], ['mystery', MYSTERIES], ['storyline', STORYLINES]] as const) {
      for (const q of arr as Array<{ id: string; stages: { checkKind?: unknown }[] }>) {
        q.stages.forEach((s, i) => {
          const ck = s.checkKind ?? null;
          if (!VALID.has(ck as never)) bad.push(`${label} ${q.id} stage ${i}: ${JSON.stringify(ck)}`);
        });
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('OTA-871 (bug 1) — a trailing null epilogue advances to turn-in, not a hang', () => {
  // Find a real mystery + storyline whose FINAL stage is a pure-narration (null) epilogue.
  const epiMystery = MYSTERIES.find((m) => m.stages.length > 1 && m.stages[m.stages.length - 1]!.checkKind === null);
  const epiStory = STORYLINES.find((s) => s.stages.length > 1 && s.stages[s.stages.length - 1]!.checkKind === null);

  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Epi', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('mystery: advancing FROM the boss stage consumes the trailing null and reaches stages.length', () => {
    expect(epiMystery).toBeTruthy();
    const m = epiMystery!;
    // Put the record at the last ACTION stage (the one before the trailing null epilogue).
    const bossStage = m.stages.length - 2;
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, activeMysteries: [{ id: m.id, stage: bossStage, tracked: true } as never] } });
    useGameStore.getState().advanceMystery(m.id);
    const rec = (useGameStore.getState().player!.activeMysteries ?? []).find((r: { id: string }) => r.id === m.id)!;
    expect((rec as { stage: number }).stage).toBeGreaterThanOrEqual(m.stages.length); // turn-in unlocked, not stuck at length-1
  });

  it('storyline: advancing FROM the boss stage consumes the trailing null and reaches stages.length', () => {
    expect(epiStory).toBeTruthy();
    const s = epiStory!;
    const bossStage = s.stages.length - 2;
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, activeStorylines: [{ id: s.id, stage: bossStage, tracked: true } as never] } });
    useGameStore.getState().advanceStoryline(s.id);
    const rec = (useGameStore.getState().player!.activeStorylines ?? []).find((r: { id: string }) => r.id === s.id)!;
    expect((rec as { stage: number }).stage).toBeGreaterThanOrEqual(s.stages.length);
  });
});

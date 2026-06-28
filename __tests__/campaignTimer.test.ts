// engine_Dev — campaign time limit ("time to complete the main quest"). The pack
// can enable a deadline (days/years); if the in-game clock passes it before the main
// quest is done, the run ends with the Snapback failure ending. Off unless enabled.

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
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import {
  setCustomMainQuestOverride,
  campaignTimeLimitHours,
  campaignTimeLimitConfig,
  campaignTimeoutEnding,
} from '../app/engine/contentPack';

const STEP = [{ action: 'reach' }];

describe('campaign time limit — math + config', () => {
  it('converts years and days to in-game hours; null when off/unset', () => {
    setCustomMainQuestOverride({ steps: STEP, timeLimit: { enabled: true, value: 7, unit: 'years' } } as never);
    expect(campaignTimeLimitHours()).toBe(7 * 365 * 24);
    expect(campaignTimeLimitConfig()).toEqual({ value: 7, unit: 'years' });

    setCustomMainQuestOverride({ steps: STEP, timeLimit: { enabled: true, value: 90, unit: 'days' } } as never);
    expect(campaignTimeLimitHours()).toBe(90 * 24);
    expect(campaignTimeLimitConfig()).toEqual({ value: 90, unit: 'days' });

    setCustomMainQuestOverride({ steps: STEP, timeLimit: { enabled: false, value: 7, unit: 'years' } } as never);
    expect(campaignTimeLimitHours()).toBeNull();
    expect(campaignTimeLimitConfig()).toBeNull();

    setCustomMainQuestOverride({ steps: STEP } as never); // no timer at all
    expect(campaignTimeLimitHours()).toBeNull();
  });

  it('exposes pack-overridable ending text', () => {
    setCustomMainQuestOverride({ steps: STEP, timeoutEnding: { title: 'T', body: 'B' } } as never);
    expect(campaignTimeoutEnding()).toEqual({ title: 'T', body: 'B' });
  });
});

describe('campaign time limit — firing', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Verbal', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('ends the run when the clock passes the limit and the quest is unfinished', async () => {
    setCustomMainQuestOverride({
      steps: Array.from({ length: 50 }, () => ({ action: 'reach' })), // far from complete
      timeLimit: { enabled: true, value: 1, unit: 'days' }, // 24h
      timeoutEnding: { title: 'Out of time', body: 'The war reignites and millions die.' },
    } as never);
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, hoursElapsed: 48, dead: false, customQuestStep: 0 } }); // past 24h
    await useGameStore.getState().submitPlayerAction('look');
    // Assert on the log (it survives the ~3.5s deferred return-to-title that the
    // handler schedules, whereas player.dead is cleared when that fires).
    const log = JSON.stringify(useGameStore.getState().gameLog);
    expect(log).toMatch(/war reignites and millions die/);
  });

  it('does NOT end the run while under the limit', async () => {
    setCustomMainQuestOverride({
      steps: STEP,
      timeLimit: { enabled: true, value: 10, unit: 'years' },
    } as never);
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, hoursElapsed: 100, dead: false } }); // far under 10 years
    await useGameStore.getState().submitPlayerAction('look');
    expect(useGameStore.getState().player?.dead).toBe(false);
  });

  it('does NOT fire when the timer is off, even past any clock value', async () => {
    setCustomMainQuestOverride({ steps: STEP, timeLimit: { enabled: false, value: 1, unit: 'days' } } as never);
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, hoursElapsed: 99999, dead: false } });
    await useGameStore.getState().submitPlayerAction('look');
    expect(useGameStore.getState().player?.dead).toBe(false);
  });
});

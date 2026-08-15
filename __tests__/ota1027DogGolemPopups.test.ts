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

// OTA-1027 — DOG + GOLEM NAMING POPUPS, and no second story-hook popup.
// A playtester at the dog-rescue moment typed "rest", thought the naming
// beat was another fight, and the old in-feed takeover silently stored
// "rest" as the breed. Both naming flows now commit through blocking
// popups (DogOnboardingModal / GolemNamingModal); typed feed input is
// NEVER treated as an answer. Separately, the story-hook COMPLETE tap no
// longer raises a redundant mission-complete popup — the thread modal
// spotlights the payout itself.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';

describe('OTA-1027 — typed input is never an onboarding answer', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('dog: "rest" during pendingDogOnboarding is not swallowed as the breed', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Handler', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'debt',
    } as any);
    store.getState().dismissStoryIntro();
    store.getState().skipTutorial();
    store.setState({
      worldMemory: {
        ...store.getState().worldMemory,
        pendingDogOnboarding: {
          stage: 'breed',
          rescueData: { scenario: 'snare', startingProfile: 'hound' },
        } as any,
      },
    });
    store.getState().submitPlayerAction('rest');
    const wm = store.getState().worldMemory;
    expect(wm.pendingDogOnboarding).toBeTruthy();
    expect((wm.pendingDogOnboarding as any).breed).toBeUndefined();
    expect(store.getState().player!.dog).toBeFalsy();
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/The dog first\. Answer the card/);
  });

  it('dog: the popup commit builds the dog with cleaned breed + name', () => {
    const store = useGameStore;
    store.getState().confirmDogOnboarding('looks like a Pitbull', 'Rex', 'girl');
    const p = store.getState().player!;
    expect(p.dog).toBeTruthy();
    expect(p.dog!.breed).toBe('Pitbull');
    expect(p.dog!.name).toBe('Rex');
    expect(store.getState().worldMemory.pendingDogOnboarding).toBeNull();
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/A Pitbull\. Rex\. The name settles on the dog like a coat\./);
    expect(logs).toMatch(/Rex, then\./);
  });

  it('golem: typed input nudges; popup commit seals; skip keeps the making', () => {
    const store = useGameStore;
    store.setState({
      pendingGolemNaming: true,
      player: {
        ...store.getState().player!,
        golem: { kind: 'stone', name: 'Stone Golem', hp: 10, hpMax: 10, attackDie: '1d6', damageType: 'blunt' } as any,
      },
    });
    store.getState().submitPlayerAction('Klanky');
    expect(store.getState().player!.golem!.name).toBe('Stone Golem'); // feed input renames nothing
    expect(store.getState().pendingGolemNaming).toBe(true);
    let logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/The construct first/);

    store.getState().confirmGolemName('Klanky');
    expect(store.getState().player!.golem!.name).toBe('Klanky');
    expect(store.getState().pendingGolemNaming).toBe(false);
    logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/Klanky, then\./);

    store.setState({ pendingGolemNaming: true });
    store.getState().confirmGolemName(null);
    expect(store.getState().player!.golem!.name).toBe('Klanky');
    expect(store.getState().pendingGolemNaming).toBe(false);
    logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/It answers to its making, then — Klanky\./);

    // Stale flag with no golem self-clears without crashing.
    store.setState({
      pendingGolemNaming: true,
      player: { ...store.getState().player!, golem: undefined },
    });
    store.getState().confirmGolemName('Ghost');
    expect(store.getState().pendingGolemNaming).toBe(false);
  });
});

describe('OTA-1027 — story-hook COMPLETE raises no second popup', () => {
  it('dismissHookContinue clears the thread and leaves missionCompleteNotice alone', () => {
    const store = useGameStore;
    store.setState({
      missionCompleteNotice: null,
      pendingHookContinue: {
        hookId: 'h1',
        noun: 'grave',
        stageHistory: [{ label: '★★ STORY THREAD COMPLETE', line: 'It is done.', reward: '✦ 12 TC.' }],
        completed: true,
      } as any,
    });
    store.getState().dismissHookContinue();
    expect(store.getState().pendingHookContinue).toBeNull();
    expect(store.getState().missionCompleteNotice).toBeNull();
  });
});

describe('OTA-1027 — SOURCE LOCKS', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const storeSrc = read('app', 'state', 'gameStore.ts');
  const appSrc = read('App.tsx');

  it('the completion-notice stash is fully retired', () => {
    expect(storeSrc).not.toMatch(/completionNotice/);
  });

  it('both popups mount globally and carry their commit buttons', () => {
    expect(appSrc).toMatch(/<DogOnboardingModal \/>/);
    expect(appSrc).toMatch(/<GolemNamingModal \/>/);
    expect(read('app', 'components', 'DogOnboardingModal.tsx')).toMatch(/TAKE THEM WITH YOU/);
    const golemSrc = read('app', 'components', 'GolemNamingModal.tsx');
    expect(golemSrc).toMatch(/SEAL THE NAME/);
    expect(golemSrc).toMatch(/KEEP ITS MAKING/);
  });

  it('the thread modal spotlights the payout in its completed state', () => {
    const hookSrc = read('app', 'components', 'HookContinueModal.tsx');
    expect(hookSrc).toMatch(/YOUR REWARD/);
    expect(hookSrc).toMatch(/rewardStrip/);
  });
});

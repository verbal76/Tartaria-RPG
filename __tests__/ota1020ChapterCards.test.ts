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

// OTA-1020 — CHAPTER CARDS (story feature, phase 2). Owner: "we need to keep
// updating the player as they play." This suite locks: the four chapter cards
// and the 3×5 epilogue matrix are fully authored; chapterCardFor personalizes
// by motive and stays silent on non-card phases; a real phase transition
// (travel into a Lost Capital) raises the card through the store; choosing an
// ending raises NO card (EndingScreen owns that moment, with the motive
// epilogue); and the wiring — global overlay mount, EndingScreen epilogue,
// every load/reset clear — is pinned at the source level.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import { CHAPTER_PHASES, chapterCardFor, epilogueMotiveLine } from '../app/engine/chapters';
import { STORY_MOTIVE_IDS } from '../app/engine/story';

const ENDINGS = ['seal', 'unleash', 'preserve'] as const;

describe('OTA-1020 — the authored chapter content is complete', () => {
  it('all four chapter cards exist for every motive, with kicker/title/body', () => {
    expect(CHAPTER_PHASES).toEqual(['revelation', 'cores', 'descent', 'choice']);
    for (const phase of CHAPTER_PHASES) {
      for (const motive of STORY_MOTIVE_IDS) {
        const card = chapterCardFor(phase, motive)!;
        expect(card).not.toBeNull();
        expect(card.kicker).toMatch(/^CHAPTER [IV]+$/);
        expect(card.title.length).toBeGreaterThan(3);
        expect(card.body.length).toBeGreaterThan(120);
        expect(card.motiveTitle.length).toBeGreaterThan(3);
        expect(card.motiveLine.length).toBeGreaterThan(60);
      }
    }
  });

  it('chapter numbering runs II→V in arc order (the crawl is Chapter I)', () => {
    expect(CHAPTER_PHASES.map((p) => chapterCardFor(p, 'debt')!.kicker))
      .toEqual(['CHAPTER II', 'CHAPTER III', 'CHAPTER IV', 'CHAPTER V']);
  });

  it('non-card phases return null (hook / nexus / ended)', () => {
    expect(chapterCardFor('hook', 'debt')).toBeNull();
    expect(chapterCardFor('nexus', 'debt')).toBeNull();
    expect(chapterCardFor('ended', 'debt')).toBeNull();
  });

  it('an unknown or missing motive falls back to a coherent card, never a blank', () => {
    const card = chapterCardFor('revelation', undefined)!;
    expect(card.motiveLine.length).toBeGreaterThan(60);
    expect(chapterCardFor('revelation', 'not_a_motive')!.motiveLine).toBe(card.motiveLine);
  });

  it('the epilogue matrix is complete: 3 endings × 5 motives', () => {
    for (const ending of ENDINGS) {
      for (const motive of STORY_MOTIVE_IDS) {
        const line = epilogueMotiveLine(ending, motive);
        expect(line).not.toBeNull();
        expect(line!.length).toBeGreaterThan(80);
      }
    }
  });
});

describe('OTA-1020 — the arc raises cards through the store', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('travelling into a Lost Capital (hook→revelation) raises CHAPTER II for YOUR motive', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Cartographer', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'missing',
    } as any);
    store.getState().dismissStoryIntro();
    store.getState().skipTutorial();
    expect(store.getState().chapterCard).toBeNull();

    store.getState().travelTo('asgardar');
    expect(store.getState().player!.mainQuest?.phase).toBe('revelation');
    const card = store.getState().chapterCard;
    expect(card).not.toBeNull();
    expect(card!.kicker).toBe('CHAPTER II');
    expect(card!.motiveTitle).toBe('The Missing');

    store.getState().dismissChapterCard();
    expect(store.getState().chapterCard).toBeNull();
  });

  it('re-entering a Capital in the same phase raises NO new card', () => {
    const store = useGameStore;
    store.getState().travelTo('samarran');
    expect(store.getState().player!.mainQuest?.phase).toBe('revelation');
    expect(store.getState().chapterCard).toBeNull();
  });

  it('choosing an ending raises NO card — EndingScreen owns that moment', () => {
    const store = useGameStore;
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        mainQuest: {
          phase: 'choice',
          coresRecovered: ['asgardar', 'samarran', 'nimari', 'drakova', 'voronov', 'karok_sa', 'yuldra_tul', 'ostragar', 'iskan_veil'],
        },
      },
    } as any);
    store.getState().chooseEndingMainQuest('preserve');
    expect(store.getState().player!.mainQuest?.phase).toBe('ended');
    expect(store.getState().chapterCard).toBeNull();
    expect(epilogueMotiveLine('preserve', store.getState().player!.storyMotive)).not.toBeNull();
  });
});

describe('OTA-1020 — SOURCE LOCKS (category: the cards reach the screen)', () => {
  const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const endingSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'EndingScreen.tsx'), 'utf8');

  it('triggerMainQuest raises the card on phase change and every load/reset path clears it', () => {
    expect(storeSrc).toMatch(/chapterCardFor\(nextState\.phase, player\.storyMotive\)/);
    const clears = storeSrc.match(/chapterCard: null/g) ?? [];
    // initial state + slot load + delete-slot + hard reset + new game
    expect(clears.length).toBeGreaterThanOrEqual(5);
  });

  it('the overlay mounts GLOBALLY in App.tsx (transitions fire from more than one screen)', () => {
    expect(appSrc).toMatch(/<ChapterCardOverlay \/>/);
  });

  it('EndingScreen renders the per-motive epilogue', () => {
    expect(endingSrc).toMatch(/epilogueMotiveLine\(ending, player\.storyMotive\)/);
  });
});
